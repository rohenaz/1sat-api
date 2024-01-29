import { Redis } from "ioredis";

export const findMatchingKeys = async (redis: Redis, partial: string) => {
  const pattern = `autofill-${partial}*`;
  let cursor = '0';
  let results = [];

  do {
    const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = reply[0];
    const keys = reply[1];

    // Fetch the value for each matching key
    for (const key of keys) {
      const value = await redis.get(key);
      if (value) {
        results.push({ key, value: JSON.parse(value) });
      }
    }
  } while (cursor !== '0');

  return results;
}