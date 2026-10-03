import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";

/**
 * Hedera testnet as an EVM chain (chain id 296, Hashio JSON-RPC). The
 * checkout contract and the wallets that pay it live here; mainnet is
 * deliberately not offered — this template is testnet-only.
 */
export const hederaTestnet = defineChain({
	id: 296,
	name: "Hedera Testnet",
	nativeCurrency: {
		name: "HBAR",
		symbol: "HBAR",
		decimals: 18,
	},
	rpcUrls: {
		default: { http: ["https://testnet.hashio.io/api"] },
	},
	blockExplorers: {
		default: { name: "Hashscan", url: "https://hashscan.io/testnet" },
	},
	testnet: true,
});

/**
 * Wagmi config for the checkout. Browser-wallet (EIP-6963/injected) only —
 * no WalletConnect cloud projectId, so the app connects out of the box with
 * zero external services configured. `ssr` keeps renders deterministic under
 * TanStack Start; account state hydrates after mount.
 *
 * `shimDisconnect: false` deliberately skips wagmi's `wallet_requestPermissions`
 * short-cut on fresh connects and always runs `eth_requestAccounts` — the
 * full per-dapp approval. Strict wallets like HashPack only authorize
 * `eth_sendTransaction` when the session was granted that way; a bare
 * `eth_accounts` permission yields EIP-1193 4100 "not authorized" on send.
 */
export const wagmiConfig = createConfig({
	chains: [hederaTestnet],
	connectors: [injected({ shimDisconnect: false })],
	transports: { [hederaTestnet.id]: http() },
	ssr: true,
});
