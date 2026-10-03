import { config, type IntegrationConfig } from "@repo/shared";
import { Result } from "better-result";
import {
	NotConfiguredError,
	type SwapError,
	type SwapRequest,
	type SwapResult,
	SwapUnavailableError,
} from "./types";

/**
 * Swap HBAR → stablecoin on SaucerSwap.
 *
 * Stub by default: when `SAUCERSWAP_ROUTER` / `STABLECOIN_TOKEN_ID` are not
 * configured it returns a typed `NotConfiguredError` without touching the
 * network; when they are configured it still returns a typed
 * `SwapUnavailableError` until the real router call is wired in the
 * integration ticket. Either way nothing throws and boot is unaffected.
 */
export const swapHbarToStablecoin = async (
	request: SwapRequest,
	deps: IntegrationConfig = config.integration,
): Promise<Result<SwapResult, SwapError>> => {
	if (!deps.saucerswapRouter || !deps.stablecoinTokenId) {
		return Result.err(
			new NotConfiguredError({
				setting: "SAUCERSWAP_ROUTER / STABLECOIN_TOKEN_ID",
				message: `Swap skipped for order ${request.reference}: SaucerSwap is not configured.`,
			}),
		);
	}

	// Seam for the integration: quote against `deps.saucerswapRouter` on
	// `deps.network`, transfer `request.hbarAmount` from the payer, return
	// the received `deps.stablecoinTokenId` amount + tx id.
	return Result.err(
		new SwapUnavailableError({
			network: deps.network,
			message: `Swap pending on ${deps.network}: SaucerSwap call not wired yet; payment ${request.reference} stays in HBAR.`,
		}),
	);
};
