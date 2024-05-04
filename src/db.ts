import type { Redis } from "ioredis";
import type { AssetType } from "./constants";

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

// takes a offset and limit
export const findMatchingKeysWithOffset = async (redis: Redis, prefix: string, partial: string, type: AssetType, offset: number, limit: number) => {
  const pattern = `${partial}*`;
  const results = [];
  const reply = await redis.hscan(`${prefix}-${type}`, offset, 'MATCH', pattern, 'COUNT', limit);
  const fields = reply[1];

  // Fetch the value for each matching field
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i + 1]) {
      try {
        const data = JSON.parse(fields[i + 1]);
        if (data) {
          results.push(data);
        } else {
          console.log(`No data found for ${fields[i]}`);
        }
      } catch (e) {
        console.log('Error parsing data', e);
      }
    }
  }

  return results;
}

export const findOneExactMatchingKey = async (redis: Redis, prefix: string, key: string, type: AssetType) => {
  const pattern = `${prefix}-${type}-${key}`;
  return await redis.get(pattern);
}