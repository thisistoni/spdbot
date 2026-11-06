import { useEffect, useState } from "react";
import type { PurchaseAccessState } from "../../shared/purchase-access";

export function usePurchaseAccess() {
  const bridge = window.ogb?.remoteClient?.active ? undefined : window.ogb?.purchase;
  const [access, setAccess] = useState<PurchaseAccessState | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let mounted = true;
    const accept = (state: PurchaseAccessState) => { if (mounted) setAccess(state); };
    void bridge.state().then(accept, () => {});
    const unsubscribe = bridge.onChanged(accept);
    return () => { mounted = false; unsubscribe(); };
  }, [bridge]);
  return { bridge, access, setAccess };
}
