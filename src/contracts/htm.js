"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashToMintBsv20 = void 0;
const scrypt_ord_1 = require("scrypt-ord");
const scrypt_ts_1 = require("scrypt-ts");
class HashToMintBsv20 extends scrypt_ord_1.BSV20V2 {
    constructor(sym, max, dec, currentReward, difficulty) {
        super((0, scrypt_ts_1.toByteString)(''), sym, max, dec);
        this.init(...arguments);
        this.supply = max;
        this.currentReward = currentReward;
        this.totalSupply = max;
        this.startingDifficulty = difficulty;
        this.maxDifficulty = 15n;
        (0, scrypt_ts_1.assert)(max % 5n === 0n, 'Supply must be divisible by 5');
        (0, scrypt_ts_1.assert)(difficulty < 15, 'Max difficulty is 15');
    }
    redeem(rewardPkh, nonce) {
        const hash = (0, scrypt_ts_1.sha256)((0, scrypt_ts_1.sha256)(this.ctx.utxo.outpoint.txid + nonce));
        const calculatedDifficulty = this.calculateDifficulty();
        const MAX_DIFFICULTY = 15;
        for (let i = 0; i < MAX_DIFFICULTY; i++) {
            const mask = BigInt(i % 2 === 0 ? 0xf0 : 0x0f);
            if (i < calculatedDifficulty) {
                const sliceStart = BigInt(i) / BigInt(2);
                const sliceEnd = sliceStart + BigInt(1);
                const byte = (0, scrypt_ts_1.slice)(hash, sliceStart, sliceEnd);
                const slicedHash = (0, scrypt_ts_1.and)((0, scrypt_ts_1.byteString2Int)(byte), mask);
                (0, scrypt_ts_1.assert)(slicedHash === BigInt(0), `Difficulty not met at position ${i}`);
            }
        }
        (0, scrypt_ts_1.assert)(this.ctx.sequence < 0xffffffff, `must use sequence < 0xffffffff`);
        const supply = this.supply - this.currentReward;
        this.supply = supply;
        let stateOutput = (0, scrypt_ts_1.toByteString)('');
        if (supply > 0n) {
            stateOutput = this.buildStateOutputFT(supply);
        }
        const rewardOutput = HashToMintBsv20.buildTransferOutput(rewardPkh, this.id, this.currentReward);
        const outputs = stateOutput + rewardOutput + this.buildChangeOutput();
        (0, scrypt_ts_1.assert)((0, scrypt_ts_1.hash256)(outputs) === this.ctx.hashOutputs, 'invalid outputs hash');
    }
    calculateDifficulty() {
        let difficulty = this.startingDifficulty;
        const supplyRatio = (this.supply * 100n) / this.totalSupply;
        if (supplyRatio < 20n) {
            difficulty = this.startingDifficulty + 4n;
        }
        else if (supplyRatio < 40n) {
            difficulty = this.startingDifficulty + 3n;
        }
        else if (supplyRatio < 60n) {
            difficulty = this.startingDifficulty + 2n;
        }
        else if (supplyRatio < 80n) {
            difficulty = this.startingDifficulty + 1n;
        }
        return difficulty;
    }
    static async buildTxForRedeem(current, options, rewardPkh) {
        const defaultAddress = await current.signer.getDefaultAddress();
        const next = current.next();
        const reward = current.currentReward;
        next.supply = current.supply - reward;
        if (current.isGenesis()) {
            next.id =
                scrypt_ord_1.Ordinal.txId2str(Buffer.from(current.utxo.txId, 'hex')
                    .reverse()
                    .toString('hex')) +
                    (0, scrypt_ts_1.toByteString)('_', true) +
                    scrypt_ord_1.Ordinal.int2Str(BigInt(current.utxo.outputIndex));
        }
        const tx = new scrypt_ts_1.bsv.Transaction().addInput(current.buildContractInput());
        tx.inputs[0].sequenceNumber = options.sequence;
        if (next.supply > 0n) {
            const stateScript = scrypt_ord_1.BSV20V2.createTransferInsciption(next.id, next.supply) +
                scrypt_ord_1.Ordinal.removeInsciption(next.getStateScript());
            const stateOutput = scrypt_ts_1.Utils.buildOutput(stateScript, 1n);
            tx.addOutput(scrypt_ts_1.bsv.Transaction.Output.fromBufferReader(new scrypt_ts_1.bsv.encoding.BufferReader(Buffer.from(stateOutput, 'hex'))));
        }
        const rewardOutput = HashToMintBsv20.buildTransferOutput(rewardPkh, next.id, reward);
        tx.addOutput(scrypt_ts_1.bsv.Transaction.Output.fromBufferReader(new scrypt_ts_1.bsv.encoding.BufferReader(Buffer.from(rewardOutput, 'hex'))));
        tx.change(options.changeAddress || defaultAddress);
        return { tx, atInputIndex: 0, nexts: [] };
    }
}
exports.HashToMintBsv20 = HashToMintBsv20;
__decorate([
    (0, scrypt_ts_1.prop)()
], HashToMintBsv20.prototype, "totalSupply", void 0);
__decorate([
    (0, scrypt_ts_1.prop)(true)
], HashToMintBsv20.prototype, "supply", void 0);
__decorate([
    (0, scrypt_ts_1.prop)()
], HashToMintBsv20.prototype, "currentReward", void 0);
__decorate([
    (0, scrypt_ts_1.prop)()
], HashToMintBsv20.prototype, "startingDifficulty", void 0);
__decorate([
    (0, scrypt_ts_1.prop)()
], HashToMintBsv20.prototype, "maxDifficulty", void 0);
__decorate([
    (0, scrypt_ts_1.method)(scrypt_ts_1.SigHash.ANYONECANPAY_ALL)
], HashToMintBsv20.prototype, "redeem", null);
__decorate([
    (0, scrypt_ts_1.method)()
], HashToMintBsv20.prototype, "calculateDifficulty", null);
//# sourceMappingURL=htm.js.map