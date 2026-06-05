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
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      cancelEmail: FunctionReference<
        "mutation",
        "internal",
        { emailId: string },
        null,
        Name
      >;
      cleanupAbandonedEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null,
        Name
      >;
      cleanupOldEmails: FunctionReference<
        "mutation",
        "internal",
        { olderThan?: number },
        null,
        Name
      >;
      createManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          from_email: string;
          from_name?: string;
          subject?: string;
          to: Array<{
            email: string;
            name?: string;
            type?: "to" | "cc" | "bcc";
          }>;
        },
        string,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bounced: boolean;
          clicked: boolean;
          complained: boolean;
          createdAt: number;
          errorMessage?: string;
          from_email: string;
          from_name?: string;
          globalMergeVars?: Array<{ content: string; name: string }>;
          headers?: Record<string, string>;
          html?: string;
          mandrillId?: string;
          mergeVars?: Array<{
            rcpt: string;
            vars: Array<{ content: string; name: string }>;
          }>;
          metadata?: Record<string, string>;
          opened: boolean;
          rejectReason?: string;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "bounced"
            | "rejected"
            | "failed";
          subject?: string;
          tags?: Array<string>;
          template?: {
            content: Array<{ content: string; name: string }>;
            name: string;
          };
          text?: string;
          to: Array<{
            email: string;
            name?: string;
            type?: "to" | "cc" | "bcc";
          }>;
          trackClicks?: boolean;
          trackOpens?: boolean;
        } | null,
        Name
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { emailId: string },
        {
          bounced: boolean;
          clicked: boolean;
          complained: boolean;
          errorMessage: string | null;
          opened: boolean;
          rejectReason: string | null;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "bounced"
            | "rejected"
            | "failed";
        } | null,
        Name
      >;
      handleEmailEvent: FunctionReference<
        "mutation",
        "internal",
        {
          eventType:
            | "send"
            | "delivered"
            | "deferral"
            | "hard_bounce"
            | "soft_bounce"
            | "open"
            | "click"
            | "spam"
            | "unsub"
            | "reject";
          mandrillId: string;
          message?: string;
          ts: number;
        },
        null,
        Name
      >;
      sendEmail: FunctionReference<
        "mutation",
        "internal",
        {
          from_email: string;
          from_name?: string;
          globalMergeVars?: Array<{ content: string; name: string }>;
          headers?: Record<string, string>;
          html?: string;
          mergeVars?: Array<{
            rcpt: string;
            vars: Array<{ content: string; name: string }>;
          }>;
          metadata?: Record<string, string>;
          options: {
            apiKey: string;
            initialBackoffMs: number;
            onEmailEvent?: { fnHandle: string };
            retryAttempts: number;
          };
          subject?: string;
          tags?: Array<string>;
          template?: {
            content: Array<{ content: string; name: string }>;
            name: string;
          };
          text?: string;
          to: Array<{
            email: string;
            name?: string;
            type?: "to" | "cc" | "bcc";
          }>;
          trackClicks?: boolean;
          trackOpens?: boolean;
        },
        string,
        Name
      >;
      updateManualEmail: FunctionReference<
        "mutation",
        "internal",
        {
          emailId: string;
          errorMessage?: string;
          mandrillId?: string;
          status:
            | "waiting"
            | "queued"
            | "cancelled"
            | "sent"
            | "delivered"
            | "bounced"
            | "rejected"
            | "failed";
        },
        null,
        Name
      >;
    };
  };
