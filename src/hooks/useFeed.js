// src/hooks/useFeed.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getTrendingReposBatch } from "../api/github";
import { rankRepos } from "../utils/algorithm";
import { getSeenIds } from "../utils/userProfile";

const PAGES_PER_BATCH = 3;
const PREFETCH_ROUNDS = 4;

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
      const existingIds = new Set(repos.map((r) => r.id));
      const seenIds = new Set(getSeenIds());

      let round = 0;
      let merged = [];
      let unseenFresh = [];
      let sawApiData = false;

      while (round < PREFETCH_ROUNDS) {
        const pageNumbers = Array.from(
          { length: PAGES_PER_BATCH },
          (_, i) => pageRef.current + i,
        );
        const results = await getTrendingReposBatch(pageNumbers);
        pageRef.current += PAGES_PER_BATCH;
        round += 1;

        const validResults = results.filter(
          (r) => Array.isArray(r) && !r?.error,
        );
        if (validResults.length > 0) {
          sawApiData = true;
          merged = [...merged, ...validResults.flat()];
          unseenFresh = merged.filter(
            (repo) => !seenIds.has(repo.id) && !existingIds.has(repo.id),
          );
          if (unseenFresh.length >= PAGES_PER_BATCH * 10) break;
        }
      }

      if (!sawApiData) {
        setError(
          "GitHub API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
        );
        return;
      }

      const candidates =
        unseenFresh.length > 0
          ? unseenFresh
          : merged.filter((repo) => !existingIds.has(repo.id));
      const ranked = rankRepos(candidates);
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
