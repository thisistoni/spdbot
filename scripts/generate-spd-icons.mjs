// Regenerate checked-in desktop/PWA icons from the SPD-Studio favicon mark.
// No image service or platform toolchain needed; --check detects stale assets.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = new URL("../", import.meta.url);
const svg = readFileSync(new URL("public/app-icon.svg", root), "utf8");
const check = process.argv.includes("--check");
const outputs = new Map();
const png = (source, width) => new Resvg(source, { fitTo: { mode: "width", value: width } }).render().asPng();
const put = (path, bytes) => outputs.set(path, Buffer.from(bytes));

// Match the macOS 824px tile on a 1024px canvas, retaining transparent margins.
const inner = svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const macSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(100 100) scale(${824 / 48})">${inner}</g></svg>\n`;
put("build/icon.svg", macSvg);
put("build/icon-1024.png", png(macSvg, 1024));
for (const size of [16, 32, 64, 128, 256, 512]) {
  put(`build/icon.iconset/icon_${size}x${size}.png`, png(macSvg, size));
  put(`build/icon.iconset/icon_${size}x${size}@2x.png`, png(macSvg, size * 2));
}
for (const size of [192, 512]) put(`public/app-icon-${size}.png`, png(svg, size));
put("public/apple-touch-icon.png", png(svg, 180));
put("electron/resources/app-icon.png", png(svg, 512));

// Modern Windows ICO entries accept PNG at every size; keep a crisp small mark.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
const images = sizes.map(size => png(svg, size));
let offset = header.length;
images.forEach((image, index) => {
  const at = 6 + index * 16, size = sizes[index];
  header[at] = size === 256 ? 0 : size; header[at + 1] = header[at];
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(image.length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += image.length;
});
put("build/icon.ico", Buffer.concat([header, ...images]));

// ICNS PNG types include both standard and Retina representations.
const chunks = [["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024], ["ic11", 32], ["ic12", 64], ["ic13", 256], ["ic14", 512]].map(([type, size]) => {
  const image = png(macSvg, size), chunk = Buffer.alloc(8);
  chunk.write(type); chunk.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([chunk, image]);
});
const icns = Buffer.alloc(8); icns.write("icns"); icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
put("build/icon.icns", Buffer.concat([icns, ...chunks]));

for (const [path, bytes] of outputs) {
  const target = fileURLToPath(new URL(path, root));
  if (check) {
    const actual = readFileSync(target);
    assert.deepEqual(path.endsWith(".svg") ? Buffer.from(actual.toString("utf8").replaceAll("\r\n", "\n")) : actual, bytes, `${path} is stale; run node scripts/generate-spd-icons.mjs`);
  }
  else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); }
}
console.log(`${check ? "Verified" : "Generated"} ${outputs.size} SPD icon assets`);
