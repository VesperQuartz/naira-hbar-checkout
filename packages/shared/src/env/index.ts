import { z } from "zod";

// Treat unset and empty-string values the same way, so a blank entry in
// .env / .envrc degrades to "absent" instead of failing validation at boot.
const unset = (value: unknown): unknown => (value === "" ? undefined : value);

const optionalString = z.preprocess(unset, z.optional(z.string()));

/** Hedera networks the integration can target. */
export const HEDERA_NETWORKS = ["testnet", "mainnet"] as const;

export type HederaNetwork = (typeof HEDERA_NETWORKS)[number];

const envSchema = z.readonly(
	z.object({
		DATABASE_URL: optionalString,
		BETTER_AUTH_SECRET: optionalString,
		BETTER_AUTH_URL: optionalString,
		VITE_PUBLIC_API_URL: optionalString,

		// Demo-only Naira rate — single source of truth for the ₦ prices in
		// this template. It is a fixed demo figure, not a live FX rate.
		DEMO_NGN_PER_USD: z.preprocess(
			unset,
			z.coerce.number().positive().default(1500),
		),
		// Integration targets; every value below is optional and the app
		// boots without them (stubs report "not configured" instead).
		HEDERA_NETWORK: z.preprocess(
			unset,
			z.enum(HEDERA_NETWORKS).default("testnet"),
		),
		CHAINLINK_HBAR_USD_FEED: optionalString,
		// JSON-RPC endpoint used to read the feed off-chain for quotes.
		// Optional; defaults to the Hashio endpoint for HEDERA_NETWORK.
		CHAINLINK_RPC_URL: optionalString,
		// Deployed CheckoutRouter the web UI sends `pay()` transactions to.
		// Optional and boot-safe: without it the checkout shows a configure
		// hint instead of a pay button (never commit real keys — this is a
		// public on-chain address).
		CHECKOUT_CONTRACT_ADDRESS: optionalString,
		HCS_TOPIC_ID: optionalString,
		SAUCERSWAP_ROUTER: optionalString,
		STABLECOIN_TOKEN_ID: optionalString,
		MERCHANT_ACCOUNT_ID: optionalString,
		// Operator credentials used to sign HCS receipt submissions. Optional
		// and boot-safe: without them the receipt step reports "not
		// configured" instead of failing (never commit real keys).
		HEDERA_OPERATOR_ID: optionalString,
		HEDERA_OPERATOR_PRIVATE_KEY: optionalString,
	}),
);

export const env = envSchema.parse(process.env);
