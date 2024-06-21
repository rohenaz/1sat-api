export const ORDFS = "https://ordfs.network";
export const API_HOST = "https://ordinals.gorillapool.io";
export const NUMBER_OF_ITEMS_PER_PAGE = 50;

export enum AssetType {
  Ordinals = "ordinals",
  BSV20 = "bsv20",
  BSV21 = "bsv21",
  LRC20 = "lrc20",
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



export const bsv21Blacklist = ["d9776ed54276526a88c3388b09c46c1dc6cffe8f14e7d407ef9f20db73621ec5_0"]