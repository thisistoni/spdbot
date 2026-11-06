export interface PurchaseClockState { greatest: number; trusted: number }
export class PurchaseClock {
  constructor(saved?: PurchaseClockState | null, options?: { wall?: () => number; mono?: () => number });
  rollback: boolean;
  now(): number;
  observeSigned(iat: number): void;
  snapshot(): PurchaseClockState;
}
