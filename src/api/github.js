// src/api/github.js
import { getGithubToken } from "./firebase";

const CACHE_PREFIX = "chort_cache:";
const DEFAULT_TTL = 1000 * 60 * 10; // 10분
const SEARCH_TTL = 1000 * 60 * 5; // 5분
const README_TTL = 1000 * 60 * 30; // 30분
const TRANSLATE_TTL = 1000 * 60 * 60 * 6; // 6시간

const memoryCache = new Map();
const inflightRequests = new Map();

const getHeaders = () => {
  const token = getGithubToken();

  const headers = {
    Accept: "application/vnd.github.v3+json",
  };

  if (token) {
    headers.Authorization = `token ${token}`;
  }

  return headers;
};

const now = () => Date.now();

const buildCacheKey = (key) => `${CACHE_PREFIX}${key}`;

const getCachedValue = (key) => {
  const fullKey = buildCacheKey(key);

  const mem = memoryCache.get(fullKey);
  if (mem && mem.expiresAt > now()) {
    return mem.value;
  }

  try {
    const raw = sessionStorage.getItem(fullKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || parsed.expiresAt <= now()) {
      sessionStorage.removeItem(fullKey);
      return null;
    }

    memoryCache.set(fullKey, parsed);
    return parsed.value;
  } catch {
    return null;
  }
};

const setCachedValue = (key, value, ttl = DEFAULT_TTL) => {
  const fullKey = buildCacheKey(key);
  const payload = {
    value,
    expiresAt: now() + ttl,
  };

  memoryCache.set(fullKey, payload);

  try {
    sessionStorage.setItem(fullKey, JSON.stringify(payload));
  } catch {
    // sessionStorage quota 초과 시 무시
  }

  return value;
};

const cachedRequest = async (key, fetcher, ttl = DEFAULT_TTL) => {
  const cached = getCachedValue(key);
  if (cached !== null) {
    return cached;
  }

  const fullKey = buildCacheKey(key);

  if (inflightRequests.has(fullKey)) {
    return inflightRequests.get(fullKey);
  }

  const promise = (async () => {
    try {
      const value = await fetcher();
      return setCachedValue(key, value, ttl);
    } finally {
      inflightRequests.delete(fullKey);
    }
  })();

  inflightRequests.set(fullKey, promise);
  return promise;
};

export const clearGithubApiCache = () => {
  const keysToDelete = [];

  for (const key of memoryCache.keys()) {
    if (key.startsWith(CACHE_PREFIX)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => memoryCache.delete(key));

  try {
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(CACHE_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // ignore
  }
};

export const starRepo = async (owner, repo) => {
  const token = getGithubToken();

  if (!token) {
    console.error("❌ GitHub 토큰이 없습니다. 로그인해주세요.");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: "PUT",
        headers: getHeaders(),
      },
    );

    if (response.status === 204 || response.ok) {
      clearGithubApiCache();
      return true;
    }

    const data = await response.json().catch(() => ({}));
    console.error(`❌ Star 실패: ${response.status}`, data);
    return false;
  } catch (error) {
    console.error("❌ Star 중 에러:", error);
    return false;
  }
};

export const unstarRepo = async (owner, repo) => {
  const token = getGithubToken();

  if (!token) {
    console.error("❌ GitHub 토큰이 없습니다. 로그인해주세요.");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      },
    );

    if (response.status === 204 || response.ok) {
      clearGithubApiCache();
      return true;
    }

    const data = await response.json().catch(() => ({}));
    console.error(`❌ Unstar 실패: ${response.status}`, data);
    return false;
  } catch (error) {
    console.error("❌ Unstar 중 에러:", error);
    return false;
  }
};

export const getTrendingRepos = async (page = 1) => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const formattedDate = date.toISOString().split("T")[0];
  const query = `created:>${formattedDate}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=10&page=${page}`;

  return cachedRequest(
    `trending:${page}:${formattedDate}`,
    async () => {
      const response = await fetch(url, { headers: getHeaders() });
      const data = await response.json();

      if (!response.ok || data.message) {
        return {
          error: true,
          message: data.message || `HTTP Error: ${response.status}`,
        };
      }

      return data.items || [];
    },
    DEFAULT_TTL,
  );
};

export const getTrendingReposBatch = async (pages = [1, 2, 3]) => {
  const results = await Promise.all(
    pages.map((page) => getTrendingRepos(page)),
  );
  return results;
};

export const searchRepos = async (keyword) => {
  if (!keyword) return [];

  const normalizedKeyword = keyword.trim().toLowerCase();
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&order=desc&per_page=20`;

  return cachedRequest(
    `search:${normalizedKeyword}`,
    async () => {
      const response = await fetch(url, { headers: getHeaders() });
      const data = await response.json();

      if (!response.ok || data.message) {
        console.error("검색 실패:", data.message || response.status);
        return [];
      }

      return data.items || [];
    },
    SEARCH_TTL,
  );
};

const cleanReadmeText = (text) => {
  let noHtmlText = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/<picture>[\s\S]*?<\/picture>/gi, "")
    .replace(/<\/?(p|div|a|span|h[1-6]|br|hr|source|img|svg|path)[^>]*>/gi, "");

  let lines = noHtmlText.split("\n").slice(0, 8).join("\n");
  const codeBlockCount = (lines.match(/```/g) || []).length;

  if (codeBlockCount % 2 !== 0) {
    lines += "\n```";
  }

  return lines.trim();
};

export const getReadmeSummary = async (owner, repo, defaultBranch = "main") => {
  const candidateBranches = [defaultBranch, "main", "master"].filter(Boolean);
  const uniqueBranches = [...new Set(candidateBranches)];

  return cachedRequest(
    `readme-summary:${owner}/${repo}:${uniqueBranches.join(",")}`,
    async () => {
      for (const branch of uniqueBranches) {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;

        try {
          const response = await fetch(url, { headers: getHeaders() });
          if (!response.ok) continue;

          const text = await response.text();
          const cleaned = cleanReadmeText(text);

          if (cleaned) {
            return cleaned;
          }
        } catch (error) {
          console.error("README 로드 에러:", error);
        }
      }

      return "";
    },
    README_TTL,
  );
};

export const getReadmeImage = async (owner, repo, defaultBranch = "main") => {
  const candidateBranches = [defaultBranch, "main", "master"].filter(Boolean);
  const uniqueBranches = [...new Set(candidateBranches)];

  return cachedRequest(
    `readme-image:${owner}/${repo}:${uniqueBranches.join(",")}`,
    async () => {
      for (const branch of uniqueBranches) {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;

        try {
          const response = await fetch(url, { headers: getHeaders() });
          if (!response.ok) continue;

          const text = await response.text();

          const markdownImgRegex =
            /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)\)/i;
          const htmlImgRegex =
            /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)["']/i;

          const mdMatch = text.match(markdownImgRegex);
          const htmlMatch = text.match(htmlImgRegex);

          let imageUrl = mdMatch ? mdMatch[1] : htmlMatch ? htmlMatch[1] : null;

          if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = imageUrl.startsWith("/")
              ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${imageUrl}`
              : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imageUrl}`;
          }

          if (imageUrl) {
            return imageUrl;
          }
        } catch (error) {
          console.error("README 이미지 파싱 에러:", error);
        }
      }

      return null;
    },
    README_TTL,
  );
};

export const translateToKorean = async (text) => {
  if (!text) return "";

  const safeText = text.substring(0, 800);
  const cacheKey = `translate:ko:${safeText}`;

  return cachedRequest(
    cacheKey,
    async () => {
      try {
        const response = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(safeText)}`,
        );
        const data = await response.json();
        return data?.[0]?.map((item) => item[0]).join("") || text;
      } catch (error) {
        console.error("번역 에러:", error);
        return text;
      }
    },
    TRANSLATE_TTL,
  );
};

const MAX_SEEN_HISTORY = 300;

export const filterAndRecordSeenRepos = (newRepos) => {
  if (!newRepos || newRepos.length === 0) return [];

  const seenIds = JSON.parse(localStorage.getItem("chort_seen_history")) || [];
  const freshRepos = newRepos.filter((repo) => !seenIds.includes(repo.id));
  const freshIds = freshRepos.map((repo) => repo.id);

  const updatedSeenIds = [...freshIds, ...seenIds].slice(0, MAX_SEEN_HISTORY);
  localStorage.setItem("chort_seen_history", JSON.stringify(updatedSeenIds));

  return freshRepos;
};

export const fetchTrendingRepos = async (page = 1) => {
  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc&page=${page}&per_page=30`,
      { headers: getHeaders() },
    );
    const data = await response.json();

    if (data.message && data.message.includes("API rate limit")) {
      console.warn("GitHub API 호출 한도 초과!");
      return [];
    }

    const freshData = filterAndRecordSeenRepos(data.items);

    if (freshData.length === 0 && data.items && data.items.length > 0) {
      return fetchTrendingRepos(page + 1);
    }

    return freshData;
  } catch (error) {
    console.error("데이터 패칭 에러:", error);
    return [];
  }
};
