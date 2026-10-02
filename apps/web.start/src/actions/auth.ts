import { auth } from "@repo/auth";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const authServerFn = createServerFn().handler(async () => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	if (!session) {
		return null;
	}

	return session;
});
