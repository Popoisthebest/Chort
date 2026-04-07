// src/hooks/useFeed.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getTrendingReposBatch } from "../api/github";
import { rankRepos } from "../utils/algorithm";

const PAGES_PER_BATCH = 3;

export const useFeed = () => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pageRef = useRef(1);
  const isFetchingRef = useRef(false);

  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const pageNumbers = Array.from(
        { length: PAGES_PER_BATCH },
        (_, i) => pageRef.current + i,
      );
      const results = await getTrendingReposBatch(pageNumbers);
      pageRef.current += PAGES_PER_BATCH;

      const validResults = results.filter((r) => Array.isArray(r) && !r?.error);
      if (validResults.length === 0) {
        setError(
          "GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
        );
        return;
      }

      const ranked = rankRepos(validResults.flat());
      setRepos((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        return [...prev, ...ranked.filter((r) => !existingIds.has(r.id))];
      });
    } catch (err) {
      console.error("피드 로드 실패:", err);
      setError("피드를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // [버그수정] resetFeed: 초기화 후 fetchMore 자동 실행
  const resetFeed = useCallback(() => {
    pageRef.current = 1;
    setRepos([]);
    setError(null);
    fetchMore();
  }, [fetchMore]);

  useEffect(() => {
    fetchMore();
  }, [fetchMore]);

  return { repos, loading, error, fetchMore, resetFeed };
};
