import { purchaseAccess } from "../purchase-access.ts";
const port = (process as NodeJS.Process & { parentPort: { on(event: string, fn: (event: { data: { type?: string; id?: string } }) => void): void; postMessage(value: unknown): void } }).parentPort;
purchaseAccess.attach(port);
port.on("message", event => {
  if (event.data?.type === "spdbot:test-status") void purchaseAccess.check().then(allowed => {
    port.postMessage({ type: "spdbot:test-status-result", id: event.data.id, allowed });
  });
});
