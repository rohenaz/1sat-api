import { cors } from '@elysiajs/cors';
import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { uniqBy } from 'lodash';
import { API_HOST, AssetType, defaults } from './constants';
import { findMatchingKeys } from './db';
import { fetchV1Tickers, fetchV2Tickers, loadAllV1Names, loadV1TickerDetails } from './init';
import { sseInit } from './sse';
import { BSV20Details, BSV20V1, BSV21, BSV21Details, ListingsV2, MarketDataV1, MarketDataV2 } from './types/bsv20';
import { calculateMarketCap, fetchChainInfo, fetchExchangeRate, fetchJSON, fetchStats, fetchTokensDetails, getPctChange, setPctChange } from './utils';

export const redis = new Redis(`${process.env.REDIS_URL}`);

// TODO: make process to get all the tickers and then an endpoint for autocomplete ticker names
redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

await fetchV1Tickers();
await fetchV2Tickers();
await loadAllV1Names();
await sseInit();

const app = new Elysia().use(cors()).get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return `:)`;
}).get('/ticker/autofill/:assetType/:id', async ({ params }) => {
  // autofill endpoint for ticker id
  const type = params.assetType
  const id = params.id.toUpperCase()

  const results = await findMatchingKeys(redis, id)
  console.log({ results })
  return results
}).get('/market/:assetType', async ({ set, params }) => {
  console.log(params.assetType)
  try {
    // let market = await redis.get(`market-${params.assetType}`);
    // console.log("In cache?", market)
    // if (!market) {
    const marketData = await fetchShallowMarketData(params.assetType as AssetType);
    // if (marketData) {
    //   await redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", defaults.expirationTime);
    // }
    console.log("marketData", marketData?.length)
    return marketData;
    //}
    //return JSON.parse(market);
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
  },
  params: t.Object({
    assetType: t.String()
  })
}).get("/market/:assetType/:id", async ({ set, params }) => {
  console.log("WITH ID", params.assetType, params.id)
  try {
    const marketData = await fetchMarketData(params.assetType as AssetType, params.id);
    return marketData;
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
    params.id = params.id.toLowerCase();
  },
  params: t.Object({
    assetType: t.String(),
    id: t.String()
  })
}).get("/status", async ({ set }) => {
  set.headers["Content-Type"] = "application/json";
  const chainInfo = await fetchChainInfo();
  const exchangeRate = await fetchExchangeRate();
  const indexers = await fetchStats()
  return {
    chainInfo,
    exchangeRate,
    indexers
  };
}).listen(process.env.PORT ?? 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// {"chain":"main","blocks":828211,"headers":661647,"bestblockhash":"000000000000000004aa4c183384a0bf13a49e6726fcc7bb7fb8c9bc9594b2f2","difficulty":119016070306.9696,"mediantime":1705928988,"verificationprogress":0.9999961584631301,"pruned":false,"chainwork":"00000000000000000000000000000000000000000150caf5c43a1446f852c8fe"}
export type ChainInfo = {
  chain: string,
  blocks: number,
  headers: number,
  bestblockhash: string,
  difficulty: number,
  mediantime: number,
  verificationprogress: number,
  pruned: boolean,
  chainwork: string,
}



// if (type === AssetType.BSV21) {
//   const urlTokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1`;
//   const { promise: promiseBsv20 } = http.customFetch<BSV20TXO[]>(urlTokens);
//   marketData.listings = await promiseBsv20;
// } else {
//   const urlV2Tokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2`;
//   const { promise: promiseBsv20v2 } =
//     http.customFetch<BSV20TXO[]>(urlV2Tokens);
//   listings = await promiseBsv20v2;
// }





// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType, id?: string) => {
  id = id?.toLowerCase();
  const info = await fetchChainInfo()
  switch (assetType) {
    case AssetType.BSV20:
      let detailedTokensV1: BSV20Details[] = [];
      let results: MarketDataV1[] = [];
      if (id) {
        detailedTokensV1 = await fetchTokensDetails<BSV20Details>([id], assetType);
        results = await loadV1TickerDetails(detailedTokensV1, info);
      } else {
        // check cache
        const cached = await redis.get(`ids-${assetType}`);
        let tickers: string[] = [];
        if (cached) {
          tickers = JSON.parse(cached);
        } else {
          // TODO: I'm fetching these tokens here just to get the list of ids to then fetch details. Very inefficient
          const urlV1Tokens = `${API_HOST}/api/bsv20?limit=20&offset=0&sort=height&dir=desc&included=true`;
          const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
          tickers = uniqBy(tickersV1, 'tick').map(ticker => ticker.tick);
          // cache
          await redis.set(`ids-${assetType}`, JSON.stringify(tickers), "EX", defaults.expirationTime);



        }

        results = await loadV1TickerDetails(detailedTokensV1, info);

      }
      // update 'tickers' cache to include this token if it isnt in there


      // let tokensV1: MarketDataV1[] = [];
      // for (const ticker of detailedTokensV1) {
      //   const totalSales = ticker.sales.reduce((acc, sale) => {
      //     return acc + parseInt(sale.price)
      //   }, 0);
      //   const totalAmount = ticker.sales.reduce((acc, sale) => {
      //     return acc + parseInt(sale.amt) / 10 ** ticker.dec
      //   }, 0);
      //   const price = totalAmount > 0 ? totalSales / totalAmount : 0;
      //   const marketCap = calculateMarketCap(price, parseInt(ticker.max) / 10 ** ticker.dec);

      //   const pctChange = await setPctChange(ticker.tick, ticker.sales, 0);

      //   tokensV1.push({
      //     ...ticker,
      //     price,
      //     marketCap,
      //     pctChange,
      //   });
      // }



      return results.sort((a, b) => {
        return b.marketCap - a.marketCap;
      });
    case AssetType.BSV21:
      let detailedTokensV2: BSV21Details[] = [];
      if (id) {
        // id is origin for v2
        detailedTokensV2 = await fetchTokensDetails<BSV21Details>([id], assetType);
      } else {
        let tokenIds: string[] = [];
        // check cache
        const cachedIds = await redis.get(`ids-${assetType}`);
        if (cachedIds) {
          tokenIds = JSON.parse(cachedIds);
        } else {
          const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
          const tickersV2 = await fetchJSON<BSV21[]>(urlV2Tokens);
          tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id.toLowerCase());
          await redis.set(`ids-${assetType}`, JSON.stringify(tokenIds), "EX", defaults.expirationTime);
        }

        detailedTokensV2 = await fetchTokensDetails<BSV21Details>(tokenIds, assetType);
      }

      let tokens: MarketDataV2[] = [];
      for (const ticker of detailedTokensV2) {
        // average price per unit bassed on last 10 sales

        // add up total price and divide by the amount to get an average price
        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt) / 10 ** ticker.dec
        }, 0);
        const price = totalAmount > 0 ? totalSales / totalAmount : 0;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.amt) / 10 ** ticker.dec);
        console.log({ totalSales, totalAmount, price, marketCap, symbol: ticker.sym, dec: ticker.dec, amt: ticker.amt })

        const pctChange = await setPctChange(ticker.id, ticker.sales, info.blocks);

        tokens.push({
          ...ticker,
          price,
          marketCap,
          pctChange,
        });
      }
      return tokens

    default:
      return [];
  }
};

const fetchShallowMarketData = async (assetType: AssetType) => {
  switch (assetType) {
    case AssetType.BSV20:
      // check cache
      const cached = await redis.get(`tickers-${assetType}`);

      let tickers: MarketDataV1[] = [];
      if (cached) {
        tickers = Object.assign(JSON.parse(cached), tickers);
      } else {
        tickers = await fetchV1Tickers();
      }
      return tickers
    case AssetType.BSV21:
      let tv2: MarketDataV2[] = [];
      // let tokenIds: string[] = [];
      // check cache
      // const cachedIds = await redis.get(`ids-${assetType}`);
      // if (cachedIds) {
      //   tokenIds = JSON.parse(cachedIds);
      // } else {
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=200&offset=0&included=true`;
      const tickersv2 = await fetchJSON<BSV21[]>(urlV2Tokens);

      // EXAMPLE
      // [{"txid":"37984afc0bdcbb091fc6d742d52bd153693b5deaa073d68b7b50ff4bb0486afe","vout":0,"height":825683,"idx":"31","id":"37984afc0bdcbb091fc6d742d52bd153693b5deaa073d68b7b50ff4bb0486afe_0","sym":"PHNX","icon":"6bf88f205b20850518ae51b8b006aa86086af8228ae8524052819e2abd72205e_0","amt":"42000000","dec":0,"fundAddress":"1MYAnam22a2ADyMHQbKPn4yWfNmovfHbfD","fundTotal":"13250233","fundUsed":"1000","fundBalance":"13249233"},{"txid":"1bff350b55a113f7da23eaba1dc40a7c5b486d3e1017cda79dbe6bd42e001c81","vout":0,"height":821630,"idx":"34188","id":"1bff350b55a113f7da23eaba1dc40a7c5b486d3e1017cda79dbe6bd42e001c81_0","sym":"BAMBOO","icon":"b9068a24d0c8acceee1fb4db19558dd6c3b8e79a7dab2bca72c6a664af4969cf_0","amt":"1000000000000000","dec":8,"fundAddress":"15gdXn8UEeQ5JDvDMoKVEWN9PZeE854P89","fundTotal":"6789169","fundUsed":"2786000","fundBalance":"4003169"},{"txid":"85d467824321e7cc29cab7bcb4aa281e90c761eaadcc023257fdd9480fcf779f","vout":0,"height":828385,"idx":"113","id":"85d467824321e7cc29cab7bcb4aa281e90c761eaadcc023257fdd9480fcf779f_0","sym":"Hilltop","icon":null,"amt":"420000","dec":0,"fundAddress":"1HdvFwjcMgRdB8Cwgzcaady1GYd7a9Ffyc","fundTotal":"4208755","fundUsed":"3000","fundBalance":"4205755"},{"txid":"0898d04136d226e3c3a17016740e62b6fe2859155b0bed8098982db79688481d","vout":0,"height":828387,"idx":"247","id":"0898d04136d226e3c3a17016740e62b6fe2859155b0bed8098982db79688481d_0","sym":"Hilltop","icon":null,"amt":"42000","dec":0,"fundAddress":"1BaRhjhgtraqzMSzCD7cTidcLqZNpAKWGr","fundTotal":"2833664","fundUsed":"3000","fundBalance":"2830664"},{"txid":"928240c419b8155a1c1d5e1a4ec1e698cc4320eb807549eb221a8406876a7e3a","vout":0,"height":821966,"idx":"11610","id":"928240c419b8155a1c1d5e1a4ec1e698cc4320eb807549eb221a8406876a7e3a_0","sym":"AU79","icon":"3f721b137d3925a7d2a12f9cce36e225277be8e3090118c818a9deaa4e5ec159_0","amt":"10000000000000","dec":8,"fundAddress":"131x6X5tTHghYEJjj1CUBB1ZGPGFRMmvgF","fundTotal":"1418800","fundUsed":"1145000","fundBalance":"273800"},{"txid":"8677c7600eab310f7e5fbbdfc139cc4b168f4d079185facb868ebb2a80728ff1","vout":0,"height":821854,"idx":"8418","id":"8677c7600eab310f7e5fbbdfc139cc4b168f4d079185facb868ebb2a80728ff1_0","sym":"VIBES","icon":"87f1d0785cf9b4951e75e8cf9353d63a49f98e9b6b255bcd6a986db929a00472_0","amt":"2100000000000000","dec":8,"fundAddress":"1FtQS5rc4d9Sr8euV9XQ744WGKBbngx3on","fundTotal":"1298634","fundUsed":"791000","fundBalance":"507634"},{"txid":"00017fdc119c09b1c07102c8e01642a336c5cad8c1d2f8d91188fad27e9b5eb7","vout":0,"height":825544,"idx":"764","id":"00017fdc119c09b1c07102c8e01642a336c5cad8c1d2f8d91188fad27e9b5eb7_0","sym":"USDSV","icon":null,"amt":"9999999999900000256","dec":8,"fundAddress":"19hLYkdmN7BZkKA7ZQ4GsHW2Ghdh6zV1r7","fundTotal":"1027000","fundUsed":"53000","fundBalance":"974000"},{"txid":"a537267d9e7e40ac03ca2a03fcecae34dfa840ea874ce769a3b4f4a475e7411a","vout":0,"height":822102,"idx":"4621","id":"a537267d9e7e40ac03ca2a03fcecae34dfa840ea874ce769a3b4f4a475e7411a_0","sym":"1SAT","icon":"b20cd6e70ba2d7f41588f3eeb36a68985d6ac4256b3796cfcbf5e221df01c6c0_0","amt":"2100000000000000","dec":8,"fundAddress":"18esyUfuwL4MK14QrAUS353jMo3APhTZaC","fundTotal":"493000","fundUsed":"493000","fundBalance":"0"},{"txid":"b0b07ef1360ce5d4af1cb03df00a1dd27f25b09713bbd2c9fb6a3e93132f7637","vout":0,"height":822239,"idx":"14822","id":"b0b07ef1360ce5d4af1cb03df00a1dd27f25b09713bbd2c9fb6a3e93132f7637_0","sym":"RATS","icon":"93fb7de6be283da0233bac78353f796fe3684791464aa26cc5843ae1fb2a6641_0","amt":"10000000000000000000","dec":8,"fundAddress":"1CHrCEgtVvMEWm2y4ivfkHvFm3UNQxzsnK","fundTotal":"214119","fundUsed":"215000","fundBalance":"-881"},{"txid":"7bd05805d77fb906f9466156912b58797455efad5f5fd19d2a13bf095c3387c0","vout":0,"height":821960,"idx":"31753","id":"7bd05805d77fb906f9466156912b58797455efad5f5fd19d2a13bf095c3387c0_0","sym":"DGEN","icon":"b1335c8a0320e5114032a86fbd89b4662f742bc13f082abce318abf791598eba_0","amt":"6969696900000000","dec":8,"fundAddress":"1PRmf2jCzzVrXVeXSBNkxAVicf57yMjWxW","fundTotal":"133235","fundUsed":"128000","fundBalance":"5235"},{"txid":"a025e5936f96b660dd884d8113c0f9ea6235992fa68e527d778c51afabb953d5","vout":0,"height":822071,"idx":"159","id":"a025e5936f96b660dd884d8113c0f9ea6235992fa68e527d778c51afabb953d5_0","sym":"♾️/21M","icon":"7732a916aa647657ae8c4209ab8b0dfa3bfd3b31ea9f55837d63f51e9070001e_0","amt":"2100000000000000","dec":8,"fundAddress":"16bjJD4RJF8TyXWcMLrBfp9t4aiJHaV8d5","fundTotal":"132235","fundUsed":"133000","fundBalance":"-765"},{"txid":"3f05fc2614d2034caf189d06d419308f1772e63a653dfc16fe3e7ee80814354d","vout":0,"height":822164,"idx":"8703","id":"3f05fc2614d2034caf189d06d419308f1772e63a653dfc16fe3e7ee80814354d_0","sym":"ONE","icon":"3bf20653b9f6ab053646889ece7d62b8ac51a17c485d840bed89f2f6a8541810_0","amt":"240000000000000","dec":8,"fundAddress":"1DzeaM9Uggi3p57NKJaAK3xYNw9ZNG2uGx","fundTotal":"122235","fundUsed":"66000","fundBalance":"56235"},{"txid":"96138b4746ae4937f1cbec959a2e8eacbf168cdd620961ec8eb8d9bb344b35db","vout":0,"height":822345,"idx":"8343","id":"96138b4746ae4937f1cbec959a2e8eacbf168cdd620961ec8eb8d9bb344b35db_0","sym":"ZEN","icon":"537403f6a137a430ace2f8a8ac16fd517e5ffdae611ad589ca46d170eb516fff_0","amt":"2100000000000000","dec":8,"fundAddress":"13aLvpe1eB54xLhjYxfEcee1xpzvDUDKkJ","fundTotal":"122235","fundUsed":"52000","fundBalance":"70235"},{"txid":"d4016ecc926a543703e68b5b47823f53a0d22e7f3047a8ce10ad41244ea27d39","vout":0,"height":822875,"idx":"824","id":"d4016ecc926a543703e68b5b47823f53a0d22e7f3047a8ce10ad41244ea27d39_0","sym":"BEACON-144","icon":null,"amt":"2100000000000000","dec":8,"fundAddress":"1DobSfUwL7Se39Zxn7PzYSW52P5PkzCdYS","fundTotal":"23000","fundUsed":"23000","fundBalance":"0"},{"txid":"3b9df9e3919c4398ceb13c699e0700e3121666107a69d3203d65d66f3c96c6b1","vout":0,"height":826116,"idx":"256","id":"3b9df9e3919c4398ceb13c699e0700e3121666107a69d3203d65d66f3c96c6b1_0","sym":"OWEN","icon":"cc8ef083df1b862c232785ee7da9336c7014aab5f34882a777b8eb8d3778d84f_0","amt":"2100000000000000","dec":8,"fundAddress":"1FpiNAihT5PCHJBGFXAuc62VmXA2ibQ5BY","fundTotal":"13000","fundUsed":"5000","fundBalance":"8000"},{"txid":"7eb9aa02f7d4e66ddee0821f2a7cf1991272d608a4f8a17cec422decf691b782","vout":0,"height":822067,"idx":"1184","id":"7eb9aa02f7d4e66ddee0821f2a7cf1991272d608a4f8a17cec422decf691b782_0","sym":"JESUS COIN","icon":"629bc83e0c43be01e8b8e9aacd3c17a6848ba175d6c9ac6815e55ac4759fe140_0","amt":"7777777777699999744","dec":8,"fundAddress":"17ssFXabNaChEBWSQVwdzaDB8gtEK2nmaY","fundTotal":"10000","fundUsed":"5000","fundBalance":"5000"},{"txid":"ab59039feda657d0aee0fbfb3c3725ca5df3b130ed80663b38121baed8b69e5a","vout":0,"height":825844,"idx":"126","id":"ab59039feda657d0aee0fbfb3c3725ca5df3b130ed80663b38121baed8b69e5a_0","sym":"hh","icon":null,"amt":"21000000","dec":0,"fundAddress":"18CGi9MpJQktQ6Bw9r78pP3MTwzu56RraM","fundTotal":"10000","fundUsed":"1000","fundBalance":"9000"},{"txid":"7ab0b8c2c4cc67e2fc01317de1618e619765ca3b1ba43f637fbed3f44d7ab002","vout":0,"height":822013,"idx":"19885","id":"7ab0b8c2c4cc67e2fc01317de1618e619765ca3b1ba43f637fbed3f44d7ab002_0","sym":"OIL","icon":null,"amt":"10000000000000000","dec":8,"fundAddress":"1MpMtgcTYS3QFfggshDBjs8GFSTV7rNk3C","fundTotal":"9000","fundUsed":"9000","fundBalance":"0"},{"txid":"2248d1c4884adb7e4d12e345fd2860f1e7ebb02d41284d2a732d7526064a0bf9","vout":0,"height":822447,"idx":"8134","id":"2248d1c4884adb7e4d12e345fd2860f1e7ebb02d41284d2a732d7526064a0bf9_0","sym":"BEACON","icon":null,"amt":"2100000000000000","dec":8,"fundAddress":"1Q4PcBao93iyM6bnZryFtApqVzJhRBt14V","fundTotal":"8000","fundUsed":"9000","fundBalance":"-1000"},{"txid":"b0becb0ba72b9ce2f63b7460d5b767cf9df043e4a1355a19db91a05bc3e84e74","vout":0,"height":827543,"idx":"584","id":"b0becb0ba72b9ce2f63b7460d5b767cf9df043e4a1355a19db91a05bc3e84e74_0","sym":"MYRT","icon":null,"amt":"1000000000000000","dec":8,"fundAddress":"1NzQCioRBEgRx1CxRmMFP3nS8FXNctmDaY","fundTotal":"7000","fundUsed":"5000","fundBalance":"2000"}]

      for (const ticker of tickersv2 || []) {
        let tick = {
          price: 0,
          pctChange: 0,
          marketCap: 0,
          accounts: 0,
          pending: '',
          pendingOps: 0,
          listings: [],
          holders: [],
          sales: [],
          ...ticker,
        }
        // check cache for sales
        const cached = await redis.get(`token-${assetType}-${ticker.id.toLowerCase()}`);
        if (cached) {
          // load values to tick
          tick = Object.assign(JSON.parse(cached), tick)
        }

        // price is based on last sale
        tick.price = tick.sales.length > 0 ? parseFloat((tick.sales[0] as ListingsV2)?.pricePer) : tick.price;
        tick.marketCap = calculateMarketCap(tick.price, parseInt(ticker.amt) / 10 ** ticker.dec);
        tick.pctChange = await getPctChange(ticker.id);

        tv2.push(tick);
      }
      // }
      return tv2;
    default:
      break;
  }
}

