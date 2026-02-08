import { defineApp } from "convex/server";
import llmCache from "@mzedstudio/llm-cache/convex.config.js";

const app = defineApp();
app.use(llmCache, { name: "llmCache" });
export default app;
