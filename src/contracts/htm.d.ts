import { BSV20V2 } from 'scrypt-ord';
import { ByteString, ContractTransaction, MethodCallOptions, PubKeyHash } from 'scrypt-ts';
export declare class HashToMintBsv20 extends BSV20V2 {
    readonly totalSupply: bigint;
    supply: bigint;
    readonly currentReward: bigint;
    readonly startingDifficulty: bigint;
    readonly maxDifficulty: bigint;
    constructor(sym: ByteString, max: bigint, dec: bigint, currentReward: bigint, difficulty: bigint);
    redeem(rewardPkh: PubKeyHash, nonce: ByteString): void;
    calculateDifficulty(): bigint;
    static buildTxForRedeem(current: HashToMintBsv20, options: MethodCallOptions<HashToMintBsv20>, rewardPkh: PubKeyHash): Promise<ContractTransaction>;
}
