// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {AggregatorV3Interface, CheckoutRouter} from "../src/CheckoutRouter.sol";

/// @title Deploy CheckoutRouter
/// @notice Env-driven testnet deploy. Feed addresses are Hedera-specific —
///         set `CHAINLINK_HBAR_USD_FEED` to an address from the Chainlink
///         docs for your network (chain 296 testnet / 295 mainnet); never
///         reuse an Ethereum aggregator address (plan §8).
contract Deploy is Script {
    /// @dev Defaults: 5% deviation tolerance, 24 hours max feed age — the
    ///      Hedera testnet HBAR/USD adapter refreshes well over hourly
    ///      (observed gaps of 3.5h+ between rounds), so an hour would make
    ///      every live payment revert `PriceStale` (plan §8).
    function run() external returns (CheckoutRouter deployed) {
        address feed = vm.envAddress("CHAINLINK_HBAR_USD_FEED");
        address merchantEvm = vm.envAddress("MERCHANT_EVM_ADDRESS");
        uint256 toleranceBps = vm.envOr("PRICE_TOLERANCE_BPS", uint256(500));
        uint256 maxPriceAge = vm.envOr("MAX_PRICE_AGE_SECONDS", uint256(86_400));

        vm.startBroadcast();
        deployed =
            new CheckoutRouter(AggregatorV3Interface(feed), merchantEvm, toleranceBps, maxPriceAge);
        vm.stopBroadcast();
    }
}
