// src/components/Feed/Feed.js

import React, { useEffect, useRef, useState, useCallback } from "react";
import { Star, Share2, Code, MessageCircle } from "lucide-react";
import ChortCard from "../Card/ChortCard";
import CommentsPanel from "../Comments/CommentsPanel";
import { useFeed } from "../../hooks/useFeed";
import { starRepo, unstarRepo } from "../../api/github";
import { recordStar } from "../../utils/userProfile";

export default function Feed() {
  const { repos, loading, error, fetchMore, resetFeed } = useFeed();

  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [currentRepo, setCurrentRepo] = useState(null);
  const [starredRepoIds, setStarredRepoIds] = useState({});
  const [commentCounts, setCommentCounts] = useState({});

  const loaderRef = useRef(null);

  useEffect(() => {
    const savedRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];
    const savedMap = {};
    savedRepos.forEach((repo) => {
      savedMap[repo.id] = true;
    });
    setStarredRepoIds(savedMap);
  }, []);

  useEffect(() => {
    if (repos.length === 0) return;

    if (!currentRepo) {
      setCurrentRepo(repos[0]);
      return;
    }

    const stillExists = repos.some((repo) => repo.id === currentRepo.id);
    if (!stillExists) {
      setCurrentRepo(repos[0]);
    }
  }, [repos, currentRepo]);

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

  useEffect(() => {
    if (!currentRepo || loading || error) return;

    const currentIndex = repos.findIndex((repo) => repo.id === currentRepo.id);
    if (currentIndex < 0) return;

    const remainingRepos = repos.length - currentIndex - 1;
    if (remainingRepos <= 3) {
      fetchMore();
    }
  }, [currentRepo, repos, loading, error, fetchMore]);

  const handleCommentsCountChange = useCallback((repoId, count) => {
    setCommentCounts((prev) => {
      if (prev[repoId] === count) {
        return prev;
      }

      return {
        ...prev,
        [repoId]: count,
      };
    });
  }, []);

  const toggleStar = async (repo) => {
    if (!repo) return;

    const savedRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];
    const isStarred = !!starredRepoIds[repo.id];

    if (isStarred) {
      setStarredRepoIds((prev) => ({ ...prev, [repo.id]: false }));
      const success = await unstarRepo(repo.owner.login, repo.name);

      if (success) {
        const newSaved = savedRepos.filter((r) => r.id !== repo.id);
        localStorage.setItem("chort_saved", JSON.stringify(newSaved));
      } else {
        setStarredRepoIds((prev) => ({ ...prev, [repo.id]: true }));
      }
    } else {
      setStarredRepoIds((prev) => ({ ...prev, [repo.id]: true }));
      const success = await starRepo(repo.owner.login, repo.name);

      if (success) {
        const exists = savedRepos.some((r) => r.id === repo.id);
        if (!exists) {
          localStorage.setItem(
            "chort_saved",
            JSON.stringify([...savedRepos, repo]),
          );
        }
        recordStar(repo);
      } else {
        setStarredRepoIds((prev) => ({ ...prev, [repo.id]: false }));
      }
    }
  };

  const handleShare = (repo) => {
    if (!repo) return;
    navigator.clipboard.writeText(`https://github.com/${repo.full_name}`);
    alert("링크가 복사되었습니다! 🚀");
  };

  const isStarred = currentRepo ? !!starredRepoIds[currentRepo.id] : false;
  const commentCount = currentRepo ? commentCounts[currentRepo.id] || 0 : 0;

  return (
    <div className="relative flex w-full h-full bg-black gap-0">
      <div className="flex-1 flex justify-center">
        <div className="w-full h-full max-w-[500px] overflow-y-scroll snap-y snap-mandatory border-r border-gray-800">
          {repos.map((repo, index) => (
            <div key={`${repo.id}-${index}`}>
              <ChortCard
                repo={repo}
                onVisible={setCurrentRepo}
                onCommentsCountChange={handleCommentsCountChange}
              />
            </div>
          ))}

          {error && (
            <div className="h-20 flex flex-col items-center justify-center bg-black gap-2">
              <p className="text-red-400 text-xs text-center px-4">{error}</p>
              <button
                onClick={resetFeed}
                className="text-xs text-purple-400 underline"
              >
                다시 시도
              </button>
            </div>
          )}

          <div
            ref={loaderRef}
            className="h-20 flex items-center justify-center bg-black"
          >
            {loading && !error && (
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>
      </div>

      {currentRepo && (
        <div className="absolute left-[calc(50%+265px)] bottom-24 flex flex-col gap-5 items-center z-30">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleStar(currentRepo);
            }}
            className="flex flex-col items-center transition-transform active:scale-90"
          >
            <div
              className={`p-3 rounded-full backdrop-blur-md transition-all ${
                isStarred
                  ? "bg-yellow-400/20 border border-yellow-400/50"
                  : "bg-black/50 border border-white/10"
              }`}
            >
              <Star
                className={`w-6 h-6 ${
                  isStarred ? "fill-yellow-400 text-yellow-400" : "text-white"
                }`}
              />
            </div>
            <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
              {(currentRepo.stargazers_count / 1000).toFixed(1)}k
            </span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCommentsOpen(true);
            }}
            className="flex flex-col items-center transition-transform active:scale-90"
          >
            <div className="p-3 bg-black/50 border border-white/10 rounded-full">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
              {commentCount}
            </span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleShare(currentRepo);
            }}
            className="flex flex-col items-center transition-transform active:scale-90"
          >
            <div className="p-3 bg-black/50 border border-white/10 rounded-full">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
              Share
            </span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(
                `https://github.com/${currentRepo.full_name}`,
                "_blank",
              );
            }}
            className="flex flex-col items-center transition-transform active:scale-90"
          >
            <div className="p-3 bg-black/50 border border-white/10 rounded-full">
              <Code className="w-6 h-6 text-white" />
            </div>
            <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
              Repo
            </span>
          </button>
        </div>
      )}

      {isCommentsOpen && currentRepo && (
        <div className="absolute top-0 right-0 h-full z-40">
          <CommentsPanel
            repo={currentRepo}
            onClose={() => setIsCommentsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
