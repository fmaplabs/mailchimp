import { describe, expect, test } from "vitest";
import { initConvexTest } from "./setup.test";

describe("example", () => {
  test("initializes without errors", () => {
    const t = initConvexTest();
    // Verify the test setup works with the component registered
    expect(t).toBeDefined();
  });
});
