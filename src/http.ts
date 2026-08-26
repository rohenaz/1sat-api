type Fetcher = (
	input: Request | string | URL,
	init?: RequestInit,
) => Promise<Response>;

type FetchJSONOptions = {
	fetcher?: Fetcher;
	retries?: number;
	retryDelayMs?: number;
	signal?: AbortSignal;
	throwOnError?: boolean;
	timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

const shouldRetry = (status: number): boolean =>
	status === 429 || status >= 500;

const createSignal = (timeoutMs: number, signal?: AbortSignal): AbortSignal => {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
};

export const fetchJSON = async <T>(
	url: string,
	{
		fetcher = fetch,
		retries = 1,
		retryDelayMs = 100,
		signal,
		throwOnError = false,
		timeoutMs = DEFAULT_TIMEOUT_MS,
	}: FetchJSONOptions = {},
): Promise<T | null> => {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		try {
			const response = await fetcher(url, {
				signal: createSignal(timeoutMs, signal),
			});
			if (response.ok) {
				return (await response.json()) as T;
			}

			if (shouldRetry(response.status) && attempt < retries) {
				await Bun.sleep(retryDelayMs * (attempt + 1));
				continue;
			}

			if (response.status !== 404) {
				const error = new Error(`Fetch failed with status ${response.status}`);
				if (throwOnError) {
					throw error;
				}
				console.error("Fetch failed", {
					url,
					status: response.status,
				});
			}
			return null;
		} catch (error) {
			if (signal?.aborted) {
				return null;
			}
			if (attempt < retries) {
				await Bun.sleep(retryDelayMs * (attempt + 1));
				continue;
			}

			console.error("Fetch error", { error, url });
			if (throwOnError) {
				throw error;
			}
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
