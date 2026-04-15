// src/pages/Explore.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  Star,
  GitFork,
  Sparkles,
  TrendingUp,
  ArrowLeft,
} from "lucide-react";
import { searchRepos, getTrendingReposBatch } from "../api/github";
import { getProfile } from "../utils/userProfile";
import { rankRepos } from "../utils/algorithm";
import RepoDetailModal from "../components/Repo/RepoDetailModal";

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

  const getOwnerAvatar = (repo) => repo?.owner?.avatar_url || FALLBACK_AVATAR;
  const getOwnerLogin = (repo) => repo?.owner?.login || "unknown";

  const getCardHeightClass = (repo, index) => {
    const descLength = repo?.description?.length || 0;
    const topicCount = repo?.topics?.length || 0;
    if (descLength > 120 || topicCount >= 3 || index % 7 === 0)
      return "min-h-[260px]";
    if (descLength > 70 || index % 5 === 0) return "min-h-[220px]";
    return "min-h-[180px]";
  };

  const handleAvatarError = (e) => {
    e.currentTarget.src = FALLBACK_AVATAR;
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await searchRepos(keyword);
      setResults(Array.isArray(data) ? data : []);
    } catch {
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
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const toDisplayTag = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    return text
      .split(/[\s-_]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  useEffect(() => {
    const loadRecommendedRepos = async () => {
      setLoadingRecommended(true);
      try {
        const fetched = await getTrendingReposBatch([1, 2, 3]);
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
      } catch {
        setRecommendedRepos([]);
      } finally {
        setLoadingRecommended(false);
      }
    };
    loadRecommendedRepos();
  }, []);

  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    const handleStorageChange = () => setProfileVersion((v) => v + 1);
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("focus", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("focus", handleStorageChange);
    };
  }, []);

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
    return unique.slice(0, 12).map(toDisplayTag);
  }, [profileVersion]);

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      {/* ── 검색 헤더 ── */}
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

      {/* ── 콘텐츠 ── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* 추천 탭 */}
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
                  <div className="w-8 h-8 border-4 border-[#2F80ED] border-t-transparent rounded-full animate-spin mb-4" />
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
                      onClick={() => setSelectedRepo(repo)}
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

        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center mt-20 opacity-70">
            <div className="w-8 h-8 border-4 border-[#2F80ED] border-t-transparent rounded-full animate-spin mb-4" />
            <p>검색 중...</p>
          </div>
        )}

        {/* 검색 결과 */}
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
                onClick={() => setSelectedRepo(repo)}
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

        {/* 결과 없음 */}
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

      {/* ── 상세보기 모달 (RepoDetailModal 공용) ── */}
      {selectedRepo && (
        <RepoDetailModal
          repo={selectedRepo}
          onClose={() => setSelectedRepo(null)}
        />
      )}
    </div>
  );
}
