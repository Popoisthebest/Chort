// src/hooks/useFeed.js
// 피드 데이터 패칭 + 개인화 알고리즘이 통합된 커스텀 훅

import { useState, useEffect, useRef, useCallback } from "react";
import { getTrendingRepos } from "../api/github";
import { rankRepos } from "../utils/algorithm";

const PAGES_PER_BATCH = 3; // 한 번에 가져올 GitHub API 페이지 수

export const useFeed = () => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 현재 GitHub API 페이지 번호
  const pageRef = useRef(1);
  // 중복 호출 방지 플래그
  const isFetchingRef = useRef(false);

  /**
   * GitHub에서 여러 페이지를 한꺼번에 가져와서 알고리즘으로 정렬 후 피드에 추가합니다.
   */
  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // PAGES_PER_BATCH 개의 페이지를 병렬 요청
      const pageNumbers = Array.from(
        { length: PAGES_PER_BATCH },
        (_, i) => pageRef.current + i,
      );

      const results = await Promise.all(
        pageNumbers.map((p) => getTrendingRepos(p)),
      );

      pageRef.current += PAGES_PER_BATCH;

      // 에러 응답 필터링
      const validResults = results.filter((r) => !r?.error);
      if (validResults.length === 0) {
        setError(
          "GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
        );
        return;
      }

      // 모든 페이지 결과를 하나로 합치기
      const allNewRepos = validResults.flat();

      // 개인화 알고리즘으로 정렬
      const ranked = rankRepos(allNewRepos);

      setRepos((prev) => {
        // 전체 목록에서 중복 제거 (repo.id 기준)
        const existingIds = new Set(prev.map((r) => r.id));
        const deduplicated = ranked.filter((r) => !existingIds.has(r.id));
        return [...prev, ...deduplicated];
      });
    } catch (err) {
      console.error("피드 로드 실패:", err);
      setError("피드를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // 피드 완전히 초기화 (알고리즘 프로필이 업데이트됐을 때 사용)
  const resetFeed = useCallback(() => {
    pageRef.current = 1;
    setRepos([]);
    setError(null);
  }, []);

  // 최초 마운트 시 1회 로드
  useEffect(() => {
    fetchMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    repos,
    loading,
    error,
    fetchMore,
    resetFeed,
  };
};
