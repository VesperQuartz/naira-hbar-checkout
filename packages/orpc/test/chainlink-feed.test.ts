import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	currentPriceSample,
	type EthCall,
	readChainlinkPrice,
} from "../src/pricing/chainlink-feed";

/** ABI-encode one 32-byte word (two's complement for negatives). */
const word = (value: bigint): string =>
	((value < 0n ? (1n << 256n) + value : value) % (1n << 256n))
		.toString(16)
		.padStart(64, "0");

/** `latestRoundData()` result: (roundId, answer, startedAt, updatedAt, answeredInRound). */
const roundData = (answer: bigint, updatedAt = 1_700_000_000n): string =>
	`0x${[1n, answer, 1_699_999_000n, updatedAt, 1n].map(word).join("")}`;

/** Deterministic `ethCall` stub: `decimals()` → 8, `latestRoundData()` → answer. */
const stubCall =
	(answer: bigint): EthCall =>
	async (_to, data) =>
		data === "0x313ce567" ? word(8n) : roundData(answer);

describe("readChainlinkPrice", () => {
	it("normalizes a feed answer to a plain USD number", async () => {
		const price = await readChainlinkPrice("0xfeed", stubCall(10_115_585n));
		assert.equal(price, 0.10115585);
	});

	it("throws when the feed answers non-positive", async () => {
		await assert.rejects(
			readChainlinkPrice("0xfeed", stubCall(-5n)),
			/non-positive/,
		);
	});

	it("throws when decimals are out of range", async () => {
		const badDecimals: EthCall = async (_to, data) =>
			data === "0x313ce567" ? word(21n) : roundData(1n);
		await assert.rejects(readChainlinkPrice("0xfeed", badDecimals), /decimals/);
	});
});

describe("currentPriceSample", () => {
	const depsWithFeed = {
		network: "testnet" as const,
		chainlinkHbarUsdFeed: "0xfeed",
		chainlinkRpcUrl: undefined,
	};

	it("returns the demo sample when no feed is configured", async () => {
		let called = false;
		const sample = await currentPriceSample(
			{ ...depsWithFeed, chainlinkHbarUsdFeed: undefined },
			async () => {
				called = true;
				return word(1n);
			},
		);
		assert.equal(called, false, "no RPC I/O without a feed");
		assert.equal(sample.hbarUsd, 0.25);
		assert.ok(Date.now() - sample.updatedAt.getTime() < 60_000);
	});

	it("reads the configured feed and dates the sample now", async () => {
		const sample = await currentPriceSample(
			depsWithFeed,
			stubCall(10_115_585n),
		);
		assert.equal(sample.hbarUsd, 0.10115585);
		assert.ok(Date.now() - sample.updatedAt.getTime() < 60_000);
		// First observation: the previous answer is the same price.
		assert.equal(sample.previousHbarUsd, sample.hbarUsd);
	});

	it("returns an aged sample when the RPC fails (typed stale quote)", async () => {
		const failing: EthCall = async () => {
			throw new Error("RPC down");
		};
		const sample = await currentPriceSample(depsWithFeed, failing);
		assert.equal(
			sample.updatedAt.getTime(),
			0,
			"epoch-dated → StalePriceError",
		);
		// Carries the last good price — never invents a fresh one.
		assert.equal(sample.hbarUsd, 0.10115585);
	});
});
