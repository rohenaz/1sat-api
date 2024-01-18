import { Elysia } from 'elysia';
import Redis from "ioredis";

// redis via url new Redis("redis://:authpassword@127.0.0.1:6380/4");
const redis = new Redis(`${process.env.REDIS_PRIVATE_URL}`);


const app = new Elysia()
  .get('/market', async () => {
    // check cache for results

    let market = await redis.get("market")

    // if not cached or expired, hit several market endpoints and return the aggregated data
    if (!market) {
      // store results in cache with 
      const marketData = await fetchMarketData();
      redis.set("market", JSON.stringify(marketData), "EX", expirateionTime);
    }
  }).listen(process.env.PORT ?? 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

const fetchMarketData = async () => {
  return [{
    tick: "PEPE",
    price: 0.3152226666666666,
    cap: 6619675.999999998,
    holders: 208,
  }]
}

// 1 hour
const expirateionTime = 60 * 60 * 1000;