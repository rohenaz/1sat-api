import { describe, expect, test } from "bun:test";
import { fetchJSON, fetchJSONArray } from "./http";

const responseSequence = (...responses: Response[]) => {
	let index = 0;
	return async () => {
		const response = responses[index++];
		if (!response) {
			throw new Error("No response configured for request");
		}
		return response;
	};
};

describe("JSON fetching", () => {
	test("retries a transient upstream failure", async () => {
		const fetcher = responseSequence(
			new Response("upstream error", { status: 500 }),
			Response.json({ ok: true }),
		);

		const result = await fetchJSON<{ ok: boolean }>("https://example.com", {
			fetcher,
			retryDelayMs: 0,
		});

		expect(result).toEqual({ ok: true });
	});

	test("does not retry a missing resource", async () => {
		let requests = 0;
		const fetcher = async () => {
			requests += 1;
			return new Response("not found", { status: 404 });
		};

		const result = await fetchJSON("https://example.com/missing", {
			fetcher,
			retryDelayMs: 0,
		});

		expect(result).toBeNull();
		expect(requests).toBe(1);
	});

	test("normalizes null responses to an empty array", async () => {
		const fetcher = responseSequence(
			new Response("not found", { status: 404 }),
		);

		expect(
			await fetchJSONArray("https://example.com/missing", {
				fetcher,
				retryDelayMs: 0,
			}),
		).toEqual([]);
	});
});
