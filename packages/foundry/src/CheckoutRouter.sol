// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal Chainlink AggregatorV3 surface — Hedera feeds expose the
///         same ABI as every other Chainlink network.
interface AggregatorV3Interface {
    /// @return decimals Number of decimals the feed's answers use (often 8).
    function decimals() external view returns (uint8);

    /// @return roundId Round id of the latest answer.
    /// @return answer Price (signed, feed decimals).
    /// @return startedAt Timestamp the round started.
    /// @return updatedAt Timestamp the round was last answered.
    /// @return answeredInRound Round id the answer was produced for.
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}

// --- custom errors (cheap on-chain, easy to assert in tests) ---

error FeedNotSet();
error InvalidConfig();
error FeedDecimalsTooHigh(uint8 feedDecimals);
error IncompleteRound();
error InvalidPrice();
error NoQuotedPrice();
error StalePrice(uint256 updatedAt, uint256 maxPriceAge);
error PriceDeviation(
    uint256 price18, uint256 quotedPrice18, uint256 deviationBps, uint256 toleranceBps
);
error NoPayment();
error NotMerchant();
error WithdrawFailed();

/// @title CheckoutRouter — HBAR payment with an on-chain Chainlink price check
/// @notice Accepts an HBAR payment for a quoted order, cross-checks the
///         quoted HBAR/USD price against a Chainlink feed, and emits a
///         `PaymentReceived` event carrying the order reference and amounts
///         so the off-chain HCS receipt can be correlated with it.
///
/// Guardrails, in order:
/// 1. non-zero payment (`msg.value`); plain HBAR transfers are rejected
///    (there is no `receive()`), only `pay()` with a reference works
/// 2. feed round completeness (`answeredInRound >= roundId`, `updatedAt != 0`)
/// 3. non-positive price and non-positive quote
/// 4. price freshness vs `maxPriceAge`
/// 5. deviation of the feed price from the quoted price ≤ `priceToleranceBps`
///
/// Testnet vs mainnet feed fallback (plan §8):
/// - Feed addresses are Hedera-specific — source them from the Chainlink
///   docs for Hedera (chain `296` testnet, `295` mainnet). Never copy an
///   Ethereum aggregator address onto Hedera.
/// - The HBAR/USD feed is verified on Hedera mainnet. Confirm the pair
///   exists for your target network before deploying. If testnet has no
///   usable HBAR/USD feed, the documented fallback is: the app quotes from
///   a read-only mainnet HBAR/USD read (that value arrives here as
///   `quotedPrice18`), this contract is deployed against whichever Hedera
///   testnet USD feed is available, and the README records which address was
///   used. The deviation guardrail stays in force either way.
contract CheckoutRouter {
    /// @notice Chainlink aggregator cross-checked at payment time.
    AggregatorV3Interface public immutable priceFeed;
    /// @notice Decimals of `priceFeed`, cached at construction.
    uint8 public immutable priceDecimals;
    /// @notice Account that can withdraw collected HBAR (payout address).
    address public immutable merchant;
    /// @notice Maximum accepted deviation feed-vs-quote, in basis points.
    uint256 public immutable priceToleranceBps;
    /// @notice Maximum accepted age of the feed answer, in seconds.
    uint256 public immutable maxPriceAge;

    /// @notice Emitted for every accepted payment.
    /// @param orderRef Off-chain order reference (correlates to HCS receipt).
    /// @param payer Account that sent the HBAR.
    /// @param amountHbar Payment value in wei (18dp HBAR).
    /// @param amountUsd18 Payment value in USD at the feed price (18dp).
    /// @param price18 Feed HBAR/USD price normalized to 18dp.
    /// @param quotedPrice18 Quoted HBAR/USD price the payer expected (18dp).
    event PaymentReceived(
        string orderRef,
        address indexed payer,
        uint256 amountHbar,
        uint256 amountUsd18,
        uint256 price18,
        uint256 quotedPrice18
    );

    /// @param priceFeed_ Hedera Chainlink aggregator for HBAR/USD.
    /// @param merchant_ Payout address for collected HBAR.
    /// @param priceToleranceBps_ Max deviation in bps (500 = 5%, max 10000).
    /// @param maxPriceAge_ Max feed answer age in seconds.
    constructor(
        AggregatorV3Interface priceFeed_,
        address merchant_,
        uint256 priceToleranceBps_,
        uint256 maxPriceAge_
    ) {
        if (address(priceFeed_) == address(0)) revert FeedNotSet();
        if (merchant_ == address(0) || priceToleranceBps_ > 10_000 || maxPriceAge_ == 0) {
            revert InvalidConfig();
        }

        uint8 feedDecimals = priceFeed_.decimals();
        if (feedDecimals > 18) revert FeedDecimalsTooHigh(feedDecimals);

        priceFeed = priceFeed_;
        priceDecimals = feedDecimals;
        merchant = merchant_;
        priceToleranceBps = priceToleranceBps_;
        maxPriceAge = maxPriceAge_;
    }

    /// @notice Pay for an order after the off-chain price check.
    /// @param orderRef Off-chain order reference to correlate.
    /// @param quotedPrice18 HBAR/USD price the quote was issued at (18dp).
    /// @return price18 The feed price that was checked, normalized to 18dp.
    function pay(string calldata orderRef, uint256 quotedPrice18)
        external
        payable
        returns (uint256 price18)
    {
        if (msg.value == 0) revert NoPayment();

        price18 = _readPrice18();

        if (quotedPrice18 == 0) revert NoQuotedPrice();
        uint256 deviationBps = _deviationBps(price18, quotedPrice18);
        if (deviationBps > priceToleranceBps) {
            revert PriceDeviation(price18, quotedPrice18, deviationBps, priceToleranceBps);
        }

        uint256 amountUsd18 = (msg.value * price18) / 1e18;
        emit PaymentReceived(orderRef, msg.sender, msg.value, amountUsd18, price18, quotedPrice18);
    }

    /// @notice Sweep collected HBAR to the merchant.
    function withdraw() external {
        if (msg.sender != merchant) revert NotMerchant();
        (bool ok,) = merchant.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    /// @dev Completeness → positivity → freshness → normalize to 18dp
    ///      (rounding down, per the Chainlink consumer checklist).
    function _readPrice18() internal view returns (uint256) {
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) =
            priceFeed.latestRoundData();

        if (answeredInRound < roundId || updatedAt == 0) revert IncompleteRound();
        if (answer <= 0) revert InvalidPrice();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxPriceAge) {
            revert StalePrice(updatedAt, maxPriceAge);
        }

        return (uint256(answer) * 1e18) / (10 ** priceDecimals);
    }

    /// @dev Deviation of `price18` vs the quoted reference, in bps.
    function _deviationBps(uint256 price18, uint256 quotedPrice18) internal pure returns (uint256) {
        uint256 diff = price18 > quotedPrice18 ? price18 - quotedPrice18 : quotedPrice18 - price18;
        return (diff * 10_000) / quotedPrice18;
    }
}
