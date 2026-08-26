import { describe, expect, test } from "bun:test";
import { isTransactionOnChain } from "./claims";

describe("claim transaction lookup", () => {
	test("reports an absent transaction as unclaimed", async () => {
		const result = await isTransactionOnChain("missing", async () => null);

		expect(result).toBeFalse();
	});

	test("reports a returned transaction as claimed", async () => {
		let requestedUrl = "";
		const result = await isTransactionOnChain("abc123", async (url) => {
			requestedUrl = url;
			return { txid: "abc123" };
		});

		expect(result).toBeTrue();
		expect(requestedUrl).toBe(
			"https://api.whatsonchain.com/v1/bsv/main/tx/hash/abc123",
		);
	});
});
