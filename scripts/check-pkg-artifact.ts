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
const entrypoints: Array<{ readonly subpath: string; readonly file: string }> = [];
for (const [subpath, target] of Object.entries(manifestExports)) {
  if (typeof target !== "object" || target === null || !("default" in target)) continue;
  const defaultTarget = target.default;
  if (typeof defaultTarget !== "string" || defaultTarget.includes("*")) continue;
  const file = resolve(packageDir, defaultTarget);
  if (!(await Bun.file(file).exists())) {
    missing.push(`${subpath}: ${defaultTarget}`);
  } else {
    entrypoints.push({ subpath, file });
  }
}
if (missing.length > 0) {
  throw new Error(`Ramose production exports point at missing files:\n${missing.join("\n")}`);
}

// The leak check follows package.json, which is the authoritative list of
// consumer entrypoints. This keeps newly declared default artifacts covered.
for (const { subpath, file } of entrypoints) {
  const source = await readFile(file, "utf8");
  if (/from\s+["'][^"']*\.ts["']/.test(source)) {
    const label = subpath === "./db" ? "database" : subpath;
    throw new Error(
      `Ramose production ${label} entrypoint contains a TypeScript import: ${file}`,
    );
  }
}


type RuntimeExports = Record<string, unknown>;
const clientRuntimeExports = [
  "createClient",
  "ClientClosedError",
  "ClientConfigurationError",
  "MutationRejectedError",
  "EntityWithdrawnError",
] as const;
const reactRuntimeExports = [
  "RamoseProvider",
  "useDb",
  "useQuery",
  "useSuspenseQuery",
  "useReceipt",
  "useSyncState",
  "toQueryState",
] as const;
const octaneRuntimeExports = [
  "RamoseProvider",
  "useRamose",
  "useDb",
  "useQuery",
  "useSuspenseQuery",
  "useReceipt",
  "useSyncState",
  "useTransact",
  "errorMessage",
] as const;


const assertFunctionExports = (
  subpath: string,
  artifact: RuntimeExports,
  names: readonly string[],
): void => {
  if (names.some((name) => typeof artifact[name] !== "function")) {
    throw new Error(`Ramose production ${subpath} entrypoint has incomplete runtime exports`);
  }
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertSourceExports = (
  subpath: string,
  source: string,
  names: readonly string[],
): void => {
  const missingExports = names.filter((name) => {
    const escaped = escapeRegExp(name);
    return !new RegExp(
      `(?:^|\\n)\\s*export\\s+(?:(?:async\\s+)?(?:function|class|const|let|var)\\s+${escaped}\\b|\\{[^}]*\\b${escaped}\\b[^}]*\\})`,
      "m",
    ).test(source);
  });
  if (missingExports.length > 0) {
    throw new Error(`Ramose production ${subpath} entrypoint has incomplete runtime exports`);
  }
};

const isMissingOptionalPeer = (error: unknown, peer: string): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const escapedPeer = escapeRegExp(peer);
  return (
    /Cannot find (?:package|module)|Module not found/.test(message) &&
    new RegExp(
      `(?:Cannot find package|Cannot find module|Module not found:)\\s*["']?${escapedPeer}(?:["'/\\\\s]|$)`,
    ).test(message)
  );
};

// React and Octane are optional peers imported at module scope. Check their
// built named exports before a guarded runtime import, so an absent peer skips
// evaluation without allowing an incomplete artifact through.
const importOptionalPeerEntrypoint = async (
  subpath: string,
  file: string,
  peer: string,
): Promise<RuntimeExports | undefined> => {
  try {
    return (await import(pathToFileURL(file).href)) as RuntimeExports;
  } catch (error) {
    if (!isMissingOptionalPeer(error, peer)) throw error;
    console.warn(
      `Skipping ${subpath} runtime export check because optional peer "${peer}" is not installed`,
    );
    return undefined;
  }
};

// Static imports cannot inspect a caller-selected packageDir, so each assertion
// loads the exact generated artifact through its file URL.
const dbPath = resolve(packageDir, "dist/db/index.js");
const db = (await import(pathToFileURL(dbPath).href)) as RuntimeExports;
if (
  typeof db.Entity !== "function" ||
  typeof db.Schema !== "function" ||
  typeof db.Field !== "function" ||
  !(db.DATABASE_NAME_RE instanceof RegExp) ||
  typeof db.DatabaseNotFound !== "function"
) {
  throw new Error("Ramose production database entrypoint has incomplete runtime exports");
}

const clientPath = resolve(packageDir, "dist/client/index.js");
const client = (await import(pathToFileURL(clientPath).href)) as RuntimeExports;
assertFunctionExports("./client", client, clientRuntimeExports);

const reactPath = resolve(packageDir, "dist/react/index.js");
const reactSource = await readFile(reactPath, "utf8");
assertSourceExports("./react", reactSource, reactRuntimeExports);
const react = await importOptionalPeerEntrypoint("./react", reactPath, "react");
if (react !== undefined) {
  assertFunctionExports("./react", react, reactRuntimeExports);
}

const octanePath = resolve(packageDir, "dist/octane/index.js");
const octaneSource = await readFile(octanePath, "utf8");
assertSourceExports("./octane", octaneSource, octaneRuntimeExports);
const octane = await importOptionalPeerEntrypoint("./octane", octanePath, "octane");
if (octane !== undefined) {
  assertFunctionExports("./octane", octane, octaneRuntimeExports);
}

console.log(`Ramose production artifact is complete: ${packageDir}`);

