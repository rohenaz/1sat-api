import EventSource from "eventsource";
import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BalanceUpdate } from "./types/bsv20";

const sse = new EventSource(`${API_HOST}/api/subscribe?channel=v1funding&channel=v2funding`);

const sseInit = async () => {
  sse.addEventListener("listings", async (event) => {
    console.log("Listings", event.data);
    // const data = JSON.parse(event.data);
    // const { listing } = data;
    // const tick = listing.tick || listing.id;
    // const assetType = listing.tick ? AssetType.BSV20 : AssetType.BSV20V2;
    // const t = await redis.get(`token-${assetType}-${tick}`);
    // const ticker = t ? JSON.parse(t) : null;
    // if (ticker) {
    //   ticker.listings = ticker.listings.unshift(listing);
    //   await redis.set(`token-${AssetType.BSV20}-${tick}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    // }
  })

  sse.addEventListener("sales", async (event) => {
    console.log("Sales", event.data);
  })

  sse.addEventListener("v1funds", async (event) => {
    const assetType = AssetType.BSV20;
    console.log("V1 Funds", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { tick, fundTotal, fundUsed, pendingOps } = data;

    const t = await redis.get(`token-${assetType}-${tick}`);
    const ticker = t ? JSON.parse(t) : null;
    if (ticker) {
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();
      await redis.set(`token-${AssetType.BSV20}-${tick}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    }
  })
  sse.addEventListener("v2funds", async (event) => {
    const assetType = AssetType.BSV20V2;
    console.log("V2 Funds", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { id, fundTotal, fundUsed, pendingOps } = data;

    const t = await redis.get(`token-${assetType}-${id}`);
    const ticker = t ? JSON.parse(t) : null;
    if (ticker) {
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();
      await redis.set(`token-${AssetType.BSV20V2}-${id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    }
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
