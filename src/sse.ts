import EventSource from "eventsource";
import { find } from "lodash";
import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { loadV1TickerDetails, loadV2TickerDetails } from "./init";
import { BalanceUpdate, ListingsV1, ListingsV2 } from "./types/bsv20";
import { fetchChainInfo } from "./utils";

const sse = new EventSource(`${API_HOST}/api/subscribe?channel=v1funds&channel=v2funds&channel=bsv20listings&channel=bsv20sales`);

const sseInit = async () => {

  sse.addEventListener("bsv20listings", async (event) => {
    const data = JSON.parse(event.data);
    const { tick } = data as ListingsV1;
    const { id } = data as ListingsV2;
    const assetType = tick ? AssetType.BSV20 : AssetType.BSV21;

    await redis.hset(`listings-${assetType}-${tick || id}`, `${data.txid}_${data.vout}`, JSON.stringify(data))
    // const t = await redis.get(`token-${assetType}-${tick || id}`);
    // let ticker = t ? JSON.parse(t) : null;
    // console.log("Adding listing", event.data);
    // if (ticker) {
    //   if (!ticker.listings) {
    //     ticker.listings = [];
    //   }
    //   ticker.listings.unshift(data);
    //   console.log("Added listing. New length:", ticker.listings.length);
    //   await redis.set(`token-${assetType}-${tick?.toLowerCase() || id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    // } else {
    //   ticker = { listings: [data] };
    //   await redis.set(`token-${assetType}-${tick?.toLowerCase() || id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    // }
    // const info = await fetchChainInfo()

    // await loadV1TickerDetails([ticker], info);
  })

  sse.addEventListener("bsv20sales", async (event) => {
    console.log("Sale or cencel", event.data);
    const { id, tick, outpoint, txid, sale } = event.data;
    // txid is the txid from which is was spend
    const assetType = tick ? AssetType.BSV20 : AssetType.BSV21;

    const listing = await redis.hget(`listings-${assetType}-${tick || id}`, `${txid}_${outpoint}`);
    if (listing) {
      const l = JSON.parse(listing);
      if (sale) {
        await redis.zadd(`sales-${assetType}-${tick || id}`, l.spendHeight || Number.MAX_SAFE_INTEGER, JSON.stringify(l))
      }
      await redis.hdel(`listings-${assetType}-${tick || id}`, `${txid}_${outpoint}`);
    }
    // const s = await redis.get(`token-${assetType}-${tick?.toLowerCase() || id}`);
    // const ticker = s ? JSON.parse(s) : null;
    // if (ticker) {
    //   // get the listing
    //   let listing = find(ticker.listings, (l: any) => l.outpoint === outpoint);

    //   if (sale) {
    //     if (!ticker.sales) {
    //       ticker.sales = [];
    //     }
    //     ticker.sales.unshift(listing);
    //   }

    //   // remove the listing
    //   ticker.listings = ticker.listings.filter((l: any) => l.outpoint !== outpoint);

    //   await redis.set(`token-${assetType}-${tick?.toLowerCase() || id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    // }

  })

  sse.addEventListener("v1funds", async (event) => {
    const assetType = AssetType.BSV20;
    console.log("V1 Funds", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { tick, fundTotal, fundUsed, pendingOps, included } = data;

    const t = await redis.get(`token-${assetType}-${tick?.toLowerCase()}`);
    const ticker = t ? JSON.parse(t) : null;
    const wasIncluded = !!ticker ? ticker.included === true : false;
    const redisTickers = await redis.get(`tickers-${assetType}`);
    let tickers = redisTickers ? JSON.parse(redisTickers) : [];
    if (ticker) {
      ticker.included = included;
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();
      // await redis.set(`token-${AssetType.BSV20}-${tick?.toLowerCase()}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
      // if (included === true && !wasIncluded) {
      //   // when ticker is included we need to also update the ticker list
      //   const tickers = await redis.get(`tickers-${assetType}`);
      //   let list = tickers ? JSON.parse(tickers) : [];
      //   list = list.map((t: any) => {
      //     if (t.tick === tick) {
      //       t.included = true;
      //     }
      //     return t;
      //   }
      //   );
      //   await redis.set(`tickers-${assetType}`, JSON.stringify(list), "EX", defaults.expirationTime);
      //   console.log("Ticker set to included", tick)
      // }
      tickers = tickers.map((t: any) => {
        // merge
        if (t.tick === tick) {
          Object.assign(t, ticker);
        }
        return t;
      })
    }
    const info = await fetchChainInfo()

    await loadV1TickerDetails(tickers, info);

  })
  sse.addEventListener("v2funds", async (event) => {
    const assetType = AssetType.BSV21;
    console.log("V2 Funds", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { id, fundTotal, fundUsed, pendingOps, included } = data;

    const t = await redis.get(`token-${assetType}-${id}`);
    const ticker = t ? JSON.parse(t) : null;
    const wasIncluded = !!ticker ? ticker.included === true : false;
    const redisTickers = await redis.get(`tickers-${assetType}`);
    let tickers = redisTickers ? JSON.parse(redisTickers) : [];
    if (ticker) {
      ticker.included = included;
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();

      tickers.push(ticker);
      // await redis.set(`token-${AssetType.BSV21}-${id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);

      // if (included === true && !wasIncluded) {
      //   // when ticker is included we need to also update the ticker list
      //   const tickers = await redis.get(`tickers-${assetType}`);
      //   let list = tickers ? JSON.parse(tickers) : [];
      //   list = list.map((t: any) => {
      //     if (t.id === id) {
      //       t.included = true;
      //     }
      //     return t;
      //   });
      //   await redis.set(`tickers-${assetType}`, JSON.stringify(list), "EX", defaults.expirationTime);
      //   console.log("Ticker set to included", id)
      // }
    }
    await loadV2TickerDetails(tickers);

  })

  return sse;
}
sse.onopen = (event) => {
  console.log("SSE Open", event);
}
sse.onerror = (event) => {
  console.error("SSE Error", event);
};

export { sseInit };
