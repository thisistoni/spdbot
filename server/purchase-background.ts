import { purchaseAccess, type PurchaseGate } from "./purchase-access.ts";

/** Remember startup intent, pause during restriction, and resume the same service after verification. */
export function guardPurchaseBackground(service: object, gate: PurchaseGate = purchaseAccess) {
  const start = Reflect.get(service, "start");
  const stop = Reflect.get(service, "stop");
  if (typeof start !== "function") throw new Error("background service has no start method");
  let requested: unknown[] | null = null;
  const run = (args: unknown[]) => {
    const result = Reflect.apply(start, service, args);
    if (result instanceof Promise) void result.catch(() => {});
    return result;
  };
  Object.defineProperty(service, "start", { value: (...args: unknown[]) => {
    requested = args;
    if (gate.allowedNow()) return run(args);
  } });
  if (typeof stop === "function") Object.defineProperty(service, "stop", { value: (...args: unknown[]) => {
    requested = null;
    return Reflect.apply(stop, service, args);
  } });
  gate.onChange(allowed => {
    if (allowed && requested) run(requested);
    else if (!allowed && typeof stop === "function") {
      const result = Reflect.apply(stop, service, []);
      if (result instanceof Promise) void result.catch(() => {});
    }
  });
}
