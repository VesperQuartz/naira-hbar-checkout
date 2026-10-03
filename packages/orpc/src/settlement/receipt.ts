import { Client, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import {
	config,
	type HederaNetwork,
	type IntegrationConfig,
} from "@repo/shared";
import { Result } from "better-result";
import { parseSigningKey } from "./hedera-key";
import {
	HcsSubmitError,
	NotConfiguredError,
	type ReceiptError,
	type ReceiptRequest,
	type ReceiptResult,
} from "./types";

/** Hedera SDK network name for the configured deployment target. */
const sdkNetwork = (network: HederaNetwork): "testnet" | "mainnet" => network;

/**
 * Write one payment receipt message to an HCS topic.
 *
 * Requires `HCS_TOPIC_ID` plus an operator (`HEDERA_OPERATOR_ID` /
 * `HEDERA_OPERATOR_PRIVATE_KEY`) to sign the submission. Anything missing
 * returns a typed `NotConfiguredError` without touching the network, so
 * boot and unconfigured deployments stay safe; a submission the network
 * rejects returns a typed `HcsSubmitError`. Nothing throws either way.
 */
export const writeHcsReceipt = async (
	request: ReceiptRequest,
	deps: IntegrationConfig = config.integration,
): Promise<Result<ReceiptResult, ReceiptError>> => {
	const topicId = request.topicId ?? deps.hcsTopicId;
	if (!topicId) {
		return Result.err(
			new NotConfiguredError({
				setting: "HCS_TOPIC_ID",
				message: `Receipt skipped for order ${request.reference}: no HCS topic configured.`,
			}),
		);
	}
	if (!deps.operatorId || !deps.operatorKey) {
		return Result.err(
			new NotConfiguredError({
				setting: "HEDERA_OPERATOR_ID / HEDERA_OPERATOR_PRIVATE_KEY",
				message: `Receipt skipped for order ${request.reference}: no operator configured to sign the HCS message on ${deps.network} (topic ${topicId}).`,
			}),
		);
	}

	// The receipt body anyone can read back from the topic/mirror node.
	const payload = JSON.stringify({
		orderId: request.orderId,
		reference: request.reference,
		amountNgn: request.amountNgn,
		amountHbar: request.amountHbar,
		paymentTxHash: request.paymentTxHash ?? null,
		swapTxHash: request.swapTxHash ?? null,
		settlementState: request.settlementState,
	});

	return Result.tryPromise({
		try: async () => {
			const key = parseSigningKey(deps.operatorKey as string);
			const client = Client.forNetwork(sdkNetwork(deps.network)).setOperator(
				deps.operatorId as string,
				key,
			);
			try {
				const response = await new TopicMessageSubmitTransaction()
					.setTopicId(topicId)
					.setMessage(payload)
					.execute(client);
				await response.getReceipt(client);
				return {
					// On-chain reference for the proof link (Hashscan transaction).
					messageId: response.transactionId.toString(),
					topicId,
				};
			} finally {
				client.close();
			}
		},
		catch: (cause) =>
			new HcsSubmitError({
				network: deps.network,
				topicId,
				message: `HCS submit failed for order ${request.reference} on ${deps.network} (topic ${topicId}).`,
				cause,
			}),
	});
};
