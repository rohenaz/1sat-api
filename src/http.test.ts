import { describe, expect, spyOn, test } from "bun:test";
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

	test("retries rate-limited responses", async () => {
		const fetcher = responseSequence(
			new Response("rate limited", { status: 429 }),
			Response.json({ ok: true }),
		);

		const result = await fetchJSON<{ ok: boolean }>("https://example.com", {
			fetcher,
			retryDelayMs: 0,
		});

		expect(result).toEqual({ ok: true });
	});

	test("retries a rejected network request", async () => {
		let requests = 0;
		const fetcher = async () => {
			requests += 1;
			if (requests === 1) {
				throw new Error("connection reset");
			}
			return Response.json({ ok: true });
		};

		const result = await fetchJSON<{ ok: boolean }>("https://example.com", {
			fetcher,
			retryDelayMs: 0,
		});

		expect(result).toEqual({ ok: true });
		expect(requests).toBe(2);
	});

	test("returns null after persistent upstream failures", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(
			() => undefined,
		);
		let requests = 0;
		const fetcher = async () => {
			requests += 1;
			return new Response("unavailable", { status: 503 });
		};

		try {
			const result = await fetchJSON("https://example.com/unavailable", {
				fetcher,
				retryDelayMs: 0,
			});

			expect(result).toBeNull();
			expect(requests).toBe(2);
			expect(errorSpy).toHaveBeenCalledTimes(1);
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("can propagate an exhausted upstream failure", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(
			() => undefined,
		);
		const fetcher = responseSequence(
			new Response("unavailable", { status: 503 }),
		);

		try {
			const request = fetchJSON("https://example.com/unavailable", {
				fetcher,
				retries: 0,
				throwOnError: true,
			});

			await expect(request).rejects.toThrow("Fetch failed with status 503");
			expect(errorSpy).toHaveBeenCalledTimes(1);
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("does not retry a request cancelled by its caller", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(
			() => undefined,
		);
		const controller = new AbortController();
		controller.abort(new Error("cancelled"));
		let requests = 0;
		const fetcher = async (
			_input: Request | string | URL,
			init?: RequestInit,
		) => {
			requests += 1;
			throw init?.signal?.reason;
		};

		try {
			const result = await fetchJSON("https://example.com/cancelled", {
				fetcher,
				signal: controller.signal,
			});

			expect(result).toBeNull();
			expect(requests).toBe(1);
			expect(errorSpy).not.toHaveBeenCalled();
		} finally {
			errorSpy.mockRestore();
		}
	});

	test("retries invalid JSON responses", async () => {
		const fetcher = responseSequence(
			new Response("not json", {
				headers: { "Content-Type": "application/json" },
			}),
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

	test("aborts requests that exceed the configured timeout", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(
			() => undefined,
		);
		const fetcher = async (
			_input: Request | string | URL,
			init?: RequestInit,
		) =>
			await new Promise<Response>((_resolve, reject) => {
				const signal = init?.signal;
				if (!signal) {
					reject(new Error("missing abort signal"));
					return;
				}

				const abort = () => reject(signal.reason);
				if (signal.aborted) {
					abort();
					return;
				}
				signal.addEventListener("abort", abort, { once: true });
			});

		try {
			const result = await fetchJSON("https://example.com/hanging", {
				fetcher,
				retries: 0,
				timeoutMs: 5,
			});

			expect(result).toBeNull();
			expect(errorSpy).toHaveBeenCalledTimes(1);
		} finally {
			errorSpy.mockRestore();
		}
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

	test("normalizes non-array responses to an empty array", async () => {
		const errorSpy = spyOn(console, "error").mockImplementation(
			() => undefined,
		);
		const fetcher = responseSequence(Response.json({ ok: true }));

		try {
			expect(
				await fetchJSONArray("https://example.com/object", {
					fetcher,
				}),
			).toEqual([]);
			expect(errorSpy).toHaveBeenCalledTimes(1);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
