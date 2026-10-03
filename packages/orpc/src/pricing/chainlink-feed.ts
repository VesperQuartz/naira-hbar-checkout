import { config, type IntegrationConfig, type PriceSample } from "@repo/shared";

/**
 * HBAR/USD pricing for quotes.
 *
 * When `CHAINLINK_HBAR_USD_FEED` is configured, every quote reads the same
 * Chainlink aggregator the contract checks at `pay` time, so the quoted
 * `hbarUsd` and the on-chain price agree (within the contract's 500 bps
 * tolerance) and payments are not rejected as `PriceDeviation`.
 *
 * Fallbacks (plan §8, boot-safe):
 * - feed not configured → the demo sample keeps quoting out of the box;
 * - RPC unreachable → an aged sample, so quoting fails with the typed
 *   `StalePriceError` ("price out of date") instead of quoting a wrong price.
 */

/** Demo HBAR/USD used only when no feed is configured. */
const DEMO_HBAR_USD = 0.25;

/** Hashio JSON-RPC defaults per Hedera network (chain 295/296). */
const defaultRpcUrl = (network: "testnet" | "mainnet"): string =>
	network === "mainnet"
		? "https://mainnet.hashio.io/api"
		: "https://testnet.hashio.io/api";

/** One `eth_call` — injectable so tests never touch the network. */
export type EthCall = (to: string, data: string) => Promise<string>;

/** The subset of integration config the reader needs. */
export type FeedDeps = Pick<
	IntegrationConfig,
	"network" | "chainlinkHbarUsdFeed" | "chainlinkRpcUrl"
>;

const WORD_HEX = 64;

/** ABI-decode one 32-byte word as a two's-complement signed integer. */
const wordToSigned = (hex: string, index: number): bigint => {
	const raw = BigInt(
		`0x${hex.slice(2 + index * WORD_HEX, 2 + (index + 1) * WORD_HEX)}`,
	);
	const signBit = 1n << 255n;
	return raw >= signBit ? raw - (1n << 256n) : raw;
};

/** ABI-decode one 32-byte word as an unsigned integer. */
const wordToUnsigned = (hex: string, index: number): bigint =>
	BigInt(`0x${hex.slice(2 + index * WORD_HEX, 2 + (index + 1) * WORD_HEX)}`);

/** `decimals()` — chainlink AggregatorV3Interface. */
const DECIMALS_CALL = "0x313ce567";
/** `latestRoundData()` — chainlink AggregatorV3Interface. */
const LATEST_ROUND_CALL = "0xfeaf968c";

/**
 * Read one Chainlink HBAR/USD answer and normalize it to a plain USD number.
 * Throws on RPC/ABI trouble — callers decide the fallback (nothing here
 * invents a price).
 */
export const readChainlinkPrice = async (
	feed: string,
	ethCall: EthCall,
): Promise<number> => {
	const decimalsHex = await ethCall(feed, DECIMALS_CALL);
	const decimals = Number(wordToUnsigned(decimalsHex, 0));
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
		throw new Error(`unexpected feed decimals: ${decimals}`);
	}

	// (roundId, answer, startedAt, updatedAt, answeredInRound) — answer is word 1.
	const roundHex = await ethCall(feed, LATEST_ROUND_CALL);
	const answer = wordToSigned(roundHex, 1);
	if (answer <= 0n) {
		throw new Error(`feed returned a non-positive answer: ${answer}`);
	}
	return Number(answer) / 10 ** decimals;
};

/** JSON-RPC `eth_call` against the configured Hedera endpoint. */
const rpcEthCall =
	(url: string): EthCall =>
	async (to, data) => {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "eth_call",
				params: [{ to, data }, "latest"],
			}),
		});
		if (!response.ok) {
			throw new Error(`RPC HTTP ${response.status}`);
		}
		const payload = (await response.json()) as {
			result?: string;
			error?: { message?: string };
		};
		if (payload.error || typeof payload.result !== "string") {
			throw new Error(payload.error?.message ?? "RPC returned no result");
		}
		return payload.result;
	};

/** Last good price — drives the quote's previous-answer deviation guardrail. */
let previousHbarUsd: number | undefined;

/**
 * Current HBAR/USD sample for quoting. Reads the configured feed over
 * JSON-RPC (see module JSDoc for the fallbacks); the sample is always
 * "now"-dated on success, since a successful read *is* the freshness signal.
 */
export const currentPriceSample = async (
	deps: FeedDeps = config.integration,
	ethCall: EthCall = rpcEthCall(
		deps.chainlinkRpcUrl ?? defaultRpcUrl(deps.network),
	),
): Promise<PriceSample> => {
	if (!deps.chainlinkHbarUsdFeed) {
		// Unconfigured demo mode: quote out of the box, no network I/O.
		return {
			hbarUsd: DEMO_HBAR_USD,
			updatedAt: new Date(),
			previousHbarUsd: DEMO_HBAR_USD,
		};
	}
	try {
		const hbarUsd = await readChainlinkPrice(
			deps.chainlinkHbarUsdFeed,
			ethCall,
		);
		const sample: PriceSample = {
			hbarUsd,
			updatedAt: new Date(),
			previousHbarUsd: previousHbarUsd ?? hbarUsd,
		};
		previousHbarUsd = hbarUsd;
		return sample;
	} catch {
		// Quote with a stale sample → typed StalePriceError, never a wrong price.
		const hbarUsd = previousHbarUsd ?? DEMO_HBAR_USD;
		return {
			hbarUsd,
			updatedAt: new Date(0),
			previousHbarUsd: previousHbarUsd ?? hbarUsd,
		};
	}
};
