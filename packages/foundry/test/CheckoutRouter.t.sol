// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {
    AggregatorV3Interface,
    CheckoutRouter,
    FeedDecimalsTooHigh,
    FeedNotSet,
    IncompleteRound,
    InvalidConfig,
    InvalidPrice,
    NoPayment,
    NoQuotedPrice,
    NotMerchant,
    PriceDeviation,
    StalePrice
} from "../src/CheckoutRouter.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";

contract CheckoutRouterTest is Test {
    /// @dev HBAR/USD at the feed's native precision: $0.25 with 8 decimals.
    int256 internal constant ANSWER = 25_000_000;
    /// @dev The same $0.25 normalized to 18 decimals.
    uint256 internal constant PRICE_18 = 2.5e17;
    uint256 internal constant TOLERANCE_BPS = 500;
    uint256 internal constant MAX_AGE = 3600;

    MockV3Aggregator internal feed;
    CheckoutRouter internal router;
    address internal merchant;
    address internal alice;

    function setUp() public {
        vm.warp(1_000_000);
        merchant = makeAddr("merchant");
        alice = makeAddr("alice");

        feed = new MockV3Aggregator(8, ANSWER);
        router = new CheckoutRouter(
            AggregatorV3Interface(address(feed)), merchant, TOLERANCE_BPS, MAX_AGE
        );
        vm.deal(alice, 1_000 ether);
    }

    // --- construction ---

    function test_ConstructorCachesConfig() public view {
        assertEq(address(router.priceFeed()), address(feed));
        assertEq(router.priceDecimals(), 8);
        assertEq(router.merchant(), merchant);
        assertEq(router.priceToleranceBps(), TOLERANCE_BPS);
        assertEq(router.maxPriceAge(), MAX_AGE);
    }

    function test_ConstructorRejectsZeroFeed() public {
        vm.expectRevert(FeedNotSet.selector);
        new CheckoutRouter(AggregatorV3Interface(address(0)), merchant, TOLERANCE_BPS, MAX_AGE);
    }

    function test_ConstructorRejectsZeroMerchant() public {
        vm.expectRevert(InvalidConfig.selector);
        new CheckoutRouter(AggregatorV3Interface(address(feed)), address(0), TOLERANCE_BPS, MAX_AGE);
    }

    function test_ConstructorRejectsToleranceAboveMax() public {
        vm.expectRevert(InvalidConfig.selector);
        new CheckoutRouter(AggregatorV3Interface(address(feed)), merchant, 10_001, MAX_AGE);
    }

    function test_ConstructorRejectsZeroMaxAge() public {
        vm.expectRevert(InvalidConfig.selector);
        new CheckoutRouter(AggregatorV3Interface(address(feed)), merchant, TOLERANCE_BPS, 0);
    }

    function test_ConstructorRejectsExcessiveFeedDecimals() public {
        MockV3Aggregator wideFeed = new MockV3Aggregator(19, 1);
        vm.expectRevert(abi.encodeWithSelector(FeedDecimalsTooHigh.selector, 19));
        new CheckoutRouter(
            AggregatorV3Interface(address(wideFeed)), merchant, TOLERANCE_BPS, MAX_AGE
        );
    }

    // --- accepting payments ---

    function test_PayAcceptsMatchingPriceAndEmits() public {
        vm.expectEmit(true, false, false, false, address(router));
        emit CheckoutRouter.PaymentReceived("order-1", alice, 1 ether, PRICE_18, PRICE_18, PRICE_18);

        vm.prank(alice);
        uint256 price18 = router.pay{value: 1 ether}("order-1", PRICE_18);

        assertEq(price18, PRICE_18);
        assertEq(address(router).balance, 1 ether);
    }

    function test_PayAcceptsExactlyAtTolerance() public {
        // $0.2375 — exactly 500 bps below the $0.25 quote.
        feed.setAnswer(23_750_000);
        assertEq(router.pay{value: 1 ether}("order-1", PRICE_18), 2.375e17);

        // $0.2625 — exactly 500 bps above the $0.25 quote.
        feed.setAnswer(26_250_000);
        assertEq(router.pay{value: 1 ether}("order-2", PRICE_18), 2.625e17);

        assertEq(address(router).balance, 2 ether);
    }

    function test_PayAcceptsAnswerAtExactMaxAge() public {
        feed.setUpdatedAt(block.timestamp - MAX_AGE);
        assertEq(router.pay{value: 1 ether}("order-1", PRICE_18), PRICE_18);
    }

    function test_PayNormalizesSixDecimalFeed() public {
        MockV3Aggregator sixFeed = new MockV3Aggregator(6, 250_000);
        CheckoutRouter sixRouter = new CheckoutRouter(
            AggregatorV3Interface(address(sixFeed)), merchant, TOLERANCE_BPS, MAX_AGE
        );
        assertEq(sixRouter.pay{value: 1 ether}("order-1", PRICE_18), PRICE_18);
    }

    // --- rejecting payments ---

    function test_PayRejectsWhenDeviationExceedsTolerance() public {
        // Feed says $0.25, quote says $0.30 → (5e16 * 10000) / 3e17 = 1666 bps.
        vm.expectRevert(
            abi.encodeWithSelector(PriceDeviation.selector, PRICE_18, 3e17, 1666, TOLERANCE_BPS)
        );
        router.pay{value: 1 ether}("order-1", 3e17);
    }

    function test_PayRejectsJustBeyondTolerance() public {
        // $0.2626 vs the $0.25 quote → 504 bps, one past the limit.
        feed.setAnswer(26_260_000);
        vm.expectRevert(
            abi.encodeWithSelector(PriceDeviation.selector, 2.626e17, PRICE_18, 504, TOLERANCE_BPS)
        );
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsStalePrice() public {
        uint256 staleAt = block.timestamp - MAX_AGE - 1;
        feed.setUpdatedAt(staleAt);
        vm.expectRevert(abi.encodeWithSelector(StalePrice.selector, staleAt, MAX_AGE));
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsFutureTimestamp() public {
        uint256 futureAt = block.timestamp + 100;
        feed.setUpdatedAt(futureAt);
        vm.expectRevert(abi.encodeWithSelector(StalePrice.selector, futureAt, MAX_AGE));
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsIncompleteRound() public {
        feed.setRound(2, 1);
        vm.expectRevert(IncompleteRound.selector);
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsZeroUpdatedAt() public {
        feed.setUpdatedAt(0);
        vm.expectRevert(IncompleteRound.selector);
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsZeroPrice() public {
        feed.setAnswer(0);
        vm.expectRevert(InvalidPrice.selector);
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsNegativePrice() public {
        feed.setAnswer(-1);
        vm.expectRevert(InvalidPrice.selector);
        router.pay{value: 1 ether}("order-1", PRICE_18);
    }

    function test_PayRejectsZeroValue() public {
        vm.expectRevert(NoPayment.selector);
        router.pay("order-1", PRICE_18);
    }

    function test_PayRejectsZeroQuote() public {
        vm.expectRevert(NoQuotedPrice.selector);
        router.pay{value: 1 ether}("order-1", 0);
    }

    function test_PlainTransferIsRejected() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(router).call{value: 0.1 ether}("");
        assertFalse(ok);
        assertEq(address(router).balance, 0);
    }

    // --- withdrawals ---

    function test_WithdrawRejectsNonMerchant() public {
        vm.expectRevert(NotMerchant.selector);
        vm.prank(alice);
        router.withdraw();
    }

    function test_WithdrawSweepsToMerchant() public {
        router.pay{value: 1 ether}("order-1", PRICE_18);
        assertEq(address(router).balance, 1 ether);

        vm.prank(merchant);
        router.withdraw();

        assertEq(address(router).balance, 0);
        assertEq(merchant.balance, 1 ether);
    }

    // --- fuzz ---

    function testFuzz_PayAcceptsWithinTolerance(uint96 rawAmount, uint64 rawAnswer) public {
        uint256 payment = bound(rawAmount, 1, 1_000 ether);
        // Both edges land exactly on the 500 bps tolerance and must pass.
        uint256 answer = bound(rawAnswer, 23_750_000, 26_250_000);
        feed.setAnswer(int256(answer));
        vm.deal(alice, payment);

        vm.prank(alice);
        router.pay{value: payment}("order-fuzz", PRICE_18);

        assertEq(address(router).balance, payment);
    }

    function testFuzz_PayRejectsOutsideTolerance(uint64 rawAnswer) public {
        // Upper bound sits one cent of a cent past the rejection edge, so the
        // computed deviation is always at least 501 bps.
        uint256 answer = bound(rawAnswer, 1, 23_747_500);
        feed.setAnswer(int256(answer));

        uint256 price18 = (answer * 1e18) / 1e8;
        uint256 deviationBps = ((PRICE_18 - price18) * 10_000) / PRICE_18;

        vm.expectRevert(
            abi.encodeWithSelector(
                PriceDeviation.selector, price18, PRICE_18, deviationBps, TOLERANCE_BPS
            )
        );
        router.pay{value: 1 ether}("order-fuzz", PRICE_18);
    }
}
