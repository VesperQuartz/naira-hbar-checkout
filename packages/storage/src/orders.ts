import { Result, TaggedError } from "better-result";
import { desc, eq } from "drizzle-orm";
import { db } from "./index";
import {
	type NewOrder,
	type NewReceipt,
	type Order,
	order,
	type Receipt,
	receipt,
} from "./schema/order.schema";

/**
 * Raised when the orders/receipts tables cannot be read or written — the
 * database is optional at boot, so callers map this to a typed "storage
 * unavailable" failure instead of crashing.
 */
export class StorageError extends TaggedError("StorageError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** Inserts an order row and returns it. */
export const insertOrder = (
	values: NewOrder,
): Promise<Result<Order, StorageError>> =>
	Result.tryPromise({
		try: async () => {
			const rows = await db.insert(order).values(values).returning();
			const row = rows[0];
			if (!row) {
				throw new Error("insert returned no row");
			}
			return row;
		},
		catch: (cause) =>
			new StorageError({ message: "Failed to insert order", cause }),
	});

/** Reads one order by id; `undefined` means not found (not an error). */
export const findOrderById = (
	orderId: string,
): Promise<Result<Order | undefined, StorageError>> =>
	Result.tryPromise({
		try: async () => {
			const rows = await db
				.select()
				.from(order)
				.where(eq(order.id, orderId))
				.limit(1);
			return rows[0];
		},
		catch: (cause) =>
			new StorageError({ message: "Failed to read order", cause }),
	});

/** Applies a partial update to one order and returns the new row. */
export const updateOrder = (
	orderId: string,
	values: Partial<Omit<NewOrder, "id">>,
): Promise<Result<Order, StorageError>> =>
	Result.tryPromise({
		try: async () => {
			const rows = await db
				.update(order)
				.set(values)
				.where(eq(order.id, orderId))
				.returning();
			const row = rows[0];
			if (!row) {
				throw new Error("update returned no row");
			}
			return row;
		},
		catch: (cause) =>
			new StorageError({ message: "Failed to update order", cause }),
	});

/** Inserts a receipt row (one per written HCS message) and returns it. */
export const insertReceipt = (
	values: NewReceipt,
): Promise<Result<Receipt, StorageError>> =>
	Result.tryPromise({
		try: async () => {
			const rows = await db.insert(receipt).values(values).returning();
			const row = rows[0];
			if (!row) {
				throw new Error("insert returned no row");
			}
			return row;
		},
		catch: (cause) =>
			new StorageError({ message: "Failed to insert receipt", cause }),
	});

/** Latest receipt for an order; `undefined` means none written yet. */
export const findReceiptByOrderId = (
	orderId: string,
): Promise<Result<Receipt | undefined, StorageError>> =>
	Result.tryPromise({
		try: async () => {
			const rows = await db
				.select()
				.from(receipt)
				.where(eq(receipt.orderId, orderId))
				.orderBy(desc(receipt.createdAt))
				.limit(1);
			return rows[0];
		},
		catch: (cause) =>
			new StorageError({ message: "Failed to read receipt", cause }),
	});
