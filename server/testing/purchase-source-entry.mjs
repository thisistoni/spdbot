// Explicit SOURCE-ONLY loader ordering, including native utilityProcess starts.
import "./purchase-parent.mjs";
await import("../index.ts");
