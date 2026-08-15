/**
 * Pull: declarative, nested entity projection.
 *
 *   [*]                                     every attribute (+ :db/id); refs as {:db/id n}
 *   [:user/name :user/email]                selected attributes
 *   [{:user/friends [:user/name]}]          nested pull through refs
 *   [:user/_friends]                        reverse refs (entities pointing here)
 *   [(:user/name :as "name") (limit :user/friends 5) (default :user/age 0)]
 *   [{:user/friends ...}]                    recursive (cycle-safe), or a depth number
 */

import { type Datom, Index, ValueTag } from "../datom.ts";
import { Db, datomJsValue } from "../db.ts";
import type { PullAttrSpec, PullPattern } from "./ast.ts";
import { parsePullPattern } from "./parse.ts";

const DEFAULT_LIMIT = 1000;

export async function pull(db: Db, eid: number, pattern: PullPattern | string | unknown[]): Promise<Record<string, unknown> | null> {
  const pat = normalizePattern(pattern);
  return pullOne(db, eid, pat, new Map());
}

export async function pullMany(
  db: Db,
  eids: readonly number[],
  pattern: PullPattern | string | unknown[],
): Promise<(Record<string, unknown> | null)[]> {
  const pat = normalizePattern(pattern);
  const cache = new Map<string, Record<string, unknown> | null>();
  const out: (Record<string, unknown> | null)[] = [];
  for (const e of eids) out.push(await pullOne(db, e, pat, cache));
  return out;
}

function normalizePattern(p: PullPattern | string | unknown[]): PullPattern {
  if (typeof p === "string") return parsePullPattern(p);
  if (Array.isArray(p) && p.length > 0 && typeof p[0] === "object" && p[0] !== null && "kind" in (p[0] as any)) return p as PullPattern;
  return parsePullPattern(p);
}

async function pullOne(
  db: Db,
  eid: number,
  pattern: PullPattern,
  cache: Map<string, Record<string, unknown> | null>,
  path: Set<number> = new Set(),
  depthLeft: Map<string, number> = new Map(),
): Promise<Record<string, unknown> | null> {
  if (typeof eid !== "number") return null;
  const key = eid + "|" + patternKey(pattern) + "|" + [...depthLeft].join(",");
  if (path.size === 0 && cache.has(key)) return cache.get(key)!;
  const datoms = await db.datomsArray(Index.EAVT, { e: eid });
  const hasWildcard = pattern.some((s) => s.kind === "wildcard");
  const result: Record<string, unknown> = {};
  let any = false;

  if (hasWildcard) {
    result[":db/id"] = eid;
    any = datoms.length > 0;
    for (const d of datoms) {
      const attr = db.attr(d.a);
      const name = attr?.ident ?? String(d.a);
      const val = d.vt === ValueTag.Ref ? { ":db/id": d.v } : datomJsValue(d);
      if (attr?.cardinality === "many") ((result[name] ??= []) as unknown[]).push(val);
      else result[name] = val;
    }
  }

  const nextPath = new Set(path).add(eid);
  for (const spec of pattern) {
    if (spec.kind === "wildcard") continue;
    if (spec.attr === ":db/id") {
      result[spec.as ?? ":db/id"] = eid;
      any = any || datoms.length > 0;
      continue;
    }
    const attr = db.attr(spec.attr);
    if (!attr) continue; // unknown attribute → omitted (Datomic throws; be lenient)
    const outName = spec.as ?? (spec.reverse ? reverseName(spec.attr) : spec.attr);
    const limit = spec.limit === undefined ? DEFAULT_LIMIT : spec.limit; // null → unlimited

    // recursion handling
    let subPattern: PullPattern | undefined = spec.sub;
    let nextDepth = depthLeft;
    if (spec.recursion !== undefined) {
      const dkey = spec.attr + (spec.reverse ? "_r" : "");
      const remaining = depthLeft.get(dkey);
      if (spec.recursion !== "..." && remaining === undefined) {
        nextDepth = new Map(depthLeft).set(dkey, spec.recursion - 1);
        if (spec.recursion <= 0) subPattern = undefined;
        else subPattern = pattern;
      } else if (spec.recursion !== "...") {
        if (remaining! <= 0) {
          subPattern = undefined;
        } else {
          nextDepth = new Map(depthLeft).set(dkey, remaining! - 1);
          subPattern = pattern;
        }
      } else {
        subPattern = pattern;
      }
      if (spec.recursion !== "..." && subPattern === undefined) {
        // depth exhausted: emit refs as {:db/id}
      }
    }

    let vals: unknown[];
    let cardMany: boolean;
    if (!spec.reverse) {
      const ds = datoms.filter((d) => d.a === attr.id);
      cardMany = attr.cardinality === "many";
      vals = [];
      for (const d of ds) {
        if (limit !== null && vals.length >= limit) break;
        vals.push(await refOrValue(db, d, subPattern, cache, nextPath, nextDepth, spec.recursion !== undefined));
      }
    } else {
      if (attr.valueType !== ValueTag.Ref) continue;
      const ds = await db.datomsArray(Index.VAET, { vt: ValueTag.Ref, v: eid, a: attr.id });
      cardMany = !attr.isComponent;
      vals = [];
      for (const d of ds) {
        if (limit !== null && vals.length >= limit) break;
        const other = d.e;
        if (subPattern) {
          if (nextPath.has(other) && spec.recursion !== undefined) {
            vals.push({ ":db/id": other });
          } else {
            const sub = await pullOne(db, other, subPattern, cache, nextPath, nextDepth);
            if (sub) vals.push(sub);
          }
        } else vals.push({ ":db/id": other });
      }
    }
    vals = vals.filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) {
      if (spec.default !== undefined) {
        result[outName] = spec.default;
        any = true;
      }
      continue;
    }
    any = true;
    result[outName] = cardMany ? vals : vals[0];
  }
  const res = any ? result : null;
  if (path.size === 0) cache.set(key, res);
  return res;
}

async function refOrValue(
  db: Db,
  d: Datom,
  sub: PullPattern | undefined,
  cache: Map<string, Record<string, unknown> | null>,
  path: Set<number>,
  depth: Map<string, number>,
  recursive: boolean,
): Promise<unknown> {
  if (d.vt !== ValueTag.Ref) return datomJsValue(d);
  const target = d.v as number;
  if (!sub) return { ":db/id": target };
  if (recursive && path.has(target)) return { ":db/id": target }; // cycle
  const r = await pullOne(db, target, sub, cache, path, depth);
  return r ?? { ":db/id": target };
}

function reverseName(attr: string): string {
  const slash = attr.lastIndexOf("/");
  return slash >= 0 ? attr.slice(0, slash + 1) + "_" + attr.slice(slash + 1) : ":_" + attr.slice(1);
}

function patternKey(p: PullPattern): string {
  return JSON.stringify(p);
}

export function normalizePullPattern(p: unknown): PullPattern {
  return normalizePattern(p as any);
}

export type { PullAttrSpec };
