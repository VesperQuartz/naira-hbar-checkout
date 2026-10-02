import { env } from "@repo/shared/env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	out: "./drizzle",
	schema: "./src/schema",
	dialect: "postgresql",
	dbCredentials: {
		url: String(env.DATABASE_URL),
	},
});
