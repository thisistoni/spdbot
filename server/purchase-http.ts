import type { IncomingMessage } from "node:http";
import { readBody as read } from "./harness/http.ts";
import { purchaseAccess, safePurchaseRequest } from "./purchase-access.ts";

/** A body can arrive after eligibility expired; recheck before handing it to a mutation. */
export async function readBody(req: IncomingMessage, limit?: number) {
  const body = await read(req, limit);
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!safePurchaseRequest(req.method ?? "GET", path) && !["/api/auth/pair", "/api/auth/pairing", "/api/pair", "/api/auth/email/start", "/api/auth/email/verify"].includes(path)) await purchaseAccess.assert();
  return body;
}
