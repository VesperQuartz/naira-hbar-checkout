import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { router } from "@repo/orpc";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

const getORPCClient = createIsomorphicFn()
	.server(() =>
		createRouterClient(router, {
			context: () => ({
				reqHeaders: getRequestHeaders(),
			}),
		}),
	)
	.client((): RouterClient<typeof router> => {
		const link = new RPCLink({
			url: `${window.location.origin}/api/rpc`,

			method: ({ context }, path) => {
				// Use GET for cached responses
				if (context?.cache) {
					return "GET";
				}

				// Use GET for rendering requests
				if (typeof window === "undefined") {
					return "GET";
				}

				// Use GET for read-like operations
				if (path.at(-1)?.match(/^(?:get|find|list|search|show)(?:[A-Z].*)?$/)) {
					return "GET";
				}

				// Use PUT for update-like operations
				if (path.at(-1)?.match(/^(?:update|change)(?:[A-Z].*)?$/)) {
					return "PUT";
				}

				// Use PATCH for patch-like operations
				if (path.at(-1)?.match(/^(?:patch)(?:[A-Z].*)?$/)) {
					return "PATCH";
				}
				return "POST";
			},
		});
		return createORPCClient(link);
	});

export const client: RouterClient<typeof router> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
