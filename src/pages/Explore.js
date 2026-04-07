import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Star,
  GitFork,
  Sparkles,
  TrendingUp,
  ArrowLeft,
  X,
  ExternalLink,
} from "lucide-react";
import { searchRepos, getTrendingRepos } from "../api/github";
import { getProfile } from "../utils/userProfile";
import { rankRepos } from "../utils/algorithm";

const DEFAULT_TOPICS = ["React", "Python", "AI", "Web3", "TypeScript"];
const FALLBACK_AVATAR =
  "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";

export default function Explore() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState([]);
  const [recommendedRepos, setRecommendedRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);

  const resetSearch = () => {
    setKeyword("");
    setResults([]);
    setHasSearched(false);
    setLoading(false);
  };

  const getOwnerAvatar = (repo) => {
    return repo?.owner?.avatar_url || FALLBACK_AVATAR;
  };

  const getOwnerLogin = (repo) => {
    return repo?.owner?.login || "unknown";
  };

  const getCardHeightClass = (repo, index) => {
    const descLength = repo?.description?.length || 0;
    const topicCount = repo?.topics?.length || 0;

    if (descLength > 120 || topicCount >= 3 || index % 7 === 0) {
      return "min-h-[260px]";
    }
    if (descLength > 70 || index % 5 === 0) {
      return "min-h-[220px]";
    }
    return "min-h-[180px]";
  };

  const handleAvatarError = (e) => {
    e.currentTarget.src = FALLBACK_AVATAR;
  };

  const openRepoDetail = (repo) => {
    setSelectedRepo(repo);
  };

  const closeRepoDetail = () => {
    setSelectedRepo(null);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const data = await searchRepos(keyword);
      setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("검색 실패:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTagClick = async (tag) => {
    setKeyword(tag);
    setLoading(true);
    setHasSearched(true);

    try {
      const data = await searchRepos(tag);
      setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("태그 검색 실패:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadRecommendedRepos = async () => {
      setLoadingRecommended(true);

      try {
        const pages = [1, 2, 3];
        const fetched = await Promise.all(
          pages.map((page) => getTrendingRepos(page)),
        );

        const validResults = fetched.filter(
          (pageRepos) => Array.isArray(pageRepos) && !pageRepos?.error,
        );

        const mergedRepos = validResults.flat();
        const rankedRepos = rankRepos(mergedRepos);

        const deduped = [];
        const seen = new Set();

        for (const repo of rankedRepos) {
          if (!seen.has(repo.id)) {
            seen.add(repo.id);
            deduped.push(repo);
          }
        }

        setRecommendedRepos(deduped.slice(0, 24));
      } catch (error) {
        console.error("추천 repo 로드 실패:", error);
        setRecommendedRepos([]);
      } finally {
        setLoadingRecommended(false);
      }
    };

    loadRecommendedRepos();
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        closeRepoDetail();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRepo]);

  const personalizedTopics = useMemo(() => {
    const profile = getProfile();

    const topicEntries = Object.entries(profile.topics || {})
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);

    const languageEntries = Object.entries(profile.languages || {})
      .sort((a, b) => b[1] - a[1])
      .map(([language]) => language);

    const merged = [...topicEntries, ...languageEntries, ...DEFAULT_TOPICS];

    const unique = [];
    const seen = new Set();

    for (const item of merged) {
      if (!item) continue;
      const normalized = String(item).trim();
      const key = normalized.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(normalized);
      }
    }

    return unique.slice(0, 12);
  }, [recommendedRepos]);

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20 border-b border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          {hasSearched && (
            <button
              onClick={resetSearch}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 transition shrink-0"
              aria-label="뒤로가기"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-3xl font-bold">Explore</h1>
        </div>

        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="레포지토리 검색 (예: react, python)"
            className="w-full bg-gray-800 text-white pl-12 pr-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-[#A259FF] transition"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <button type="submit" className="hidden">
            검색
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {!hasSearched && (
          <div className="mt-4 space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-gray-200">
                  관심 있을 만한 주제
                </h2>
              </div>

              <div className="flex gap-2 flex-wrap">
                {personalizedTopics.map((topic) => (
                  <button
                    key={topic}
                    onClick={() => handleTagClick(topic)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 transition rounded-full text-sm font-medium border border-gray-700"
                  >
                    #{topic}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-gray-200">
                  당신이 좋아할 레포
                </h2>
              </div>

              {loadingRecommended ? (
                <div className="flex flex-col items-center justify-center mt-16 opacity-70">
                  <div className="w-8 h-8 border-4 border-[#2F80ED] border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-sm text-gray-400">
                    추천 레포 불러오는 중...
                  </p>
                </div>
              ) : recommendedRepos.length === 0 ? (
                <div className="text-gray-500 text-sm">
                  아직 추천할 레포가 없습니다.
                </div>
              ) : (
                <div className="columns-2 gap-4 [column-fill:_balance]">
                  {recommendedRepos.map((repo, index) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => openRepoDetail(repo)}
                      className="mb-4 w-full break-inside-avoid text-left bg-black border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition group"
                    >
                      <div
                        className={`p-4 flex flex-col justify-between ${getCardHeightClass(repo, index)}`}
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <img
                              src={getOwnerAvatar(repo)}
                              alt="avatar"
                              onError={handleAvatarError}
                              className="w-7 h-7 rounded-full object-cover bg-gray-800 shrink-0"
                            />
                            <span className="text-xs text-gray-400 truncate">
                              @{getOwnerLogin(repo)}
                            </span>
                          </div>

                          <h3 className="font-bold text-base mb-2 text-blue-400 break-words group-hover:text-blue-300 transition">
                            {repo.name}
                          </h3>

                          <p className="text-sm text-gray-400 leading-snug break-words">
                            {repo.description || "설명이 없는 레포입니다."}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2 items-center text-xs font-bold text-gray-300">
                          <span className="flex items-center gap-1">
                            <Star className="w-4 h-4 text-yellow-400" />
                            {(repo.stargazers_count / 1000).toFixed(1)}k
                          </span>

                          <span className="flex items-center gap-1">
                            <GitFork className="w-4 h-4" />
                            {repo.forks_count}
                          </span>

                          {repo.language && (
                            <span className="text-purple-400 border border-purple-400/30 px-1.5 py-0.5 rounded">
                              {repo.language}
                            </span>
                          )}

                          {repo.topics?.slice(0, 2).map((topic) => (
                            <span
                              key={`${repo.id}-${topic}`}
                              className="text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded"
                            >
                              #{topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center mt-20 opacity-70">
            <div className="w-8 h-8 border-4 border-[#2F80ED] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p>검색 중...</p>
          </div>
        )}

        {!loading && hasSearched && results.length > 0 && (
          <div className="flex flex-col gap-4 mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">
                총 {results.length}개의 결과를 찾았습니다.
              </p>
              <button
                onClick={resetSearch}
                className="text-sm text-purple-400 hover:text-purple-300 transition"
              >
                뒤로가기
              </button>
            </div>

            {results.map((repo) => (
              <div
                key={repo.id}
                onClick={() => openRepoDetail(repo)}
                className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={getOwnerAvatar(repo)}
                    alt="avatar"
                    onError={handleAvatarError}
                    className="w-6 h-6 rounded-full object-cover bg-gray-800 shrink-0"
                  />
                  <span className="text-xs text-gray-400">
                    @{getOwnerLogin(repo)}
                  </span>
                </div>

                <h3 className="font-bold text-lg mb-1 truncate text-blue-400">
                  {repo.name}
                </h3>

                <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-snug">
                  {repo.description || "설명이 없는 레포입니다."}
                </p>

                <div className="flex gap-4 text-xs font-bold text-gray-300 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {(repo.stargazers_count / 1000).toFixed(1)}k
                  </span>

                  <span className="flex items-center gap-1">
                    <GitFork className="w-4 h-4" />
                    {repo.forks_count}
                  </span>

                  {repo.language && (
                    <span className="text-purple-400 border border-purple-400/30 px-1.5 rounded">
                      {repo.language}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 text-gray-500">
            <p>검색 결과가 없습니다.</p>
            <p className="text-sm mt-1">다른 키워드로 검색해 보세요.</p>
            <button
              onClick={resetSearch}
              className="mt-4 text-sm text-purple-400 hover:text-purple-300 transition"
            >
              뒤로가기
            </button>
          </div>
        )}
      </div>

      {selectedRepo && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-3xl border border-gray-800 bg-[#0d1117] shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-800 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={getOwnerAvatar(selectedRepo)}
                    alt="avatar"
                    onError={handleAvatarError}
                    className="w-9 h-9 rounded-full object-cover bg-gray-800 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-400 truncate">
                      @{getOwnerLogin(selectedRepo)}
                    </p>
                    <h2 className="text-xl font-bold text-white truncate">
                      {selectedRepo.name}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-300">
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400" />
                    {(selectedRepo.stargazers_count / 1000).toFixed(1)}k
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="w-4 h-4" />
                    {selectedRepo.forks_count}
                  </span>
                  {selectedRepo.language && (
                    <span className="text-purple-400 border border-purple-400/30 px-2 py-1 rounded">
                      {selectedRepo.language}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => window.open(selectedRepo.html_url, "_blank")}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 transition text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  GitHub
                </button>
                <button
                  onClick={closeRepoDetail}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-800 hover:bg-gray-700 transition"
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">
                  Description
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed break-words">
                  {selectedRepo.description || "설명이 없는 레포입니다."}
                </p>
              </div>

              {selectedRepo.topics?.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3">
                    Topics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedRepo.topics.map((topic) => (
                      <button
                        key={topic}
                        onClick={() => {
                          closeRepoDetail();
                          handleTagClick(topic);
                        }}
                        className="text-xs font-bold px-2.5 py-1.5 bg-white/5 border border-white/10 rounded text-gray-300 hover:bg-white/10 transition"
                      >
                        #{topic}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Repo Info
                </h3>
                <div className="space-y-2 text-sm text-gray-300">
                  <p>
                    <span className="text-gray-500">Full name:</span>{" "}
                    {selectedRepo.full_name}
                  </p>
                  <p>
                    <span className="text-gray-500">Default branch:</span>{" "}
                    {selectedRepo.default_branch || "main"}
                  </p>
                  <p>
                    <span className="text-gray-500">Visibility:</span>{" "}
                    {selectedRepo.private ? "Private" : "Public"}
                  </p>
                  <p>
                    <span className="text-gray-500">Open on GitHub:</span>{" "}
                    <button
                      onClick={() =>
                        window.open(selectedRepo.html_url, "_blank")
                      }
                      className="text-blue-400 hover:text-blue-300 transition"
                    >
                      {selectedRepo.html_url}
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={closeRepoDetail}
            className="absolute inset-0 -z-10"
            aria-label="overlay 닫기"
          />
        </div>
      )}
    </div>
  );
}
