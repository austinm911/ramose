/**
 * `@octanejs/testing-library` auto-registers `cleanup` only when the runner
 * exposes globals; this suite runs with `globals: false`, so it registers
 * here — the same thing importing `@testing-library/react/pure` would ask
 * for.
 */

import { cleanup } from "@octanejs/testing-library";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
