import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

describe("bun env", () => {
	test("should alias process env", () => {
		expect(Bun.env).toBe(process.env);
	});
});

describe("HTTP semantics", () => {
	test("HEAD succeeds for async GET routes without returning a body", async () => {
		const app = new Elysia().get("/async", async () => ({ ok: true }));
		const response = await app.handle(
			new Request("http://localhost/async", { method: "HEAD" }),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-length")).toBe("11");
		expect(await response.text()).toBe("");
	});
});
