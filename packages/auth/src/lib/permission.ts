import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const statement = {
	...defaultStatements,
	project: ["create", "share", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const adminRole = ac.newRole({
	project: ["create", "update"],
	...adminAc.statements,
});

export const userRole = ac.newRole({
	project: ["create", "update"],
});

export const customRole = ac.newRole({
	project: ["create", "update"],
});
