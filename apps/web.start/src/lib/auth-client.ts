import type { auth } from "@repo/auth";
import { adminRole, customRole, userRole } from "@repo/auth/lib/permission";
import { env } from "@repo/shared";
import {
	adminClient,
	inferAdditionalFields,
	usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL: env.VITE_PUBLIC_API_URL,
	plugins: [
		usernameClient(),
		inferAdditionalFields<typeof auth>(),
		adminClient({
			roles: {
				admin: adminRole,
				user: userRole,
				custom: customRole,
				superadmin: adminRole,
			},
			adminRoles: ["admin", "superadmin"],
		}),
	],
});
