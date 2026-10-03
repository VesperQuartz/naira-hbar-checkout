import { DEMO_NGN_PER_USD, type Quote, type QuoteInput } from "@repo/shared";
import { Result, TaggedError } from "better-result";

/**
 * Default guardrail thresholds. Every value is overridable per call through
 * {@link QuoteOptions} so tests can exercise the boundaries without waiting
 * on real time.
 */
export const DEFAULT_QUOTE_GUARDRAILS = {
	/** Maximum age of a price sample before it counts as stale. */
	maxPriceAgeMs: 60_000,
	/** Maximum deviation vs the previous answer, in basis points (500 = 5%). */
	deviationToleranceBps: 500,
	/** How long an issued quote stays valid. */
	ttlMs: 5 * 60_000,
} as const;

/** The Naira amount or the feed price is not usable for a quote. */
export class InvalidQuoteInputError extends TaggedError(
	"InvalidQuoteInputError",
)<{
	readonly amountNgn: number;
	readonly hbarUsd: number;
	readonly message: string;
}> {}

/** The price sample is older than the configured max age. */
export class StalePriceError extends TaggedError("StalePriceError")<{
	readonly updatedAt: Date;
	readonly ageMs: number;
	readonly maxPriceAgeMs: number;
	readonly message: string;
}> {}

/** The price moved beyond the tolerance vs the previous answer. */
export class PriceDeviationError extends TaggedError("PriceDeviationError")<{
	readonly hbarUsd: number;
	readonly previousHbarUsd: number;
	readonly deviationBps: number;
	readonly toleranceBps: number;
	readonly message: string;
}> {}

export type QuoteError =
	| InvalidQuoteInputError
	| StalePriceError
	| PriceDeviationError;

/** Per-call overrides; each defaults to {@link DEFAULT_QUOTE_GUARDRAILS} or config. */
export type QuoteOptions = {
	/** Injectable clock — defaults to the current time. */
	readonly now?: Date;
	/** Demo NGN/USD rate — defaults to the validated shared config value. */
	readonly ngnPerUsd?: number;
	/** Injectable id — defaults to a random UUID. */
	readonly quoteId?: string;
	readonly maxPriceAgeMs?: number;
	readonly deviationToleranceBps?: number;
	readonly ttlMs?: number;
};

const roundTo = (value: number, decimals: number): number => {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
};

/**
 * Turns a Naira amount into a USD/HBAR quote. Pure: the price sample and the
 * clock are injected, so there is no network I/O and tests stay deterministic.
 *
 * Guardrails, in order:
 * 1. invalid input (non-positive/non-finite amount or price) → `InvalidQuoteInputError`
 * 2. price sample older than `maxPriceAgeMs` → `StalePriceError`
 * 3. price moved more than `deviationToleranceBps` vs the previous answer → `PriceDeviationError`
 */
export const createQuote = (
	input: QuoteInput,
	options: QuoteOptions = {},
): Result<Quote, QuoteError> => {
	const {
		now = new Date(),
		ngnPerUsd = DEMO_NGN_PER_USD,
		quoteId = crypto.randomUUID(),
		maxPriceAgeMs = DEFAULT_QUOTE_GUARDRAILS.maxPriceAgeMs,
		deviationToleranceBps = DEFAULT_QUOTE_GUARDRAILS.deviationToleranceBps,
		ttlMs = DEFAULT_QUOTE_GUARDRAILS.ttlMs,
	} = options;

	const { amountNgn, price } = input;

	if (
		!Number.isFinite(amountNgn) ||
		amountNgn <= 0 ||
		!Number.isFinite(price.hbarUsd) ||
		price.hbarUsd <= 0
	) {
		return Result.err(
			new InvalidQuoteInputError({
				amountNgn,
				hbarUsd: price.hbarUsd,
				message: `Invalid quote input: amountNgn=${amountNgn}, hbarUsd=${price.hbarUsd}`,
			}),
		);
	}

	const ageMs = now.getTime() - price.updatedAt.getTime();
	if (ageMs > maxPriceAgeMs) {
		return Result.err(
			new StalePriceError({
				updatedAt: price.updatedAt,
				ageMs,
				maxPriceAgeMs,
				message: `Price sample is stale: age ${ageMs}ms exceeds ${maxPriceAgeMs}ms`,
			}),
		);
	}

	if (Number.isFinite(price.previousHbarUsd) && price.previousHbarUsd > 0) {
		const deviationBps =
			(Math.abs(price.hbarUsd - price.previousHbarUsd) /
				price.previousHbarUsd) *
			10_000;
		if (deviationBps > deviationToleranceBps) {
			return Result.err(
				new PriceDeviationError({
					hbarUsd: price.hbarUsd,
					previousHbarUsd: price.previousHbarUsd,
					deviationBps,
					toleranceBps: deviationToleranceBps,
					message: `Price deviates ${deviationBps.toFixed(0)}bps, tolerance ${deviationToleranceBps}bps`,
				}),
			);
		}
	}

	// USD first (kobo precision), then HBAR (8 decimals — the token's grain).
	const amountUsd = roundTo(amountNgn / ngnPerUsd, 2);
	const amountHbar = roundTo(amountUsd / price.hbarUsd, 8);

	return Result.ok({
		quoteId,
		amountNgn,
		amountUsd,
		amountHbar,
		ngnPerUsd,
		hbarUsd: price.hbarUsd,
		issuedAt: now,
		expiresAt: new Date(now.getTime() + ttlMs),
	});
};

/**
 * Exhaustive mapping of quote failures to safe, user-facing messages — the
 * API layer's presentation seam for the `createQuote` boundary.
 */
export const describeQuoteError = (error: QuoteError): string =>
	error.match({
		InvalidQuoteInputError: () =>
			"Enter a valid amount in Naira to get a quote.",
		StalePriceError: () =>
			"The HBAR price is out of date — please try again in a moment.",
		PriceDeviationError: () =>
			"The HBAR price moved outside the accepted range — please try again shortly.",
	});
