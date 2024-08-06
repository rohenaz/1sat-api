import {
  P2PKHAddress,
  Script,
  SigHash,
  Transaction,
  TxIn,
  TxOut,
  type PrivateKey,
} from "bsv-wasm";
import { buildInscription, type Utxo } from "js-1sat-ord";
import { botRedis } from ".";
import {
  API_HOST,
  IDX_FEE_PER_OUT,
  ordPk,
  ordiAddress,
  payAddress,
  payPk,
} from "./constants";
import type { BSV20 } from "./types/bsv20";

export type Ticker = {
  id: string;
  fundAddress: string;
};

// 1SAT POW20
const TICK = {
  id: "a54d3af24a03bcc28f6b3f2dd0ad249ee042b2f4b95810ae5184ab617a74b8b9_0",
  fundAddress: "1PMLoq6Jq9ymQ2UkntV1HR4M3pjQHEEXFm",
} as Ticker;

export const createAirdropTx = async (
  toAddress: string,
  sendAmount: number,
  paymentUtxos: Utxo[],
  inputTokens: BSV20[],
  ticker = TICK
) => {
  const address = P2PKHAddress.from_string(toAddress);
  const tx = new Transaction(1, 0);

  const spend: string[] = []; // list of txids spent as inputs
  // add token inputs
  let amounts = 0;
  let i = 0;
  for (const utxo of inputTokens) {
    if (!utxo.script) {
      console.log("no script for utxo", utxo.txid, utxo.vout);
      continue;
    }

    const txBuf = Buffer.from(utxo.txid, "hex");
    const utxoIn = new TxIn(txBuf, utxo.vout, Script.from_asm_string(""));
    amounts += Number.parseInt(utxo.amt);
    tx.add_input(utxoIn);

    // sign ordinal
    const sig = tx.sign(
      ordPk,
      SigHash.NONE | SigHash.ANYONECANPAY | SigHash.FORKID,
      i,
      Script.from_bytes(Buffer.from(utxo.script, "base64")),
      BigInt(1)
    );

    utxoIn.set_unlocking_script(
      Script.from_asm_string(
        `${sig.to_hex()} ${ordPk.to_public_key().to_hex()}`
      )
    );

    tx.set_input(i, utxoIn);
    spend.push(`${utxo.txid}_${utxo.vout}`);
    i++;
    if (sendAmount <= amounts) {
      break;
    }
  }

  if (amounts < sendAmount) {
    throw new Error(
      `Not enough tokens to send airdrop.
Amounts: ${amounts}
Send Amount: ${sendAmount}
Input Tokens Len: ${inputTokens.length}`
    );
  }

  let changeInsc: Script | undefined;
  let changeInscription: any | undefined;
  if (amounts > sendAmount) {
    // build change inscription
    changeInscription = {
      p: "bsv-20",
      op: "transfer",
      amt: (amounts - sendAmount).toString(),
      id: ticker.id,
    };

    const changeFileB64 = Buffer.from(
      JSON.stringify(changeInscription)
    ).toString("base64");
    changeInsc = buildInscription(
      P2PKHAddress.from_string(ordiAddress),
      changeFileB64,
      "application/bsv-20"
    );
    const changeInscOut = new TxOut(BigInt(1), changeInsc);
    tx.add_output(changeInscOut);
  }
  let totalSatsIn = 0;
  // payment Inputs
  for (const utxo of paymentUtxos.sort((a, b) => {
    return a.satoshis > b.satoshis ? -1 : 1;
  })) {
    let utxoIn = new TxIn(
      Buffer.from(utxo.txid, "hex"),
      utxo.vout,
      Script.from_asm_string("")
    );

    tx.add_input(utxoIn);

    utxoIn = signPayment(
      tx,
      payPk,
      i,
      {
        txid: utxo.txid,
        vout: utxo.vout,
        script: P2PKHAddress.from_string(payAddress)
          .get_locking_script()
          .to_asm_string(),
        satoshis: utxo.satoshis,
      },
      utxoIn
    );
    tx.set_input(i, utxoIn);
    spend.push(`${utxo.txid}_${utxo.vout}`);
    totalSatsIn += utxo.satoshis;
    i++;
    break;
  }

  const inscription = {
    p: "bsv-20",
    op: "transfer",
    amt: sendAmount.toString(),
    id: ticker.id,
  };

  const fileB64 = Buffer.from(JSON.stringify(inscription)).toString("base64");
  const insc = buildInscription(address, fileB64, "application/bsv-20");

  const satOut = new TxOut(BigInt(1), insc);
  tx.add_output(satOut);

  const indexerAddress = ticker.fundAddress;
  // output idx 2 indexer fee
  if (indexerAddress) {
    const indexerFeeOutput = new TxOut(
      BigInt(IDX_FEE_PER_OUT * 2),
      P2PKHAddress.from_string(indexerAddress).get_locking_script()
    );
    tx.add_output(indexerFeeOutput);
  }

  // output idx 3 change
  const changeOut = createChangeOutput(tx, payAddress, totalSatsIn);
  tx.add_output(changeOut);
  const pipeline = botRedis.pipeline();

  //save the newly created utxo in redis
  if (changeInsc) {
    const newTokenUtxo = {
      txid: tx.get_id_hex(),
      vout: 0,
      script: Buffer.from(changeInsc.to_bytes()).toString("base64"),
      amt: changeInscription.amt,
    } as Partial<BSV20>;

    for (const s of spend) {
      // remove spent utxos from redis
      pipeline.hdel("ord-utxos", s);
    }

    // save utxos in redis
    pipeline.hset(
      "ord-utxos",
      `${newTokenUtxo.txid}_${newTokenUtxo.vout}`,
      JSON.stringify(newTokenUtxo)
    );
  }

  // delete the spends
  for (const s of spend) {
    // remove spent utxos from redis
    pipeline.hdel("pay-utxos", s);
  }

  // update payment utxos
  const newPaymentUtxo = {
    txid: tx.get_id_hex(),
    vout: 3,
    satoshis: Number(changeOut.get_satoshis()),
    outpoint: `${tx.get_id_hex()}_3`,
    accSats: "",
    height: 0,
    idx: "",
    owner: "",
    spend: "",
    origin: null,
    data: null,
  };

  pipeline.hset(
    "pay-utxos",
    `${tx.get_id_hex()}_3`,
    JSON.stringify(newPaymentUtxo)
  );
  await pipeline.exec();

  return {
    rawTx: tx.to_hex(),
    txid: tx.get_id_hex(),
    spend,
  };
};

export const signPayment = (
  tx: Transaction,
  paymentPK: PrivateKey,
  inputIdx: number,
  paymentUtxo: Utxo,
  utxoIn: TxIn
) => {
  const sig2 = tx.sign(
    paymentPK,
    SigHash.NONE | SigHash.ANYONECANPAY | SigHash.FORKID,
    inputIdx,
    Script.from_asm_string(paymentUtxo.script),
    BigInt(paymentUtxo.satoshis)
  );
  utxoIn.set_unlocking_script(
    Script.from_asm_string(
      `${sig2.to_hex()} ${paymentPK.to_public_key().to_hex()}`
    )
  );
  return utxoIn;
};

export const createChangeOutput = (
  tx: Transaction,
  changeAddress: string,
  paymentSatoshis: number
) => {
  // get total satoshis out
  const outs = tx.get_noutputs();
  let totalSatoshisOut = 0n;
  for (let i = 0; i < outs; i++) {
    const out = tx.get_output(i);
    totalSatoshisOut += out?.get_satoshis() || BigInt(0);
  }
  const changeaddr = P2PKHAddress.from_string(changeAddress);
  const changeScript = changeaddr.get_locking_script();
  const emptyOut = new TxOut(BigInt(1), changeScript);
  const fee = Math.ceil(
    SAT_FEE_PER_BYTE * (tx.get_size() + emptyOut.to_bytes().byteLength)
  );
  const change = BigInt(paymentSatoshis) - totalSatoshisOut - BigInt(fee);
  const changeOut = new TxOut(change, changeScript);
  return changeOut;
};

export const SAT_FEE_PER_BYTE = 0.065;

export const broadcast = async ({
  rawTx,
  txid,
}: {
  rawTx: string;
  txid: string;
}) => {
  if (!rawTx || !txid) {
    console.error("Invalid tx data:", { rawTx, txid });
    return;
  }
  const rawtx = Buffer.from(rawTx, "hex").toString("base64");
  const url = `${API_HOST}/tx`;
  try {
    console.log("Broadcasting tx:", rawtx.length, url);
    const promise = fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rawtx,
      }),
    });
    const broadacstResponse = await promise;
    if (broadacstResponse.status !== 200) {
      throw Error(
        `Error broadcasting tx:${broadacstResponse.statusText}, status: ${broadacstResponse.status}`
      );
    }
    console.log("Broadcasted tx:", txid);
  } catch (error) {
    throw Error(`Error broadcasting tx:${error}`);
  }
};
