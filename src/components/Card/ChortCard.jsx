import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Terminal, FileText, AlignLeft, Languages } from "lucide-react";
import {
  getReadmeImage,
  getReadmePreviewRaw,
  prepareReadmeForLocalRender,
  translateToKorean,
} from "../../api/github";
import { getCommentCount } from "../../api/firebase";
import { recordView } from "../../utils/userProfile";

const repoDetailCache = new Map();

const getRepoCacheKey = (repo) => repo.full_name;

const getInitialCacheEntry = (repo) => {
  const key = getRepoCacheKey(repo);
  return (
    repoDetailCache.get(key) || {
      koDescription: "",
      renderedReadmeHtml: "",
      readmeMarkdown: "",
      readmeFallback: "",
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

const ChortCard = ({ repo, onVisible, onCommentsCountChange }) => {
  const repoKey = repo.full_name;
  const cacheEntry = useMemo(() => getInitialCacheEntry(repo), [repo]);

  const [readmeImage, setReadmeImage] = useState(
    cacheEntry.readmeImage || null,
  );
  const [koDescription, setKoDescription] = useState(
    cacheEntry.koDescription || "번역 중...",
  );
  const [renderedReadmeHtml, setRenderedReadmeHtml] = useState(
    cacheEntry.renderedReadmeHtml || "",
  );
  const [readmeMarkdown, setReadmeMarkdown] = useState(
    cacheEntry.readmeMarkdown || "",
  );
  const [readmeFallback, setReadmeFallback] = useState(
    cacheEntry.readmeFallback || "",
  );
  const [readmeLoaded, setReadmeLoaded] = useState(
    cacheEntry.heavyLoaded || false,
  );
  const [isKorean, setIsKorean] = useState(true);

  const cardRef = useRef(null);
  const viewStartTime = useRef(null);
  const trackingActiveRef = useRef(false);
  const engagementRef = useRef({ hadScroll: false, hadInteraction: false });
  const removeEngagementListenersRef = useRef(() => {});

  const lightLoadedRef = useRef(cacheEntry.lightLoaded || false);
  const heavyLoadedRef = useRef(cacheEntry.heavyLoaded || false);
  const lightLoadingRef = useRef(false);
  const heavyLoadingRef = useRef(false);
  const onCommentsCountChangeRef = useRef(onCommentsCountChange);

  const ogImageUrl = `https://opengraph.githubassets.com/1/${repo.full_name}`;

  useEffect(() => {
    onCommentsCountChangeRef.current = onCommentsCountChange;
  }, [onCommentsCountChange]);

  const resetEngagement = useCallback(() => {
    engagementRef.current = { hadScroll: false, hadInteraction: false };
  }, []);

  const detachEngagementListeners = useCallback(() => {
    removeEngagementListenersRef.current?.();
    removeEngagementListenersRef.current = () => {};
  }, []);

  const attachEngagementListeners = useCallback(() => {
    detachEngagementListeners();

    const markInteraction = () => {
      if (!trackingActiveRef.current) return;
      engagementRef.current.hadInteraction = true;
    };

    const markScroll = () => {
      if (!trackingActiveRef.current) return;
      engagementRef.current.hadInteraction = true;
      engagementRef.current.hadScroll = true;
    };

    document.addEventListener("pointerdown", markInteraction, true);
    document.addEventListener("keydown", markInteraction, true);
    document.addEventListener("wheel", markScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", markScroll, {
      capture: true,
      passive: true,
    });

    removeEngagementListenersRef.current = () => {
      document.removeEventListener("pointerdown", markInteraction, true);
      document.removeEventListener("keydown", markInteraction, true);
      document.removeEventListener("wheel", markScroll, true);
      document.removeEventListener("touchmove", markScroll, true);
    };
  }, [detachEngagementListeners]);

  useEffect(() => {
    const latestCache = getInitialCacheEntry(repo);
    setReadmeImage(latestCache.readmeImage || null);
    setKoDescription(latestCache.koDescription || "번역 중...");
    setRenderedReadmeHtml(latestCache.renderedReadmeHtml || "");
    setReadmeMarkdown(latestCache.readmeMarkdown || "");
    setReadmeFallback(latestCache.readmeFallback || "");
    setReadmeLoaded(latestCache.heavyLoaded || false);
    setIsKorean(true);
    lightLoadedRef.current = latestCache.lightLoaded || false;
    heavyLoadedRef.current = latestCache.heavyLoaded || false;
    lightLoadingRef.current = false;
    heavyLoadingRef.current = false;
    viewStartTime.current = null;
    trackingActiveRef.current = false;
    resetEngagement();
    detachEngagementListeners();
  }, [detachEngagementListeners, repoKey, repo, resetEngagement]);

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
        console.error("카드 기본 데이터 로드 에러:", error.message);
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
          setReadmeMarkdown(latestCache.readmeMarkdown || "");
          setReadmeFallback(latestCache.readmeFallback || "");
          setReadmeLoaded(true);
          heavyLoadedRef.current = true;
          return;
        }

        const imagePromise = getReadmeImage(
          repo.owner.login,
          repo.name,
          repo.default_branch,
        );
        const readmePromise = getReadmePreviewRaw(
          repo.owner.login,
          repo.name,
          repo.default_branch,
        );

        const [imageUrl, readmeContent] = await Promise.all([
          imagePromise,
          readmePromise,
        ]);

        if (cancelled) return;

        const nextReadmeMarkdown = prepareReadmeForLocalRender(
          readmeContent || "",
        );
        const nextFallback = nextReadmeMarkdown
          ? ""
          : "README 데이터를 찾을 수 없습니다.";

        setReadmeImage(imageUrl || null);
        setRenderedReadmeHtml("");
        setReadmeMarkdown(nextReadmeMarkdown);
        setReadmeFallback(nextFallback);
        setReadmeLoaded(true);
        setRepoCacheEntry(repo, {
          readmeImage: imageUrl || null,
          renderedReadmeHtml: "",
          readmeMarkdown: nextReadmeMarkdown,
          readmeFallback: nextFallback,
          heavyLoaded: true,
        });
        heavyLoadedRef.current = true;
      } catch (error) {
        console.error("카드 상세 데이터 로드 에러:", error.message);
        if (!cancelled) {
          setReadmeImage(null);
          setRenderedReadmeHtml("");
          setReadmeMarkdown("");
          setReadmeFallback("README 미리보기를 불러오지 못했습니다.");
          setReadmeLoaded(true);
        }
        setRepoCacheEntry(repo, {
          readmeImage: null,
          renderedReadmeHtml: "",
          readmeMarkdown: "",
          readmeFallback: "README 미리보기를 불러오지 못했습니다.",
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
          if (!trackingActiveRef.current) {
            trackingActiveRef.current = true;
            resetEngagement();
            attachEngagementListeners();
            viewStartTime.current = Date.now();
          }
        } else if (viewStartTime.current && trackingActiveRef.current) {
          trackingActiveRef.current = false;
          detachEngagementListeners();
          const dwellMs = Date.now() - viewStartTime.current;
          recordView(repo, {
            dwellMs,
            hadScroll: engagementRef.current.hadScroll,
            hadInteraction: engagementRef.current.hadInteraction,
          });
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
      detachEngagementListeners();
      observer.disconnect();
    };
  }, [
    attachEngagementListeners,
    detachEngagementListeners,
    onVisible,
    repo,
    repoKey,
    resetEngagement,
  ]);

  const displayDescription = isKorean
    ? koDescription
    : repo.description || "No description provided.";

  return (
    <div
      ref={cardRef}
      className="relative flex h-[100dvh] min-h-[100dvh] w-full min-w-0 max-w-full snap-start flex-col overflow-hidden bg-[#0d1117]"
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img
          src={readmeImage || ogImageUrl}
          alt="background blur"
          className="w-full h-full object-cover blur-3xl scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117]/80 via-[#0d1117]/95 to-[#0d1117]" />
      </div>

      <div className="relative z-10 flex h-full w-full min-w-0 max-w-full flex-col pt-14 pb-24 sm:pt-10 sm:pb-10 md:pt-8 md:pb-6">
        <div className="flex shrink-0 items-start justify-between px-4 pb-3 sm:px-5 sm:pb-4 md:pb-3">
          <div className="min-w-0 max-w-[calc(100%-64px)] sm:pr-10 md:pr-8">
            <div
              className="mb-2 flex min-w-0 max-w-full items-center gap-2 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                window.open(repo.owner.html_url, "_blank");
              }}
            >
              <img
                src={repo.owner.avatar_url}
                className="h-5 w-5 rounded-full border border-gray-600 sm:h-6 sm:w-6"
                alt="avatar"
              />
              <span className="truncate text-[11px] font-semibold tracking-wide text-gray-400 sm:text-xs">
                @{repo.owner.login}
              </span>
            </div>
            <h1 className="min-w-0 max-w-full break-words text-lg font-black leading-tight text-white sm:text-2xl md:text-xl">
              {repo.name}
            </h1>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsKorean(!isKorean);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-gray-200 transition-colors hover:bg-white/20 sm:px-3 sm:text-xs"
            title="설명 언어 전환"
          >
            <Languages className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {isKorean ? "KR" : "EN"}
          </button>
        </div>

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden px-4 sm:px-5">
          <div className="mb-2.5 w-full min-w-0 max-w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm sm:mb-4 sm:p-4 md:mb-3 md:p-3">
            <h3 className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-400 sm:mb-2 md:mb-1.5">
              <AlignLeft className="w-3 h-3" /> Description
            </h3>
            <p
              className="block w-full min-w-0 max-w-full overflow-hidden whitespace-normal break-all text-[11px] leading-relaxed text-gray-200 sm:text-sm sm:break-words sm:line-clamp-3 md:text-[13px] md:leading-snug"
              style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
            >
              {displayDescription}
            </p>
          </div>

          {readmeImage && (
            <div className="mb-2.5 flex shrink-0 justify-center overflow-hidden rounded-xl border border-white/10 bg-black/50 sm:mb-4 md:mb-3">
              <img
                src={readmeImage}
                alt="Preview"
                className="h-auto max-h-20 w-full object-contain sm:max-h-32 md:max-h-24"
              />
            </div>
          )}

          <div className="relative min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/40 p-2.5 backdrop-blur-sm sm:p-4 md:p-3">
            <h3 className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-purple-400 sm:mb-3 md:mb-2">
              <FileText className="w-3 h-3" /> README Snippet
            </h3>

            {renderedReadmeHtml ? (
              <div className="relative h-full min-w-0 max-w-full overflow-hidden">
                <div
                  className="readme-rendered min-w-0 max-w-full overflow-hidden break-words text-gray-300 text-[11px] leading-relaxed sm:text-xs md:leading-snug"
                  dangerouslySetInnerHTML={{ __html: renderedReadmeHtml }}
                />
              </div>
            ) : readmeMarkdown ? (
              <div className="relative h-full min-w-0 max-w-full overflow-hidden">
                <div className="readme-rendered min-w-0 max-w-full overflow-hidden break-words text-gray-300 text-[11px] leading-relaxed sm:text-xs md:leading-snug">
                  <ReactMarkdown>{readmeMarkdown}</ReactMarkdown>
                </div>
              </div>
            ) : !readmeLoaded ? (
              <div
                className="block w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all text-[11px] leading-relaxed text-gray-300 sm:text-xs md:leading-snug"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                README 불러오는 중...
              </div>
            ) : (
              <div
                className="block w-full min-w-0 max-w-full overflow-hidden whitespace-pre-wrap break-all text-[11px] leading-relaxed text-gray-400 sm:text-xs md:leading-snug"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                {readmeFallback || "README 데이터를 찾을 수 없습니다."}
              </div>
            )}

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 rounded-b-xl bg-gradient-to-t from-[#151a22] to-transparent sm:h-24 md:h-16">
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 pr-20 pt-2.5 sm:px-5 sm:pt-4 sm:pr-20 md:pt-3 md:pr-24">
          <div className="mb-3 flex flex-wrap gap-1.5 sm:gap-2 md:mb-2">
            {repo.language && (
              <span className="rounded border border-blue-500/30 bg-blue-500/20 px-2 py-1 text-[10px] font-bold text-blue-400">
                {repo.language}
              </span>
            )}
            {repo.topics?.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-gray-400"
              >
                #{topic}
              </span>
            ))}
          </div>

          <div
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-700 bg-black/80 p-2 transition hover:bg-gray-900 sm:gap-3 sm:p-3 md:p-2.5"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(
                `git clone https://github.com/${repo.full_name}`,
              );
              alert("클론 명령어가 복사되었습니다!");
            }}
          >
            <Terminal className="h-4 w-4 shrink-0 text-green-400" />
            <code className="min-w-0 truncate text-[11px] font-mono text-green-400 sm:text-xs">
              git clone https://github.com/{repo.full_name}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChortCard;
