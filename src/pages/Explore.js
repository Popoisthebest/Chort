import React, { useState } from "react";
import { Search, Star, GitFork } from "lucide-react";
import { searchRepos } from "../api/github";

export default function Explore() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // 검색 실행 함수
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!keyword.trim()) return;

    setLoading(true);
    setHasSearched(true);
    const data = await searchRepos(keyword);
    setResults(data);
    setLoading(false);
  };

  // 추천 태그 클릭 시 자동 검색
  const handleTagClick = (tag) => {
    setKeyword(tag);
    // 상태 업데이트 후 바로 검색을 실행하기 위해 태그 값을 직접 전달
    const fetchTag = async () => {
      setLoading(true);
      setHasSearched(true);
      const data = await searchRepos(tag);
      setResults(data);
      setLoading(false);
    };
    fetchTag();
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      {/* 1. 상단 고정 헤더 & 검색창 */}
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20">
        <h1 className="text-3xl font-bold mb-4">Explore 🔍</h1>
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="레포지토리 검색 (예: react, python)"
            className="w-full bg-gray-800 text-white pl-12 pr-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-[#A259FF] transition"
          />
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <button type="submit" className="hidden">
            검색
          </button>
        </form>
      </div>

      {/* 2. 스크롤 가능한 메인 영역 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* 검색 전 기본 화면 (추천 태그) */}
        {!hasSearched && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">
              Popular Topics
            </h2>
            <div className="flex gap-2 flex-wrap">
              {["React", "Python", "AI", "Web3", "TypeScript"].map((topic) => (
                <button
                  key={topic}
                  onClick={() => handleTagClick(topic)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 transition rounded-full text-sm font-medium"
                >
                  #{topic}
                </button>
              ))}
            </div>
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
          <div className="flex flex-col gap-4 mt-2">
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
                <div className="flex gap-4 text-xs font-bold text-gray-300">
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400" />{" "}
                    {(repo.stargazers_count / 1000).toFixed(1)}k
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="w-4 h-4" /> {repo.forks_count}
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
