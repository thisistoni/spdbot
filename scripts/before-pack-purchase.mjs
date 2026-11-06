import { validateAuthority } from "../electron/purchase-authority.mjs";

// Runtime remains restricted without trust; distribution additionally refuses to package it.
export default function beforePackPurchase() { validateAuthority(); }
