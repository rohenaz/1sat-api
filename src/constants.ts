export const ORDFS = `https://ordfs.network`;
export const API_HOST = `https://ordinals.gorillapool.io`;
export enum AssetType {
  Ordinals = "ordinals",
  BSV20 = "bsv20",
  BSV20V2 = "bsv20v2",
  LRC20 = "lrc20",
}
export enum Bsv20Status {
  Invalid = -1,
  Pending = 0,
  Valid = 1,
}

export const defaults = {
  expirationTime: 60 * 60 * 24 * 30, // 30 days
  resultsPerPage: 20
}

