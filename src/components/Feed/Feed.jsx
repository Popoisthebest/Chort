// src/components/Feed/Feed.jsx

import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  Star,
  Share2,
  Code,
  MessageCircle,
  SlidersHorizontal,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import ChortCard from "../Card/ChortCard";
import CommentsPanel from "../Comments/CommentsPanel";
import { useFeed } from "../../hooks/useFeed";
import {
  getStarredRepos,
  invalidateStarredCache,
  starRepo,
  unstarRepo,
} from "../../api/github";
import {
  recordCommentOpen,
  recordGithubOpen,
  recordStar,
} from "../../utils/userProfile";
import { LoginModalContext } from "../../App";

const DEFAULT_LANG_FILTERS = [
  "전체",
  "Python",
  "TypeScript",
  "Rust",
  "Go",
  "Java",
  "C++",
];
const CUSTOM_LANGUAGES_KEY = "chort_custom_languages";
const MAX_CUSTOM_LANGUAGES = 20;

const PERIOD_FILTERS = [
  { label: "오늘", value: "daily" },
  { label: "이번주", value: "weekly" },
  { label: "이번달", value: "monthly" },
];

const normalizeLanguageInput = (value) => {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
};

const mergeLanguageFilters = (customLanguages = []) => {
  const merged = [];
  const seen = new Set();

  [...DEFAULT_LANG_FILTERS, ...customLanguages].forEach((language) => {
    const normalized = normalizeLanguageInput(language);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    merged.push(normalized);
  });

  return merged;
};

const loadCustomLanguages = () => {
  try {
    const raw = localStorage.getItem(CUSTOM_LANGUAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? mergeLanguageFilters(parsed).filter(
          (language) =>
            !DEFAULT_LANG_FILTERS.some(
              (defaultLanguage) =>
                defaultLanguage.toLowerCase() === language.toLowerCase(),
            ),
        )
      : [];
  } catch {
    return [];
  }
};

const saveCustomLanguages = (languages) => {
  try {
    localStorage.setItem(CUSTOM_LANGUAGES_KEY, JSON.stringify(languages));
  } catch {
    // ignore storage errors
  }
};

function LanguageFilterControls({
  languages,
  customLanguages,
  selectedLanguage,
  inputValue,
  onInputChange,
  onSelect,
  onAdd,
  onRemove,
}) {
  const customLanguageSet = useMemo(
    () => new Set(customLanguages.map((language) => language.toLowerCase())),
    [customLanguages],
  );

  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
        언어
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {languages.map((lang) => {
          const isCustom = customLanguageSet.has(lang.toLowerCase());
          return (
            <span
              key={lang}
              className={`inline-flex items-center rounded-full text-xs font-bold transition ${
                selectedLanguage === lang
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-gray-400 hover:bg-white/20"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(lang)}
                className="px-3 py-1 whitespace-nowrap"
              >
                {lang}
              </button>
              {isCustom && (
                <button
                  type="button"
                  onClick={() => onRemove(lang)}
                  className="mr-1 rounded-full p-1 text-gray-300 transition hover:bg-white/15 hover:text-white"
                  title={`${lang} 삭제`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <form onSubmit={onAdd} className="flex min-w-0 gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="언어 추가"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs text-white outline-none placeholder:text-gray-600 focus:border-blue-500"
        />
        <button
          type="submit"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          disabled={!normalizeLanguageInput(inputValue)}
          title="언어 추가"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default function Feed() {
  const [periodFilter, setPeriodFilter] = useState("monthly");
  const [langFilter, setLangFilter] = useState("전체");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [customLanguageInput, setCustomLanguageInput] = useState("");
  const [customLanguages, setCustomLanguages] = useState(loadCustomLanguages);
  const { repos, loading, error, fetchMore, resetFeed } = useFeed(
    periodFilter,
    langFilter,
  );
  const { user, openLoginModal } = useContext(LoginModalContext);

  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [starredRepoIds, setStarredRepoIds] = useState({});
  const [commentCounts, setCommentCounts] = useState({});

  const loaderRef = useRef(null);
  const feedScrollRef = useRef(null);
  const lastTapRef = useRef({}); // 더블탭 감지용

  const languageFilters = useMemo(
    () => mergeLanguageFilters(customLanguages),
    [customLanguages],
  );

  const filteredRepos = useMemo(() => {
    if (langFilter === "전체") return repos;
    return repos.filter(
      (repo) => repo.language?.toLowerCase() === langFilter.toLowerCase(),
    );
  }, [langFilter, repos]);

  const activeRepo = useMemo(() => {
    return (
      filteredRepos.find((repo) => repo.id === currentRepo?.id) ||
      filteredRepos[0] ||
      null
    );
  }, [currentRepo?.id, filteredRepos]);

  useEffect(() => {
    let cancelled = false;

    const syncStarred = async () => {
      const localRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];
      const localMap = {};
      localRepos.forEach((repo) => {
        localMap[repo.id] = true;
      });

      if (!user) {
        if (!cancelled) {
          setStarredRepoIds(localMap);
        }
        return;
      }

      try {
        const starred = await getStarredRepos();
        if (cancelled) return;

        const starredMap = {};
        starred.forEach((repo) => {
          starredMap[repo.id] = true;
        });
        localStorage.setItem("chort_saved", JSON.stringify(starred));
        setStarredRepoIds(starredMap);
      } catch (error) {
        if (!cancelled) {
          setStarredRepoIds(localMap);
        }
      }
    };

    syncStarred();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (filteredRepos.length === 0) {
      setCurrentRepo(null);
      return;
    }

    if (!currentRepo) {
      setCurrentRepo(filteredRepos[0]);
      return;
    }

    const stillExists = filteredRepos.some((repo) => repo.id === currentRepo.id);
    if (!stillExists) {
      setCurrentRepo(filteredRepos[0]);
    }
  }, [filteredRepos, currentRepo]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          fetchMore();
        }
      },
      { threshold: 1.0 },
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [fetchMore, loading]);

  useEffect(() => {
    if (!activeRepo || loading || error) return;

    const currentIndex = filteredRepos.findIndex(
      (repo) => repo.id === activeRepo.id,
    );
    if (currentIndex < 0) return;

    const remainingRepos = filteredRepos.length - currentIndex - 1;
    if (remainingRepos <= 3) {
      fetchMore();
    }
  }, [activeRepo, filteredRepos, loading, error, fetchMore]);

  const handleCommentsCountChange = useCallback((repoId, count) => {
    setCommentCounts((prev) => {
      if (prev[repoId] === count) {
        return prev;
      }
      return { ...prev, [repoId]: count };
    });
  }, []);

  const toggleStar = useCallback(async (repo) => {
    if (!repo) return;

    // 로그인 확인
    if (!user) {
      openLoginModal("Star를 누르려면 GitHub 로그인이 필요합니다.");
      return;
    }

    const savedRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];
    const isStarred = !!starredRepoIds[repo.id];

    if (isStarred) {
      setStarredRepoIds((prev) => ({ ...prev, [repo.id]: false }));
      const success = await unstarRepo(repo.owner.login, repo.name);

      if (success) {
        invalidateStarredCache();
        const newSaved = savedRepos.filter((r) => r.id !== repo.id);
        localStorage.setItem("chort_saved", JSON.stringify(newSaved));
      } else {
        setStarredRepoIds((prev) => ({ ...prev, [repo.id]: true }));
      }
    } else {
      setStarredRepoIds((prev) => ({ ...prev, [repo.id]: true }));
      const success = await starRepo(repo.owner.login, repo.name);

      if (success) {
        invalidateStarredCache();
        const savedRepos =
          JSON.parse(localStorage.getItem("chort_saved")) || [];
        const exists = savedRepos.some((r) => r.id === repo.id);

        if (!exists) {
          // [수정] 새롭게 저장되는 레포를 배열의 맨 앞(0번 인덱스)에 추가
          const newSaved = [repo, ...savedRepos];
          localStorage.setItem("chort_saved", JSON.stringify(newSaved));
        }
        recordStar(repo);
      } else {
        setStarredRepoIds((prev) => ({ ...prev, [repo.id]: false }));
      }
    }
  }, [openLoginModal, starredRepoIds, user]);

  const handleShare = (repo) => {
    if (!repo) return;
    navigator.clipboard.writeText(`https://github.com/${repo.full_name}`);
    alert("링크가 복사되었습니다! 🚀");
  };

  const handleCommentsOpen = (repo) => {
    setCurrentRepo(repo);
    setIsCommentsOpen(true);
    recordCommentOpen(repo);
  };

  const goToNextRepo = useCallback(() => {
    if (!activeRepo || filteredRepos.length === 0 || !feedScrollRef.current) {
      return;
    }

    const currentIndex = filteredRepos.findIndex(
      (repo) => repo.id === activeRepo.id,
    );
    if (currentIndex < 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= filteredRepos.length) return;

    const nextElement = feedScrollRef.current.querySelector(
      `[data-feed-index="${nextIndex}"]`,
    );
    nextElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeRepo, filteredRepos]);

  const isStarred = activeRepo ? !!starredRepoIds[activeRepo.id] : false;

  // 더블탭으로 Star 등록
  const handleDoubleTap = useCallback(
    (repo) => {
      const now = Date.now();
      const last = lastTapRef.current[repo.id] || 0;
      if (now - last < 300) {
        // 더블탭 감지 → Star 토글
        toggleStar(repo);
      }
      lastTapRef.current[repo.id] = now;
    },
    [toggleStar],
  );

  // 댓글 패널에서 발생한 갯수 변경을 Feed state에 즉시 반영하는 콜백
  const handleCommentsUpdate = useCallback((repoId, count) => {
    setCommentCounts((prev) => ({
      ...prev,
      [repoId]: count,
    }));
  }, []);

  const handleAddCustomLanguage = useCallback((event) => {
    event.preventDefault();
    const nextLanguage = normalizeLanguageInput(customLanguageInput);
    if (!nextLanguage) return;

    const allLanguages = mergeLanguageFilters(customLanguages);
    const alreadyExists = allLanguages.some(
      (language) => language.toLowerCase() === nextLanguage.toLowerCase(),
    );

    if (alreadyExists) {
      setLangFilter(
        allLanguages.find(
          (language) => language.toLowerCase() === nextLanguage.toLowerCase(),
        ) || nextLanguage,
      );
      setCustomLanguageInput("");
      return;
    }

    setCustomLanguages((prev) => {
      const updated = [...prev, nextLanguage].slice(-MAX_CUSTOM_LANGUAGES);
      saveCustomLanguages(updated);
      return updated;
    });
    setLangFilter(nextLanguage);
    setCustomLanguageInput("");
  }, [customLanguageInput, customLanguages]);

  const handleRemoveCustomLanguage = useCallback((languageToRemove) => {
    setCustomLanguages((prev) => {
      const updated = prev.filter(
        (language) =>
          language.toLowerCase() !== languageToRemove.toLowerCase(),
      );
      saveCustomLanguages(updated);
      return updated;
    });

    setLangFilter((current) =>
      current.toLowerCase() === languageToRemove.toLowerCase() ? "전체" : current,
    );
  }, []);

  useEffect(() => {
    const exists = languageFilters.some(
      (language) => language.toLowerCase() === langFilter.toLowerCase(),
    );
    if (!exists) setLangFilter("전체");
  }, [langFilter, languageFilters]);

  return (
    <div className="relative flex h-full w-full min-w-0 overflow-x-hidden bg-black gap-0">
      <div className="absolute left-4 top-4 z-30 hidden lg:flex lg:flex-col lg:items-start lg:gap-3">
        <button
          onClick={() => setIsFilterOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-bold text-white backdrop-blur-md transition hover:bg-black/85"
        >
          {isFilterOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
          필터
        </button>

        {isFilterOpen && (
          <div className="w-[min(320px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-black/80 p-4 backdrop-blur-md shadow-2xl">
            <div className="mb-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                기간
              </p>
              <div className="flex flex-wrap gap-2">
                {PERIOD_FILTERS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriodFilter(p.value)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      periodFilter === p.value
                        ? "bg-purple-600 text-white"
                        : "bg-white/10 text-gray-400 hover:bg-white/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <LanguageFilterControls
              languages={languageFilters}
              customLanguages={customLanguages}
              selectedLanguage={langFilter}
              inputValue={customLanguageInput}
              onInputChange={setCustomLanguageInput}
              onSelect={setLangFilter}
              onAdd={handleAddCustomLanguage}
              onRemove={handleRemoveCustomLanguage}
            />
          </div>
        )}
      </div>

      {isFilterOpen && (
        <div className="absolute inset-x-4 bottom-24 z-40 rounded-2xl border border-white/10 bg-black/85 p-4 backdrop-blur-md shadow-2xl lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold tracking-wider text-white">필터</p>
            <button
              onClick={() => setIsFilterOpen(false)}
              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-gray-300 transition hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              기간
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_FILTERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriodFilter(p.value)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    periodFilter === p.value
                      ? "bg-purple-600 text-white"
                      : "bg-white/10 text-gray-400 hover:bg-white/20"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <LanguageFilterControls
            languages={languageFilters}
            customLanguages={customLanguages}
            selectedLanguage={langFilter}
            inputValue={customLanguageInput}
            onInputChange={setCustomLanguageInput}
            onSelect={setLangFilter}
            onAdd={handleAddCustomLanguage}
            onRemove={handleRemoveCustomLanguage}
          />
        </div>
      )}

      <div className="relative flex min-w-0 flex-1 overflow-hidden gap-0">
        <div
          className="flex min-w-0 flex-1 justify-center overflow-x-hidden"
          onClick={goToNextRepo}
        >
          <div
            ref={feedScrollRef}
            className="h-full w-full min-w-0 max-w-[500px] overflow-x-hidden overflow-y-scroll snap-y snap-mandatory border-r border-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            {filteredRepos.map((repo, index) => (
              <div
                key={`${repo.id}-${index}`}
                data-feed-index={index}
                onPointerDown={() => handleDoubleTap(repo)}
              >
                <ChortCard
                  repo={repo}
                  onVisible={setCurrentRepo}
                  onCommentsCountChange={handleCommentsCountChange}
                />
              </div>
            ))}

            {error && (
              <div className="h-20 flex flex-col items-center justify-center bg-black gap-2">
                <p className="text-red-400 text-xs text-center px-4">{error}</p>
                <button
                  onClick={resetFeed}
                  className="text-xs text-purple-400 underline"
                >
                  다시 시도
                </button>
              </div>
            )}

            <div
              ref={loaderRef}
              className="h-20 flex items-center justify-center bg-black"
            >
              {loading && !error && (
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </div>
        </div>
      </div>
      {activeRepo && (
        <>
          <div className="absolute bottom-28 right-3 z-30 flex flex-col items-center gap-5 lg:hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsFilterOpen((prev) => !prev);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              {isFilterOpen ? (
                <X className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
              ) : (
                <SlidersHorizontal className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
              )}
              <span className="mt-1 text-[10px] font-bold tracking-wider text-white">
                Filter
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleStar(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <Star
                className={`h-7 w-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] ${
                  isStarred ? "fill-yellow-400 text-yellow-400" : "text-white"
                }`}
              />
              <span className="mt-1 text-[10px] font-bold tracking-wider text-white">
                {(activeRepo.stargazers_count / 1000).toFixed(1)}k
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCommentsOpen(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <MessageCircle className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
              <span className="mt-1 text-[10px] font-bold tracking-wider text-white">
                {commentCounts[activeRepo.id] || 0}
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <Share2 className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
              <span className="mt-1 text-[10px] font-bold tracking-wider text-white">
                Share
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                recordGithubOpen(activeRepo);
                window.open(
                  `https://github.com/${activeRepo.full_name}`,
                  "_blank",
                );
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <Code className="h-7 w-7 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" />
              <span className="mt-1 text-[10px] font-bold tracking-wider text-white">
                Repo
              </span>
            </button>
          </div>

          <div className="absolute bottom-24 z-30 hidden lg:flex lg:left-[calc(50%+265px)] lg:flex-col lg:items-center lg:gap-5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleStar(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <div
                className={`rounded-full p-3 backdrop-blur-md transition-all ${
                  isStarred
                    ? "border border-yellow-400/50 bg-yellow-400/20"
                    : "border border-white/10 bg-black/50"
                }`}
              >
                <Star
                  className={`h-6 w-6 ${
                    isStarred ? "fill-yellow-400 text-yellow-400" : "text-white"
                  }`}
                />
              </div>
              <span className="mt-1.5 text-[10px] font-bold tracking-wider text-white">
                {(activeRepo.stargazers_count / 1000).toFixed(1)}k
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCommentsOpen(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <div className="rounded-full border border-white/10 bg-black/50 p-3">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <span className="mt-1.5 text-[10px] font-bold tracking-wider text-white">
                {commentCounts[activeRepo.id] || 0}
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleShare(activeRepo);
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <div className="rounded-full border border-white/10 bg-black/50 p-3">
                <Share2 className="h-6 w-6 text-white" />
              </div>
              <span className="mt-1.5 text-[10px] font-bold tracking-wider text-white">
                Share
              </span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                recordGithubOpen(activeRepo);
                window.open(
                  `https://github.com/${activeRepo.full_name}`,
                  "_blank",
                );
              }}
              className="flex flex-col items-center transition-transform active:scale-90"
            >
              <div className="rounded-full border border-white/10 bg-black/50 p-3">
                <Code className="h-6 w-6 text-white" />
              </div>
              <span className="mt-1.5 text-[10px] font-bold tracking-wider text-white">
                Repo
              </span>
            </button>
          </div>
        </>
      )}

      {isCommentsOpen && activeRepo && (
        <div className="absolute inset-0 z-40 sm:inset-y-0 sm:left-auto">
          <CommentsPanel
            repo={activeRepo}
            onClose={() => setIsCommentsOpen(false)}
            onCountChange={handleCommentsUpdate} // 실시간 연동 핵심
          />
        </div>
      )}
    </div>
  );
}
