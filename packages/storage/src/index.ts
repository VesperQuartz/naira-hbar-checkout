import { env } from "@repo/shared";
import { drizzle } from "drizzle-orm/neon-http";
import { authRelations } from "./schema/auth.schema";

export const db = drizzle({
	connection: {
		connectionString: String(env.DATABASE_URL),
	},
	logger: true,
	relations: {
		...authRelations,
	},
});

export type Db = typeof db;
