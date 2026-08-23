#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageDir = resolve(process.argv[2] ?? "packages/ramose");
const manifestValue: unknown = JSON.parse(
  await readFile(resolve(packageDir, "package.json"), "utf8"),
);
if (
  typeof manifestValue !== "object" ||
  manifestValue === null ||
  !("exports" in manifestValue) ||
  typeof manifestValue.exports !== "object" ||
  manifestValue.exports === null
) {
  throw new Error("Ramose package.json has no readable exports map");
}
const manifestExports = manifestValue.exports;


const missing: string[] = [];
for (const [subpath, target] of Object.entries(manifestExports)) {
  if (typeof target !== "object" || target === null || !("default" in target)) continue;
  const defaultTarget = target.default;
  if (typeof defaultTarget !== "string" || defaultTarget.includes("*")) continue;
  const file = resolve(packageDir, defaultTarget);
  if (!(await Bun.file(file).exists())) missing.push(`${subpath}: ${defaultTarget}`);
}
if (missing.length > 0) {
  throw new Error(`Ramose production exports point at missing files:\n${missing.join("\n")}`);
}

const dbPath = resolve(packageDir, "dist/db/index.js");
const dbSource = await readFile(dbPath, "utf8");
if (/from\s+["'][^"']*\.ts["']/.test(dbSource)) {
  throw new Error(`Ramose production database entrypoint contains a TypeScript import: ${dbPath}`);
}

// The package directory is runtime-selected so this checks the exact generated
// artifact passed to a consumer, not the source entrypoint.
const db = await import(pathToFileURL(dbPath).href);
if (
  typeof db.Attr !== "function" ||
  !(db.DATABASE_NAME_RE instanceof RegExp) ||
  typeof db.DatabaseNotFound !== "function"
) {
  throw new Error("Ramose production database entrypoint has incomplete runtime exports");
}

console.log(`Ramose production artifact is complete: ${packageDir}`);
