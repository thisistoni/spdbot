import type { PurchaseAuthority } from "./purchase-verifier.mjs";
export const PURCHASE_AUTHORITY: PurchaseAuthority;
export function validateAuthority(authority?: PurchaseAuthority): PurchaseAuthority;
export function purchaseProtocol(authority?: PurchaseAuthority): "spdbot-preview:" | "spdbot:";
