import { pgCuid2 } from "drizzle-cuid2";
import { defineRelationsPart } from "drizzle-orm";
import { index, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Order lifecycle:
 *
 * - `pending` — created, not yet quoted for HBAR
 * - `awaiting_payment` — quote attached, waiting for the HBAR transfer
 * - `paid` — payment transaction seen on chain
 * - `swapping` — HBAR → stablecoin swap in flight
 * - `settled` — swap + HCS receipt done
 * - `failed` — payment/swap/receipt step failed terminally
 * - `expired` — quote/order expired before payment
 */
export type OrderState =
	| "pending"
	| "awaiting_payment"
	| "paid"
	| "swapping"
	| "settled"
	| "failed"
	| "expired";

/**
 * Settlement state carried by an HCS receipt:
 *
 * - `pending` — receipt not yet written
 * - `settled` — swap + receipt succeeded
 * - `failed` — settlement step failed
 * - `skipped` — integrations not configured (safe no-op path)
 */
export type SettlementState = "pending" | "settled" | "failed" | "skipped";

// Amounts and price-at-quote columns are numeric strings (drizzle `numeric`),
// keeping exact decimal values — never floats — for money.
const amount = (column: string) => numeric(column, { precision: 24, scale: 8 });

export const order = pgTable(
	"order",
	{
		id: pgCuid2("id").primaryKey().defaultRandom(),
		// Order reference shown to the contract event and HCS receipt so
		// off-chain rows can be correlated with on-chain activity.
		reference: text("reference").notNull().unique(),
		// Quote this order is paying against (see the pricing service).
		quoteId: text("quote_id"),
		state: text("state").$type<OrderState>().notNull().default("pending"),

		// The Naira price is what the customer sees up front, so it is
		// required from creation. USD/HBAR figures and the price-at-quote
		// are filled in when the quote is attached.
		amountNgn: amount("amount_ngn").notNull(),
		amountUsd: amount("amount_usd"),
		amountHbar: amount("amount_hbar"),
		ngnPerUsdAtQuote: amount("ngn_per_usd_at_quote"),
		hbarUsdAtQuote: amount("hbar_usd_at_quote"),

		// Hedera accounts: merchant comes from config (nullable — the demo
		// runs without MERCHANT_ACCOUNT_ID set), buyer when paid.
		merchantAccountId: text("merchant_account_id"),
		buyerAccountId: text("buyer_account_id"),

		// On-chain references.
		paymentTxHash: text("payment_tx_hash"),
		swapTxHash: text("swap_tx_hash"),
		settlementTxHash: text("settlement_tx_hash"),
		// Stablecoin actually received from the swap (swap info).
		swapOutAmount: amount("swap_out_amount"),
		stablecoinTokenId: text("stablecoin_token_id"),

		expiresAt: timestamp("expires_at"),
		paidAt: timestamp("paid_at"),
		settledAt: timestamp("settled_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("order_state_idx").on(table.state)],
);

export const receipt = pgTable(
	"receipt",
	{
		id: pgCuid2("id").primaryKey().defaultRandom(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "cascade" }),
		// HCS topic the receipt message was written to.
		topicId: text("topic_id").notNull(),
		// HCS message reference: consensus timestamp / message id of the
		// receipt message on the topic.
		messageReference: text("message_reference").notNull(),
		settlementState: text("settlement_state")
			.$type<SettlementState>()
			.notNull()
			.default("pending"),
		paymentTxHash: text("payment_tx_hash"),
		// Consensus time of the HCS message (when it reached the network).
		recordedAt: timestamp("recorded_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("receipt_orderId_idx").on(table.orderId)],
);

export type Order = typeof order.$inferSelect;
export type NewOrder = typeof order.$inferInsert;
export type Receipt = typeof receipt.$inferSelect;
export type NewReceipt = typeof receipt.$inferInsert;

export const orderRelations = defineRelationsPart({ order, receipt }, (r) => ({
	order: {
		receipts: r.many.receipt({
			from: r.order.id,
			to: r.receipt.orderId,
		}),
	},
	receipt: {
		order: r.one.order({
			from: r.receipt.orderId,
			to: r.order.id,
		}),
	},
}));
