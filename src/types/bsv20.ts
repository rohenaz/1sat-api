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
  max: string; // Total supply
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

// For BSV20V2 Data
export interface BSV20V2 extends BaseTxo {
  id: string;
  sym: string; // Symbol
  icon?: string; // eg 87f1d0785cf9b4951e75e8cf9353d63a49f98e9b6b255bcd6a986db929a00472_0
  amt: string; // Total supply
  dec: number; // Decimal places (display only)
  fundAddress: string;
  fundTotal: string; // Total value in satoshis
  fundUsed?: string;
  fundBalance: string;
}

export interface ListingsV2 extends BSV20V2 {
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

export interface BSV20V1Details extends BSV20V1 {
  accounts: string; // string number of holders
  pending: string;
  pendingOps: string;
  listings: BSV20V1[];
}
export interface BSV20V2Details extends BSV20V2 {
  accounts: string; // string number of holders
  pending: string;
  listings: ListingsV2[];
}

// Adjust the BSV20TXO type if needed
export type BSV20TXO = BSV20V1 | BSV20V2;