// src/hooks/useFeed.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getFeedCards } from "../api/firebase";
import { rankRepos } from "../utils/algorithm";
import { getSeenIds } from "../utils/userProfile";

const PAGE_SIZE = 10;

export const useFeed = () => {
  const [repos, setRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isFetchingRef = useRef(false);
  const lastVisibleRef = useRef(null);
  const hasMoreRef = useRef(true);

  const fetchMore = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const { items, lastVisible, hasMore } = await getFeedCards(
        lastVisibleRef.current,
        PAGE_SIZE,
      );

      if (!Array.isArray(items)) {
        setError("피드 데이터를 불러오지 못했습니다.");
        return;
      }

      const seenIds = new Set(getSeenIds());

      setRepos((prev) => {
        const existingIds = new Set(prev.map((repo) => repo.id));
        const fresh = items.filter(
          (repo) => !existingIds.has(repo.id) && !seenIds.has(repo.id),
        );
        const fallback = items.filter((repo) => !existingIds.has(repo.id));
        const candidates = fresh.length > 0 ? fresh : fallback;
        const ranked = rankRepos(candidates);

        return [...prev, ...ranked];
      });

      lastVisibleRef.current = lastVisible;
      hasMoreRef.current = hasMore;
    } catch (err) {
      console.error("피드 로드 실패:", err);
      setError("피드를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  const resetFeed = useCallback(() => {
    lastVisibleRef.current = null;
    hasMoreRef.current = true;
    isFetchingRef.current = false;
    setRepos([]);
    setError(null);
  }, []);

  useEffect(() => {
    fetchMore();
  }, [fetchMore]);

  return { repos, loading, error, fetchMore, resetFeed };
};
