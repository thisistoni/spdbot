import type { WireBot } from "../shared/wire.ts";
import type { BrowserCleanupWireRequest } from "./browser-lifecycle-cleanup.ts";
export type DesktopPrivateMessage = BrowserCleanupWireRequest | import("./login-handoff.ts").LoginHandoffResult | {
  type: "openmausbot:browser-control";
  botId: string;
  held: true;
} | {
  type: "openmausbot:phone-secret-save";
  requestId: string;
  target: string;
  value: string;
} | {
  type: "approval-trusted-mode-result" | "approval-trusted-mode-commit-result";
  requestId: string;
  ok: boolean;
  bot?: WireBot;
  error?: string;
} | {
  type: "approval-trusted-mode-confirm-result";
  requestId: string;
  ok: boolean;
  error?: string;
} | {
  type: "approval-trusted-mode-activate-result" | "approval-trusted-mode-finalize-result";
  requestId: string;
  ok: boolean;
  error?: string;
};
