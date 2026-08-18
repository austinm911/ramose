/**
 * The database-name rule, public on `@ripple/alchemy/db` (issue #37).
 *
 * The regex is the peer Worker's `validDbName`; `isDatabaseName` is the
 * function form an app calls before letting a user-minted name reach the
 * peer. Both edges pinned: 64 chars is the last valid length, and the first
 * character must be alphanumeric.
 */

import { describe, expect, test } from "bun:test";
import { DATABASE_NAME_RE, isDatabaseName } from "../../src/db/index.ts";

describe("database names", () => {
  test("the regex is the server Worker's `validDbName`", () => {
    for (const ok of ["a", "movies", "A0", "a.b-c_d", "x".repeat(64)]) {
      expect(DATABASE_NAME_RE.test(ok)).toBe(true);
    }
    for (const bad of ["", "-leading", ".leading", "has space", "has/slash", "x".repeat(65)]) {
      expect(DATABASE_NAME_RE.test(bad)).toBe(false);
    }
  });

  test("isDatabaseName is the same rule as a predicate", () => {
    expect(isDatabaseName("x".repeat(64))).toBe(true);
    expect(isDatabaseName("x".repeat(65))).toBe(false);
    expect(isDatabaseName("-leading")).toBe(false);
  });
});
