/** Toolchain probe: TSRX compiles, mounts, and reacts to an event. */

import { fireEvent, render } from "@octanejs/testing-library";
import { describe, expect, test } from "vitest";
import { Smoke } from "../fixtures/smoke.tsrx";

describe("harness", () => {
  test("a TSRX fixture mounts and updates", () => {
    const { container } = render(Smoke, { props: { label: "hi" } });
    expect(container.textContent).toBe("hi:1");
    fireEvent.click(container.querySelector("#smoke")!);
    expect(container.textContent).toBe("hi:2");
  });
});
