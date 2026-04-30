// src/pages/Saved.jsx
import React, { useState, useEffect, useContext, useCallback } from "react";
import { Star, GitFork, Trash2, RefreshCw } from "lucide-react";
import {
  unstarRepo,
  getStarredRepos,
  invalidateStarredCache,
  getTranslatedText,
} from "../api/github";
import { LoginModalContext } from "../App";
import RepoDetailModal from "../components/Repo/RepoDetailModal";

const SETTINGS_KEY = "chort_settings";
const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { autoTranslate: true, language: "ko", ...JSON.parse(raw) }
      : { autoTranslate: true, language: "ko" };
  } catch {
    return { autoTranslate: true, language: "ko" };
  }
};

// 레포 카드 설명 번역 훅
function useTranslatedDescription(description, enabled, language) {
  const [translated, setTranslated] = useState(null);

  useEffect(() => {
    if (!enabled || !description) {
      setTranslated(null);
      return;
    }
    let cancelled = false;
    getTranslatedText(description, language)
      .then((result) => {
        if (!cancelled) setTranslated(result || description);
      })
      .catch(() => {
        if (!cancelled) setTranslated(description);
      });
    return () => {
      cancelled = true;
    };
  }, [description, enabled, language]);

  return translated;
}

// 개별 저장된 레포 카드 컴포넌트
function SavedRepoCard({ repo, onOpen, onRemove, autoTranslate, language }) {
  const translated = useTranslatedDescription(
    repo.description,
    autoTranslate,
    language,
  );
  const displayDesc = autoTranslate
    ? translated || repo.description || "설명이 없는 레포입니다."
    : repo.description || "설명이 없는 레포입니다.";

  return (
    <div
      onClick={() => onOpen(repo)}
      className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition relative group"
    >
      <div className="flex items-center gap-3 mb-2 pr-8">
        <img
          src={repo.owner?.avatar_url}
          alt="avatar"
          className="w-6 h-6 rounded-full"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <span className="text-xs text-gray-400">@{repo.owner?.login}</span>
      </div>
      <h3 className="font-bold text-lg mb-1 truncate text-yellow-400">
        {repo.name}
      </h3>
      <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-snug">
        {displayDesc}
      </p>

      <div className="flex justify-between items-end">
        <div className="flex gap-4 text-xs font-bold text-gray-300">
          <span className="flex items-center gap-1">
            <Star className="w-4 h-4 text-yellow-400" />
            {((repo.stargazers_count || 0) / 1000).toFixed(1)}k
          </span>
          <span className="flex items-center gap-1">
            <GitFork className="w-4 h-4" />
            {repo.forks_count || 0}
          </span>
          {repo.language && (
            <span className="text-purple-400 border border-purple-400/30 px-1.5 py-0.5 rounded text-[10px]">
              {repo.language}
            </span>
          )}
        </div>

        {/* Unstar 버튼 */}
        <button
          onClick={(e) => onRemove(repo, e)}
          title="Star 취소"
          className="p-2 bg-gray-800 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function Saved() {
  const { user, openLoginModal } = useContext(LoginModalContext);
  const [savedRepos, setSavedRepos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);

  // 설정 (자동 번역, 언어)
  const [settings, setSettings] = useState(loadSettings);
  useEffect(() => {
    const onStorage = () => setSettings(loadSettings());
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onStorage);
    };
  }, []);

  /**
   * GitHub API에서 starred 목록을 가져와 localStorage와 병합
   * - GitHub에서 이미 starred한 레포 → localStorage에 추가
   * - localStorage에 있지만 GitHub에서 unstar된 레포 → 제거
   */
  const syncStarredRepos = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const ghStarred = await getStarredRepos();
      const synced = [];
      const seen = new Set();

      for (const repo of ghStarred) {
        if (!seen.has(repo.id)) {
          seen.add(repo.id);
          synced.push(repo);
        }
      }

      localStorage.setItem("chort_saved", JSON.stringify(synced));
      setSavedRepos(synced);
    } catch (err) {
      console.error("starred 동기화 실패:", err);
      // 실패 시 localStorage 그대로 사용
      const local = JSON.parse(localStorage.getItem("chort_saved")) || [];
      setSavedRepos(local);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    syncStarredRepos();
  }, [user, syncStarredRepos]);

  const removeRepo = async (repo, e) => {
    e.stopPropagation();

    if (!user) {
      openLoginModal("저장된 레포를 관리하려면 로그인이 필요합니다.");
      return;
    }

    const previousSaved = savedRepos;
    const newSaved = savedRepos.filter((item) => item.id !== repo.id);

    // Optimistic update
    localStorage.setItem("chort_saved", JSON.stringify(newSaved));
    setSavedRepos(newSaved);

    const success = await unstarRepo(repo.owner.login, repo.name);
    if (success) {
      invalidateStarredCache();
    } else {
      alert("GitHub에서 별 취소에 실패했습니다. 다시 시도해주세요.");
      localStorage.setItem("chort_saved", JSON.stringify(previousSaved));
      setSavedRepos(previousSaved);
    }
  };

  // RepoDetailModal에서 star 상태 변경 시 목록 업데이트
  const handleStarChange = (isNowStarred, repo) => {
    if (!isNowStarred) {
      // unstar → 목록에서 제거
      setSavedRepos((prev) => {
        const newList = prev.filter((r) => r.id !== repo.id);
        localStorage.setItem("chort_saved", JSON.stringify(newList));
        return newList;
      });
    } else {
      // star → 목록에 추가
      setSavedRepos((prev) => {
        const exists = prev.some((r) => r.id === repo.id);
        if (exists) return prev;
        const newList = [repo, ...prev];
        localStorage.setItem("chort_saved", JSON.stringify(newList));
        return newList;
      });
    }
  };

  // 비로그인 상태
  if (!user) {
    return (
      <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        <Star className="w-12 h-12 text-gray-600 mb-2" />
        <p className="text-gray-400 text-center">
          저장된 레포지토리를 보려면 로그인이 필요합니다.
        </p>
        <button
          onClick={() =>
            openLoginModal("저장된 레포지토리를 보려면 로그인이 필요합니다.")
          }
          className="mt-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-full transition"
        >
          GitHub로 로그인
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-20 lg:pb-16">
      {/* 헤더 */}
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md px-4 py-4 sm:p-6 z-20 flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Saved</h1>
          <p className="text-gray-400 text-sm mt-1">내가 Star한 레포지토리</p>
        </div>
        <button
          onClick={syncStarredRepos}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs text-gray-300 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          동기화
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        {loading && savedRepos.length === 0 ? (
          <div className="flex justify-center items-center mt-32">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : savedRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-32 text-gray-500">
            <Star className="w-12 h-12 mb-4 opacity-20" />
            <p>아직 Star한 레포지토리가 없습니다.</p>
            <p className="text-sm mt-1">
              홈에서 마음에 드는 프로젝트에 별을 눌러보세요!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-400 mb-2">
              총 {savedRepos.length}개의 저장된 항목
            </p>
            {savedRepos.map((repo) => (
              <SavedRepoCard
                key={repo.id}
                repo={repo}
                onOpen={setSelectedRepo}
                onRemove={removeRepo}
                autoTranslate={settings.autoTranslate}
                language={settings.language}
              />
            ))}
          </div>
        )}
      </div>

      {/* 상세 팝업 (RepoDetailModal 공용) */}
      {selectedRepo && (
        <RepoDetailModal
          repo={selectedRepo}
          onClose={() => setSelectedRepo(null)}
          isStarred={true}
          onStarChange={handleStarChange}
        />
      )}
    </div>
  );
}
