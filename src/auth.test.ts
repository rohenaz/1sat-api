import { describe, expect, test } from "bun:test";
import { createBasicAuthGuard } from "./auth";

const guard = createBasicAuthGuard({
	credentials: "admin:secret;operator:password",
	realm: "Admin",
	scope: "/admin",
});

const request = (path: string, authorization?: string) =>
	new Request(`https://api.example.com${path}`, {
		headers: authorization ? { Authorization: authorization } : undefined,
	});

describe("basic auth guard", () => {
	test("ignores requests outside its scope", () => {
		expect(guard({ request: request("/status") })).toBeUndefined();
	});

	test("accepts configured credentials", () => {
		const authorization = `Basic ${Buffer.from("admin:secret").toString("base64")}`;
		expect(
			guard({ request: request("/admin/utxo/consolidate/key", authorization) }),
		).toBeUndefined();
	});

	test("challenges missing, malformed, and invalid credentials", () => {
		const invalidPassword = `Basic ${Buffer.from("admin:wrong").toString("base64")}`;
		const invalidUsername = `Basic ${Buffer.from("unknown:secret").toString("base64")}`;
		const missingPassword = `Basic ${Buffer.from("admin:").toString("base64")}`;

		for (const authorization of [
			undefined,
			"Basic",
			"Basic ",
			invalidPassword,
			invalidUsername,
			missingPassword,
		]) {
			const response = guard({
				request: request("/admin/utxo/consolidate/key", authorization),
			});
			expect(response?.status).toBe(401);
			expect(response?.headers.get("WWW-Authenticate")).toBe(
				'Basic realm="Admin"',
			);
		}
	});
});
