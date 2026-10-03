import { PrivateKey } from "@hashgraph/sdk";

/**
 * Parse an operator signing key.
 *
 * A 32-byte hex key (0x-prefixed or bare) is ECDSA secp256k1 — the format
 * Hedera accounts actually use for `HEDERA_OPERATOR_PRIVATE_KEY`.
 * `PrivateKey.fromString` would otherwise guess Ed25519 and the network
 * would reject every signature with `INVALID_SIGNATURE`. Anything else
 * (DER, SDK string form) goes to `fromString` unchanged.
 *
 * Kept free of `@repo/shared` imports so scripts can load it before the
 * environment is parsed.
 */
export const parseSigningKey = (raw: string): PrivateKey => {
	const trimmed = raw.trim();
	return /^(0x)?[0-9a-fA-F]{64}$/.test(trimmed)
		? PrivateKey.fromStringECDSA(trimmed.replace(/^0x/, ""))
		: PrivateKey.fromString(trimmed);
};
