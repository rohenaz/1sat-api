import { Utxo } from "js-1sat-ord";
import { Bsv20Status } from "../constants";
import { BSV20 } from "./bsv20";
import { BaseTxo, GPFile } from "./common";

export interface Inscription {
  json?: any;
  text?: string;
  words?: string[];
  file: GPFile;
}

export type SIGMA = {
  vin: number;
  valid: boolean;
  address: string;
  algorithm: string;
  signature: string;
};

export interface LRC20 extends BaseTxo {
  op: string;
  id: string;
  amt: number;
  p: "lrc-20";
}

export interface BSV20TXO extends BaseTxo {
  amt: string;
  tick: string;
  price: string;
  pricePer: string;
  spend: string;
  owner: string;
  op: string;
  payout: string | null;
  outpoint: string;
  reason: string | null;
  listing: boolean;
  id: string;
  status: Bsv20Status;
  sym: string;
  icon: string;
}

export interface TxoData {
  types?: string[];
  insc?: Inscription;
  map?: { [key: string]: any };
  b?: File;
  sigma?: SIGMA[];
  list?: {
    price: number;
    payout: string;
  };
  bsv20?: BSV20;
}



type Origin = {
  data?: TxoData;
  num?: string;
  outpoint: string;
  map?: { [key: string]: any };
};

export interface OrdUtxo extends Utxo {
  txid: string;
  vout: number;
  outpoint: string;
  satoshis: number;
  accSats: number;
  owner?: string;
  script: string;
  spend?: string;
  origin?: Origin;
  height: number;
  idx: number;
  data?: TxoData;
}

export type Inventory = {
  ordinals: OrdUtxo[],
  bsv20: BSV20TXO[],
  bsv20v2: BSV20TXO[]
}
