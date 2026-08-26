import { timingSafeEqual } from "node:crypto";

type BasicAuthGuardOptions = {
	credentials: string;
	realm?: string;
	scope: string;
};

type Credential = {
	password: string;
	username: string;
};

const parseCredentials = (value: string): Map<string, Credential> => {
	const credentials = new Map<string, Credential>();

	for (const entry of value.split(";")) {
		const [username, password] = entry.split(":");
		if (username && password) {
			credentials.set(username, { password, username });
		}
	}

	return credentials;
};

const safeEqual = (actual: string, expected: string): boolean => {
	const actualBuffer = Buffer.from(actual, "utf8");
	const expectedBuffer = Buffer.from(expected, "utf8");
	const maxLength = Math.max(
		actualBuffer.byteLength,
		expectedBuffer.byteLength,
	);

	return timingSafeEqual(
		Buffer.concat([actualBuffer, Buffer.alloc(maxLength)], maxLength),
		Buffer.concat([expectedBuffer, Buffer.alloc(maxLength)], maxLength),
	);
};

const unauthorized = (realm: string): Response =>
	new Response("Unauthorized", {
		headers: { "WWW-Authenticate": `Basic realm="${realm}"` },
		status: 401,
	});

export const createBasicAuthGuard = ({
	credentials: serializedCredentials,
	realm = "Secure Area",
	scope,
}: BasicAuthGuardOptions) => {
	const credentials = parseCredentials(serializedCredentials);

	return ({ request }: { request: Request }): Response | undefined => {
		if (!new URL(request.url).pathname.startsWith(scope)) {
			return undefined;
		}

		const authorization = request.headers.get("Authorization");
		if (!authorization?.toLowerCase().startsWith("basic ")) {
			return unauthorized(realm);
		}

		try {
			const token = authorization.split(" ")[1];
			if (!token) {
				return unauthorized(realm);
			}

			const [username = "", password = ""] = Buffer.from(token, "base64")
				.toString("utf8")
				.split(":");
			const reference = credentials.get(username);
			const usernameMatches = safeEqual(username, reference?.username ?? "");
			const passwordMatches = safeEqual(password, reference?.password ?? "");
			const valid =
				Boolean(username && password) && usernameMatches && passwordMatches;

			return valid ? undefined : unauthorized(realm);
		} catch {
			return unauthorized(realm);
		}
	};
};
