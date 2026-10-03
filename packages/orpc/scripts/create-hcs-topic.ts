import { Client, TopicCreateTransaction } from "@hashgraph/sdk";
import { parseSigningKey } from "../src/settlement/hedera-key";
import { loadRepoEnv } from "./load-env";

/**
 * Create one HCS topic for payment receipts and print the HCS_TOPIC_ID to
 * paste into `.env`:
 *
 *   pnpm --filter @repo/orpc hcs:topic
 *
 * Reads `HEDERA_OPERATOR_ID` / `HEDERA_OPERATOR_PRIVATE_KEY` from the
 * environment, falling back to the repo-root `.env` (never committed).
 * Arrow-function style throughout — repo rule.
 */

const run = async () => {
	loadRepoEnv();

	const operatorId = process.env.HEDERA_OPERATOR_ID;
	const operatorKey = process.env.HEDERA_OPERATOR_PRIVATE_KEY;
	if (!operatorId || !operatorKey) {
		throw new Error(
			"Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_PRIVATE_KEY first (in .env) — a funded testnet account from https://portal.hedera.com/ works.",
		);
	}

	const network =
		process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
	const client = Client.forNetwork(network).setOperator(
		operatorId,
		parseSigningKey(operatorKey),
	);

	try {
		const response = await new TopicCreateTransaction().execute(client);
		const receipt = await response.getReceipt(client);
		const topicId = receipt.topicId?.toString() ?? "unknown";
		console.log(`Created HCS topic ${topicId} on ${network}.`);
		console.log(`Add to .env:  export HCS_TOPIC_ID=${topicId}`);
		console.log(
			`Mirror: https://${network}.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`,
		);
	} finally {
		client.close();
	}
};

run().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
