import React, { useState, useEffect, useRef } from "react";
import { Terminal, FileText, AlignLeft, Languages } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  getReadmeImage,
  getReadmeSummary,
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
      originalReadme: "",
      koReadme: "",
      readmeImage: null,
      commentCount: null,
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
  const cached = getInitialCacheEntry(repo);

  const [readmeImage, setReadmeImage] = useState(cached.readmeImage || null);
  const [originalReadme, setOriginalReadme] = useState(
    cached.originalReadme || "",
  );
  const [koDescription, setKoDescription] = useState(
    cached.koDescription || "번역 중...",
  );
  const [koReadme, setKoReadme] = useState(
    cached.koReadme || "README 불러오는 중...",
  );
  const [isKorean, setIsKorean] = useState(true);

  const cardRef = useRef(null);
  const hasLoadedLightRef = useRef(false);
  const hasLoadedHeavyRef = useRef(cached.heavyLoaded || false);
  const viewStartTime = useRef(null);
  const hasRecordedSignal = useRef(false);

  const ogImageUrl = `https://opengraph.githubassets.com/1/${repo.full_name}`;

  useEffect(() => {
    let isMounted = true;

    const loadLightData = async () => {
      if (hasLoadedLightRef.current) return;
      hasLoadedLightRef.current = true;

      try {
        if (!cached.koDescription) {
          const translatedDesc = await translateToKorean(
            repo.description || "",
          );
          if (!isMounted) return;

          setKoDescription(translatedDesc || "설명이 없습니다.");
          setRepoCacheEntry(repo, {
            koDescription: translatedDesc || "설명이 없습니다.",
          });
        } else {
          setKoDescription(cached.koDescription);
        }

        if (cached.commentCount !== null) {
          onCommentsCountChange?.(repo.id, cached.commentCount);
        } else {
          const totalCount = await getCommentCount(repo.id);
          if (!isMounted) return;

          onCommentsCountChange?.(repo.id, totalCount);
          setRepoCacheEntry(repo, { commentCount: totalCount });
        }
      } catch (error) {
        console.error("카드 기본 데이터 로드 에러:", error);
        if (isMounted && !cached.koDescription) {
          setKoDescription(repo.description || "설명이 없습니다.");
        }
      }
    };

    const loadHeavyData = async () => {
      if (hasLoadedHeavyRef.current) return;
      hasLoadedHeavyRef.current = true;

      try {
        if (
          cached.originalReadme &&
          cached.koReadme &&
          Object.prototype.hasOwnProperty.call(cached, "readmeImage")
        ) {
          if (!isMounted) return;

          setOriginalReadme(cached.originalReadme);
          setKoReadme(cached.koReadme);
          setReadmeImage(cached.readmeImage || null);
          return;
        }

        const [imageUrl, readmeText] = await Promise.all([
          getReadmeImage(repo.owner.login, repo.name, repo.default_branch),
          getReadmeSummary(repo.owner.login, repo.name, repo.default_branch),
        ]);

        if (!isMounted) return;

        const safeReadme = readmeText || "";
        const translatedReadme = safeReadme
          ? await translateToKorean(safeReadme)
          : "README 데이터를 찾을 수 없습니다.";

        if (!isMounted) return;

        setReadmeImage(imageUrl || null);
        setOriginalReadme(safeReadme);
        setKoReadme(translatedReadme);

        setRepoCacheEntry(repo, {
          readmeImage: imageUrl || null,
          originalReadme: safeReadme,
          koReadme: translatedReadme,
          heavyLoaded: true,
        });
      } catch (error) {
        console.error("카드 상세 데이터 로드 에러:", error);

        if (!isMounted) return;

        setKoReadme((prev) =>
          prev === "README 불러오는 중..."
            ? "README 데이터를 찾을 수 없습니다."
            : prev,
        );

        setRepoCacheEntry(repo, {
          readmeImage: null,
          originalReadme: "",
          koReadme: "README 데이터를 찾을 수 없습니다.",
          heavyLoaded: true,
        });
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          onVisible?.(repo);
          loadHeavyData();
        }

        if (entry.isIntersecting) {
          loadLightData();
        }

        if (entry.isIntersecting) {
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
      },
      { threshold: [0.1, 0.6] },
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [repo, onVisible, onCommentsCountChange, cached]);

  const displayDescription = isKorean
    ? koDescription
    : repo.description || "No description provided.";

  const displayReadme = isKorean
    ? koReadme
    : originalReadme || "No README data found.";

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

            <div className="text-gray-300 text-xs leading-relaxed break-words break-keep">
              <ReactMarkdown
                components={{
                  h1: ({ children, ...props }) => (
                    <h1
                      className="text-lg font-bold text-white mt-2 mb-2 border-b border-gray-700 pb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h1>
                  ),
                  h2: ({ children, ...props }) => (
                    <h2
                      className="text-md font-bold text-gray-100 mt-2 mb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ children, ...props }) => (
                    <h3
                      className="text-sm font-bold text-gray-200 mt-1 mb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h3>
                  ),
                  p: (props) => <p className="mb-2" {...props} />,
                  ul: (props) => (
                    <ul
                      className="list-disc pl-5 mb-2 text-gray-400"
                      {...props}
                    />
                  ),
                  li: (props) => <li className="mb-1" {...props} />,
                  code({ inline, children, ...props }) {
                    return inline ? (
                      <code
                        className="bg-gray-800 text-red-300 px-1.5 py-0.5 rounded-md text-[10px] font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <div className="relative mb-2">
                        <pre className="bg-[#161b22] border border-gray-700 p-3 rounded-lg overflow-hidden text-[10px] font-mono text-green-400">
                          <code {...props}>{children}</code>
                        </pre>
                      </div>
                    );
                  },
                }}
              >
                {displayReadme}
              </ReactMarkdown>
            </div>

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
    </div>
  );
};

export default ChortCard;
