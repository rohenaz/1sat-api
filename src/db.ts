import { Redis } from "ioredis";

export const findMatchingKeys = async (redis: Redis, partial: string) => {
  const pattern = `autofill-${partial}*`;
  let cursor = '0';
  let keys = [];

  do {
    // Using SCAN command to find keys that match the pattern
    const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = reply[0];
    keys.push(...reply[1]);
  } while (cursor !== '0');

  return keys;
}