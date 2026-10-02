import { env } from "@repo/shared/env";
import { defineConfig } from "drizzle-kit";

// Must match the Postgres service in the repo root docker-compose.yml.
const databaseUrl =
	env.DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5433/naira_hbar_checkout";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/schema",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl,
	},
});
