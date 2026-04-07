// src/api/github.js
import { getGithubToken } from "./firebase";

const CACHE_PREFIX = "chort_cache:";
const DEFAULT_TTL = 1000 * 60 * 10;
const SEARCH_TTL = 1000 * 60 * 5;
const README_TTL = 1000 * 60 * 30;
const TRANSLATE_TTL = 1000 * 60 * 60 * 6;

const memoryCache = new Map();
const inflightRequests = new Map();

const now = () => Date.now();
const buildCacheKey = (key) => `${CACHE_PREFIX}${key}`;

const getHeaders = ({
  accept = "application/vnd.github+json",
  contentType,
} = {}) => {
  const token = getGithubToken();
  const headers = { Accept: accept };
  if (contentType) headers["Content-Type"] = contentType;
  if (token) headers.Authorization = `token ${token}`;
  return headers;
};

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
  const payload = { value, expiresAt: now() + ttl };

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
  if (cached !== null) return cached;

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

const getReadmeCandidatePaths = () => [
  "README.md",
  "readme.md",
  "README.MD",
  "Readme.md",
];

const getReadmeCandidateBranches = (defaultBranch = "main") => {
  return [...new Set([defaultBranch, "main", "master"].filter(Boolean))];
};

const fetchText = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) return null;
  return response.text();
};

const decodeBase64Utf8 = (value) => {
  if (!value || typeof value !== "string") return "";
  try {
    const sanitized = value.replace(/\s/g, "");
    const binary = atob(sanitized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
};

const decodeHtmlEntities = (text) => {
  if (!text) return "";
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
};

const normalizeWhitespace = (text) => {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const shouldSkipTranslationNode = (node) => {
  const parent = node.parentElement;
  if (!parent) return true;

  const skipTags = new Set([
    "CODE",
    "PRE",
    "SCRIPT",
    "STYLE",
    "SVG",
    "IMG",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "BUTTON",
    "OPTION",
  ]);

  if (skipTags.has(parent.tagName)) return true;
  if (parent.closest("code, pre, script, style, svg")) return true;

  return false;
};

const isTranslatableText = (text) => {
  const normalized = normalizeWhitespace(text);
  if (!normalized || normalized.length < 2) return false;

  const letters =
    normalized.match(/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF\u3040-\u30FF]/g) || [];
  return letters.length > 0;
};

const chunkText = (text, maxLength = 800) => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const sentences = normalized.split(/(?<=[.!?。！？])\s+|\n+/);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;

    if (!current) {
      current = piece;
      continue;
    }

    if ((current + " " + piece).length <= maxLength) {
      current += ` ${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  }

  if (current) chunks.push(current);
  return chunks;
};

// [성능개선] star/unstar 시 불필요한 전체 캐시 무효화 제거
// trending/search/readme 캐시는 star 여부와 무관하므로 삭제할 이유 없음
export const starRepo = async (owner, repo) => {
  const token = getGithubToken();
  if (!token) {
    console.error("❌ GitHub 토큰이 없습니다. 로그인해주세요.");
    return false;
  }

  try {
    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      { method: "PUT", headers: getHeaders() },
    );

    if (response.status === 204 || response.ok) return true;

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
      { method: "DELETE", headers: getHeaders() },
    );

    if (response.status === 204 || response.ok) return true;

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
  const q = `created:>${formattedDate}`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10&page=${page}`;

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
  return Promise.all(pages.map((page) => getTrendingRepos(page)));
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
  if (!text) return "";

  let cleaned = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<picture[\s\S]*?<\/picture>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/^\s*[-|:]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(english|한국어|简体中文|繁體中文|japanese|日本語)(\s*[·|/]\s*.*)?$/i.test(
          line,
        ),
    )
    .slice(0, 8);

  let result = lines.join("\n");
  const codeBlockCount = (result.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) result += "\n```";

  return result.trim();
};

export const getReadmeRaw = async (owner, repo, defaultBranch = "main") => {
  const branches = getReadmeCandidateBranches(defaultBranch);
  const paths = getReadmeCandidatePaths();

  return cachedRequest(
    `readme-raw:${owner}/${repo}:${branches.join(",")}:${paths.join(",")}`,
    async () => {
      for (const branch of branches) {
        for (const path of paths) {
          const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
          try {
            const response = await fetch(url, { headers: getHeaders() });
            if (!response.ok) continue;

            const data = await response.json().catch(() => null);
            if (!data) continue;

            if (typeof data.content === "string" && data.encoding === "base64") {
              const decoded = decodeBase64Utf8(data.content);
              if (decoded) return decoded;
            }

            if (typeof data.download_url === "string" && data.download_url) {
              const text = await fetchText(data.download_url, {
                headers: getHeaders({ accept: "text/plain" }),
              });
              if (text) return text;
            }
          } catch {
            // 후보 브랜치/경로 탐색 중 단건 실패는 다음 후보로 진행
          }
        }
      }
      return "";
    },
    README_TTL,
  );
};

export const getReadmeSummary = async (owner, repo, defaultBranch = "main") => {
  return cachedRequest(
    `readme-summary:${owner}/${repo}:${defaultBranch}`,
    async () => {
      const text = await getReadmeRaw(owner, repo, defaultBranch);
      return cleanReadmeText(text);
    },
    README_TTL,
  );
};

export const getRenderedReadmeHtml = async (
  owner,
  repo,
  defaultBranch = "main",
) => {
  return cachedRequest(
    `readme-rendered-html:${owner}/${repo}:${defaultBranch}`,
    async () => {
      const markdown = await getReadmeRaw(owner, repo, defaultBranch);
      if (!markdown) return "";

      try {
        const response = await fetch("https://api.github.com/markdown", {
          method: "POST",
          headers: getHeaders({
            accept: "text/html",
            contentType: "application/json",
          }),
          body: JSON.stringify({
            text: markdown,
            mode: "gfm",
            context: `${owner}/${repo}`,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          console.error("README HTML 렌더링 실패:", response.status, errorText);
          return "";
        }

        return response.text();
      } catch (error) {
        console.error("README HTML 렌더링 에러:", error);
        return "";
      }
    },
    README_TTL,
  );
};

export const getTranslatedText = async (text, target = "ko") => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  return cachedRequest(
    `translate:${target}:${normalized}`,
    async () => {
      try {
        const response = await fetch(
          `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(normalized)}`,
        );
        const data = await response.json();
        return normalizeWhitespace(
          data?.[0]?.map((item) => item[0]).join("") || normalized,
        );
      } catch (error) {
        console.error("번역 에러:", error);
        return normalized;
      }
    },
    TRANSLATE_TTL,
  );
};

export const translateToKorean = async (text) => {
  if (!text) return "";
  const chunks = chunkText(text, 800);
  const translated = await Promise.all(
    chunks.map((chunk) => getTranslatedText(chunk, "ko")),
  );
  return translated.join("\n\n").trim();
};

// [성능개선] 번역 API 호출을 직렬 → Promise.all 병렬 처리
// cachedRequest의 inflightRequests가 중복 요청을 막으므로 안전
export const getTranslatedRenderedReadmeHtml = async (
  owner,
  repo,
  defaultBranch = "main",
  target = "ko",
) => {
  return cachedRequest(
    `readme-rendered-html-translated:${owner}/${repo}:${defaultBranch}:${target}`,
    async () => {
      const html = await getRenderedReadmeHtml(owner, repo, defaultBranch);
      if (!html || typeof window === "undefined") return "";

      try {
        const parser = new DOMParser();
        const domDoc = parser.parseFromString(html, "text/html");
        const walker = domDoc.createTreeWalker(
          domDoc.body,
          NodeFilter.SHOW_TEXT,
        );

        const textNodes = [];
        let currentNode = walker.nextNode();

        while (currentNode) {
          if (
            currentNode.nodeType === Node.TEXT_NODE &&
            !shouldSkipTranslationNode(currentNode) &&
            isTranslatableText(currentNode.nodeValue)
          ) {
            textNodes.push(currentNode);
          }
          currentNode = walker.nextNode();
        }

        const uniqueTexts = [
          ...new Set(
            textNodes
              .map((node) => normalizeWhitespace(node.nodeValue))
              .filter(Boolean),
          ),
        ];

        // [성능개선] 직렬 for-await → Promise.all 병렬 처리
        const pairs = await Promise.all(
          uniqueTexts.map(async (originalText) => {
            const translated = await getTranslatedText(originalText, target);
            return [originalText, translated || originalText];
          }),
        );
        const translationMap = new Map(pairs);

        textNodes.forEach((node) => {
          const originalText = normalizeWhitespace(node.nodeValue);
          if (!originalText) return;

          const translated = translationMap.get(originalText);
          if (translated) {
            node.nodeValue = node.nodeValue.replace(
              decodeHtmlEntities(originalText),
              translated,
            );

            if (normalizeWhitespace(node.nodeValue) === originalText) {
              node.nodeValue = translated;
            }
          }
        });

        return domDoc.body.innerHTML || "";
      } catch (error) {
        console.error("README HTML 번역 에러:", error);
        return "";
      }
    },
    TRANSLATE_TTL,
  );
};

export const getReadmeImage = async (owner, repo, defaultBranch = "main") => {
  const candidateBranches = getReadmeCandidateBranches(defaultBranch);

  return cachedRequest(
    `readme-image:${owner}/${repo}:${candidateBranches.join(",")}`,
    async () => {
      const text = await getReadmeRaw(owner, repo, defaultBranch);
      if (!text) return null;

      const markdownImgRegex =
        /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)\)/i;
      const htmlImgRegex =
        /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)["']/i;

      const mdMatch = text.match(markdownImgRegex);
      const htmlMatch = text.match(htmlImgRegex);

      let imageUrl = mdMatch ? mdMatch[1] : htmlMatch ? htmlMatch[1] : null;

      if (imageUrl && !imageUrl.startsWith("http")) {
        const branch = candidateBranches[0] || "main";
        imageUrl = imageUrl.startsWith("/")
          ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${imageUrl}`
          : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imageUrl}`;
      }

      return imageUrl || null;
    },
    README_TTL,
  );
};
