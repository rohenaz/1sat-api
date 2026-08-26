type Fetcher = (
	input: Request | string | URL,
	init?: RequestInit,
) => Promise<Response>;

type FetchJSONOptions = {
	fetcher?: Fetcher;
	retries?: number;
	retryDelayMs?: number;
};

const shouldRetry = (status: number): boolean =>
	status === 429 || status >= 500;

export const fetchJSON = async <T>(
	url: string,
	{ fetcher = fetch, retries = 1, retryDelayMs = 100 }: FetchJSONOptions = {},
): Promise<T | null> => {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetcher(url);
			if (response.ok) {
				return (await response.json()) as T;
			}

			if (shouldRetry(response.status) && attempt < retries) {
				await Bun.sleep(retryDelayMs * (attempt + 1));
				continue;
			}

			if (response.status !== 404) {
				console.error("Fetch failed", { url, status: response.status });
			}
			return null;
		} catch (error) {
			if (attempt < retries) {
				await Bun.sleep(retryDelayMs * (attempt + 1));
				continue;
			}

			console.error("Fetch error", { error, url });
			return null;
		}
	}

	return null;
};

export const fetchJSONArray = async <T>(
	url: string,
	options?: FetchJSONOptions,
): Promise<T[]> => {
	const response = await fetchJSON<unknown>(url, options);
	if (response === null) {
		return [];
	}
	if (!Array.isArray(response)) {
		console.error("Expected an array response", {
			url,
			responseType: typeof response,
		});
		return [];
	}
	return response as T[];
};
