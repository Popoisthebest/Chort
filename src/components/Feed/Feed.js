import React, { useState, useEffect, useRef, useCallback } from "react";
import ChortCard from "../Card/ChortCard";
import { getTrendingRepos } from "../../api/github"; // 본인의 실제 경로에 맞게 확인해주세요

const MAX_SEEN_HISTORY = 300; // 최대 기억할 시청 기록 개수

export default function Feed() {
  const [repos, setRepos] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const loaderRef = useRef(null);

  // 데이터 불러오기 및 중복 필터링 함수
  const fetchMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    let currentPageToFetch = page;
    let freshData = [];
    let attempts = 0; // 💡 무한 루프 방지용 카운터

    // 최대 3페이지만 연속으로 탐색하도록 브레이크를 겁니다.
    while (freshData.length === 0 && attempts < 3) {
      attempts++;
      try {
        const newData = await getTrendingRepos(currentPageToFetch);

        // 💡 API 한도 초과(Rate Limit) 등 에러가 발생했거나 데이터가 없으면 즉시 루프 탈출
        if (!newData || newData.length === 0 || newData.message) {
          console.warn(
            `[API 경고] 데이터를 불러올 수 없습니다. (Rate Limit 의심) 메시지:`,
            newData?.message,
          );
          break;
        }

        const seenIds =
          JSON.parse(localStorage.getItem("chort_seen_history")) || [];
        freshData = newData.filter((repo) => !seenIds.includes(repo.id));

        if (freshData.length > 0) {
          const freshIds = freshData.map((repo) => repo.id);
          const updatedSeenIds = [...freshIds, ...seenIds].slice(
            0,
            MAX_SEEN_HISTORY,
          );
          localStorage.setItem(
            "chort_seen_history",
            JSON.stringify(updatedSeenIds),
          );
        } else {
          console.log(
            `[Chort] ${currentPageToFetch}페이지는 모두 본 레포입니다. 다음 페이지로 넘어갑니다.`,
          );
          currentPageToFetch += 1;

          // 💡 다음 API를 찌르기 전에 0.5초(500ms) 휴식을 주어 서버 차단을 방지합니다.
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error("데이터 패칭 중 에러 발생:", error);
        break;
      }
    }

    if (freshData.length > 0) {
      setRepos((prev) => [...prev, ...freshData]);
      setPage(currentPageToFetch + 1);
    }

    setLoading(false);
  }, [page, loading]);

  // 첫 로드
  useEffect(() => {
    fetchMore();
  }, [fetchMore]);

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
    // 💡 스크롤바를 보이지 않게 숨겨서 앱처럼 보이도록 스타일(msOverflowStyle, scrollbarWidth)을 추가했습니다.
    <div
      className="w-full max-w-md h-screen bg-black overflow-y-scroll snap-y snap-mandatory"
      style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
    >
      {repos.map((repo, index) => (
        <ChortCard key={`${repo.id}-${index}`} repo={repo} />
      ))}

      {/* 무한 스크롤 트리거 지점 */}
      <div
        ref={loaderRef}
        className="h-20 flex items-center justify-center bg-black snap-start"
      >
        {loading && (
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        )}
      </div>
    </div>
  );
}
