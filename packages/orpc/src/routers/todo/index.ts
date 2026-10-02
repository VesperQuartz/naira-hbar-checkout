import { z } from "zod";
import { base } from "#/routers/base";
import { authMiddleware } from "#/routers/middleware";

export const TodoSchema = z.object({
	id: z.number().int().min(1),
	task: z.string(),
});

export const listTodos = base
	.use(authMiddleware)
	.route({
		method: "GET",
	})
	.handler(async () => {
		return [
			{
				id: Math.random() * 100,
				task: "today is a big day",
			},
		];
	});
