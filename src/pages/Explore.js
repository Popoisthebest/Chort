import React, { useEffect, useMemo, useState } from "react";
import { Search, Star, GitFork, Sparkles, TrendingUp } from "lucide-react";
import { searchRepos, getTrendingRepos } from "../api/github";
import { getProfile } from "../utils/userProfile";
import { rankRepos } from "../utils/algorithm";

const DEFAULT_TOPICS = ["React", "Python", "AI", "Web3", "TypeScript"];

export default function Explore() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState([]);
  const [recommendedRepos, setRecommendedRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);

  // 검색 실행 함수
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

  // 추천 태그 클릭 시 자동 검색
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

  // 검색 전 개인화 추천 repo 로드
  useEffect(() => {
    const loadRecommendedRepos = async () => {
      setLoadingRecommended(true);

      try {
        // Explore 기본 화면용으로 트렌딩 repo를 여러 페이지 수집
        const pages = [1, 2, 3];
        const fetched = await Promise.all(
          pages.map((page) => getTrendingRepos(page)),
        );

        const validResults = fetched.filter(
          (pageRepos) => Array.isArray(pageRepos) && !pageRepos?.error,
        );

        const mergedRepos = validResults.flat();

        // 개인화 알고리즘 정렬
        const rankedRepos = rankRepos(mergedRepos);

        // id 기준 중복 제거 후 상위 일부만 사용
        const deduped = [];
        const seen = new Set();

        for (const repo of rankedRepos) {
          if (!seen.has(repo.id)) {
            seen.add(repo.id);
            deduped.push(repo);
          }
        }

        setRecommendedRepos(deduped.slice(0, 18));
      } catch (error) {
        console.error("추천 repo 로드 실패:", error);
        setRecommendedRepos([]);
      } finally {
        setLoadingRecommended(false);
      }
    };

    loadRecommendedRepos();
  }, []);

  // 사용자 프로필 기반 관심 태그 계산
  const personalizedTopics = useMemo(() => {
    const profile = getProfile();

    const topicEntries = Object.entries(profile.topics || {})
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);

    const languageEntries = Object.entries(profile.languages || {})
      .sort((a, b) => b[1] - a[1])
      .map(([language]) => language);

    const merged = [...topicEntries, ...languageEntries, ...DEFAULT_TOPICS];

    // 중복 제거 + 빈 값 제거
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
      {/* 상단 고정 헤더 & 검색창 */}
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20 border-b border-gray-800">
        <h1 className="text-3xl font-bold mb-4">Explore 🔍</h1>

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

      {/* 메인 영역 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* 검색 전 기본 화면 */}
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
                <div className="grid grid-cols-2 gap-4">
                  {recommendedRepos.map((repo, index) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => window.open(repo.html_url, "_blank")}
                      className={`text-left bg-black border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-600 transition group ${
                        index % 5 === 0 || index % 7 === 0 ? "col-span-2" : ""
                      }`}
                    >
                      <div className="p-4 h-full flex flex-col justify-between min-h-[180px]">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <img
                              src={repo.owner.avatar_url}
                              alt="avatar"
                              className="w-7 h-7 rounded-full"
                            />
                            <span className="text-xs text-gray-400 truncate">
                              @{repo.owner.login}
                            </span>
                          </div>

                          <h3 className="font-bold text-base mb-2 text-blue-400 break-words group-hover:text-blue-300 transition">
                            {repo.name}
                          </h3>

                          <p className="text-sm text-gray-400 line-clamp-3 leading-snug">
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

                          {repo.topics?.[0] && (
                            <span className="text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
                              #{repo.topics[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* 로딩 인디케이터 */}
        {loading && (
          <div className="flex flex-col items-center justify-center mt-20 opacity-70">
            <div className="w-8 h-8 border-4 border-[#2F80ED] border-t-transparent rounded-full animate-spin mb-4"></div>
            <p>검색 중...</p>
          </div>
        )}

        {/* 검색 결과 리스트 */}
        {!loading && hasSearched && results.length > 0 && (
          <div className="flex flex-col gap-4 mt-4">
            <p className="text-xs text-gray-400 mb-2">
              총 {results.length}개의 결과를 찾았습니다.
            </p>

            {results.map((repo) => (
              <div
                key={repo.id}
                onClick={() => window.open(repo.html_url, "_blank")}
                className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <img
                    src={repo.owner.avatar_url}
                    alt="avatar"
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-xs text-gray-400">
                    @{repo.owner.login}
                  </span>
                </div>

                <h3 className="font-bold text-lg mb-1 truncate text-blue-400">
                  {repo.name}
                </h3>

                <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-snug">
                  {repo.description}
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

        {/* 검색 결과 없음 */}
        {!loading && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center mt-20 text-gray-500">
            <p>검색 결과가 없습니다.</p>
            <p className="text-sm mt-1">다른 키워드로 검색해 보세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
