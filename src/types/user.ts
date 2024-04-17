export interface User {
  address: string;
  discordId: string;
  airdrops: Airdrop[];
  wins: Airdrop[];
  giftsGiven: Airdrop[];
  unregistered?: boolean;
}

export interface Airdrop {
  amount: number;
  txid: string;
  timestamp: number;
}
