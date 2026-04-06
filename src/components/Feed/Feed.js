import React, { useState, useEffect, useRef, useCallback } from "react";
import ChortCard from "../Card/ChortCard";
import { getTrendingRepos } from "../../api/github";

export default function Feed() {
  const [repos, setRepos] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef(null);

  // 데이터 불러오기 함수
  const fetchMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const newData = await getTrendingRepos(page);
    setRepos((prev) => [...prev, ...newData]);
    setPage((prev) => prev + 1);
    setLoading(false);
  }, [page, loading]);

  // 첫 로드
  useEffect(() => {
    fetchMore();
  }, []);

  // 무한 스크롤 감지 (마지막 요소에 도달했을 때)
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

  return (
    <div className="w-full max-w-md h-screen bg-black overflow-y-scroll snap-y snap-mandatory">
      {repos.map((repo, index) => (
        <ChortCard key={`${repo.id}-${index}`} repo={repo} />
      ))}

      {/* 무한 스크롤 트리거 지점 */}
      <div
        ref={loaderRef}
        className="h-20 flex items-center justify-center bg-black"
      >
        {loading && (
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>
    </div>
  );
}
