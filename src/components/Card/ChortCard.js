// src/components/Card/ChortCard.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Terminal, FileText, AlignLeft, Languages } from "lucide-react";
import {
  getReadmeImage,
  getReadmeSummary,
  getRenderedReadmeHtml,
  translateToKorean,
} from "../../api/github";
import { getCommentCount } from "../../api/firebase";
import { recordView, recordSkip } from "../../utils/userProfile";

const repoDetailCache = new Map();

const getRepoCacheKey = (repo) => repo.full_name;

const getInitialCacheEntry = (repo) => {
  const key = getRepoCacheKey(repo);
  return (
    repoDetailCache.get(key) || {
      koDescription: "",
      renderedReadmeHtml: "",
      fallbackReadmeText: "",
      readmeImage: null,
      commentCount: null,
      lightLoaded: false,
      heavyLoaded: false,
    }
  );
};

const setRepoCacheEntry = (repo, patch) => {
  const key = getRepoCacheKey(repo);
  const prev = getInitialCacheEntry(repo);
  repoDetailCache.set(key, { ...prev, ...patch });
};

const sanitizeRenderedHtml = (html) => {
  if (!html || typeof window === "undefined") return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const blockedSelectors = [
      "script",
      "style",
      "img",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "meta",
      "link",
    ];

    doc
      .querySelectorAll(blockedSelectors.join(","))
      .forEach((node) => node.remove());

    doc.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (name.startsWith("on")) {
          node.removeAttribute(attr.name);
          return;
        }
        if (
          (name === "href" || name === "src") &&
          /^\s*javascript:/i.test(value)
        ) {
          node.removeAttribute(attr.name);
          return;
        }
        if (name === "style") {
          node.removeAttribute(attr.name);
          return;
        }
      });

      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noreferrer noopener");
      }
    });

    return doc.body.innerHTML || "";
  } catch (error) {
    console.error("README HTML sanitize 에러:", error);
    return "";
  }
};

const ChortCard = ({ repo, onVisible, onCommentsCountChange }) => {
  const repoKey = repo.full_name;
  const cacheEntry = useMemo(() => getInitialCacheEntry(repo), [repoKey]);

  const [readmeImage, setReadmeImage] = useState(
    cacheEntry.readmeImage || null,
  );
  const [koDescription, setKoDescription] = useState(
    cacheEntry.koDescription || "번역 중...",
  );
  const [renderedReadmeHtml, setRenderedReadmeHtml] = useState(
    cacheEntry.renderedReadmeHtml || "",
  );
  const [fallbackReadmeText, setFallbackReadmeText] = useState(
    cacheEntry.fallbackReadmeText || "",
  );
  const [isKorean, setIsKorean] = useState(true);

  const cardRef = useRef(null);
  const viewStartTime = useRef(null);
  const hasRecordedSignal = useRef(false);

  const lightLoadedRef = useRef(cacheEntry.lightLoaded || false);
  const heavyLoadedRef = useRef(cacheEntry.heavyLoaded || false);
  const lightLoadingRef = useRef(false);
  const heavyLoadingRef = useRef(false);
  const onCommentsCountChangeRef = useRef(onCommentsCountChange);

  const ogImageUrl = `https://opengraph.githubassets.com/1/${repo.full_name}`;

  useEffect(() => {
    onCommentsCountChangeRef.current = onCommentsCountChange;
  }, [onCommentsCountChange]);

  // repo 교체 시 상태 리셋
  useEffect(() => {
    const latestCache = getInitialCacheEntry(repo);
    setReadmeImage(latestCache.readmeImage || null);
    setKoDescription(latestCache.koDescription || "번역 중...");
    setRenderedReadmeHtml(latestCache.renderedReadmeHtml || "");
    setFallbackReadmeText(latestCache.fallbackReadmeText || "");
    setIsKorean(true);
    lightLoadedRef.current = latestCache.lightLoaded || false;
    heavyLoadedRef.current = latestCache.heavyLoaded || false;
    lightLoadingRef.current = false;
    heavyLoadingRef.current = false;
    viewStartTime.current = null;
    hasRecordedSignal.current = false;
  }, [repoKey]);

  // [성능개선] useEffect 의존성에서 repo 객체 제거 → repoKey(string)만 사용
  // 이전: [repo, repoKey, onVisible] — repo 객체는 매 렌더마다 새 참조 생성
  //       → 피드에 새 배치 추가될 때마다 모든 카드의 옵저버가 재생성됨
  // 이후: [repoKey, onVisible] — 실제 레포가 바뀔 때만 재실행
  useEffect(() => {
    let cancelled = false;

    const loadLightData = async () => {
      if (lightLoadedRef.current || lightLoadingRef.current) return;
      lightLoadingRef.current = true;
      try {
        const latestCache = getInitialCacheEntry(repo);

        let nextKoDescription = latestCache.koDescription;
        if (!nextKoDescription) {
          nextKoDescription = await translateToKorean(repo.description || "");
        }

        let nextCommentCount = latestCache.commentCount;
        if (nextCommentCount === null || nextCommentCount === undefined) {
          nextCommentCount = await getCommentCount(repo.id);
        }

        if (cancelled) return;

        setKoDescription(nextKoDescription || "설명이 없습니다.");
        onCommentsCountChangeRef.current?.(repo.id, nextCommentCount || 0);
        setRepoCacheEntry(repo, {
          koDescription: nextKoDescription || "설명이 없습니다.",
          commentCount: nextCommentCount || 0,
          lightLoaded: true,
        });
        lightLoadedRef.current = true;
      } catch (error) {
        console.error("카드 기본 데이터 로드 에러:", error);
        if (!cancelled)
          setKoDescription(repo.description || "설명이 없습니다.");
      } finally {
        lightLoadingRef.current = false;
      }
    };

    const loadHeavyData = async () => {
      if (heavyLoadedRef.current || heavyLoadingRef.current) return;
      heavyLoadingRef.current = true;
      try {
        const latestCache = getInitialCacheEntry(repo);

        if (latestCache.heavyLoaded) {
          if (cancelled) return;
          setReadmeImage(latestCache.readmeImage || null);
          setRenderedReadmeHtml(latestCache.renderedReadmeHtml || "");
          setFallbackReadmeText(
            latestCache.fallbackReadmeText ||
              "README 데이터를 찾을 수 없습니다.",
          );
          heavyLoadedRef.current = true;
          return;
        }

        const [imageUrl, html, summaryText] = await Promise.all([
          getReadmeImage(repo.owner.login, repo.name, repo.default_branch),
          getRenderedReadmeHtml(
            repo.owner.login,
            repo.name,
            repo.default_branch,
          ),
          getReadmeSummary(repo.owner.login, repo.name, repo.default_branch),
        ]);

        if (cancelled) return;

        const safeHtml = sanitizeRenderedHtml(html || "");
        const safeFallback = summaryText || "README 데이터를 찾을 수 없습니다.";

        setReadmeImage(imageUrl || null);
        setRenderedReadmeHtml(safeHtml);
        setFallbackReadmeText(safeFallback);
        setRepoCacheEntry(repo, {
          readmeImage: imageUrl || null,
          renderedReadmeHtml: safeHtml,
          fallbackReadmeText: safeFallback,
          heavyLoaded: true,
        });
        heavyLoadedRef.current = true;
      } catch (error) {
        console.error("카드 상세 데이터 로드 에러:", error);
        if (!cancelled) {
          setReadmeImage(null);
          setRenderedReadmeHtml("");
          setFallbackReadmeText("README 데이터를 찾을 수 없습니다.");
        }
        setRepoCacheEntry(repo, {
          readmeImage: null,
          renderedReadmeHtml: "",
          fallbackReadmeText: "README 데이터를 찾을 수 없습니다.",
          heavyLoaded: true,
        });
        heavyLoadedRef.current = true;
      } finally {
        heavyLoadingRef.current = false;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry.isIntersecting) {
          loadLightData();
          loadHeavyData();
          if (!viewStartTime.current) {
            viewStartTime.current = Date.now();
            hasRecordedSignal.current = false;
          }
        } else if (viewStartTime.current && !hasRecordedSignal.current) {
          hasRecordedSignal.current = true;
          const dwellMs = Date.now() - viewStartTime.current;
          if (dwellMs < 800) {
            recordSkip(repo);
          } else {
            recordView(repo, dwellMs);
          }
          viewStartTime.current = null;
        }

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          onVisible?.(repo);
        }
      },
      { threshold: [0.1, 0.6] },
    );

    if (cardRef.current) observer.observe(cardRef.current);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [repoKey, onVisible]); // [성능개선] repo 객체 제거

  const displayDescription = isKorean
    ? koDescription
    : repo.description || "No description provided.";

  return (
    <div
      ref={cardRef}
      className="relative h-screen w-full snap-start bg-[#0d1117] flex flex-col overflow-hidden"
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img
          src={readmeImage || ogImageUrl}
          alt="background blur"
          className="w-full h-full object-cover blur-3xl scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117]/80 via-[#0d1117]/95 to-[#0d1117]" />
      </div>

      <div className="relative z-10 flex flex-col h-full w-full pt-10 pb-10">
        <div className="px-5 pb-4 shrink-0 flex justify-between items-start">
          <div className="pr-10">
            <div
              className="flex items-center gap-2 mb-2 cursor-pointer w-max"
              onClick={(e) => {
                e.stopPropagation();
                window.open(repo.owner.html_url, "_blank");
              }}
            >
              <img
                src={repo.owner.avatar_url}
                className="w-6 h-6 rounded-full border border-gray-600"
                alt="avatar"
              />
              <span className="font-semibold text-gray-400 text-xs tracking-wide">
                @{repo.owner.login}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white leading-tight break-words">
              {repo.name}
            </h1>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsKorean(!isKorean);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-xs font-bold text-gray-200 transition-colors shrink-0"
            title="설명 언어 전환"
          >
            <Languages className="w-4 h-4" />
            {isKorean ? "KR" : "EN"}
          </button>
        </div>

        <div className="flex-1 overflow-hidden px-5 relative flex flex-col">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 backdrop-blur-sm shrink-0">
            <h3 className="text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Description
            </h3>
            <p className="text-gray-200 text-sm leading-relaxed break-keep line-clamp-3">
              {displayDescription}
            </p>
          </div>

          {readmeImage && (
            <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 flex justify-center shrink-0">
              <img
                src={readmeImage}
                alt="Preview"
                className="w-full h-auto max-h-32 object-contain"
              />
            </div>
          )}

          <div className="bg-black/40 border border-white/10 rounded-xl p-4 backdrop-blur-sm flex-1 overflow-hidden relative">
            <h3 className="text-[10px] font-bold text-purple-400 mb-3 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> README Snippet
            </h3>

            {renderedReadmeHtml ? (
              <div className="relative h-full overflow-hidden">
                <div
                  className="readme-rendered text-gray-300 text-xs leading-relaxed break-words"
                  dangerouslySetInnerHTML={{ __html: renderedReadmeHtml }}
                />
              </div>
            ) : (
              <div className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap break-words break-keep">
                {fallbackReadmeText || "README 불러오는 중..."}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#151a22] to-transparent pointer-events-none rounded-b-xl flex items-end justify-center pb-2">
              <span className="text-[10px] text-gray-500 font-semibold mb-1">
                ...Tap Repo to read more
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 shrink-0 pt-4 pr-20">
          <div className="flex flex-wrap gap-2 mb-3">
            {repo.language && (
              <span className="text-[10px] font-bold px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400">
                {repo.language}
              </span>
            )}
            {repo.topics?.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="text-[10px] font-bold px-2 py-1 bg-white/5 border border-white/10 rounded text-gray-400"
              >
                #{topic}
              </span>
            ))}
          </div>

          <div
            className="bg-black/80 border border-gray-700 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-900 transition"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(
                `git clone https://github.com/${repo.full_name}`,
              );
              alert("클론 명령어가 복사되었습니다!");
            }}
          >
            <Terminal className="w-4 h-4 text-green-400 shrink-0" />
            <code className="text-xs text-green-400 font-mono truncate">
              git clone https://github.com/{repo.full_name}
            </code>
          </div>
        </div>
      </div>
      {/* [구조개선] inline <style> 제거 → index.css로 이동 */}
    </div>
  );
};

export default ChortCard;
