/**
 * Pricing/quote wire types. Pure data shapes only — safe for the client to
 * import. The quote computation itself is server-side (see `@repo/orpc`).
 */

/** A Chainlink-style HBAR/USD sample with its feed timestamp. */
export type PriceSample = {
	/** Current HBAR/USD answer. */
	readonly hbarUsd: number;
	/** When the feed produced this answer (round updatedAt). */
	readonly updatedAt: Date;
	/** Previous accepted answer — baseline for the deviation guard. */
	readonly previousHbarUsd: number;
};

/** Typed input to the quote service. */
export type QuoteInput = {
	/** Price the customer sees in Naira. */
	readonly amountNgn: number;
	/** Injectable price sample — the service performs no network I/O. */
	readonly price: PriceSample;
};

/** Breakdown returned for a valid quote. */
export type Quote = {
	readonly quoteId: string;
	readonly amountNgn: number;
	readonly amountUsd: number;
	readonly amountHbar: number;
	/** Demo NGN/USD rate used (single-sourced, clearly labelled demo). */
	readonly ngnPerUsd: number;
	/** HBAR/USD price used for the conversion. */
	readonly hbarUsd: number;
	readonly issuedAt: Date;
	readonly expiresAt: Date;
};
