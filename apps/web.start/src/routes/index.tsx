import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useEffect, useRef, useState } from "react";
import { parseAbi } from "viem";
import {
	useAccount,
	useBalance,
	useConnect,
	useDisconnect,
	useSwitchChain,
	useWaitForTransactionReceipt,
	useWriteContract,
} from "wagmi";
import { Odometer } from "@/components/odometer";
import {
	LogLine,
	RailPanel,
	StatusPill,
	StepPanel,
} from "@/components/terminal";
import { client, orpc } from "@/lib/orpc/client";
import { hederaTestnet } from "@/lib/wagmi/config";

const CHAIN_ID = hederaTestnet.id;
const HASHSCAN = "https://hashscan.io/testnet";
const WALLET_GET = "https://www.hashpack.app/";
const PRESETS = [1000, 5000, 50000] as const;

/** The only contract surface the browser talks to. */
const PAY_ABI = parseAbi([
	"function pay(string orderRef, uint256 quotedPrice18) payable returns (uint256)",
]);

/** Decimal string → integer units (no float math; mirrors the proof script). */
const toUnits = (value: string, decimals: number): bigint => {
	const [whole, fraction = ""] = String(value).split(".");
	const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
	return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
};

const formatNaira = (value: number): string =>
	`₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

const formatUsd = (value: number): string =>
	`$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;

const shortHash = (hash: string): string =>
	hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;

const countdown = (msLeft: number): string => {
	const total = Math.max(0, Math.floor(msLeft / 1000));
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** JSON transport turns `Date` into a string; normalize either shape. */
const toDate = (value: Date | string | null | undefined): Date | undefined => {
	if (!value) {
		return undefined;
	}
	return value instanceof Date ? value : new Date(value);
};

/** Wallet errors arrive as raw viem/wagmi messages — shorten to one line. */
const summarizeError = (error: unknown): string => {
	const message = error instanceof Error ? error.message : String(error);
	const friendly = /reject/i.test(message)
		? "Request rejected in the wallet."
		: /authorized by the user|code:?\s*4100/i.test(message)
			? "Your wallet has not authorized this site to send transactions — disconnect the site in your wallet (or reconnect here) and try again."
			: /insufficient funds/i.test(message)
				? "Not enough HBAR to cover the payment and gas."
				: /chain|network/i.test(message) &&
						/add|switch|unsupported/i.test(message)
					? "Your wallet does not have Hedera testnet yet — approving the switch should add it."
					: message.replace(/\(request id:.*$/i, "").trim();
	return friendly.length > 160 ? `${friendly.slice(0, 157)}…` : friendly;
};

/** Clock so expiry can tick without re-running the quote call. */
const useNow = (): number => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	return now;
};

type LockedOrder = Awaited<ReturnType<typeof client.checkout.create>>;
type ConfirmedSettlement = Awaited<ReturnType<typeof client.checkout.confirm>>;

const Checkout = () => {
	const now = useNow();

	// 01 — amount (debounced into a quote).
	const [amountInput, setAmountInput] = useState("");
	const [requested, setRequested] = useState<number>();
	const parsedAmount = Number(amountInput);
	const hasAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;

	useEffect(() => {
		if (!hasAmount) {
			setRequested(undefined);
			return;
		}
		const timer = setTimeout(() => setRequested(parsedAmount), 550);
		return () => clearTimeout(timer);
	}, [hasAmount, parsedAmount]);

	const quoteQuery = useQuery({
		...orpc.checkout.quote.queryOptions({
			input: { amountNgn: requested ?? 1 },
		}),
		enabled: requested !== undefined,
		staleTime: 0,
	});

	// 02 → 03 — the locked order the wallet pays against.
	const [locked, setLocked] = useState<LockedOrder | null>(null);
	const confirmAttempted = useRef<string | null>(null);

	const lockMutation = useMutation({
		mutationFn: (amountNgn: number) => client.checkout.create({ amountNgn }),
		onSuccess: (order) => setLocked(order),
	});

	const confirmMutation = useMutation({
		mutationFn: (input: { orderId: string; paymentTxHash: string }) =>
			client.checkout.confirm(input),
	});

	// A new amount invalidates a lock — unless we already settled it.
	const resetPayment = () => {
		resetTx();
		confirmMutation.reset();
		confirmAttempted.current = null;
	};

	const resetAll = () => {
		setAmountInput("");
		setRequested(undefined);
		setLocked(null);
		resetPayment();
	};

	// biome sees resetPayment's identity change every render, so the amount
	// invalidation effect (placed below the wallet/payment state it inspects)
	// reads it through a ref instead of listing it as a dependency.
	const resetPaymentRef = useRef(resetPayment);
	useEffect(() => {
		resetPaymentRef.current = resetPayment;
	});

	// Wallet.
	const [hasWallet, setHasWallet] = useState<boolean | undefined>();
	useEffect(() => {
		setHasWallet(
			typeof window !== "undefined" &&
				Boolean((window as { ethereum?: unknown }).ethereum),
		);
	}, []);
	const { address, isConnected, chainId, connector } = useAccount();
	const {
		connectors,
		connect,
		isPending: isConnecting,
		error: connectError,
	} = useConnect();
	const { disconnect } = useDisconnect();
	const { switchChain, isPending: isSwitching } = useSwitchChain();
	const { data: balance } = useBalance({ address });

	// Payment.
	const {
		writeContract,
		data: txHash,
		isPending: isSigning,
		error: txError,
		reset: resetTx,
	} = useWriteContract();
	const txReceipt = useWaitForTransactionReceipt({ hash: txHash });

	// Once the payment is mined, run settlement (swap note + HCS receipt).
	useEffect(() => {
		if (!txReceipt.isSuccess || !txHash || !locked) {
			return;
		}
		if (confirmAttempted.current === txHash) {
			return;
		}
		confirmAttempted.current = txHash;
		confirmMutation.mutate({
			orderId: locked.id,
			paymentTxHash: txHash,
		});
	}, [txReceipt.isSuccess, txHash, locked, confirmMutation]);

	// A new amount invalidates a lock — unless we already settled it, or a
	// payment is mid-flight (never orphan an on-chain transaction).
	useEffect(() => {
		if (!locked || confirmMutation.data || requested === undefined) {
			return;
		}
		if (isSigning || txReceipt.isLoading || confirmMutation.isPending) {
			return;
		}
		if (Number(locked.amountNgn) !== requested) {
			setLocked(null);
			resetPaymentRef.current();
		}
	}, [requested, locked, confirmMutation, isSigning, txReceipt.isLoading]);

	const settled = confirmMutation.data ?? null;

	// ---- derived readouts -------------------------------------------------
	const quote = quoteQuery.data;
	const activeHbar = locked
		? Number(locked.amountHbar)
		: (quote?.amountHbar ?? undefined);
	const hbarText =
		activeHbar !== undefined && hasAmount ? activeHbar.toFixed(4) : "————";
	const rate =
		locked !== null
			? Number(locked.hbarUsdAtQuote)
			: (quote?.hbarUsd ?? undefined);
	const expiresAt =
		locked !== null
			? toDate(locked.expiresAt)
			: quote
				? toDate(quote.expiresAt)
				: undefined;
	const expired = expiresAt !== undefined && expiresAt.getTime() <= now;
	const msLeft = expiresAt ? expiresAt.getTime() - now : 0;

	const headerConnect = () => {
		if (hasWallet === false) {
			window.open(WALLET_GET, "_blank", "noopener");
			return;
		}
		const connector = connectors[0];
		if (connector) {
			connect({ connector });
		}
	};

	const runPrimaryAction = async () => {
		// Settlement already paid on chain but confirm failed → retry it.
		if (confirmMutation.isError && txHash && locked) {
			confirmMutation.mutate({
				orderId: locked.id,
				paymentTxHash: txHash,
			});
			return;
		}
		// Lock (or re-lock an expired quote).
		if (!locked || expired) {
			if (hasAmount) {
				resetPayment();
				lockMutation.mutate(parsedAmount);
			}
			return;
		}
		if (!isConnected) {
			// No browser wallet: send the visitor somewhere useful instead of
			// letting the connector throw.
			if (hasWallet === false) {
				window.open(WALLET_GET, "_blank", "noopener");
				return;
			}
			const connector = connectors[0];
			if (connector) {
				connect({ connector });
			}
			return;
		}
		if (chainId !== CHAIN_ID) {
			switchChain({ chainId: CHAIN_ID });
			return;
		}
		if (!locked.contractAddress) {
			return;
		}
		// Some wallets (HashPack) can hold a stale or eth_accounts-only
		// session while wagmi still reports "connected" — the send then
		// fails with EIP-1193 4100 and no prompt ever appears. Re-assert
		// the account grant right before paying; a healthy session answers
		// silently, an expired one opens the approval popup.
		try {
			const provider = (await connector?.getProvider()) as
				| { request?: (args: { method: string }) => Promise<unknown> }
				| undefined;
			if (provider?.request) {
				await provider.request({ method: "eth_requestAccounts" });
			}
		} catch (error) {
			if ((error as { code?: number }).code === 4001) {
				// The user declined to (re)connect — don't follow up with a
				// transaction they clearly don't want to approve yet.
				return;
			}
		}
		// The contract re-reads Chainlink and re-checks this quoted price on
		// chain; value is the HBAR leg in wei.
		writeContract({
			address: locked.contractAddress as `0x${string}`,
			abi: PAY_ABI,
			functionName: "pay",
			args: [locked.reference, toUnits(String(locked.hbarUsdAtQuote), 18)],
			value: toUnits(String(locked.amountHbar), 18),
		});
	};

	const ctaLabel = (() => {
		if (!hasAmount) {
			return "Enter a Naira amount";
		}
		if (quoteQuery.isPending && !quote) {
			return "Fetching quote…";
		}
		if (quoteQuery.isError) {
			return "Quote unavailable — retry above";
		}
		if (!locked) {
			return lockMutation.isPending ? "Creating order…" : "Lock quote";
		}
		if (expired) {
			return "Quote expired — refresh";
		}
		if (!isConnected) {
			return hasWallet === false ? "Install a wallet" : "Connect wallet";
		}
		if (chainId !== CHAIN_ID) {
			return "Switch to Hedera testnet";
		}
		if (isSigning || isConnecting) {
			return "Confirm in your wallet…";
		}
		if (txHash && (txReceipt.isLoading || confirmMutation.isPending)) {
			return confirmMutation.isPending
				? "Writing HCS receipt…"
				: "Waiting for Hedera…";
		}
		if (confirmMutation.isError) {
			return "Retry settlement";
		}
		if (!locked.contractAddress) {
			return "Contract not configured";
		}
		return `Pay ${Number(locked.amountHbar).toFixed(4)} HBAR`;
	})();

	const ctaDisabled =
		!hasAmount ||
		quoteQuery.isError ||
		(!locked && lockMutation.isPending) ||
		(locked !== null &&
			!expired &&
			isConnected &&
			chainId === CHAIN_ID &&
			!locked.contractAddress);

	const walletShort = address ? shortHash(address) : "";
	const walletError = connectError ?? txError;

	return (
		<div className="grid-backdrop min-h-svh bg-background">
			<a
				href="#main"
				className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:border focus:border-primary focus:bg-background focus:px-3 focus:py-2 focus:font-mono focus:text-xs"
			>
				Skip to payment
			</a>
			<div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-4 sm:px-8">
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 py-4 sm:py-5">
					<div className="flex items-center gap-3">
						<span className="flex h-9 w-9 items-center justify-center border border-primary/40 bg-primary/10 font-mono text-base font-bold text-primary">
							₦
						</span>
						<div>
							<h1 className="display-wide text-[15px] leading-none font-bold">
								Naira Checkout
							</h1>
							<p className="mt-1.5 font-mono text-[10px] tracking-[0.28em] text-muted-foreground uppercase">
								HBAR settlement terminal
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2 sm:gap-3">
						<span className="hidden items-center gap-2 border border-border px-2.5 py-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase sm:inline-flex">
							<span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
							Hedera testnet
						</span>
						{isConnected && address ? (
							<span className="inline-flex items-center gap-2 border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] tabular-nums">
								<span
									className={`h-1.5 w-1.5 rounded-full ${chainId === CHAIN_ID ? "bg-primary" : "bg-signal"}`}
								/>
								{walletShort}
								<button
									type="button"
									onClick={() => disconnect()}
									className="text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
									aria-label="Disconnect wallet"
								>
									✕
								</button>
							</span>
						) : (
							<Button
								variant="outline"
								size="sm"
								className="font-mono text-[11px] tracking-widest uppercase"
								onClick={headerConnect}
							>
								Connect wallet
							</Button>
						)}
					</div>
				</header>

				<main
					id="main"
					className="grid flex-1 items-start gap-4 py-6 sm:gap-5 lg:grid-cols-[1.6fr_1fr]"
				>
					{/* ---- settlement rail ---- */}
					<div className="flex min-w-0 flex-col gap-4 sm:gap-5">
						<StepPanel
							index="01"
							title="Amount"
							right={
								<StatusPill tone={hasAmount ? "live" : "off"}>
									{hasAmount ? "set" : "idle"}
								</StatusPill>
							}
						>
							<form
								className="flex flex-col gap-3"
								onSubmit={(event) => {
									event.preventDefault();
									if (hasAmount) {
										setRequested(parsedAmount);
									}
								}}
							>
								<div className="relative">
									<span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-mono text-lg text-muted-foreground">
										₦
									</span>
									<Input
										name="amount"
										autoComplete="off"
										type="number"
										min="1"
										step="any"
										inputMode="decimal"
										placeholder="5,000…"
										aria-label="Amount in Naira"
										value={amountInput}
										onChange={(event) => setAmountInput(event.target.value)}
										className="h-12 pl-9 pr-14 font-mono text-lg tabular-nums"
									/>
									<span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-mono text-[11px] tracking-widest text-muted-foreground">
										NGN
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									{PRESETS.map((preset) => (
										<button
											key={preset}
											type="button"
											onClick={() => setAmountInput(String(preset))}
											className="border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:border-primary/50 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
										>
											{formatNaira(preset)}
										</button>
									))}
									<span className="ml-auto font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
										prices in ₦ · paid in HBAR
									</span>
								</div>
							</form>
						</StepPanel>

						<StepPanel
							index="02"
							title="Quote"
							right={
								<StatusPill tone={!quote ? "off" : expired ? "wait" : "live"}>
									{!quote
										? "idle"
										: expired
											? "expired"
											: quoteQuery.isFetching
												? "updating"
												: "live"}
								</StatusPill>
							}
						>
							<div className="panel-glow relative overflow-hidden border border-border/60 bg-background/40 px-4 py-5 sm:px-5">
								<div className="relative flex items-end justify-between gap-3">
									<div className="min-w-0">
										<Odometer
											value={hbarText}
											className={`font-mono text-[clamp(2rem,7vw,3.25rem)] leading-none font-bold tracking-tight tabular-nums ${
												activeHbar === undefined ? "text-muted-foreground" : ""
											}`}
										/>
										<span className="ml-2 font-mono text-sm text-muted-foreground">
											HBAR
										</span>
									</div>
									<span className="font-mono text-[11px] text-muted-foreground tabular-nums sm:text-xs">
										{quote
											? `≈ ${formatUsd(
													locked ? Number(locked.amountUsd) : quote.amountUsd,
												)}`
											: "awaiting amount"}
									</span>
								</div>
								<div className="relative mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border/50 pt-3 font-mono text-[11px] text-muted-foreground tabular-nums">
									<span>
										{locked
											? formatNaira(Number(locked.amountNgn))
											: quote
												? formatNaira(quote.amountNgn)
												: "—"}
										{" · rate "}
										{rate !== undefined ? formatUsd(rate) : "—"}
										{" / HBAR"}
									</span>
									{expiresAt ? (
										<span className={expired ? "text-signal" : ""}>
											{expired
												? "quote expired"
												: `locks in ${countdown(msLeft)}`}
										</span>
									) : (
										<span>quote valid 5 min once locked</span>
									)}
								</div>
							</div>

							<div className="mt-3 min-h-6">
								{quoteQuery.isPending && hasAmount ? (
									<div className="flex flex-col gap-2">
										<Skeleton className="h-3 w-1/3" />
										<Skeleton className="h-3 w-1/4" />
									</div>
								) : quoteQuery.isError ? (
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="text-xs text-destructive" aria-live="polite">
											{summarizeError(quoteQuery.error)}
										</p>
										<Button
											variant="outline"
											size="sm"
											onClick={() => void quoteQuery.refetch()}
										>
											Retry
										</Button>
									</div>
								) : !hasAmount ? (
									<p className="text-xs text-muted-foreground">
										Enter an amount — the Chainlink HBAR/USD feed prices it
										immediately.
									</p>
								) : null}
							</div>
						</StepPanel>

						<StepPanel
							index="03"
							title="Settle"
							right={
								<StatusPill
									tone={
										settled ? "live" : locked && isConnected ? "wait" : "off"
									}
								>
									{settled
										? "settled"
										: locked
											? isConnected
												? "ready"
												: "awaiting wallet"
											: "idle"}
								</StatusPill>
							}
						>
							<div className="flex flex-col gap-3">
								{isConnected && address ? (
									<div className="flex flex-wrap items-center justify-between gap-2 border border-border/70 bg-background/40 px-3 py-2.5 font-mono text-[11px] tabular-nums">
										<span className="text-muted-foreground">
											<span
												className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${chainId === CHAIN_ID ? "bg-primary" : "bg-signal"}`}
											/>
											{walletShort}
										</span>
										<span>
											{balance
												? `${Number(balance.formatted).toFixed(2)} ${balance.symbol}`
												: "—"}
										</span>
										<span className="text-muted-foreground">
											{chainId === CHAIN_ID ? "chain 296 ✓" : "wrong network"}
										</span>
									</div>
								) : null}

								{!settled ? (
									<>
										<Button
											size="lg"
											className="h-12 w-full font-mono text-xs tracking-[0.18em] uppercase"
											disabled={ctaDisabled}
											onClick={runPrimaryAction}
										>
											{isConnecting || isSwitching ? "Working…" : ctaLabel}
										</Button>
										{walletError ? (
											<p
												className="text-xs text-destructive"
												aria-live="polite"
											>
												{summarizeError(walletError)}
											</p>
										) : null}
										{lockMutation.isError ? (
											<p
												className="text-xs text-destructive"
												aria-live="polite"
											>
												{summarizeError(lockMutation.error)}
											</p>
										) : null}
										{locked !== null && !locked.contractAddress ? (
											<p className="text-xs text-signal">
												Set{" "}
												<code className="font-mono">
													CHECKOUT_CONTRACT_ADDRESS
												</code>{" "}
												in <code className="font-mono">.env</code> to enable
												paying from this page.
											</p>
										) : null}

										{/* Running settlement log — the terminal transcript. */}
										<div
											aria-live="polite"
											className="flex flex-col gap-1.5 border-t border-border/50 pt-3"
										>
											{locked ? (
												<LogLine tone="ok">
													order {locked.reference} ·{" "}
													{Number(locked.amountHbar).toFixed(4)} HBAR locked
												</LogLine>
											) : null}
											{isSigning ? (
												<LogLine tone="wait">
													confirm the transaction in your wallet
												</LogLine>
											) : null}
											{txHash && txReceipt.isLoading ? (
												<LogLine tone="wait">
													tx {shortHash(txHash)} submitted — waiting for Hedera
												</LogLine>
											) : null}
											{txReceipt.isSuccess ? (
												<LogLine tone="ok">payment confirmed on chain</LogLine>
											) : null}
											{confirmMutation.isPending ? (
												<LogLine tone="wait">
													settling — swap note + HCS receipt
												</LogLine>
											) : null}
										</div>
									</>
								) : (
									<SettlementResult settled={settled} onReset={resetAll} />
								)}
							</div>
						</StepPanel>
					</div>

					{/* ---- instrument rail ---- */}
					<aside className="flex min-w-0 flex-col gap-4 sm:gap-5">
						<RailPanel eyebrow="Oracle">
							<div className="flex items-baseline justify-between gap-2">
								<span className="font-mono text-2xl font-bold tabular-nums sm:text-[28px]">
									{rate !== undefined ? formatUsd(rate) : "—.————"}
								</span>
								<span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
									1 HBAR
								</span>
							</div>
							<dl className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-3 font-mono text-[11px] tabular-nums">
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">feed</dt>
									<dd>Chainlink HBAR / USD · 8 dp</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">₦ fx</dt>
									<dd>
										{quote ? formatNaira(quote.ngnPerUsd) : "—"} / $
										<span className="text-muted-foreground"> demo</span>
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">on-chain</dt>
									<dd>±5% deviation check</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">sample</dt>
									<dd>
										{quoteQuery.isFetching ? "reading…" : quote ? "fresh" : "—"}
									</dd>
								</div>
							</dl>
							<p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
								The contract re-reads the same feed when you pay and reverts if
								the price drifted past the tolerance. The ₦ leg is a demo rate (
								<code className="font-mono">DEMO_NGN_PER_USD</code>), not live
								FX.
							</p>
						</RailPanel>

						<RailPanel eyebrow="On-chain path">
							<ol className="flex flex-col gap-3">
								{[
									{
										step: "01",
										title: "Price checked",
										detail:
											"CheckoutRouter reads Chainlink and verifies your locked price.",
									},
									{
										step: "02",
										title: "Swap to stable",
										detail:
											"HBAR → stablecoin on SaucerSwap so the merchant keeps value.",
									},
									{
										step: "03",
										title: "Receipt on HCS",
										detail:
											"Every settlement writes a message to the Hedera Consensus Service.",
									},
								].map((item) => (
									<li key={item.step} className="flex gap-3">
										<span className="mt-0.5 font-mono text-[11px] font-bold text-primary">
											{item.step}
										</span>
										<div className="min-w-0">
											<p className="text-sm font-medium">{item.title}</p>
											<p className="text-xs leading-relaxed text-muted-foreground">
												{item.detail}
											</p>
										</div>
									</li>
								))}
							</ol>
						</RailPanel>

						<RailPanel eyebrow="Session">
							<dl className="flex flex-col gap-2 font-mono text-[11px] tabular-nums">
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">contract</dt>
									<dd className="min-w-0">
										{locked?.contractAddress ? (
											<a
												className="text-foreground underline-offset-4 hover:underline"
												href={`${HASHSCAN}/contract/${locked.contractAddress}`}
												target="_blank"
												rel="noreferrer"
											>
												{shortHash(locked.contractAddress)}
											</a>
										) : (
											"created with order"
										)}
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">order</dt>
									<dd className="min-w-0 truncate">
										{locked?.reference ?? "—"}
									</dd>
								</div>
								<div className="flex justify-between gap-3">
									<dt className="text-muted-foreground">payer</dt>
									<dd className="min-w-0 truncate">{walletShort || "—"}</dd>
								</div>
							</dl>
						</RailPanel>
					</aside>
				</main>

				<footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 py-4 font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
					<span>Hedera testnet · Chainlink · SaucerSwap · HCS</span>
					<span>Template — not a production payment system</span>
				</footer>
			</div>
		</div>
	);
};

/** Post-payment panel: what happened, where to verify it, how to restart. */
const SettlementResult = ({
	settled,
	onReset,
}: {
	readonly settled: ConfirmedSettlement;
	readonly onReset: () => void;
}) => {
	const { order, swap, receipt, notes } = settled;
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between gap-3 border border-primary/40 bg-primary/10 px-3 py-2.5">
				<span className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
					✓ settled
				</span>
				<span className="font-mono text-[11px] tabular-nums">
					{Number(order.amountHbar ?? 0).toFixed(4)} HBAR
				</span>
			</div>
			<dl className="flex flex-col gap-2 font-mono text-[11px] tabular-nums">
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">order</dt>
					<dd className="min-w-0 truncate">{order.reference}</dd>
				</div>
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">paid in</dt>
					<dd>{formatNaira(Number(order.amountNgn))}</dd>
				</div>
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">payment tx</dt>
					<dd className="min-w-0">
						<a
							className="text-foreground underline-offset-4 hover:underline"
							href={`${HASHSCAN}/transaction/${order.paymentTxHash ?? ""}`}
							target="_blank"
							rel="noreferrer"
						>
							{order.paymentTxHash ? shortHash(order.paymentTxHash) : "—"} ↗
						</a>
					</dd>
				</div>
				{receipt.ok ? (
					<div className="flex justify-between gap-3">
						<dt className="text-muted-foreground">hcs receipt</dt>
						<dd className="min-w-0">
							<a
								className="text-foreground underline-offset-4 hover:underline"
								href={`${HASHSCAN}/topic/${receipt.topicId}`}
								target="_blank"
								rel="noreferrer"
							>
								{receipt.topicId} ↗
							</a>
						</dd>
					</div>
				) : (
					<div className="flex justify-between gap-3">
						<dt className="text-muted-foreground">hcs receipt</dt>
						<dd className="text-signal">{receipt.code}</dd>
					</div>
				)}
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">swap</dt>
					<dd className={swap.ok ? "" : "text-signal"}>
						{swap.ok
							? `settled ${swap.outAmount}`
							: `${swap.code} (plan §8 fallback)`}
					</dd>
				</div>
			</dl>
			{notes.length > 0 ? (
				<div className="flex flex-col gap-1 border-t border-border/50 pt-3">
					{notes.map((note) => (
						<LogLine key={note} tone="wait">
							{note}
						</LogLine>
					))}
				</div>
			) : null}
			<Button
				variant="outline"
				className="w-full font-mono text-[11px] tracking-[0.18em] uppercase"
				onClick={onReset}
			>
				New order
			</Button>
		</div>
	);
};

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [{ title: "₦ → HBAR · Naira Checkout" }],
	}),
	component: Checkout,
});
