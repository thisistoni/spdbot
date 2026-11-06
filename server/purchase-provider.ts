import type { ProviderInstance } from "./contracts.ts";
import { purchaseAccess, type PurchaseGate } from "./purchase-access.ts";

// The registry is shared by HTTP, rooms, routines, internal MCP and background model calls.
// Wrapping preserves getters and driver receivers. No purchase claim changes upstream feature rights.
export function purchaseProvider(instance: ProviderInstance, gate: PurchaseGate = purchaseAccess): ProviderInstance {
  const stop = () => { void instance.adapter.stopAll().catch(() => {}); };
  const unsubscribe = gate.onChange(allowed => { if (!allowed) stop(); });
  const guarded = new Set(["sendTurn", "steer", "respondToRequest", "generateText", "generateMemoryText", "reviewPermission", "ping", "hold"]);
  const wrap = <T extends object>(target: T): T => new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key, object);
      if (key === "cacheKeepWarm" && value) return wrap(value);
      if (typeof value !== "function") return value;
      if (key === "hold") return (...args: unknown[]) => { gate.assertNow(); return Reflect.apply(value, object, args); };
      if (guarded.has(String(key))) return async (...args: unknown[]) => {
        await gate.assert();
        gate.assertNow();
        const result = await Reflect.apply(value, object, args);
        try { await gate.assert(); } catch (error) { stop(); throw error; }
        return result;
      };
      if (key === "dispose") return async () => { unsubscribe(); return Reflect.apply(value, object, []); };
      return value.bind(object);
    },
  });
  const adapter = wrap(instance.adapter);
  const wrapped = wrap(instance);
  return new Proxy(wrapped, { get: (object, key) => key === "adapter" ? adapter : Reflect.get(object, key) });
}
