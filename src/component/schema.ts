import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vEventType,
  vMergeVar,
  vOptions,
  vRecipient,
  vRecipientMergeVar,
  vStatus,
  vTemplate,
} from "./shared.js";

export default defineSchema({
  emails: defineTable({
    from_email: v.string(),
    from_name: v.optional(v.string()),
    to: v.array(vRecipient),
    subject: v.optional(v.string()),
    html: v.optional(v.id("content")),
    text: v.optional(v.id("content")),
    template: v.optional(vTemplate),
    headers: v.optional(v.record(v.string(), v.string())),
    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.record(v.string(), v.string())),
    globalMergeVars: v.optional(v.array(vMergeVar)),
    mergeVars: v.optional(v.array(vRecipientMergeVar)),
    trackOpens: v.optional(v.boolean()),
    trackClicks: v.optional(v.boolean()),

    status: vStatus,
    errorMessage: v.optional(v.string()),
    rejectReason: v.optional(v.string()),
    mandrillId: v.optional(v.string()),

    opened: v.boolean(),
    clicked: v.boolean(),
    bounced: v.boolean(),
    complained: v.boolean(),

    segment: v.number(),
    finalizedAt: v.number(),
  })
    .index("by_status_segment", ["status", "segment"])
    .index("by_mandrillId", ["mandrillId"])
    .index("by_finalizedAt", ["finalizedAt"]),

  deliveryEvents: defineTable({
    emailId: v.id("emails"),
    mandrillId: v.string(),
    eventType: vEventType,
    ts: v.number(),
    message: v.optional(v.string()),
  }).index("by_emailId_eventType", ["emailId", "eventType"]),

  content: defineTable({
    content: v.bytes(),
    mimeType: v.string(),
  }),

  lastOptions: defineTable({
    options: vOptions,
  }),

  nextBatchRun: defineTable({
    runId: v.id("_scheduled_functions"),
  }),
});
