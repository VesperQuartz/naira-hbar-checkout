import { loadRepoEnv } from "./load-env";

/**
 * Live end-to-end proof against Hedera testnet (ticket 10):
 *
 *   pnpm --filter @repo/orpc proof
 *
 * Creates an order, pays it on `CheckoutRouter.pay()` (the Chainlink price
 * check runs on-chain), confirms with the real transaction hash, writes the
 * HCS receipt, and prints Hashscan/mirror links. Spends a little testnet
 * HBAR. Requires in `.env`: funded `HEDERA_OPERATOR_ID`/`HEDERA_OPERATOR_PRIVATE_KEY`,
 * `CHAINLINK_HBAR_USD_FEED`, `CHECKOUT_CONTRACT_ADDRESS`, `HCS_TOPIC_ID`,
 * and `DATABASE_URL` for the order/receipt rows.
 *
 * Arrow-function style throughout — repo rule.
 */

// Load .env first — the router parses config at import time.
loadRepoEnv();

const { parseSigningKey } = await import("../src/settlement/hedera-key");

/** Sleep helper for mirror-node polling. */
const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Decimal string → integer units at `decimals` precision (no float math). */
const toUnits = (value: string, decimals: number): bigint => {
	const [whole, fraction = ""] = String(value).split(".");
	if (whole === "" && fraction === "") {
		throw new Error(`not a decimal amount: ${value}`);
	}
	const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
	return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
};

/** GET one mirror-node endpoint as JSON. */
const mirrorGet = async <T>(url: string): Promise<T> => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`mirror node HTTP ${response.status} for ${url}`);
	}
	return (await response.json()) as T;
};

/**
 * Hedera tx id (`0.0.x@sec.nanos`) → EVM `0x…` payment hash. The mirror's
 * single-transaction endpoint only accepts the dashed id form and carries no
 * EVM hash, so walk tx → `consensus_timestamp` → contract-result `hash`.
 * Polls: the mirror may take a moment to index a fresh transaction.
 */
const waitForEthereumHash = async (
	mirror: string,
	contractAddress: string,
	transactionId: string,
): Promise<string> => {
	const dashedId = transactionId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
	for (let attempt = 0; attempt < 15; attempt += 1) {
		const txResponse = await fetch(`${mirror}/api/v1/transactions/${dashedId}`);
		if (txResponse.ok) {
			const tx = (await txResponse.json()) as {
				transactions?: Array<{ consensus_timestamp?: string }>;
			};
			const consensusTimestamp = tx.transactions?.[0]?.consensus_timestamp;
			if (consensusTimestamp) {
				const resultResponse = await fetch(
					`${mirror}/api/v1/contracts/${contractAddress}/results/${consensusTimestamp}`,
				);
				if (resultResponse.ok) {
					const result = (await resultResponse.json()) as {
						hash?: string;
					};
					if (result.hash) {
						return result.hash;
					}
				}
			}
		}
		await sleep(1000);
	}
	throw new Error(
		`mirror node never returned an EVM hash for ${transactionId}`,
	);
};

const requireEnv = (name: string): string => {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Set ${name} in .env first.`);
	}
	return value;
};

const main = async () => {
	const network =
		process.env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
	const operatorId = requireEnv("HEDERA_OPERATOR_ID");
	const operatorKey = requireEnv("HEDERA_OPERATOR_PRIVATE_KEY");
	const contractAddress = requireEnv("CHECKOUT_CONTRACT_ADDRESS");
	const amountNgn = Number(process.env.PROOF_AMOUNT_NGN ?? 5000);
	const mirror = `https://${network}.mirrornode.hedera.com`;

	const { call } = await import("@orpc/server");
	const { checkoutRouter } = await import("../src/routers/checkout/index");
	const {
		Client,
		ContractExecuteTransaction,
		ContractFunctionParameters,
		ContractId,
		HbarUnit,
	} = await import("@hashgraph/sdk");

	// 1. Quote (reads the Chainlink feed off-chain) + persist the order.
	const order = await call(
		checkoutRouter.create,
		{ amountNgn, buyerAccountId: operatorId },
		{ context: {} },
	);
	console.log(
		`1. order ${order.id} (${order.reference}): ${order.amountNgn} NGN = ${order.amountHbar} HBAR @ ${order.hbarUsdAtQuote} USD/HBAR`,
	);

	// 2. Pay on the contract — this runs the on-chain Chainlink price check.
	const contract = await mirrorGet<{ contract_id: string }>(
		`${mirror}/api/v1/contracts/${contractAddress}`,
	);
	const client = Client.forNetwork(network).setOperator(
		operatorId,
		parseSigningKey(operatorKey),
	);
	let transactionId: string;
	try {
		const transaction = new ContractExecuteTransaction()
			.setContractId(ContractId.fromString(contract.contract_id))
			.setGas(300_000)
			.setPayableAmount(Number(toUnits(order.amountHbar, 8)), HbarUnit.Tinybar)
			.setFunction(
				"pay",
				new ContractFunctionParameters()
					.addString(order.reference)
					.addUint256(toUnits(String(order.hbarUsdAtQuote), 18).toString()),
			);
		const response = await transaction.execute(client);
		await response.getReceipt(client);
		transactionId = response.transactionId.toString();
	} finally {
		client.close();
	}
	console.log(`2. pay() accepted on chain — tx ${transactionId}`);

	// 3. Confirm with the real EVM transaction hash.
	const paymentTxHash = await waitForEthereumHash(
		mirror,
		contractAddress,
		transactionId,
	);
	console.log(`3. payment ethereum hash ${paymentTxHash}`);

	const confirmed = await call(
		checkoutRouter.confirm,
		{ orderId: order.id, paymentTxHash, payerAccountId: operatorId },
		{ context: {} },
	);
	console.log(
		`4. confirm → order ${confirmed.order.state}; swap ${
			confirmed.swap.ok ? "ok" : confirmed.swap.code
		}; receipt ${confirmed.receipt.ok ? "ok" : confirmed.receipt.code}`,
	);
	if (confirmed.notes.length > 0) {
		console.log(`   notes: ${confirmed.notes.join(" | ")}`);
	}

	// 5. Read it all back and print the proof links.
	const status = await call(
		checkoutRouter.status,
		{ orderId: order.id },
		{ context: {} },
	);
	const receipt = status.receipt;
	console.log(`5. status → ${status.state}; receipt:`, receipt);
	if (!receipt) {
		throw new Error("no receipt row was persisted — see notes above");
	}

	const links = [
		[`contract`, `https://hashscan.io/${network}/contract/${contractAddress}`],
		[
			`payment tx`,
			`https://hashscan.io/${network}/transaction/${transactionId}`,
		],
		[
			`receipt msg`,
			`https://hashscan.io/${network}/transaction/${receipt.messageReference}`,
		],
		[`topic`, `https://hashscan.io/${network}/topic/${receipt.topicId}`],
		[
			`topic messages (mirror)`,
			`${mirror}/api/v1/topics/${receipt.topicId}/messages`,
		],
	];
	console.log("\nProof links:");
	for (const [label, url] of links) {
		console.log(`  ${label}: ${url}`);
	}
};

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
