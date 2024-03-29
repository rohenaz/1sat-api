import { Bsv20Status } from "../constants";
import { BaseTxo } from "./common";

export interface BSV20 extends BaseTxo {
  max?: string;
  lim?: string;
  dec?: number;
  supply?: string;
  available?: string;
  pct_minted?: string;
  reason?: null;
  pending?: string;
  id?: string;
  p: string;
  op: string;
  tick?: string;
  amt: string;
  status?: Bsv20Status;
}


// For BSV20V1 Data
export interface BSV20V1 extends BaseTxo {
  status?: number;
  included: boolean;
  tick: string;
  max: string; // Total supply populated on deployment only
  amt: string; // Total supply
  lim?: string;
  dec: number;
  supply: string; // Current supply
  available?: string;
  pctMinted?: string;
  fundAddress: string;
  fundTotal: string; // Total value in satoshis
  fundUsed?: string;
  fundBalance: string;
}

// For BSV21 Data
export interface BSV21 extends BaseTxo {
  id: string;
  sym: string; // Symbol
  icon?: string; // eg 87f1d0785cf9b4951e75e8cf9353d63a49f98e9b6b255bcd6a986db929a00472_0
  amt: string; // Total supply
  dec: number; // Decimal places (display only)
  fundAddress: string;
  fundTotal: string; // Total value in satoshis
  fundUsed?: string;
  fundBalance: string;
  included: boolean;
}

export interface ListingsV2 extends BSV21 {
  price: string;
  pricePer: string;
  owner: string;
  sale: boolean;
  payout: string; // base64 encoded
  script: string; // base64 encoded
  spend: string;
  spendIdx: string;
  spendHeight: string;
}
export interface ListingsV1 extends BSV20V1 {
  price: string;
  pricePer: string;
  owner: string;
  sale: boolean;
  payout: string; // base64 encoded
  script: string; // base64 encoded
  spend: string;
  spendIdx: string;
  spendHeight: string;
}

export interface BSV20Details extends BSV20V1 {
  accounts: number;
  holders: Holder[];
  pending: string;
  pendingOps: number;
  listings: ListingsV1[];
  sales: ListingsV1[];
}

export interface Holder {
  address: string;
  amt: string;
}

export interface BSV21Details extends BSV21 {
  accounts: number;
  holders: Holder[];
  pendingOps: number;
  listings: ListingsV2[];
  sales: ListingsV2[];
}

// Adjust the BSV20TXO type if needed
export type BSV20TXO = BSV20V1 | BSV21;


export interface MarketDataV2 extends BSV21Details {
  price: number;
  marketCap: number;
  pctChange: number;
}

export interface MarketDataV1 extends BSV20Details {
  price: number;
  marketCap: number;
  pctChange: number;
  num: number;
}
export interface BalanceUpdate {
  tick?: string,
  id?: string,
  fundTotal: number,
  pendingOps: number,
  fundUsed: number,
  included: boolean
}

