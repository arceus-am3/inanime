import extractAnimeInfo from "../extractors/animeInfo.extractor.js";
import extractSeasons from "../extractors/seasons.extractor.js";
import { getCachedData, setCachedData } from "../helper/cache.helper.js";

const DEFAULT_DETAIL_CACHE_DAYS = 7;
const DEFAULT_DETAIL_STALE_DAYS = 1;

function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

function setDetailCacheHeaders(res) {
  const detailCacheDays = parsePositiveInteger(
    process.env.DETAIL_CACHE_TTL_DAYS,
    DEFAULT_DETAIL_CACHE_DAYS
  );
  const staleCacheDays = parsePositiveInteger(
    process.env.DETAIL_CACHE_STALE_DAYS,
    DEFAULT_DETAIL_STALE_DAYS
  );
  const ttlSeconds = detailCacheDays * 24 * 60 * 60;
  const staleSeconds = staleCacheDays * 24 * 60 * 60;
  const edgeCacheValue = `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${staleSeconds}, stale-if-error=${staleSeconds}`;

  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("CDN-Cache-Control", edgeCacheValue);
  res.setHeader("Vercel-CDN-Cache-Control", edgeCacheValue);

  return ttlSeconds;
}

export const getAnimeInfo = async (req, res) => {
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Missing required query parameter: id",
    });
  }

  try {
    const cacheKey = `animeInfo:${id}`;
    const cacheTtlSeconds = setDetailCacheHeaders(res);
    const cachedResponse = await getCachedData(cacheKey);
    if (cachedResponse !== null && cachedResponse !== undefined) {
      res.setHeader("X-Detail-Cache", "HIT");
      return cachedResponse;
    }

    const [seasonsResult, dataResult] = await Promise.allSettled([
      extractSeasons(id),
      extractAnimeInfo(id),
    ]);

    if (dataResult.status !== "fulfilled" || !dataResult.value) {
      const error = new Error("Failed to fetch anime detail data from upstream");
      error.status = 502;
      throw error;
    }

    const seasons =
      seasonsResult.status === "fulfilled" && Array.isArray(seasonsResult.value)
        ? seasonsResult.value
        : [];

    if (seasonsResult.status === "rejected") {
      console.error("Failed to fetch seasons:", seasonsResult.reason);
    }

    const responseData = { data: dataResult.value, seasons };

    await setCachedData(cacheKey, responseData, {
      ttlSeconds: cacheTtlSeconds,
      memoryTtlSeconds: cacheTtlSeconds,
    }).catch((err) => {
      console.error("Failed to set cache:", err);
    });

    res.setHeader("X-Detail-Cache", "MISS");
    return responseData;
  } catch (e) {
    console.error(e);
    return res.status(e.status || 500).json({
      success: false,
      message: e.message || "An error occurred",
    });
  }
};
