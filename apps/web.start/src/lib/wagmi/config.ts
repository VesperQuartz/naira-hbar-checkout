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
 * no WalletConnect cloud projectId, so the app boots and connects with zero
 * external services configured. `ssr` keeps renders deterministic under
 * TanStack Start; account state hydrates after mount.
 */
export const wagmiConfig = createConfig({
	chains: [hederaTestnet],
	connectors: [injected()],
	transports: { [hederaTestnet.id]: http() },
	ssr: true,
});
