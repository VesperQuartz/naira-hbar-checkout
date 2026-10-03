import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IntegrationConfig } from "@repo/shared";
import { Result } from "better-result";
import { writeHcsReceipt } from "../src/settlement/receipt";
import { swapHbarToStablecoin } from "../src/settlement/swap";
import {
	HcsSubmitError,
	NotConfiguredError,
	type ReceiptRequest,
	type SwapRequest,
	SwapUnavailableError,
} from "../src/settlement/types";

const swapRequest: SwapRequest = {
	orderId: "order-id",
	reference: "order_ref",
	hbarAmount: "400.00000000",
};

const receiptRequest: ReceiptRequest = {
	orderId: "order-id",
	reference: "order_ref",
	amountNgn: "150000",
	amountHbar: "400",
	paymentTxHash: "0.0.123-1700000000-123456789",
	settlementState: "pending",
};

const unconfigured: IntegrationConfig = {
	network: "testnet",
	chainlinkHbarUsdFeed: undefined,
	hcsTopicId: undefined,
	saucerswapRouter: undefined,
	stablecoinTokenId: undefined,
	merchantAccountId: undefined,
	operatorId: undefined,
	operatorKey: undefined,
};

const configured: IntegrationConfig = {
	...unconfigured,
	saucerswapRouter: "0x0123456789abcdef",
	stablecoinTokenId: "0.0.2000",
	hcsTopicId: "0.0.1001",
};

/** Topic + operator present, but the key is unusable — submit must fail typed. */
const withOperator: IntegrationConfig = {
	...configured,
	operatorId: "0.0.5000",
	operatorKey: "not-a-key",
};

describe("swapHbarToStablecoin", () => {
	it("returns a typed NotConfiguredError when SaucerSwap is absent", async () => {
		const result = await swapHbarToStablecoin(swapRequest, unconfigured);

		assert.ok(Result.isError(result));
		assert.ok(NotConfiguredError.is(result.error));
		assert.equal(
			result.error.setting,
			"SAUCERSWAP_ROUTER / STABLECOIN_TOKEN_ID",
		);
	});

	it("returns a typed SwapUnavailableError when configured but unwired", async () => {
		const result = await swapHbarToStablecoin(swapRequest, configured);

		assert.ok(Result.isError(result));
		assert.ok(SwapUnavailableError.is(result.error));
		assert.equal(result.error.network, "testnet");
		assert.ok(result.error.message.includes("order_ref"));
	});
});

describe("writeHcsReceipt", () => {
	it("returns a typed NotConfiguredError without a topic", async () => {
		const result = await writeHcsReceipt(receiptRequest, unconfigured);

		assert.ok(Result.isError(result));
		assert.ok(NotConfiguredError.is(result.error));
		assert.equal(result.error.setting, "HCS_TOPIC_ID");
	});

	it("prefers a topic passed on the request over the config", async () => {
		const result = await writeHcsReceipt(
			{ ...receiptRequest, topicId: "0.0.555" },
			unconfigured,
		);

		// The request topic cleared the topic gate, so the failure is the
		// missing operator — and its message names the requested topic.
		assert.ok(Result.isError(result));
		assert.ok(NotConfiguredError.is(result.error));
		assert.equal(
			result.error.setting,
			"HEDERA_OPERATOR_ID / HEDERA_OPERATOR_PRIVATE_KEY",
		);
		assert.ok(result.error.message.includes("0.0.555"));
	});

	it("returns a typed NotConfiguredError when no operator is set", async () => {
		const result = await writeHcsReceipt(receiptRequest, configured);

		assert.ok(Result.isError(result));
		assert.ok(NotConfiguredError.is(result.error));
		assert.equal(
			result.error.setting,
			"HEDERA_OPERATOR_ID / HEDERA_OPERATOR_PRIVATE_KEY",
		);
		assert.ok(result.error.message.includes("0.0.1001"));
	});

	it("returns a typed HcsSubmitError when signing fails", async () => {
		const result = await writeHcsReceipt(receiptRequest, withOperator);

		assert.ok(Result.isError(result));
		assert.ok(HcsSubmitError.is(result.error));
		assert.equal(result.error.topicId, "0.0.1001");
		assert.equal(result.error.network, "testnet");
		assert.ok(result.error.message.includes("order_ref"));
	});
});
