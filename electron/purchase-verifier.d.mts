export interface PurchaseBinding { principal: string; sid: string; device_id: string; jkt: string; session_expires: number }
export interface PurchaseAuthority { environment: string; origin: string; onlineKeys: Record<string, string>[]; leaseKeys: Record<string, string>[] }
export interface PurchaseSecurity {
  binding: PurchaseBinding; lease: string | null; installedStatus: string | null; denialStatus: string | null; observedStatus: string | null; trustedStatus: string | null;
  highest_installed_lease_seq: number; denial_seq: number; highest_decision_seq: number; highest_entitlement_revision: number;
}
export interface PurchaseClaims { iat: number; exp: number; sub: string; sid: string; device_id: string; cnf: { jkt: string }; lease_seq: number; entitlement_revision: number; state?: string; refresh_after: number }
export const MAX_ACCEPTED_OFFLINE_LEASE_SECONDS: number;
export function verifyToken(raw: unknown, kind: string, authority: PurchaseAuthority, binding: PurchaseBinding | null, now: number, options?: { historical?: boolean }): Promise<PurchaseClaims>;
export function deviceThumbprint(jwk: unknown): Promise<string>;
export function emptySecurity(binding: PurchaseBinding): PurchaseSecurity;
export function validateSecurity(s: unknown, authority: PurchaseAuthority, now: number): Promise<PurchaseSecurity>;
export function usableLease(s: PurchaseSecurity | null, authority: PurchaseAuthority, now: number): Promise<PurchaseClaims>;
export function applyDecision(s: PurchaseSecurity, response: { access_status: string; offline_lease?: string }, authority: PurchaseAuthority, now: number, options?: { historical?: boolean }): Promise<{ security: PurchaseSecurity; status: PurchaseClaims }>;
