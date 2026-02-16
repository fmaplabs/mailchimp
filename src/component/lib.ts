import { v } from "convex/values";
import {
  internalAction,
  mutation,
  type MutationCtx,
  query,
  internalQuery,
} from "./_generated/server.js";
import { Workpool } from "@convex-dev/workpool";
import { RateLimiter } from "@convex-dev/rate-limiter";
import { api, components, internal } from "./_generated/api.js";
import { internalMutation } from "./_generated/server.js";
import { type Id, type Doc } from "./_generated/dataModel.js";
import {
  type EventType,
  type RuntimeConfig,
  type Status,
  vEventType,
  vMergeVar,
  vOptions,
  vRecipient,
  vRecipientMergeVar,
  vStatus,
  vTemplate,
} from "./shared.js";
import type { FunctionHandle } from "convex/server";
import schema from "./schema.js";

// ── Constants ───────────────────────────────────────────────────────────────

const SEGMENT_MS = 125;
const BASE_BATCH_DELAY = 1000;
const BATCH_SIZE = 100;
const EMAIL_POOL_SIZE = 4;
const CALLBACK_POOL_SIZE = 4;
const MANDRILL_ONE_CALL_EVERY_MS = 600;
const FIXED_WINDOW_DELAY = MANDRILL_ONE_CALL_EVERY_MS;
const FINALIZED_EMAIL_RETENTION_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const ABANDONED_EMAIL_RETENTION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const FINALIZED_EPOCH = Number.MAX_SAFE_INTEGER;

const PERMANENT_ERROR_CODES = new Set([
  400, 401, 403, 404, 405, 406, 407, 408, 410, 411, 413, 414, 415, 416, 418,
  421, 422, 426, 427, 428, 431,
]);

// ── Workpool & Rate Limiter ─────────────────────────────────────────────────

const emailPool = new Workpool(components.emailWorkpool, {
  maxParallelism: EMAIL_POOL_SIZE,
});

const callbackPool = new Workpool(components.callbackWorkpool, {
  maxParallelism: CALLBACK_POOL_SIZE,
});

const mandrillApiRateLimiter = new RateLimiter(components.rateLimiter, {
  mandrillApi: {
    kind: "fixed window",
    period: MANDRILL_ONE_CALL_EVERY_MS,
    rate: 1,
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function getSegment(now: number) {
  return Math.floor(now / SEGMENT_MS);
}

async function getDelay(ctx: MutationCtx): Promise<number> {
  const limit = await mandrillApiRateLimiter.limit(ctx, "mandrillApi", {
    reserve: true,
  });
  const jitter = Math.random() * FIXED_WINDOW_DELAY;
  return limit.retryAfter ? limit.retryAfter + jitter : 0;
}

async function scheduleBatchRun(ctx: MutationCtx, options: RuntimeConfig) {
  const lastOptions = await ctx.db.query("lastOptions").unique();
  if (!lastOptions) {
    await ctx.db.insert("lastOptions", { options });
  } else {
    const prev = lastOptions.options;
    if (
      prev.apiKey !== options.apiKey ||
      prev.initialBackoffMs !== options.initialBackoffMs ||
      prev.retryAttempts !== options.retryAttempts ||
      prev.onEmailEvent?.fnHandle !== options.onEmailEvent?.fnHandle
    ) {
      await ctx.db.replace(lastOptions._id, { options });
    }
  }

  const existing = await ctx.db.query("nextBatchRun").unique();
  if (existing) return;

  const runId = await ctx.scheduler.runAfter(
    BASE_BATCH_DELAY,
    internal.lib.makeBatch,
    { reloop: false, segment: getSegment(Date.now() + BASE_BATCH_DELAY) },
  );
  await ctx.db.insert("nextBatchRun", { runId });
}

async function reschedule(ctx: MutationCtx, emailsLeft: boolean) {
  emailsLeft =
    emailsLeft ||
    (await ctx.db
      .query("emails")
      .withIndex("by_status_segment", (q) => q.eq("status", "waiting"))
      .first()) !== null;

  if (!emailsLeft) {
    const batchRun = await ctx.db.query("nextBatchRun").unique();
    if (!batchRun) throw new Error("No batch run found -- invariant");
    await ctx.db.delete(batchRun._id);
  } else {
    const segment = getSegment(Date.now() + BASE_BATCH_DELAY);
    await ctx.scheduler.runAfter(BASE_BATCH_DELAY, internal.lib.makeBatch, {
      reloop: false,
      segment,
    });
  }
}

async function cleanupEmail(ctx: MutationCtx, email: Doc<"emails">) {
  await ctx.db.delete(email._id);
  if (email.text) await ctx.db.delete(email.text);
  if (email.html) await ctx.db.delete(email.html);

  const events = await ctx.db
    .query("deliveryEvents")
    .withIndex("by_emailId_eventType", (q) => q.eq("emailId", email._id))
    .collect();
  for (const event of events) {
    await ctx.db.delete(event._id);
  }
}

// Status ranking — higher means "more progressed"
const STATUS_RANK: Record<Status, number> = {
  waiting: 0,
  queued: 1,
  sent: 2,
  delivered: 3,
  bounced: 4,
  rejected: 4,
  failed: 4,
  cancelled: 100,
};

function computeEmailUpdateFromEvent(
  email: Doc<"emails">,
  eventType: EventType,
  message?: string,
): Partial<Doc<"emails">> | null {
  const canUpgradeTo = (next: Status) => {
    if (email.status === "cancelled") return false;
    return STATUS_RANK[next] > STATUS_RANK[email.status];
  };

  switch (eventType) {
    case "send":
      // Mandrill "send" = accepted by receiving server
      if (canUpgradeTo("delivered")) {
        return { status: "delivered" as const, finalizedAt: Date.now() };
      }
      return null;

    case "hard_bounce":
      if (canUpgradeTo("bounced")) {
        return {
          status: "bounced" as const,
          bounced: true,
          errorMessage: message,
          finalizedAt: Date.now(),
        };
      }
      if (!email.bounced) return { bounced: true, errorMessage: message };
      return null;

    case "soft_bounce":
      if (!email.bounced) return { bounced: true, errorMessage: message };
      return null;

    case "open":
      if (!email.opened) return { opened: true };
      return null;

    case "click":
      if (!email.clicked) return { clicked: true };
      return null;

    case "spam":
      if (!email.complained) return { complained: true };
      return null;

    case "reject":
      if (canUpgradeTo("rejected")) {
        return {
          status: "rejected" as const,
          rejectReason: message,
          finalizedAt: Date.now(),
        };
      }
      return null;

    case "deferral":
    case "unsub":
      // Logged as delivery events but don't change email status
      return null;

    default: {
      // Exhaustive check
      const _: never = eventType;
      console.warn(`Unknown event type: ${String(_)}`);
      return null;
    }
  }
}

async function enqueueCallbackIfExists(
  ctx: MutationCtx,
  emailId: Id<"emails">,
  eventType: EventType,
) {
  const lastOptions = await ctx.db.query("lastOptions").unique();
  if (!lastOptions?.options.onEmailEvent) return;

  const handle = lastOptions.options.onEmailEvent.fnHandle as FunctionHandle<
    "mutation",
    { id: string; event: string },
    void
  >;
  await callbackPool.enqueueMutation(ctx, handle, {
    id: emailId,
    event: eventType,
  });
}

// ── Exposed Mutations ───────────────────────────────────────────────────────

export const sendEmail = mutation({
  args: {
    options: vOptions,
    from_email: v.string(),
    from_name: v.optional(v.string()),
    to: v.array(vRecipient),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    template: v.optional(vTemplate),
    headers: v.optional(v.record(v.string(), v.string())),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.record(v.string(), v.string())),
    globalMergeVars: v.optional(v.array(vMergeVar)),
    mergeVars: v.optional(v.array(vRecipientMergeVar)),
    trackOpens: v.optional(v.boolean()),
    trackClicks: v.optional(v.boolean()),
  },
  returns: v.id("emails"),
  handler: async (ctx, args) => {
    const hasContent =
      args.html !== undefined || args.text !== undefined;
    const hasTemplate = args.template !== undefined;
    if (!hasContent && !hasTemplate) {
      throw new Error("Either html/text or template must be provided");
    }

    let htmlContentId: Id<"content"> | undefined;
    if (args.html !== undefined) {
      htmlContentId = await ctx.db.insert("content", {
        content: new TextEncoder().encode(args.html).buffer as ArrayBuffer,
        mimeType: "text/html",
      });
    }

    let textContentId: Id<"content"> | undefined;
    if (args.text !== undefined) {
      textContentId = await ctx.db.insert("content", {
        content: new TextEncoder().encode(args.text).buffer as ArrayBuffer,
        mimeType: "text/plain",
      });
    }

    const segment = getSegment(Date.now());

    const emailId = await ctx.db.insert("emails", {
      from_email: args.from_email,
      from_name: args.from_name,
      to: args.to,
      subject: args.subject,
      html: htmlContentId,
      text: textContentId,
      template: args.template,
      headers: args.headers,
      tags: args.tags,
      metadata: args.metadata,
      globalMergeVars: args.globalMergeVars,
      mergeVars: args.mergeVars,
      trackOpens: args.trackOpens,
      trackClicks: args.trackClicks,
      status: "waiting",
      opened: false,
      clicked: false,
      bounced: false,
      complained: false,
      segment,
      finalizedAt: FINALIZED_EPOCH,
    });

    await scheduleBatchRun(ctx, args.options);
    return emailId;
  },
});

export const createManualEmail = mutation({
  args: {
    from_email: v.string(),
    from_name: v.optional(v.string()),
    to: v.array(vRecipient),
    subject: v.optional(v.string()),
  },
  returns: v.id("emails"),
  handler: async (ctx, args) => {
    const emailId = await ctx.db.insert("emails", {
      from_email: args.from_email,
      from_name: args.from_name,
      to: args.to,
      subject: args.subject,
      status: "queued",
      opened: false,
      clicked: false,
      bounced: false,
      complained: false,
      segment: Infinity,
      finalizedAt: FINALIZED_EPOCH,
    });
    return emailId;
  },
});

export const updateManualEmail = mutation({
  args: {
    emailId: v.id("emails"),
    status: vStatus,
    mandrillId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const isFinal =
      args.status === "failed" ||
      args.status === "cancelled" ||
      args.status === "bounced" ||
      args.status === "rejected";
    await ctx.db.patch(args.emailId, {
      status: args.status,
      mandrillId: args.mandrillId,
      errorMessage: args.errorMessage,
      ...(isFinal ? { finalizedAt: Date.now() } : {}),
    });
    return null;
  },
});

export const cancelEmail = mutation({
  args: { emailId: v.id("emails") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) throw new Error("Email not found");
    if (email.status !== "waiting" && email.status !== "queued") {
      throw new Error(
        `Cannot cancel email with status "${email.status}"`,
      );
    }
    await ctx.db.patch(args.emailId, {
      status: "cancelled",
      finalizedAt: Date.now(),
    });
    return null;
  },
});

export const handleEmailEvent = mutation({
  args: {
    eventType: vEventType,
    mandrillId: v.string(),
    ts: v.number(),
    message: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await ctx.db
      .query("emails")
      .withIndex("by_mandrillId", (q) => q.eq("mandrillId", args.mandrillId))
      .unique();

    if (!email) {
      console.info(
        `Email not found for mandrillId: ${args.mandrillId}, ignoring`,
      );
      return null;
    }

    // Record delivery event
    await ctx.db.insert("deliveryEvents", {
      emailId: email._id,
      mandrillId: args.mandrillId,
      eventType: args.eventType,
      ts: args.ts,
      message: args.message,
    });

    // Update email state
    const patch = computeEmailUpdateFromEvent(
      email,
      args.eventType,
      args.message,
    );
    if (patch) {
      await ctx.db.patch(email._id, patch);
    }

    await enqueueCallbackIfExists(ctx, email._id, args.eventType);
    return null;
  },
});

// ── Exposed Queries ─────────────────────────────────────────────────────────

export const getStatus = query({
  args: { emailId: v.id("emails") },
  returns: v.union(
    v.object({
      status: vStatus,
      errorMessage: v.union(v.string(), v.null()),
      rejectReason: v.union(v.string(), v.null()),
      bounced: v.boolean(),
      complained: v.boolean(),
      opened: v.boolean(),
      clicked: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return null;
    return {
      status: email.status,
      errorMessage: email.errorMessage ?? null,
      rejectReason: email.rejectReason ?? null,
      bounced: email.bounced,
      complained: email.complained,
      opened: email.opened,
      clicked: email.clicked,
    };
  },
});

const emailFields = schema.tables.emails.validator.fields;
const {
  html: _html,
  text: _text,
  segment: _segment,
  finalizedAt: _finalizedAt,
  ...emailFieldsWithoutContent
} = emailFields;

export const get = query({
  args: { emailId: v.id("emails") },
  returns: v.union(
    v.object({
      ...emailFieldsWithoutContent,
      createdAt: v.number(),
      html: v.optional(v.string()),
      text: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.emailId);
    if (!email) return null;

    const html = email.html
      ? new TextDecoder().decode(
          (await ctx.db.get(email.html))?.content,
        )
      : undefined;
    const text = email.text
      ? new TextDecoder().decode(
          (await ctx.db.get(email.text))?.content,
        )
      : undefined;

    const {
      _id,
      _creationTime,
      html: _h,
      text: _t,
      segment: _s,
      finalizedAt: _f,
      ...rest
    } = email;

    return {
      ...rest,
      createdAt: _creationTime,
      html,
      text,
    };
  },
});

// ── Internal Queries ────────────────────────────────────────────────────────

export const getEmailsByIds = internalQuery({
  args: { emailIds: v.array(v.id("emails")) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const emails = await Promise.all(
      args.emailIds.map((id) => ctx.db.get(id)),
    );
    return emails.filter((e): e is Doc<"emails"> => e !== null);
  },
});

export const getAllContentByIds = internalQuery({
  args: { contentIds: v.array(v.id("content")) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const entries: Array<{ id: string; text: string }> = [];
    for (const id of args.contentIds) {
      const doc = await ctx.db.get(id);
      if (doc) {
        entries.push({
          id,
          text: new TextDecoder().decode(doc.content),
        });
      }
    }
    return entries;
  },
});

export const getEmailByMandrillId = internalQuery({
  args: { mandrillId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emails")
      .withIndex("by_mandrillId", (q) => q.eq("mandrillId", args.mandrillId))
      .unique();
  },
});

// ── Internal Mutations ──────────────────────────────────────────────────────

export const makeBatch = internalMutation({
  args: { reloop: v.boolean(), segment: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lastOptions = await ctx.db.query("lastOptions").unique();
    if (!lastOptions) throw new Error("No last options found -- invariant");
    const options = lastOptions.options;

    const emails = await ctx.db
      .query("emails")
      .withIndex("by_status_segment", (q) =>
        q.eq("status", "waiting").lte("segment", args.segment - 2),
      )
      .take(BATCH_SIZE);

    if (emails.length === 0 || (args.reloop && emails.length < BATCH_SIZE)) {
      await reschedule(ctx, emails.length > 0);
      return null;
    }

    console.log(`Making a batch of ${emails.length} emails`);

    for (const email of emails) {
      await ctx.db.patch(email._id, { status: "queued" });
    }

    const delay = await getDelay(ctx);

    await emailPool.enqueueAction(
      ctx,
      internal.lib.callMandrillAPIWithBatch,
      {
        apiKey: options.apiKey,
        emailIds: emails.map((e) => e._id),
      },
      {
        retry: {
          maxAttempts: options.retryAttempts,
          initialBackoffMs: options.initialBackoffMs,
          base: 2,
        },
        runAfter: delay,
        context: { emailIds: emails.map((e) => e._id) },
        onComplete: internal.lib.onEmailComplete,
      },
    );

    await ctx.scheduler.runAfter(0, internal.lib.makeBatch, {
      reloop: true,
      segment: args.segment,
    });
    return null;
  },
});

export const markEmailsFailed = internalMutation({
  args: {
    emailIds: v.array(v.id("emails")),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await Promise.all(
      args.emailIds.map(async (emailId) => {
        const email = await ctx.db.get(emailId);
        if (!email || email.status === "cancelled") return;
        await ctx.db.patch(emailId, {
          status: "failed",
          errorMessage: args.errorMessage,
          finalizedAt: Date.now(),
        });
      }),
    );
    return null;
  },
});

const vBatchReturns = v.union(
  v.object({
    emailIds: v.array(v.id("emails")),
    mandrillIds: v.array(v.string()),
  }),
  v.null(),
);

export const onEmailComplete = emailPool.defineOnComplete({
  context: v.object({ emailIds: v.array(v.id("emails")) }),
  handler: async (ctx, args) => {
    if (args.result.kind === "success") {
      const result = args.result.returnValue as
        | { emailIds: Id<"emails">[]; mandrillIds: string[] }
        | undefined;
      if (!result) return;
      const { emailIds, mandrillIds } = result;
      await Promise.all(
        emailIds.map((emailId, i) =>
          ctx.db.patch(emailId, {
            status: "sent",
            mandrillId: mandrillIds[i],
          }),
        ),
      );
    } else if (args.result.kind === "failed") {
      const errorMessage = args.result.error;
      await Promise.all(
        args.context.emailIds.map(async (emailId) => {
          const email = await ctx.db.get(emailId);
          if (!email || email.status === "cancelled") return;
          await ctx.db.patch(emailId, {
            status: "failed",
            errorMessage,
            finalizedAt: Date.now(),
          });
        }),
      );
    } else if (args.result.kind === "canceled") {
      await Promise.all(
        args.context.emailIds.map(async (emailId) => {
          const email = await ctx.db.get(emailId);
          if (!email || email.status !== "queued") return;
          await ctx.db.patch(emailId, {
            status: "cancelled",
            errorMessage: "Mandrill API batch job was cancelled",
            finalizedAt: Date.now(),
          });
        }),
      );
    }
  },
});

// ── Internal Action — Mandrill API Call ─────────────────────────────────────

export const callMandrillAPIWithBatch = internalAction({
  args: {
    apiKey: v.string(),
    emailIds: v.array(v.id("emails")),
  },
  returns: vBatchReturns,
  handler: async (ctx, args) => {
    const allEmails = (await ctx.runQuery(internal.lib.getEmailsByIds, {
      emailIds: args.emailIds,
    })) as Doc<"emails">[];
    const emails = allEmails.filter((e) => e.status === "queued");

    if (emails.length === 0) {
      console.log(
        "No emails to send in batch. All were cancelled or failed.",
      );
      return null;
    }

    // Gather all content IDs
    const contentIds = emails
      .flatMap((e) => [e.html, e.text])
      .filter((id): id is Id<"content"> => id !== undefined);

    const contentEntries = contentIds.length > 0
      ? ((await ctx.runQuery(internal.lib.getAllContentByIds, {
          contentIds,
        })) as Array<{ id: string; text: string }>)
      : [];

    const contentMap = new Map(contentEntries.map((e) => [e.id, e.text]));

    const sentEmailIds: Id<"emails">[] = [];
    const mandrillIds: string[] = [];

    for (const email of emails) {
      const htmlText = email.html ? contentMap.get(email.html) : undefined;
      const plainText = email.text ? contentMap.get(email.text) : undefined;

      const message: Record<string, unknown> = {
        from_email: email.from_email,
        from_name: email.from_name,
        to: email.to.map((r) => ({
          email: r.email,
          name: r.name,
          type: r.type ?? "to",
        })),
        subject: email.subject,
        html: htmlText,
        text: plainText,
        headers: email.headers,
        tags: email.tags,
        metadata: email.metadata,
        global_merge_vars: email.globalMergeVars?.map((v) => ({
          name: v.name,
          content: v.content,
        })),
        merge_vars: email.mergeVars?.map((v) => ({
          rcpt: v.rcpt,
          vars: v.vars.map((mv) => ({ name: mv.name, content: mv.content })),
        })),
        track_opens: email.trackOpens,
        track_clicks: email.trackClicks,
      };

      // Clean undefined values
      for (const key of Object.keys(message)) {
        if (message[key] === undefined) delete message[key];
      }

      let endpoint: string;
      let body: Record<string, unknown>;

      if (email.template) {
        endpoint =
          "https://mandrillapp.com/api/1.0/messages/send-template.json";
        body = {
          key: args.apiKey,
          template_name: email.template.name,
          template_content: email.template.content,
          message,
        };
      } else {
        endpoint = "https://mandrillapp.com/api/1.0/messages/send.json";
        body = {
          key: args.apiKey,
          message,
        };
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (PERMANENT_ERROR_CODES.has(response.status)) {
          const errorText = await response.text();
          await ctx.runMutation(internal.lib.markEmailsFailed, {
            emailIds: [email._id],
            errorMessage: `Mandrill API error: ${response.status} ${errorText}`,
          });
          continue;
        }
        const errorText = await response.text();
        throw new Error(`Mandrill API error: ${errorText}`);
      }

      const data = (await response.json()) as Array<{
        email: string;
        status: string;
        _id: string;
        reject_reason?: string;
      }>;

      // Mandrill returns one entry per recipient
      // Use the first recipient's _id as the tracking ID
      if (data.length > 0) {
        const firstResult = data[0];

        if (
          firstResult.status === "rejected" ||
          firstResult.status === "invalid"
        ) {
          await ctx.runMutation(internal.lib.markEmailsFailed, {
            emailIds: [email._id],
            errorMessage: `Mandrill ${firstResult.status}: ${firstResult.reject_reason ?? "unknown"}`,
          });
          continue;
        }

        sentEmailIds.push(email._id);
        mandrillIds.push(firstResult._id);
      }
    }

    if (sentEmailIds.length === 0) return null;
    return { emailIds: sentEmailIds, mandrillIds };
  },
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

export const cleanupOldEmails = mutation({
  args: { olderThan: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const olderThan = args.olderThan ?? FINALIZED_EMAIL_RETENTION_MS;
    const oldAndDone = await ctx.db
      .query("emails")
      .withIndex("by_finalizedAt", (q) =>
        q.lt("finalizedAt", Date.now() - olderThan),
      )
      .take(BATCH_SIZE);

    for (const email of oldAndDone) {
      await cleanupEmail(ctx, email);
    }

    if (oldAndDone.length > 0) {
      console.log(`Cleaned up ${oldAndDone.length} old emails`);
    }

    if (oldAndDone.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, api.lib.cleanupOldEmails, {
        olderThan,
      });
    }
    return null;
  },
});

export const cleanupAbandonedEmails = mutation({
  args: { olderThan: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const olderThan = args.olderThan ?? ABANDONED_EMAIL_RETENTION_MS;
    const cutoff = Date.now() - olderThan;

    // Query by creation time for abandoned emails that never finalized
    const abandoned = await ctx.db
      .query("emails")
      .withIndex("by_finalizedAt", (q) =>
        q.eq("finalizedAt", FINALIZED_EPOCH),
      )
      .take(500);

    const old = abandoned.filter((e) => e._creationTime < cutoff);

    for (const email of old) {
      await cleanupEmail(ctx, email);
    }

    if (old.length > 0) {
      console.log(`Cleaned up ${old.length} abandoned emails`);
    }

    if (old.length === 500) {
      await ctx.scheduler.runAfter(0, api.lib.cleanupAbandonedEmails, {
        olderThan,
      });
    }
    return null;
  },
});
