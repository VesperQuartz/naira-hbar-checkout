import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Shared `.env` loading for the orpc scripts (`hcs:topic`, `smoke`,
 * `proof`). Real environment variables always win; quotes are stripped so
 * values copied with surrounding quotes still parse. Never committed —
 * reads the repo-root `.env` only.
 */

const envFile = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../../.env",
);

/** Fill process.env from the repo .env without overriding real env vars. */
export const loadRepoEnv = (): void => {
	try {
		const lines = readFileSync(envFile, "utf8").split("\n");
		for (const line of lines) {
			const match =
				/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
			if (!match) {
				continue;
			}
			const value = match[2].trim().replace(/^["']|["']$/g, "");
			if (value && process.env[match[1]] === undefined) {
				process.env[match[1]] = value;
			}
		}
	} catch {
		// No .env — real environment variables only.
	}
};
