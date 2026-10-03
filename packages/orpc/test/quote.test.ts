import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PriceSample, QuoteInput } from "@repo/shared";
import { Result } from "better-result";
import {
	createQuote,
	DEFAULT_QUOTE_GUARDRAILS,
	describeQuoteError,
	InvalidQuoteInputError,
	PriceDeviationError,
	StalePriceError,
} from "../src/pricing/quote";

const NOW = new Date("2026-10-02T12:00:00.000Z");

const priceAt = (overrides: Partial<PriceSample> = {}): PriceSample => ({
	hbarUsd: 0.25,
	updatedAt: NOW,
	previousHbarUsd: 0.25,
	...overrides,
});

const inputAt = (overrides: Partial<QuoteInput> = {}): QuoteInput => ({
	amountNgn: 150_000,
	price: priceAt(),
	...overrides,
});

describe("createQuote", () => {
	it("returns the full USD/HBAR breakdown for a valid input", () => {
		const result = createQuote(inputAt(), {
			now: NOW,
			quoteId: "quote-fixed",
			ngnPerUsd: 1500,
		});

		assert.ok(Result.isOk(result));
		assert.deepEqual(result.value, {
			quoteId: "quote-fixed",
			amountNgn: 150_000,
			amountUsd: 100,
			amountHbar: 400,
			ngnPerUsd: 1500,
			hbarUsd: 0.25,
			issuedAt: NOW,
			expiresAt: new Date(NOW.getTime() + DEFAULT_QUOTE_GUARDRAILS.ttlMs),
		});
	});

	it("defaults the demo rate to the shared config value", () => {
		const result = createQuote(inputAt({ amountNgn: 1500 }), {
			now: NOW,
			quoteId: "quote-default-rate",
		});

		assert.ok(Result.isOk(result));
		assert.equal(result.value.ngnPerUsd, 1500);
		assert.equal(result.value.amountUsd, 1);
	});

	it("rounds USD to kobo and HBAR to its 8-decimal grain", () => {
		const result = createQuote(
			inputAt({
				amountNgn: 1000,
				price: priceAt({ hbarUsd: 0.3, previousHbarUsd: 0.3 }),
			}),
			{
				now: NOW,
				quoteId: "quote-rounding",
				ngnPerUsd: 1500,
			},
		);

		assert.ok(Result.isOk(result));
		assert.equal(result.value.amountUsd, 0.67);
		// 0.67 / 0.30 = 2.23333333…
		assert.equal(result.value.amountHbar, 2.23333333);
	});

	it("honours an injected TTL", () => {
		const result = createQuote(inputAt(), {
			now: NOW,
			quoteId: "quote-ttl",
			ttlMs: 60_000,
		});

		assert.ok(Result.isOk(result));
		assert.equal(result.value.expiresAt.getTime(), NOW.getTime() + 60_000);
	});

	it("rejects a non-positive or non-finite Naira amount", () => {
		for (const amountNgn of [0, -1, Number.NaN]) {
			const result = createQuote(inputAt({ amountNgn }), { now: NOW });

			assert.ok(Result.isError(result));
			assert.ok(InvalidQuoteInputError.is(result.error));
		}
	});

	it("rejects an unusable feed price", () => {
		const result = createQuote(inputAt({ price: priceAt({ hbarUsd: 0 }) }), {
			now: NOW,
		});

		assert.ok(Result.isError(result));
		assert.ok(InvalidQuoteInputError.is(result.error));
	});

	it("rejects a price sample older than the max age", () => {
		const stale = new Date(
			NOW.getTime() - DEFAULT_QUOTE_GUARDRAILS.maxPriceAgeMs - 1,
		);
		const result = createQuote(
			inputAt({ price: priceAt({ updatedAt: stale }) }),
			{ now: NOW },
		);

		assert.ok(Result.isError(result));
		assert.ok(StalePriceError.is(result.error));
		assert.equal(
			result.error.maxPriceAgeMs,
			DEFAULT_QUOTE_GUARDRAILS.maxPriceAgeMs,
		);
	});

	it("accepts a price sample exactly at the max age", () => {
		const edge = new Date(
			NOW.getTime() - DEFAULT_QUOTE_GUARDRAILS.maxPriceAgeMs,
		);
		const result = createQuote(
			inputAt({ price: priceAt({ updatedAt: edge }) }),
			{ now: NOW },
		);

		assert.ok(Result.isOk(result));
	});

	it("rejects a price that deviates beyond the tolerance", () => {
		const result = createQuote(
			inputAt({ price: priceAt({ hbarUsd: 0.3, previousHbarUsd: 0.25 }) }),
			{ now: NOW },
		);

		assert.ok(Result.isError(result));
		assert.ok(PriceDeviationError.is(result.error));
		assert.ok(Math.abs(result.error.deviationBps - 2000) < 1e-6);
		assert.equal(
			result.error.toleranceBps,
			DEFAULT_QUOTE_GUARDRAILS.deviationToleranceBps,
		);
	});

	it("accepts a price move exactly at the tolerance", () => {
		// 0.3125 vs 0.25 is exactly +2500bps (binary-exact values, no float drift).
		const result = createQuote(
			inputAt({ price: priceAt({ hbarUsd: 0.3125, previousHbarUsd: 0.25 }) }),
			{ now: NOW, deviationToleranceBps: 2500 },
		);

		assert.ok(Result.isOk(result));
	});
});

describe("describeQuoteError", () => {
	it("maps every tagged failure to a safe message", () => {
		const failures = [
			createQuote(inputAt({ amountNgn: 0 }), { now: NOW }),
			createQuote(inputAt({ price: priceAt({ updatedAt: new Date(0) }) }), {
				now: NOW,
			}),
			createQuote(
				inputAt({ price: priceAt({ hbarUsd: 9, previousHbarUsd: 0.25 }) }),
				{ now: NOW },
			),
		];

		for (const result of failures) {
			assert.ok(Result.isError(result));
			const message = describeQuoteError(result.error);
			assert.ok(message.length > 0);
		}
	});
});
