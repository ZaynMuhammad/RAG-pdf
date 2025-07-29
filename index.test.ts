import { describe, expect, it } from "bun:test";
import app from ".";

describe("Hono App", () => {
  it("Should return 200 for root path", async () => {
    const req = new Request("http://localhost/");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Hello Hono!");
  });

  it("Should return JSON for /api/hello", async () => {
    const req = new Request("http://localhost/api/hello");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Hello from Hono API!");
    expect(data.timestamp).toBeDefined();
  });

  it("Should echo POST data", async () => {
    const testData = { test: "data" };
    const req = new Request("http://localhost/api/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testData),
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.message).toBe("Echo response");
    expect(data.data).toEqual(testData);
  });
});
