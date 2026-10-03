import { ORPCError } from "@orpc/server";
import { config } from "@repo/shared";
import {
	findOrderById,
	findReceiptByOrderId,
	insertOrder,
	insertReceipt,
	type StorageError,
	updateOrder,
} from "@repo/storage/orders";
import type { SettlementState } from "@repo/storage/schema/order.schema";
import { Result } from "better-result";
import { z } from "zod";
import {
	createQuote,
	currentPriceSample,
	describeQuoteError,
	InvalidQuoteInputError,
	type QuoteError,
} from "#/pricing/index";
import { swapHbarToStablecoin, writeHcsReceipt } from "#/settlement/index";
import { base } from "../base";

/**
 * Transport-boundary mapping: `Result` failures become typed oRPC errors.
 * Quote guardrail failures are client-relevant (bad input vs retryable
 * price trouble); storage failures mean the optional DB is unreachable.
 */
const quoteErrorToORPC = (error: QuoteError) =>
	InvalidQuoteInputError.is(error)
		? new ORPCError("BAD_REQUEST", {
				message: describeQuoteError(error),
				data: { code: error._tag },
			})
		: new ORPCError("SERVICE_UNAVAILABLE", {
				message: describeQuoteError(error),
				data: { code: error._tag },
			});

const storageErrorToORPC = (error: StorageError) =>
	new ORPCError("SERVICE_UNAVAILABLE", {
		message:
			"Order storage is unavailable — configure DATABASE_URL and try again.",
		data: { code: error._tag },
	});

const amountNgn = z.number().positive();

export const checkoutRouter = {
	/** Price a Naira amount without creating anything. */
	quote: base.input(z.object({ amountNgn })).handler(async ({ input }) => {
		const result = createQuote({
			amountNgn: input.amountNgn,
			price: await currentPriceSample(),
		});
		if (Result.isError(result)) {
			throw quoteErrorToORPC(result.error);
		}
		return result.value;
	}),
	/** Quote a Naira amount and persist a new order awaiting payment. */
	create: base
		.input(
			z.object({
				amountNgn,
				reference: z
					.string()
					.regex(/^[A-Za-z0-9._-]{1,64}$/)
					.optional(),
				buyerAccountId: z
					.string()
					.regex(/^0\.0\.\d{1,10}$/)
					.optional(),
			}),
		)
		.handler(async ({ input }) => {
			const quoted = createQuote({
				amountNgn: input.amountNgn,
				price: await currentPriceSample(),
			});
			if (Result.isError(quoted)) {
				throw quoteErrorToORPC(quoted.error);
			}
			const quote = quoted.value;

			const inserted = await insertOrder({
				reference: input.reference ?? `order_${quote.quoteId}`,
				quoteId: quote.quoteId,
				state: "awaiting_payment",
				amountNgn: String(quote.amountNgn),
				amountUsd: String(quote.amountUsd),
				amountHbar: String(quote.amountHbar),
				ngnPerUsdAtQuote: String(quote.ngnPerUsd),
				hbarUsdAtQuote: String(quote.hbarUsd),
				merchantAccountId: config.integration.merchantAccountId ?? null,
				buyerAccountId: input.buyerAccountId ?? null,
				expiresAt: quote.expiresAt,
			});
			if (Result.isError(inserted)) {
				throw storageErrorToORPC(inserted.error);
			}
			// The browser pays this contract directly, so the address rides
			// along with the order instead of a second public env var.
			return {
				...inserted.value,
				contractAddress: config.integration.checkoutContractAddress ?? null,
			};
		}),
	/** Read an order back by its id, with its HCS receipt when written. */
	status: base
		.input(z.object({ orderId: z.string().min(1).max(64) }))
		.handler(async ({ input }) => {
			const found = await findOrderById(input.orderId);
			if (Result.isError(found)) {
				throw storageErrorToORPC(found.error);
			}
			if (!found.value) {
				throw new ORPCError("NOT_FOUND", { message: "Order not found." });
			}
			const receipt = await findReceiptByOrderId(input.orderId);
			if (Result.isError(receipt)) {
				throw storageErrorToORPC(receipt.error);
			}
			return { ...found.value, receipt: receipt.value ?? null };
		}),
	/**
	 * Record the on-chain payment for an order and run settlement: swap
	 * (documented plan §8 fallback when unavailable) then one HCS receipt,
	 * both persisted so `status` can serve them back.
	 */
	confirm: base
		.input(
			z.object({
				orderId: z.string().min(1).max(64),
				paymentTxHash: z.string().regex(/^0x[0-9a-fA-F]{8,128}$/),
				payerAccountId: z
					.string()
					.regex(/^0\.0\.\d{1,10}$/)
					.optional(),
			}),
		)
		.handler(async ({ input }) => {
			const found = await findOrderById(input.orderId);
			if (Result.isError(found)) {
				throw storageErrorToORPC(found.error);
			}
			if (!found.value) {
				throw new ORPCError("NOT_FOUND", { message: "Order not found." });
			}
			const order = found.value;
			if (order.state !== "awaiting_payment") {
				throw new ORPCError("CONFLICT", {
					message: `Order is ${order.state}; only awaiting_payment orders can be confirmed.`,
				});
			}

			// Plain-language notes a reviewer can read back from the response.
			const notes: string[] = [];

			// 1. Payment seen on chain.
			const paid = await updateOrder(order.id, {
				state: "paid",
				paymentTxHash: input.paymentTxHash,
				buyerAccountId: input.payerAccountId ?? order.buyerAccountId,
				paidAt: new Date(),
			});
			if (Result.isError(paid)) {
				throw storageErrorToORPC(paid.error);
			}
			let current = paid.value;

			// 2. Swap — an unconfigured/unwired swap is the plan §8 fallback:
			// keep the payment, the price check and the HCS receipt.
			const swap = await swapHbarToStablecoin({
				orderId: order.id,
				reference: order.reference,
				hbarAmount: order.amountHbar ?? "0",
				payerAccountId: input.payerAccountId,
			});
			const swapOutcome = Result.isError(swap)
				? {
						ok: false as const,
						code: swap.error._tag,
						message: swap.error.message,
					}
				: { ok: true as const, ...swap.value };
			if (Result.isError(swap)) {
				notes.push(swap.error.message);
			}

			// 3. HCS receipt — written whenever topic + operator are configured.
			const settlementState: SettlementState = swapOutcome.ok
				? "settled"
				: "skipped";
			const receipt = await writeHcsReceipt({
				orderId: order.id,
				reference: order.reference,
				amountNgn: order.amountNgn,
				amountHbar: order.amountHbar ?? "0",
				paymentTxHash: input.paymentTxHash,
				swapTxHash: swapOutcome.ok ? swapOutcome.txHash : undefined,
				settlementState,
			});
			if (Result.isError(receipt)) {
				// No message written → nothing to persist; the order stays paid
				// and the typed reason comes back on this response.
				notes.push(receipt.error.message);
				return {
					order: current,
					swap: swapOutcome,
					receipt: {
						ok: false as const,
						code: receipt.error._tag,
						message: receipt.error.message,
					},
					notes,
				};
			}

			// 4. Persist the receipt and close the order out.
			const inserted = await insertReceipt({
				orderId: order.id,
				topicId: receipt.value.topicId,
				messageReference: receipt.value.messageId,
				settlementState,
				paymentTxHash: input.paymentTxHash,
				recordedAt: new Date(),
			});
			if (Result.isError(inserted)) {
				throw storageErrorToORPC(inserted.error);
			}
			const settled = await updateOrder(order.id, {
				state: "settled",
				settledAt: new Date(),
				swapTxHash: swapOutcome.ok ? swapOutcome.txHash : null,
				swapOutAmount: swapOutcome.ok ? swapOutcome.outAmount : null,
				stablecoinTokenId: swapOutcome.ok ? swapOutcome.tokenId : null,
			});
			if (Result.isError(settled)) {
				throw storageErrorToORPC(settled.error);
			}
			current = settled.value;

			return {
				order: current,
				swap: swapOutcome,
				receipt: { ok: true as const, ...receipt.value },
				notes,
			};
		}),
};
