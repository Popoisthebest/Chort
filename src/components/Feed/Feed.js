import React, { useState, useEffect, useRef, useCallback } from "react";
import ChortCard from "../Card/ChortCard";
import CommentsPanel from "../Comments/CommentsPanel";
import { getTrendingRepos } from "../../api/github";

export default function Feed() {
  const [repos, setRepos] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const loaderRef = useRef(null);

  const fetchMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    const newData = await getTrendingRepos(page);
    setRepos((prev) => [...prev, ...newData]);
    setPage((prev) => prev + 1);
    setLoading(false);
  }, [page, loading]);

  useEffect(() => {
    fetchMore();
  }, []);

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
    <div className="flex w-full h-full bg-black gap-0">
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-[400px] overflow-y-scroll snap-y snap-mandatory border-r border-gray-800">
          {repos.map((repo, index) => (
            <div key={`${repo.id}-${index}`}>
              <ChortCard
                repo={repo}
                onCommentClick={() => setSelectedRepo(repo)}
              />
            </div>
          ))}

          <div
            ref={loaderRef}
            className="h-20 flex items-center justify-center bg-black"
          >
            {loading && (
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
        </div>
      </div>

      {selectedRepo && (
        <CommentsPanel
          repo={selectedRepo}
          onClose={() => setSelectedRepo(null)}
        />
      )}
    </div>
  );
}
