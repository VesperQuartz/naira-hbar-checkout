/**
 * Order → confirm → status smoke run against the local database.
 *
 *   pnpm --filter @repo/orpc smoke
 *
 * With no HCS/SaucerSwap configured it proves the plan §8 fallback: the
 * payment is persisted, both steps report typed "not configured" reasons,
 * and `status` reads the order back. With `HCS_TOPIC_ID` + operator set it
 * additionally writes a real receipt message and returns it from `status`.
 * Arrow-function style throughout — repo rule.
 */
import { loadRepoEnv } from "./load-env";

// Load .env first — the router parses config at import time.
loadRepoEnv();

const { call } = await import("@orpc/server");
const { checkoutRouter } = await import("../src/routers/checkout/index");

const main = async () => {
	const created = await call(
		checkoutRouter.create,
		{ amountNgn: 25_000 },
		{ context: {} },
	);
	console.log("created:", created.id, created.state, created.reference);

	const confirmed = await call(
		checkoutRouter.confirm,
		{ orderId: created.id, paymentTxHash: "0xabc123def45678901" },
		{ context: {} },
	);
	console.log("confirm order.state:", confirmed.order.state);
	console.log(
		"confirm swap:",
		confirmed.swap.ok ? "ok" : `${confirmed.swap.code}`,
	);
	console.log(
		"confirm receipt:",
		confirmed.receipt.ok ? "ok" : `${confirmed.receipt.code}`,
	);
	console.log("confirm notes:", confirmed.notes);

	const status = await call(
		checkoutRouter.status,
		{ orderId: created.id },
		{ context: {} },
	);
	console.log(
		"status:",
		status.state,
		"| paymentTxHash:",
		status.paymentTxHash,
		"| receipt:",
		status.receipt,
	);
};

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
