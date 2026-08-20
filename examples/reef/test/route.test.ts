import { describe, expect, test } from "bun:test";
import { hrefOf, parsePath, type Route } from "../src/app/route.tsx";

const roundTrip = (path: string, route: Route) => {
  expect(parsePath(path)).toEqual(route);
  expect(hrefOf(route)).toBe(path);
};

describe("reef page routes", () => {
  test("the picker is /", () => {
    roundTrip("/", { kind: "home" });
    expect(parsePath("")).toEqual({ kind: "home" });
  });

  test("a workspace slug is that board", () => {
    roundTrip("/coral-team", { kind: "board", slug: "coral-team" });
    expect(parsePath("/coral-team/")).toEqual({
      kind: "board",
      slug: "coral-team",
    });
  });

  test("an issue path opens that panel", () => {
    roundTrip("/coral-team/issues/12", {
      kind: "board",
      slug: "coral-team",
      issueId: 12,
    });
  });

  test("a bad slug falls back to the picker", () => {
    expect(parsePath("/Nope")).toEqual({ kind: "home" });
    expect(parsePath("/x")).toEqual({ kind: "home" });
  });

  test("a bad issue suffix stays on the board", () => {
    expect(parsePath("/coral-team/issues/nope")).toEqual({
      kind: "board",
      slug: "coral-team",
    });
    expect(parsePath("/coral-team/issues")).toEqual({
      kind: "board",
      slug: "coral-team",
    });
    expect(parsePath("/coral-team/extra")).toEqual({
      kind: "board",
      slug: "coral-team",
    });
  });
});
