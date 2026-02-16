import { v, type Infer } from "convex/values";

// ── Status ──────────────────────────────────────────────────────────────────

export const vStatus = v.union(
  v.literal("waiting"),
  v.literal("queued"),
  v.literal("cancelled"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("rejected"),
  v.literal("failed"),
);
export type Status = Infer<typeof vStatus>;

// ── Email building blocks ───────────────────────────────────────────────────

export const vRecipient = v.object({
  email: v.string(),
  name: v.optional(v.string()),
  type: v.optional(
    v.union(v.literal("to"), v.literal("cc"), v.literal("bcc")),
  ),
});
export type Recipient = Infer<typeof vRecipient>;

export const vTemplate = v.object({
  name: v.string(),
  content: v.array(
    v.object({
      name: v.string(),
      content: v.string(),
    }),
  ),
});
export type Template = Infer<typeof vTemplate>;

export const vMergeVar = v.object({
  name: v.string(),
  content: v.string(),
});
export type MergeVar = Infer<typeof vMergeVar>;

export const vRecipientMergeVar = v.object({
  rcpt: v.string(),
  vars: v.array(vMergeVar),
});
export type RecipientMergeVar = Infer<typeof vRecipientMergeVar>;

// ── Runtime config ──────────────────────────────────────────────────────────

export const vOptions = v.object({
  apiKey: v.string(),
  initialBackoffMs: v.number(),
  retryAttempts: v.number(),
  onEmailEvent: v.optional(v.object({ fnHandle: v.string() })),
});
export type RuntimeConfig = Infer<typeof vOptions>;

// ── Webhook events ──────────────────────────────────────────────────────────

export const vEventType = v.union(
  v.literal("send"),
  v.literal("deferral"),
  v.literal("hard_bounce"),
  v.literal("soft_bounce"),
  v.literal("open"),
  v.literal("click"),
  v.literal("spam"),
  v.literal("unsub"),
  v.literal("reject"),
);
export type EventType = Infer<typeof vEventType>;

export const vWebhookEvent = v.object({
  event: v.string(),
  _id: v.optional(v.string()),
  ts: v.optional(v.number()),
  msg: v.object({
    _id: v.optional(v.string()),
    email: v.optional(v.string()),
    subject: v.optional(v.string()),
    sender: v.optional(v.string()),
    state: v.optional(v.string()),
    bounce_description: v.optional(v.string()),
    diag: v.optional(v.string()),
    reject: v.optional(
      v.object({
        reason: v.optional(v.string()),
      }),
    ),
  }),
});
export type WebhookEvent = Infer<typeof vWebhookEvent>;
