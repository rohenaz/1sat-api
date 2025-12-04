import type { OrdUtxo } from "./ordinals";

export interface CollectionStats {
  count: number;
  max: number;
}

export type KnownSubType = "collection";

export type Trait = {
  name: string;
  value: string;
};

export type CollectionItemData = {
  collectionId: string;
  name?: string;
  description?: string;
  image?: string;
  mintNumber?: number;
  rank?: number;
  rarityLabel?: string;
  traits?: Trait[];
  [key: string]: string | number | Trait[] | undefined;
};

export interface Collection extends OrdUtxo {
  map: {
    app: string;
    name: string;
    type: string;
    subType: KnownSubType;
    royalties?: string;
    previewUrl?: string;
    subTypeData: string; // JSON stringified CollectionItemData
  };
}

export type CollectionSortBy =
  | "recent"
  | "price_asc"
  | "price_desc"
  | "rarity"
  | "mint_number";

export type TraitFilter = {
  name: string;
  value: string;
};

export type CollectionFilterOptions = {
  collectionId: string;
  traits?: TraitFilter[];
  minPrice?: number;
  maxPrice?: number;
  listed?: boolean;
  sort?: CollectionSortBy;
};

// Query structure for the upstream API
export type CollectionQuery = {
  map: {
    subTypeData: {
      collectionId: string;
      [key: string]: string | undefined;
    };
  };
};
