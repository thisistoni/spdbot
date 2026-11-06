import { purchaseAccess, type PurchaseGate } from "./purchase-access.ts";
import type { RoutineManager } from "./routines.ts";

export function guardPurchaseRoutines(manager: RoutineManager, gate: PurchaseGate = purchaseAccess) {
  for (const method of ["runNow", "enqueueWebhook", "mergeIntoQueuedRun"] as const) {
    const original = manager[method];
    Object.defineProperty(manager, method, { value: (...args: unknown[]) => {
      gate.assertNow();
      return Reflect.apply(original, manager, args);
    } });
  }
  const start = manager.start.bind(manager);
  const tick = manager.tick.bind(manager);
  manager.start = () => { if (gate.allowedNow()) start(); };
  manager.tick = async () => { if (await gate.check()) await tick(); };
  gate.onChange(allowed => { if (allowed) start(); else manager.stop(); });
}

/** Cancel live work, preserve definitions/history, and let future schedules resume after reconnection. */
export function installPurchaseRuntime({ routines, restrict }: { routines: () => RoutineManager | null; restrict: () => void }, gate: PurchaseGate = purchaseAccess) {
  return gate.onChange(allowed => {
    if (allowed) return;
    restrict();
    const manager = routines();
    for (const run of manager?.listRuns() ?? []) {
      if (["queued", "running", "waiting"].includes(run.status)) void manager!.cancelRun(run.id, "SPDBot-Zugang abgelaufen oder gesperrt.").catch(() => {});
    }
  });
}
