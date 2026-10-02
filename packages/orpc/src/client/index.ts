import { createORPCClient } from "@orpc/client";
import type { RouterClient } from "@orpc/server";
import { env } from "@repo/shared";
import { SuperJSONLink } from "#/routers/middleware/superjson/link";
import type { router } from "../routers";

const baseUrl = env.VITE_PUBLIC_API_URL;

export const link = new SuperJSONLink({
	url: `${baseUrl}/api/rpc`,
	method: ({ context }, path) => {
		console.log(path, "path");
		// Use GET for cached responses
		if (context["cache"]) {
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

export const client: RouterClient<typeof router> = createORPCClient(link);
