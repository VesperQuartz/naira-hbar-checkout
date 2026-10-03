/**
 * Settlement seam — server-only. The API layer calls swap and HCS receipt
 * behind these typed interfaces; the HCS receipt signs with the operator
 * from config when present, the SaucerSwap swap is still a typed stub, and
 * both fail safely so boot never depends on secrets or live integrations.
 *
 * Testnet vs mainnet behaviour (plan §8, mirrored here so implementers see
 * it at the call site):
 *
 * - Network selection comes from `HEDERA_NETWORK` (default `testnet`) via
 *   `config.integration.network`; operator keys stay in the process env
 *   (`HEDERA_OPERATOR_*`) and are never imported into code.
 * - Chainlink HBAR/USD feed: the feed is verified on mainnet. If no usable
 *   testnet feed exists, read the mainnet feed read-only for the price
 *   check and say so in the README — the bounty allows this.
 * - SaucerSwap: if testnet liquidity is not usable, keep the payment, the
 *   Chainlink price check and the HCS receipt, and describe the swap as the
 *   planned next step (plan §8 fallback). `swapHbarToStablecoin` then keeps
 *   returning a typed `SwapUnavailableError` with the network on it.
 */

export { writeHcsReceipt } from "./receipt";
export { swapHbarToStablecoin } from "./swap";
export {
	HcsSubmitError,
	NotConfiguredError,
	type ReceiptError,
	type ReceiptRequest,
	type ReceiptResult,
	type SwapError,
	type SwapRequest,
	type SwapResult,
	SwapUnavailableError,
} from "./types";
