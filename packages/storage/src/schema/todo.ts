import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const todoTable = pgTable("todo", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	task: varchar({ length: 255 }).notNull(),
});
