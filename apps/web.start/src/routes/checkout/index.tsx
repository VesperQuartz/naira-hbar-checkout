import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { type FormEvent, useEffect, useState } from "react";
import { orpc } from "@/lib/orpc/client";

const formatNaira = (value: number): string =>
	`₦${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

const formatUsd = (value: number): string =>
	`$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Clock so expiry can tick without re-running the quote call. */
const useNow = (): number => {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	return now;
};

/** Demo wallet: a stand-in account id until real Hedera wallet wiring lands. */
const connectDemoWallet = (): string =>
	`0.0.${1000 + Math.floor(Math.random() * 9000)}`;

const Checkout = () => {
	const now = useNow();
	const [amountInput, setAmountInput] = useState("");
	const [requestedAmount, setRequestedAmount] = useState<number | undefined>();
	const [wallet, setWallet] = useState<string | undefined>();

	const quoteQuery = useQuery({
		...orpc.checkout.quote.queryOptions({
			input: { amountNgn: requestedAmount ?? 1 },
		}),
		enabled: requestedAmount !== undefined,
		staleTime: 0,
	});

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const amount = Number(amountInput);
		if (!Number.isFinite(amount) || amount <= 0) {
			return;
		}
		if (amount === requestedAmount) {
			void quoteQuery.refetch();
			return;
		}
		setRequestedAmount(amount);
	};

	const quote = quoteQuery.data;
	const expiresAt = quote ? new Date(quote.expiresAt) : undefined;
	const isExpired = expiresAt !== undefined && expiresAt.getTime() <= now;

	return (
		<div className="flex min-h-svh flex-col items-center p-6">
			<div className="flex w-full max-w-lg min-w-0 flex-col gap-6">
				<header className="flex items-center justify-between">
					<div>
						<h1 className="text-lg font-medium">Checkout</h1>
						<p className="text-sm text-muted-foreground">
							Pay in ₦, settle in HBAR.
						</p>
					</div>
					<Link
						to="/"
						className="text-sm text-muted-foreground underline-offset-4 hover:underline"
					>
						← Home
					</Link>
				</header>

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="amount">Amount in Naira</Label>
						<div className="flex gap-2">
							<Input
								id="amount"
								name="amount"
								type="number"
								min="1"
								step="any"
								inputMode="decimal"
								placeholder="150,000"
								value={amountInput}
								onChange={(event) => setAmountInput(event.target.value)}
							/>
							<Button type="submit" disabled={quoteQuery.isFetching}>
								{quoteQuery.isFetching ? "Quoting…" : "Get quote"}
							</Button>
						</div>
					</div>
				</form>

				<Card>
					<CardHeader>
						<CardTitle>Quote</CardTitle>
						<CardDescription>
							HBAR amount, USD equivalent and expiry for your Naira price.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-3">
						{requestedAmount === undefined ? (
							<p className="text-sm text-muted-foreground">
								Enter an amount to see what it costs in HBAR.
							</p>
						) : quoteQuery.isPending ? (
							<div className="flex flex-col gap-2">
								<Skeleton className="h-8 w-2/3" />
								<Skeleton className="h-4 w-1/2" />
								<Skeleton className="h-4 w-1/3" />
							</div>
						) : quoteQuery.isError ? (
							<div className="flex flex-col gap-2">
								<p className="text-sm font-medium text-destructive">
									{quoteQuery.error instanceof Error
										? quoteQuery.error.message
										: "Something went wrong getting your quote."}
								</p>
								<Button
									variant="outline"
									onClick={() => void quoteQuery.refetch()}
								>
									Try again
								</Button>
							</div>
						) : quote && expiresAt ? (
							<div className="flex flex-col gap-3">
								<div>
									<p className="text-3xl font-semibold tabular-nums">
										{quote.amountHbar.toFixed(4)} HBAR
									</p>
									<p className="text-sm text-muted-foreground tabular-nums">
										{formatUsd(quote.amountUsd)} ·{" "}
										{formatNaira(quote.amountNgn)}
									</p>
								</div>
								<p className="text-xs text-muted-foreground tabular-nums">
									1 HBAR = {formatUsd(quote.hbarUsd)} · demo rate{" "}
									{formatNaira(quote.ngnPerUsd)}/$
								</p>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span className="tabular-nums">
										{isExpired
											? "Quote expired"
											: `Expires ${expiresAt.toLocaleTimeString()}`}
									</span>
									<Button
										variant="outline"
										size="sm"
										onClick={() => void quoteQuery.refetch()}
									>
										Refresh quote
									</Button>
								</div>
							</div>
						) : null}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Wallet</CardTitle>
						<CardDescription>
							Connect before paying. Demo mode — no extension required yet.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex items-center justify-between gap-3">
						{wallet ? (
							<>
								<span className="font-mono text-sm tabular-nums">{wallet}</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setWallet(undefined)}
								>
									Disconnect
								</Button>
							</>
						) : (
							<>
								<span className="text-sm text-muted-foreground">
									No wallet connected
								</span>
								<Button
									size="sm"
									onClick={() => setWallet(connectDemoWallet())}
								>
									Connect wallet
								</Button>
							</>
						)}
					</CardContent>
				</Card>

				<p className="text-xs text-muted-foreground">
					Demo wallet ids are local placeholders — real Hedera wallet wiring
					lands with the settlement integrations.
				</p>
			</div>
		</div>
	);
};

export const Route = createFileRoute("/checkout/")({ component: Checkout });
