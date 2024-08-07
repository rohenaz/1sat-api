export const ORDFS = "https://ordfs.network";
export const API_HOST = "https://ordinals.gorillapool.io/api";
export const NUMBER_OF_ITEMS_PER_PAGE = 50;

export enum AssetType {
  Ordinals = "ordinals",
  BSV20 = "bsv20",
  BSV21 = "bsv21",
}

export enum Bsv20Status {
  Invalid = -1,
  Pending = 0,
  Valid = 1,
}

export const defaults = {
  expirationTime: 60 * 15, // 15 minutes
  resultsPerPage: 20
}

export const bsv21Blacklist = [
  // MELA - Requested in Discord by issuer KURO to delist
  "d9776ed54276526a88c3388b09c46c1dc6cffe8f14e7d407ef9f20db73621ec5_0"
]

import { P2PKHAddress, PrivateKey, PublicKey } from "bsv-wasm";
export const TOKEN = Bun.env.TOKEN;
export const REDIS_URL = Bun.env.REDIS_URL;
export const ONESAT_API_HOST = "https://api.1sat.market";
// 1NVoMjzjAgskT5dqWtTXVjQXUns7RqYp2m
export const ordiAddress = P2PKHAddress.from_pubkey(
  PublicKey.from_private_key(PrivateKey.from_wif(Bun.env.ORDPK)),
).to_string();
export const payAddress = P2PKHAddress.from_pubkey(
  PublicKey.from_private_key(PrivateKey.from_wif(Bun.env.PAYPK)),
).to_string();

export const ordPkWif = Bun.env.ORDPK;
export const payPkWif = Bun.env.PAYPK;

export const ordPk = PrivateKey.from_wif(ordPkWif!);
export const payPk = PrivateKey.from_wif(payPkWif!);
export const TICK = "GM";
export const ONESAT_TOKEN_ID = ""
export const GM_CHANNEL_ID = "1094249765530779689";
export const REGISTRATION_CHANNEL_ID = "1208510837103403069";
export const PUPPET_CHANNEL_ID = "1217469740746932265";
export const ORDI_USER_ID = "1208390024660520981";
export const NUM_COINS_DROP = 500;
export const ONESAT_SERVER_ID = "1084960051330031727";
// midnight = 0
export const START_OF_DAY_HOUR = 0;

const mainChannel = "1084960051946606664";
const devChannel = "1085293347813462066";

export const EST = -5
export const minMembershipDuration = 14;
export const IDX_FEE_PER_OUT = 1000;
