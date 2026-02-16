/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<
  Name extends string | undefined = string | undefined,
> = {
  lib: {
    sendEmail: FunctionReference<"mutation", "internal", any, string, Name>;
    createManualEmail: FunctionReference<
      "mutation",
      "internal",
      any,
      string,
      Name
    >;
    updateManualEmail: FunctionReference<
      "mutation",
      "internal",
      any,
      null,
      Name
    >;
    cancelEmail: FunctionReference<"mutation", "internal", any, null, Name>;
    handleEmailEvent: FunctionReference<
      "mutation",
      "internal",
      any,
      null,
      Name
    >;
    getStatus: FunctionReference<"query", "internal", any, any, Name>;
    get: FunctionReference<"query", "internal", any, any, Name>;
    cleanupOldEmails: FunctionReference<
      "mutation",
      "internal",
      any,
      null,
      Name
    >;
    cleanupAbandonedEmails: FunctionReference<
      "mutation",
      "internal",
      any,
      null,
      Name
    >;
  };
};
