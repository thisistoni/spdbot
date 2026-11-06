import { integer } from "./purchase-wire.mjs";

export class PurchaseClock {
  constructor(saved = null, { wall = () => Date.now() / 1000, mono = () => performance.now() / 1000 } = {}) {
    this.wall = wall;
    this.mono = mono;
    const now = wall();
    if (saved && (Object.keys(saved).some(k => !["greatest", "trusted"].includes(k)) || !integer(saved.greatest) || !integer(saved.trusted) || saved.greatest < saved.trusted)) throw new Error("invalid_access_clock");
    this.greatest = Math.max(saved?.greatest ?? 0, Math.floor(now));
    this.trusted = saved?.trusted ?? 0;
    this.rollback = !!saved && now < saved.greatest - 60;
    this.anchor = Math.max(now, this.greatest);
    this.lastMono = mono();
    this.anchorMono = this.lastMono;
  }
  now() {
    const wall = this.wall();
    const mono = this.mono();
    if (!Number.isFinite(wall) || !Number.isFinite(mono) || mono < this.lastMono || wall < this.greatest - 60) this.rollback = true;
    this.lastMono = mono;
    const effective = Math.max(this.greatest, wall, this.anchor + Math.max(0, mono - this.anchorMono));
    this.greatest = Math.floor(effective);
    return effective;
  }
  // Only called after a fresh, request-bound signed response was verified.
  observeSigned(iat) {
    if (!integer(iat)) throw new Error("stale_server_time");
    this.now();
    this.trusted = Math.max(this.trusted, iat);
    this.greatest = Math.max(this.greatest, iat);
    // A corrected wall clock may recover; forward progress is never discarded.
    this.rollback = this.wall() < this.greatest - 60;
    this.anchor = this.greatest;
    this.anchorMono = this.mono();
  }
  snapshot() { this.now(); return { greatest: this.greatest, trusted: this.trusted }; }
}
