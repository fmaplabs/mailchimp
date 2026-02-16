import { defineApp } from "convex/server";
import mailchimp from "@fmaplabs/mailchimp/convex.config.js";

const app = defineApp();
app.use(mailchimp);

export default app;
