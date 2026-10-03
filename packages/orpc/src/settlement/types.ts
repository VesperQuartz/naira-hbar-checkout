import type { HederaNetwork } from "@repo/shared";
import type { SettlementState } from "@repo/storage/schema/order.schema";
import { TaggedError } from "better-result";

/**
 * Swap HBAR → stablecoin (SaucerSwap). Amounts are decimal strings — 8dp
 * for HBAR, token decimals for the stablecoin — never floats.
 */
export type SwapRequest = {
	/** Order the swap settles. */
	readonly orderId: string;
	/** Order reference, carried for correlation in logs/events. */
	readonly reference: string;
	/** HBAR to swap (8dp), taken from the paid order. */
	readonly hbarAmount: string;
	/** Buyer's Hedera account, when known. */
	readonly payerAccountId?: string;
};

export type SwapResult = {
	/** Transaction id/hash of the swap on Hedera. */
	readonly txHash: string;
	/** Stablecoin actually received (token decimals). */
	readonly outAmount: string;
	/** Stablecoin token id received. */
	readonly tokenId: string;
};

/** Write one receipt message to an HCS topic. */
export type ReceiptRequest = {
	readonly orderId: string;
	readonly reference: string;
	/** HCS topic; falls back to the configured `HCS_TOPIC_ID`. */
	readonly topicId?: string;
	readonly amountNgn: string;
	readonly amountHbar: string;
	readonly paymentTxHash?: string;
	readonly swapTxHash?: string;
	/** Settlement state recorded in the receipt. */
	readonly settlementState: SettlementState;
};

export type ReceiptResult = {
	/** Consensus message id/reference of the written receipt. */
	readonly messageId: string;
	readonly topicId: string;
};

/** An integration input is missing — safe no-op, nothing is attempted. */
export class NotConfiguredError extends TaggedError("NotConfiguredError")<{
	/** Env var(s) that would enable the step. */
	readonly setting: string;
	readonly message: string;
}> {}

/** The swap seam exists but the on-chain call is not wired yet. */
export class SwapUnavailableError extends TaggedError("SwapUnavailableError")<{
	readonly network: HederaNetwork;
	readonly message: string;
}> {}

/** HCS submission was attempted but the network rejected it. */
export class HcsSubmitError extends TaggedError("HcsSubmitError")<{
	readonly network: HederaNetwork;
	readonly topicId: string;
	readonly message: string;
	readonly cause?: unknown;
}> {}

export type SwapError = NotConfiguredError | SwapUnavailableError;
export type ReceiptError = NotConfiguredError | HcsSubmitError;
