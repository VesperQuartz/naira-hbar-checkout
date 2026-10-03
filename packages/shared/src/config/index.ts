import { env, type HederaNetwork } from "../env";

/**
 * Demo pricing settings. The NGN/USD figure is an explicit, single-sourced
 * demo rate — clearly labelled as such — never a live FX quote.
 */
export type PricingConfig = {
	readonly label: "demo";
	readonly ngnPerUsd: number;
};

/**
 * Integration endpoints. Every field except `network` is optional and typed
 * `string | undefined` so callers must handle the "not configured" case —
 * boot never depends on these being present.
 */
export type IntegrationConfig = {
	readonly network: HederaNetwork;
	readonly chainlinkHbarUsdFeed: string | undefined;
	/** JSON-RPC URL for off-chain feed reads; `undefined` → Hashio default. */
	readonly chainlinkRpcUrl: string | undefined;
	readonly hcsTopicId: string | undefined;
	readonly saucerswapRouter: string | undefined;
	readonly stablecoinTokenId: string | undefined;
	readonly merchantAccountId: string | undefined;
	/** Operator account used to sign HCS submissions (testnet). */
	readonly operatorId: string | undefined;
	/** Its key — kept out of the code, read from env only. */
	readonly operatorKey: string | undefined;
};

export type CheckoutConfig = {
	readonly pricing: PricingConfig;
	readonly integration: IntegrationConfig;
};

/** The demo NGN/USD rate, single-sourced from validated env config. */
export const DEMO_NGN_PER_USD: number = env.DEMO_NGN_PER_USD;

/**
 * Typed, validated config for pricing and integration settings — import this
 * instead of reading raw `process.env`.
 */
export const config: CheckoutConfig = {
	pricing: {
		label: "demo",
		ngnPerUsd: env.DEMO_NGN_PER_USD,
	},
	integration: {
		network: env.HEDERA_NETWORK,
		chainlinkHbarUsdFeed: env.CHAINLINK_HBAR_USD_FEED,
		chainlinkRpcUrl: env.CHAINLINK_RPC_URL,
		hcsTopicId: env.HCS_TOPIC_ID,
		saucerswapRouter: env.SAUCERSWAP_ROUTER,
		stablecoinTokenId: env.STABLECOIN_TOKEN_ID,
		merchantAccountId: env.MERCHANT_ACCOUNT_ID,
		operatorId: env.HEDERA_OPERATOR_ID,
		operatorKey: env.HEDERA_OPERATOR_PRIVATE_KEY,
	},
};

export type { HederaNetwork };
