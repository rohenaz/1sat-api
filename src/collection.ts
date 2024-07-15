import { API_HOST, NUMBER_OF_ITEMS_PER_PAGE } from "./constants";
import type { FetchItemsQuery } from "./types/collection";
import type { OrdUtxo } from "./types/ordinals";
import { fetchJSON } from "./utils";

export const fetchCollectionItems = async (
  q: FetchItemsQuery,
  offset = 0,
  limit: number = NUMBER_OF_ITEMS_PER_PAGE
) => {
  const collectionItemsUrl = `${API_HOST}/api/txos/search/unspent?offset=${offset}&limit=${limit}&q=${btoa(
    JSON.stringify(q)
  )}`;
  const items = await fetchJSON<OrdUtxo[]>(collectionItemsUrl);

  return (items ?? []).filter((i) => !i?.data?.list?.price);
};

export const fetchCollectionMarket = async (
  q: FetchItemsQuery,
  offset = 0,
  limit: number = NUMBER_OF_ITEMS_PER_PAGE
) => {
  const collectionMarketUrl = `${API_HOST}/api/market?sort=price&dir=asc&offset=${offset}&limit=${limit}&q=${btoa(
    JSON.stringify(q)
  )}`;

  return await fetchJSON<OrdUtxo[]>(collectionMarketUrl);
};

export const fetchCollectionSales = async (
  collectionId: string,
  offset = 0,
  limit: number = NUMBER_OF_ITEMS_PER_PAGE
) => {
  const q = {
    map: {
      subTypeData: {
        collectionId,
      },
    },
  };
  const collectionSalesUrl = `${API_HOST}/api/market/sales?offset=${offset}&limit=${limit}&q=${btoa(
    JSON.stringify(q)
  )}`;

  return await fetchJSON<OrdUtxo[]>(collectionSalesUrl);
}