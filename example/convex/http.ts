import { httpRouter } from "convex/server";
import { components } from "./_generated/api";
import { MailchimpTransactional } from "@fmaplabs/mailchimp";

const http = httpRouter();

const mailchimp = new MailchimpTransactional(components.mailchimp, {
  // apiKey defaults to process.env.MANDRILL_API_KEY
  // webhookKey defaults to process.env.MANDRILL_WEBHOOK_KEY
});

// Register Mandrill webhook routes (POST + HEAD)
mailchimp.registerRoutes(http, {
  path: "/mandrill/webhook",
});

export default http;
