import { API_HOST, NUMBER_OF_ITEMS_PER_PAGE } from "./constants";
import type {
	CollectionFilterOptions,
	CollectionItemData,
	CollectionQuery,
	CollectionSortBy,
} from "./types/collection";
import type { OrdUtxo } from "./types/ordinals";
import { fetchJSON } from "./utils";

const buildQuery = (opts: CollectionFilterOptions): CollectionQuery => {
	const q: CollectionQuery = {
		map: {
			subTypeData: {
				collectionId: opts.collectionId,
			},
		},
	};

	// Add trait filters to the query
	if (opts.traits && opts.traits.length > 0) {
		for (const trait of opts.traits) {
			// Traits are stored as key-value pairs in subTypeData
			// e.g. "Background": "Blue"
			q.map.subTypeData[trait.name] = trait.value;
		}
	}

	return q;
};

const parseSubTypeData = (item: OrdUtxo): CollectionItemData | undefined => {
	const subTypeDataStr = item.origin?.map?.subTypeData;
	if (!subTypeDataStr) {
		return undefined;
	}

	try {
		return JSON.parse(subTypeDataStr) as CollectionItemData;
	} catch {
		return undefined;
	}
};

const sortItems = (
	items: OrdUtxo[],
	sort: CollectionSortBy = "recent",
): OrdUtxo[] => {
	return [...items].sort((a, b) => {
		const dataA = parseSubTypeData(a);
		const dataB = parseSubTypeData(b);

		switch (sort) {
			case "mint_number": {
				const numA = dataA?.mintNumber ?? Number.MAX_SAFE_INTEGER;
				const numB = dataB?.mintNumber ?? Number.MAX_SAFE_INTEGER;
				return numA - numB;
			}
			case "rarity": {
				const rankA = dataA?.rank ?? Number.MAX_SAFE_INTEGER;
				const rankB = dataB?.rank ?? Number.MAX_SAFE_INTEGER;
				return rankA - rankB;
			}
			default:
				return (b.height ?? 0) - (a.height ?? 0);
		}
	});
};

const sortMarket = (
	items: OrdUtxo[],
	sort: CollectionSortBy = "price_asc",
): OrdUtxo[] => {
	return [...items].sort((a, b) => {
		const priceA = a.data?.list?.price ?? 0;
		const priceB = b.data?.list?.price ?? 0;
		const dataA = parseSubTypeData(a);
		const dataB = parseSubTypeData(b);

		switch (sort) {
			case "price_desc":
				return priceB - priceA;
			case "rarity": {
				const rankA = dataA?.rank ?? Number.MAX_SAFE_INTEGER;
				const rankB = dataB?.rank ?? Number.MAX_SAFE_INTEGER;
				return rankA - rankB;
			}
			case "mint_number": {
				const numA = dataA?.mintNumber ?? Number.MAX_SAFE_INTEGER;
				const numB = dataB?.mintNumber ?? Number.MAX_SAFE_INTEGER;
				return numA - numB;
			}
			default:
				return priceA - priceB;
		}
	});
};

const filterByPrice = (
	items: OrdUtxo[],
	minPrice?: number,
	maxPrice?: number,
): OrdUtxo[] => {
	return items.filter((item) => {
		const price = item.data?.list?.price ?? 0;
		if (minPrice !== undefined && price < minPrice) {
			return false;
		}
		if (maxPrice !== undefined && price > maxPrice) {
			return false;
		}
		return true;
	});
};

export const fetchCollectionItems = async (
	opts: CollectionFilterOptions,
	offset = 0,
	limit: number = NUMBER_OF_ITEMS_PER_PAGE,
): Promise<OrdUtxo[]> => {
	const q = buildQuery(opts);
	const url = `${API_HOST}/txos/search/unspent?offset=${offset}&limit=${limit}&q=${btoa(
		JSON.stringify(q),
	)}`;
	const items = await fetchJSON<OrdUtxo[]>(url);

	// Filter out listed items (those are in market)
	let filtered = (items ?? []).filter((i) => !i?.data?.list?.price);

	// Apply sorting
	filtered = sortItems(filtered, opts.sort);

	return filtered;
};

export const fetchCollectionMarket = async (
	opts: CollectionFilterOptions,
	offset = 0,
	limit: number = NUMBER_OF_ITEMS_PER_PAGE,
): Promise<OrdUtxo[]> => {
	const q = buildQuery(opts);
	const url = `${API_HOST}/market?sort=price&dir=asc&offset=${offset}&limit=${limit}&q=${btoa(
		JSON.stringify(q),
	)}`;

	let items = await fetchJSON<OrdUtxo[]>(url);
	if (!items) {
		return [];
	}

	// Apply price filter
	items = filterByPrice(items, opts.minPrice, opts.maxPrice);

	// Apply sorting
	items = sortMarket(items, opts.sort);

	return items;
};

export const fetchCollectionSales = async (
	collectionId: string,
	offset = 0,
	limit: number = NUMBER_OF_ITEMS_PER_PAGE,
): Promise<OrdUtxo[]> => {
	const q: CollectionQuery = {
		map: {
			subTypeData: {
				collectionId,
			},
		},
	};
	const url = `${API_HOST}/market/sales?offset=${offset}&limit=${limit}&q=${btoa(
		JSON.stringify(q),
	)}`;

	return (await fetchJSON<OrdUtxo[]>(url)) ?? [];
};
