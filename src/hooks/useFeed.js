// src/hooks/useFeed.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getTrendingReposBatch } from "../api/github";
import { rankRepos } from "../utils/algorithm";
import { getSeenIds } from "../utils/userProfile";

const PAGES_PER_BATCH = 3;
const PREFETCH_ROUNDS = 4;

export const useFeed = (periodFilter = "monthly", languageFilter = "전체") => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pageRef = useRef(1);
  const isFetchingRef = useRef(false);
  const reposRef = useRef([]);

  const filtersRef = useRef({
    period: periodFilter,
    language: languageFilter,
  });

  useEffect(() => {
    reposRef.current = repos;
  }, [repos]);

  useEffect(() => {
    filtersRef.current = {
      period: periodFilter,
      language: languageFilter,
    };
  }, [periodFilter, languageFilter]);

  const fetchMore = useCallback(async ({ reset = false } = {}) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const activeFilters = filtersRef.current;
      if (reset) {
        pageRef.current = 1;
      }

      const existingIds = new Set(
        reset ? [] : reposRef.current.map((repo) => repo.id),
      );
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
        const results = await getTrendingReposBatch(pageNumbers, activeFilters);
        pageRef.current += PAGES_PER_BATCH;
        round += 1;

        const validResults = results.filter(
          (result) => Array.isArray(result) && !result?.error,
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
      const ranked = rankRepos(candidates, activeFilters.period);
      setRepos((prev) => {
        if (reset) {
          const deduped = [];
          const nextIds = new Set();
          ranked.forEach((repo) => {
            if (!nextIds.has(repo.id)) {
              nextIds.add(repo.id);
              deduped.push(repo);
            }
          });
          return deduped;
        }

        const prevIds = new Set(prev.map((repo) => repo.id));
        return [...prev, ...ranked.filter((repo) => !prevIds.has(repo.id))];
      });
    } catch (err) {
      console.error("피드 로드 실패:", err);
      setError("피드를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const resetFeed = useCallback(() => {
    setError(null);
    setRepos([]);
    fetchMore({ reset: true });
  }, [fetchMore]);

  useEffect(() => {
    pageRef.current = 1;
    resetFeed();
  }, [periodFilter, languageFilter, resetFeed]);

  return { repos, loading, error, fetchMore, resetFeed };
};
