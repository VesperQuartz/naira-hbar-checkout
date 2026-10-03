# AGENTS.md

Short notes for AI coding tools working in this repo.

## What this is

A Naira-priced checkout template: prices are shown in **₦**, the customer pays in **HBAR**, the contract checks the price against **Chainlink**, swaps HBAR into a stablecoin on **SaucerSwap**, and writes a receipt to **HCS**. A developer starter on testnet — not a production payment product.

## Folder map

| Path | What lives there |
| --- | --- |
| `packages/foundry/` | Foundry project: `CheckoutRouter.sol`, tests in `test/`, deploy script in `script/` |
| `packages/storage/` | Drizzle schema and Postgres access — optional at runtime |
| `packages/auth/` | Better Auth configuration |
| `packages/orpc/` | Typed API routers — server only |
| `packages/shared/` | Shared types and validated config |
| `packages/ui/` | shadcn/ui components |
| `apps/web.start/` | TanStack Start app (the checkout UI) |
| `agents/skills/` | Hedera/Harness reference skills — read when working on Hedera topics |

## Commands

| Task | Command |
| --- | --- |
| Install | `pnpm install` |
| Dev server | `pnpm dev` |
| Lint | `pnpm lint` (Biome only) |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` (node:test unit tests + `forge test`) |
| Build | `pnpm build` |
| Contract build | `cd packages/foundry && forge build` |
| Contract tests | `cd packages/foundry && forge test` |
| Contract deploy | `cd packages/foundry && forge script script/Deploy.s.sol --rpc-url https://testnet.hashio.io/api --private-key "$HEDERA_OPERATOR_PRIVATE_KEY" --broadcast` |
| Receipt topic (once) | `pnpm --filter @repo/orpc hcs:topic` |
| Live proof: order → pay → receipt | `pnpm --filter @repo/orpc proof` |
| Order confirm smoke run | `pnpm --filter @repo/orpc smoke` |
| Local database | `docker compose up -d`, then `pnpm --filter @repo/storage db:push` |

## Environment variables

All names live in `.env.example`: `DEMO_NGN_PER_USD`, `CHAINLINK_HBAR_USD_FEED`, `CHAINLINK_RPC_URL`, `CHECKOUT_CONTRACT_ADDRESS`, `HEDERA_NETWORK`, `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_PRIVATE_KEY`, `HCS_TOPIC_ID`, `SAUCERSWAP_ROUTER`, `STABLECOIN_TOKEN_ID`, `MERCHANT_ACCOUNT_ID`, `MERCHANT_EVM_ADDRESS`, `PRICE_TOLERANCE_BPS`, `MAX_PRICE_AGE_SECONDS`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `VITE_PUBLIC_API_URL`.

Never commit `.env`. Keep real keys out of the code — read them from the validated config in `packages/shared`.

## Code rules

- TypeScript everywhere — no plain JavaScript.
- **Arrow functions only** in React and Node: components, hooks, handlers, route handlers, utilities. No `function` declarations.
- File names in **kebab-case**.
- **Biome** is the only linter and formatter — do not add ESLint or Prettier.
- **pnpm** for packages (`pnpm add`, `pnpm install`), `pnpx` for one-off packages, `bun` only for global installs.
- Prefer **Drizzle** for database access. The database must stay optional: the app boots without `DATABASE_URL`.
- Check Hedera and Chainlink specifics against `agents/skills/` (feed addresses, HCS message rules) before inventing them.

## Things not to touch

- The managed **Turborepo block** at the end of this file — turbo rewrites it before repository-scoped commands. Keep it committed.
- Generated files (`routeTree.gen.ts`, `dist/`, `.output/`) — do not hand-edit them.
- `agents/skills/` — reference material, not project source.
- `packages/ui/` is a **vendored shadcn/ui kit** kept as upstream ships it — its `function` declarations are the one documented exception to the arrow-function rule; everything first-party is arrow-only.
- Do not add committed secrets, a real `.env`, or private keys anywhere in the repo.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
