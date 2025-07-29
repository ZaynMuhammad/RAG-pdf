import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { convexMiddleware } from "convex/server";
import { ConvexHttpClient } from "convex/browser";
import { schema } from "./convex/schema";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

const app = new Hono();

app.get("/", (c) => c.text("Hello Hono!"));

app.get("/api/hello", (c) => {
  return c.json({
    message: "Hello from Hono API!",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/echo", async (c) => {
  const body = await c.req.json();
  return c.json({
    message: "Echo response",
    data: body,
  });
});

export default {
  port: 3000,
  fetch: app.fetch,
};
