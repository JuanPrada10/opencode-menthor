#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = path.join(root, "dist");

// Returns every .js file (relative path) under dir, recursing into subfolders.
function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const nested of collectJsFiles(path.join(dir, entry.name))) {
        found.push(path.join(entry.name, nested));
      }
    } else if (entry.name.endsWith(".js")) {
      found.push(entry.name);
    }
  }
  return found;
}

// 1. Clean dist/
console.log("[build] Limpiando dist/...");
fs.rmSync(dist, { recursive: true, force: true });

// 2. Compile TypeScript
console.log("[build] Compilando TypeScript...");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");
const tscResult = spawnSync(process.execPath, [tscBin], { cwd: root, stdio: "inherit" });
if (tscResult.error) {
  console.error(`[build] No se pudo ejecutar tsc: ${tscResult.error.message}`);
  process.exit(1);
}
if (tscResult.status !== 0) {
  console.error(`[build] tsc falló con código ${tscResult.status ?? "desconocido"}. Abortando.`);
  process.exit(tscResult.status ?? 1);
}

// 3. Copy static assets
const copies = [
  { from: "src/client", to: "dist/client" },
  { from: "src/views", to: "dist/views" },
];

const copied = [];
const skipped = [];
for (const { from, to } of copies) {
  const srcDir = path.join(root, from);
  const dstDir = path.join(root, to);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, dstDir, { recursive: true });
    copied.push(`${from} -> ${to}`);
  } else {
    skipped.push(`${from} (no existe)`);
  }
}

// 4. Verify client JS syntax
const clientJsDir = path.join(root, "src/client/js");
const clientJsFiles = collectJsFiles(clientJsDir);
for (const file of clientJsFiles) {
  const filePath = path.join(clientJsDir, file);
  const check = spawnSync(process.execPath, ["--check", filePath], { cwd: root, encoding: "utf-8" });
  if (check.status !== 0) {
    const detail = (check.stderr || check.stdout || "").trim();
    console.error(`[build] ✗ Error de sintaxis en ${file}`);
    if (detail) console.error(detail);
    process.exit(check.status ?? 1);
  }
}
console.log(`[build] ✓ Sintaxis de cliente verificada (${clientJsFiles.length} archivos)`);

// 5. Summary
console.log("\n[build] Resumen:");
console.log("  ✓ dist/ limpiado y TypeScript compilado");
for (const c of copied) console.log(`  ✓ Copiado ${c}`);
for (const s of skipped) console.log(`  ⚠ Omitido ${s}`);
console.log("[build] Listo.\n");
