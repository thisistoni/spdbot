export interface PurchaseAccessState {
  allowed: boolean;
  connected: boolean;
  state: "active" | "connecting" | "restricted";
  expiresAt: number | null;
  issue: string | null;
}
export interface PurchaseAccessBridge {
  state(): Promise<PurchaseAccessState>;
  connect(): Promise<PurchaseAccessState>;
  refresh(): Promise<PurchaseAccessState>;
  signOut(): Promise<PurchaseAccessState>;
  onChanged(listener: (state: PurchaseAccessState) => void): () => void;
}
