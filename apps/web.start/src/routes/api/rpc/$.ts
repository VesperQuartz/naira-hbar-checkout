import { rpcHandler } from "@repo/orpc";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/rpc/$")({
	server: {
		handlers: {
			ANY: async ({ request }) => {
				const { response } = await rpcHandler.handle(request, {
					prefix: "/api/rpc",
					context: {
						reqHeaders: request.headers,
					}, // Provide initial context if needed
				});

				return response ?? new Response("Not Found", { status: 404 });
			},
		},
	},
});
