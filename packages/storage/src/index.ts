import { env } from "@repo/shared";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { authRelations } from "./schema/auth.schema";

// Falls back to the local Postgres started by `docker compose up -d` at the
// repo root, so the app still boots when DATABASE_URL is not configured.
const databaseUrl =
	env.DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5433/naira_hbar_checkout";

const relations = {
	...authRelations,
};

export const db: NodePgDatabase<typeof relations> = drizzle({
	connection: {
		connectionString: databaseUrl,
	},
	logger: true,
	relations,
});

export type Db = typeof db;
