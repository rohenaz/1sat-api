import { fetchJSON } from "./http";

type FetchTransaction = (url: string) => Promise<unknown | null>;

const fetchTransaction: FetchTransaction = (url) => fetchJSON<unknown>(url);

export const isTransactionOnChain = async (
	txid: string,
	request: FetchTransaction = fetchTransaction,
): Promise<boolean> => {
	const transaction = await request(
		`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`,
	);
	return transaction !== null;
};
