import { Redis } from "ioredis";
import { AssetType } from "./constants";

export const findMatchingKeys = async (redis: Redis, prefix: string, partial: string, type: AssetType) => {
  const pattern = `${prefix}-${type}-${partial}*`;
  let cursor = '0';
  let results = [];
  do {
    const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 60);
    cursor = reply[0];
    const keys = reply[1];

    // Fetch the value for each matching key
    for (const key of keys) {
      const value = await redis.get(key);
      if (value) {
        results.push(JSON.parse(value));
      }
    }
  } while (cursor !== '0');
  return results;
}