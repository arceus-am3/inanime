import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const CACHE_SERVER_URL = process.env.CACHE_URL || null;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || null;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || null;
const DEFAULT_MEMORY_CACHE_TTL_SECONDS = parsePositiveInteger(
  process.env.MEMORY_CACHE_TTL_SECONDS,
  300
);
const CACHE_REQUEST_TIMEOUT_MS = 5000;
const memoryCache = globalThis.__HIANIME_API_CACHE__ || new Map();

if (!globalThis.__HIANIME_API_CACHE__) {
  globalThis.__HIANIME_API_CACHE__ = memoryCache;
}

function parsePositiveInteger(value, fallback = 0) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

function isUpstashEnabled() {
  return Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
}

function getMemoryCacheEntry(key) {
  const cachedEntry = memoryCache.get(key);

  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return cachedEntry.value;
}

function setMemoryCacheEntry(key, value, ttlSeconds = DEFAULT_MEMORY_CACHE_TTL_SECONDS) {
  if (!ttlSeconds) {
    return;
  }

  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

function parseCachedPayload(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const getCachedData = async (key) => {
  try {
    const memoryValue = getMemoryCacheEntry(key);
    if (memoryValue !== null) {
      return memoryValue;
    }

    if (isUpstashEnabled()) {
      const response = await axios.get(
        `${UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`,
        {
          headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          },
          timeout: CACHE_REQUEST_TIMEOUT_MS,
        }
      );

      const cachedValue = parseCachedPayload(response.data?.result ?? null);

      if (cachedValue !== null) {
        setMemoryCacheEntry(key, cachedValue);
      }

      return cachedValue;
    }

    if (!CACHE_SERVER_URL) {
      return null;
    }

    const response = await axios.get(
      `${CACHE_SERVER_URL}/${encodeURIComponent(key)}`,
      {
        timeout: CACHE_REQUEST_TIMEOUT_MS,
      }
    );
    const cachedValue = response.data;

    if (cachedValue !== null && cachedValue !== undefined) {
      setMemoryCacheEntry(key, cachedValue);
    }

    return cachedValue;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Error getting cache data for key "${key}":`, error.message);
    return null;
  }
};

export const setCachedData = async (key, value, options = {}) => {
  const ttlSeconds = parsePositiveInteger(options.ttlSeconds, 0);
  const memoryTtlSeconds = parsePositiveInteger(
    options.memoryTtlSeconds,
    ttlSeconds || DEFAULT_MEMORY_CACHE_TTL_SECONDS
  );

  try {
    setMemoryCacheEntry(key, value, memoryTtlSeconds);

    if (isUpstashEnabled()) {
      const command = ["SET", key, JSON.stringify(value)];

      if (ttlSeconds > 0) {
        command.push("EX", String(ttlSeconds));
      }

      await axios.post(UPSTASH_REDIS_REST_URL, command, {
        headers: {
          Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: CACHE_REQUEST_TIMEOUT_MS,
      });
      return;
    }

    if (!CACHE_SERVER_URL) {
      return;
    }

    await axios.post(
      CACHE_SERVER_URL,
      { key, value },
      { timeout: CACHE_REQUEST_TIMEOUT_MS }
    );
  } catch (error) {
    console.error("Error setting cache data:", error);
    throw error;
  }
};
