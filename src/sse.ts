import EventSource from "eventsource";
import { find } from "lodash";
import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { loadV1TickerDetails, loadV2TickerDetails } from "./init";
import { BalanceUpdate } from "./types/bsv20";

const sse = new EventSource(`${API_HOST}/api/subscribe?channel=v1funds&channel=v2funds&channel=bsv20listings&channel=bsv20sales`);

const sseInit = async () => {

  sse.addEventListener("bsv20listings", async (event) => {
    console.log("Listings", event.data);
    const data = JSON.parse(event.data);
    const { id, tick } = data;
    const assetType = tick ? AssetType.BSV20 : AssetType.BSV20V2;
    const t = await redis.get(`token-${assetType}-${tick || id}`);
    const ticker = t ? JSON.parse(t) : null;
    if (ticker) {
      const tokenDetails = await redis.get(`token-${assetType}-${tick || id}`);
      let token = tokenDetails ? JSON.parse(tokenDetails) : null;
      if (token) {
        token.listings = token.listings.unshift(data);
        await redis.set(`token-${assetType}-${tick || id}`, JSON.stringify(token), "EX", defaults.expirationTime);
      } else {
        token = { listings: [data] };
        await redis.set(`token-${assetType}-${tick || id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
      }
    }
  })

  sse.addEventListener("bsv20sales", async (event) => {
    console.log("Sale or cencel", event.data);
    const { id, tick, outpoint, txid, sale } = event.data;
    // txid is the txid from which is was spend
    const assetType = tick ? AssetType.BSV20 : AssetType.BSV20V2;
    const s = await redis.get(`token-${assetType}-${tick || id}`);
    const ticker = s ? JSON.parse(s) : null;
    if (ticker) {
      const tokenDetails = await redis.get(`token-${assetType}-${tick || id}`);
      let token = tokenDetails ? JSON.parse(tokenDetails) : null;
      if (token) {
        // get the listing
        let listing = find(token.listings, (l: any) => l.outpoint === outpoint);

        if (sale) {
          token.sales = token.sales.unshift(listing);
        }

        // remove the listing
        token.listings = token.listings.filter((l: any) => l.outpoint !== outpoint);

        await redis.set(`token-${assetType}-${tick || id}`, JSON.stringify(token), "EX", defaults.expirationTime);
      }
    }
  })

  sse.addEventListener("v1funds", async (event) => {
    const assetType = AssetType.BSV20;
    console.log("V1 Funds", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { tick, fundTotal, fundUsed, pendingOps, included } = data;

    const t = await redis.get(`token-${assetType}-${tick}`);
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
      // await redis.set(`token-${AssetType.BSV20}-${tick}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
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
      const tickers = redisTickers ? JSON.parse(redisTickers) : [];
      tickers.push(ticker);
    }
    await loadV1TickerDetails(tickers);

  })
  sse.addEventListener("v2funds", async (event) => {
    const assetType = AssetType.BSV20V2;
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
      // await redis.set(`token-${AssetType.BSV20V2}-${id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);

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
    await loadV2TickerDetails([ticker]);

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
