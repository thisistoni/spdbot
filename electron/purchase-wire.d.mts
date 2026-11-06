export function hash(text: string): string;
export function opaque(value: unknown): value is string;
export function publicJwk(value: unknown): { kty: "OKP"; crv: "Ed25519"; x: string };
export function exact(value: unknown, fields: string[]): Record<string, unknown>;
export function possessionBytes(nonce: string, lease: string): Buffer;
