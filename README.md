# naira-hbar-checkout

A shop lists prices in **Naira (₦)** and the customer pays in **HBAR**. The contract checks the price against **Chainlink**, swaps the HBAR into a stablecoin on **SaucerSwap** so the merchant keeps stable value, and every payment writes a receipt to **HCS** that anyone can open on Hashscan.

A `scaffold-hbar` template — a developer starter on testnet, not a production payment product.

## Quick start

```bash
npm create scaffold-hbar@latest -- --template VesperQuartz/naira-hbar-checkout
cd naira-hbar-checkout
pnpm install
cp .env.example .env
pnpm dev
```

Prefer to clone it directly instead:

```bash
git clone https://github.com/VesperQuartz/naira-hbar-checkout.git
cd naira-hbar-checkout
pnpm install
cp .env.example .env
pnpm dev
```

The app boots with no secrets configured. Fill in only what you need (see the table below).

## Prerequisites

- **Node.js** 20.18.3 or newer
- **pnpm** (`corepack enable` ships it with Node)
- **Foundry** for the contract: `curl -L https://foundry.paradigm.xyz | bash`, then restart the terminal and run `foundryup`
- A **Hedera testnet account** with testnet HBAR from the [Hedera Portal faucet](https://portal.hedera.com/)
- **Docker** — only if you want the optional order-history database

## Environment variables

Copy `.env.example` to `.env` (or `.envrc`) and fill in what you use. Nothing secret is committed.

| Name | What it does | Example |
| --- | --- | --- |
| `DEMO_NGN_PER_USD` | Fixed demo Naira-per-USD rate used to show ₦ prices (not live FX) | `1500` |
| `CHAINLINK_HBAR_USD_FEED` | Hedera-specific Chainlink HBAR/USD aggregator address | `0x...` |
| `CHAINLINK_RPC_URL` | JSON-RPC endpoint for the off-chain Chainlink quote read (defaults to Hashio for `HEDERA_NETWORK`) | `https://testnet.hashio.io/api` |
| `CHECKOUT_CONTRACT_ADDRESS` | Deployed `CheckoutRouter` `0x…` — printed by the deploy script, required by the live proof | `0x...` |
| `HEDERA_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `HEDERA_OPERATOR_ID` | Signs HCS receipts and the deploy script | `0.0.1234` |
| `HEDERA_OPERATOR_PRIVATE_KEY` | Its key — testnet only, never commit | `302...` |
| `HCS_TOPIC_ID` | Consensus topic that receives payment receipts | `0.0.1001` |
| `MERCHANT_EVM_ADDRESS` | `0x…` payout address for `CheckoutRouter.withdraw()` (not a `0.0.x` id) | `0x...` |
| `PRICE_TOLERANCE_BPS` | Contract guardrail: max feed-vs-quote deviation (default `500`) | `500` |
| `MAX_PRICE_AGE_SECONDS` | Contract guardrail: max feed answer age (default `86400` — the testnet feed refreshes slower than hourly) | `86400` |
| `SAUCERSWAP_ROUTER` | SaucerSwap router used for the HBAR → stablecoin swap | `0x...` |
| `STABLECOIN_TOKEN_ID` | HTS stablecoin the merchant is paid in | `0.0.2002` |
| `MERCHANT_ACCOUNT_ID` | Account that receives the stablecoin | `0.0.3003` |
| `DATABASE_URL` | Optional Postgres for order history — the app boots without it | `postgresql://...` |
| `BETTER_AUTH_SECRET` | Session signing secret for app login | `...` |
| `BETTER_AUTH_URL` | Public URL of the app (used for auth callbacks) | `http://localhost:3000` |

## How it works

1. The page shows a price in ₦. A fixed demo ₦/USD rate times the Chainlink HBAR/USD price tells the customer how much HBAR that is.
2. The customer clicks **Pay with HBAR** from a connected wallet and sends HBAR to the `CheckoutRouter` contract.
3. The contract reads Chainlink HBAR/USD itself and rejects the payment if the round is incomplete, the price is non-positive, or it has gone stale.
4. The server swaps the HBAR into a stablecoin on SaucerSwap so the merchant keeps stable value (until `SAUCERSWAP_ROUTER` is set, this step reports its typed fallback and the payment still settles).
5. A receipt message (order id, amounts, timestamps, transaction references) is submitted to an HCS topic and is readable on Hashscan.

## Hedera services used

| Service | Why |
| --- | --- |
| **Smart contracts** | `CheckoutRouter` accepts the HBAR payment and orchestrates everything on-chain |
| **Chainlink Data Feeds** | HBAR/USD price read and sanity check inside the contract |
| **Consensus Service (HCS)** | One receipt message per payment, publicly verifiable |
| **Token Service (HTS)** | The stablecoin that is paid out to the merchant |
| **SaucerSwap** (ecosystem DEX) | Swaps HBAR into the stablecoin so the merchant keeps stable value |

## The swap and the oracle on testnet

- **Oracle.** HBAR/USD comes from the Hedera-testnet Chainlink aggregator `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a` (8 decimals). The contract reverts a payment when the round is incomplete, the answer is non-positive, the answer is older than `MAX_PRICE_AGE_SECONDS`, or the off-chain quote deviates from it by more than `PRICE_TOLERANCE_BPS`. Quotes read the same feed over `CHAINLINK_RPC_URL`; with no feed configured they fall back to a fixed demo HBAR price so the app still boots. The testnet adapter refreshes slower than an hour (3.5 h+ observed between rounds), hence the 24 h deploy default.
- **Swap.** Set `SAUCERSWAP_ROUTER`, `STABLECOIN_TOKEN_ID` and `MERCHANT_ACCOUNT_ID` to wire the HBAR → stablecoin swap. In the proof run above those were unset, so the swap step reported a typed "not configured" reason, the payment and receipt still settled, and the receipt records `settlementState: "skipped"` — the documented fallback.

## Associating the stablecoin token

On Hedera an account must **associate** with an HTS token before it can receive it. Do this once for `MERCHANT_ACCOUNT_ID` and `STABLECOIN_TOKEN_ID` before the first swap pays out.

1. **From a wallet** — open the wallet for `MERCHANT_ACCOUNT_ID` (HashPack, Blade, Kabila…), search `STABLECOIN_TOKEN_ID` and choose **Associate**. Wallet UIs and the SaucerSwap app both expose this; a small association fee is charged in HBAR.
2. **From code** — sign and send a `TokenAssociateTransaction` with the merchant account's key:

   ```ts
   import { Client, TokenAssociateTransaction } from "@hashgraph/sdk";

   const tx = await new TokenAssociateTransaction()
     .setAccountId("0.0.3003") // MERCHANT_ACCOUNT_ID
     .setTokenIds(["0.0.2002"]) // STABLECOIN_TOKEN_ID
     .freezeWith(client)
     .sign(merchantKey);
   await tx.execute(client);
   ```

3. **Verify** — `GET https://testnet.mirrornode.hedera.com/api/v1/accounts/<MERCHANT_ACCOUNT_ID>` and check the `tokens` list contains `STABLECOIN_TOKEN_ID`.

## Proof

Everything below runs against **Hedera testnet** with a funded account from the [Hedera Portal faucet](https://portal.hedera.com/).

1. **Deploy the contract** — set `CHAINLINK_HBAR_USD_FEED` (a Hedera address from the [Chainlink feed list](https://docs.chain.link/data-feeds/price-feeds/addresses?network=hedera), never an Ethereum one) and `MERCHANT_EVM_ADDRESS`, then:

   ```bash
   set -a; . .env; set +a     # at the repo root, if the variables aren't exported yet
   cd packages/contract
   forge script script/Deploy.s.sol --rpc-url https://testnet.hashio.io/api \
     --private-key "$HEDERA_OPERATOR_PRIVATE_KEY" --broadcast
   ```

   Copy the printed address into `.env` as `CHECKOUT_CONTRACT_ADDRESS`.
   → Hashscan: `https://hashscan.io/testnet/contract/<0x…>`

2. **Create the receipt topic** (once):

   ```bash
   pnpm --filter @repo/orpc hcs:topic
   ```

   Paste the printed `HCS_TOPIC_ID` into `.env`.

3. **Run the whole flow** — one command creates an order quoted from the live Chainlink feed, calls `pay(orderRef, quotedPrice18)` on the contract (the on-chain price check runs inside it), confirms the order with the real EVM transaction hash, and writes the HCS receipt:

   ```bash
   pnpm --filter @repo/orpc proof
   ```

   The script prints the payment transaction, the receipt message, and the topic — all openable on Hashscan.

4. **Read it back** — `checkout.status` on the order returns the persisted receipt (`topicId`, `messageReference`, `settlementState`) when the optional database is configured.

   ```bash
   docker compose up -d && pnpm --filter @repo/storage db:push
   pnpm --filter @repo/orpc smoke
   ```

   With no integrations configured the same smoke run proves the fallback: payment persisted, typed "not configured" reasons, order readable via `status`.

### Proof from a live testnet run (2026-10-03)

- **Contract:** [`0x3239D08A333a583233D663fE37bDf04f6b9dc339`](https://hashscan.io/testnet/contract/0x3239D08A333a583233D663fE37bDf04f6b9dc339) — `CheckoutRouter` on Hedera testnet, feed `0x59bC155EB6c6C415fE43255aF66EcF0523c92B4a`, tolerance 500 bps, max age 86 400 s.
- **Payment:** [`0.0.7899598@1791008635.197964734`](https://hashscan.io/testnet/transaction/0.0.7899598@1791008635.197964734) — `pay()` accepted for a ₦5 000 order (32.91949996 HBAR quoted at 0.10115585 USD/HBAR), EVM hash `0xd5a9bf3d…005d3a`.
- **Receipt:** [`0.0.7899598@1791008642.355474709`](https://hashscan.io/testnet/transaction/0.0.7899598@1791008642.355474709) on topic [`0.0.10837688`](https://hashscan.io/testnet/topic/0.0.10837688) — JSON message with `orderId`, `reference`, `amountNgn`, `amountHbar`, `paymentTxHash`, `settlementState` (swap step reports its typed fallback, so `skipped`).
- **Mirror node:** <https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10837688/messages> — every receipt on the topic, base64-decoded JSON.

## Project structure

```
naira-hbar-checkout/
├── template.json        scaffold-hbar manifest (removed by the CLI when it scaffolds)
├── README.md
├── AGENTS.md
├── LICENSE              MIT
├── .env.example         all variable names, no values
├── docker-compose.yml   local Postgres for the optional order history
└── packages/
    ├── contract/        Foundry: CheckoutRouter.sol, tests, deploy script
    ├── storage/         Drizzle schema + Postgres access (optional at runtime)
    ├── auth/            Better Auth config
    ├── orpc/            typed API routers (server only)
    ├── shared/          shared types and validated config
    ├── ui/              shadcn/ui components
    └── ...
└── apps/
    └── web.start/       TanStack Start app (checkout UI)
```

## Running tests

```bash
pnpm lint
pnpm typecheck
pnpm build
cd packages/contract && forge test
```

## Known limits and next steps

- The ₦ rate is a **fixed demo figure** (`DEMO_NGN_PER_USD`). A live Naira rate API is the obvious next step.
- The **database is optional**: without `DATABASE_URL` the app still runs, it just keeps no order history.
- Testnet liquidity and feed availability drive which swap/oracle paths are documented above.
- This is a **developer starter on testnet**: production use would need real rate feeds, proper key management and an audit.
