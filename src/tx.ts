import { TokenType, transferOrdTokens, type Utxo } from "js-1sat-ord";
import { botRedis } from ".";
import {
  API_HOST,
  ordPk,
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
  if (!ordPk || !payPk) {
    throw new Error("ORDPK and PAYPK environment variables must be set for airdrops");
  }

  // Convert BSV20 tokens to TokenUtxo format expected by js-1sat-ord
  const tokenUtxos = inputTokens.map(token => {
    if (!token.script) {
      throw new Error(`Token UTXO ${token.txid}:${token.vout} is missing script`);
    }
    return {
      satoshis: 1 as const,
      txid: token.txid,
      vout: token.vout,
      script: token.script,
      amt: token.amt,
      id: ticker.id,
    };
  });

  // Use js-1sat-ord's transferOrdTokens function
  const result = await transferOrdTokens({
    protocol: TokenType.BSV20,
    tokenID: ticker.id,
    decimals: 0, // BSV-20 tokens have 0 decimals
    utxos: paymentUtxos,
    inputTokens: tokenUtxos,
    distributions: [{
      address: toAddress,
      tokens: sendAmount, // tokens as a number
    }],
    paymentPk: payPk,
    ordPk: ordPk,
  });

  // Track which UTXOs were spent
  const spend: string[] = [];

  // Add spent token UTXOs
  for (const token of inputTokens) {
    spend.push(`${token.txid}_${token.vout}`);
  }

  // The result contains the signed transaction
  const tx = result.tx;
  const txid = tx.id('hex') as string;
  const rawTx = tx.toHex();

  // Update Redis with spent and new UTXOs
  const pipeline = botRedis.pipeline();

  // Remove spent UTXOs
  for (const s of spend) {
    pipeline.hdel("ord-utxos", s);
  }

  // If there's token change, save it
  if (result.tokenChange && result.tokenChange.length > 0) {
    for (const change of result.tokenChange) {
      const newTokenUtxo = {
        txid,
        vout: change.vout,
        script: change.script,
        amt: change.amt,
      } as Partial<BSV20>;

      pipeline.hset(
        "ord-utxos",
        `${newTokenUtxo.txid}_${newTokenUtxo.vout}`,
        JSON.stringify(newTokenUtxo)
      );
    }
  }

  // Track spent payment UTXOs (js-1sat-ord handles this internally,
  // but we need to update our Redis cache)
  // Note: We'll need to determine which payment UTXOs were used
  // For now, assume the first payment UTXO was used
  if (paymentUtxos.length > 0) {
    const usedPaymentUtxo = paymentUtxos[0];
    spend.push(`${usedPaymentUtxo.txid}_${usedPaymentUtxo.vout}`);
    pipeline.hdel("pay-utxos", `${usedPaymentUtxo.txid}_${usedPaymentUtxo.vout}`);
  }

  // If there's payment change, save it
  if (result.spentOutpoints && result.spentOutpoints.length > 0) {
    // Find the change output (last output is typically change)
    const changeOutput = tx.outputs[tx.outputs.length - 1];
    if (changeOutput?.satoshis && changeOutput.satoshis > 546) {
      const changeVout = tx.outputs.length - 1;
      const newPaymentUtxo = {
        txid,
        vout: changeVout,
        satoshis: changeOutput.satoshis,
        outpoint: `${txid}_${changeVout}`,
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
        `${txid}_${changeVout}`,
        JSON.stringify(newPaymentUtxo)
      );
    }
  }

  await pipeline.exec();

  return {
    rawTx,
    txid,
    spend,
  };
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
