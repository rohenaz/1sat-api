import { Redis } from "ioredis";
import { AssetType } from "./constants";

export const findMatchingKeys = async (redis: Redis, prefix: string, partial: string, type: AssetType) => {
  const pattern = `${partial}*`;
  let cursor = '0';
  const results = [];
  do {
    const reply = await redis.hscan(`${prefix}-${type}`, cursor, 'MATCH', pattern, 'COUNT', 60);
    cursor = reply[0];
    const keys = reply[1];

    // Fetch the value for each matching key
    for (let i = 0; i < keys.length; i += 2) {
      results.push(JSON.parse(keys[i + 1]));
    }
  } while (cursor !== '0');
  return results;
}

export const findOneExactMatchingKey = async (redis: Redis, prefix: string, key: string, type: AssetType) => {
  const pattern = `${prefix}-${type}-${key}`;
  return await redis.get(pattern);
}