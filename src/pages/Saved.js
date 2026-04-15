// src/pages/Saved.js
import React, { useState, useEffect, useContext } from "react";
import { Star, GitFork, Trash2 } from "lucide-react";
import { unstarRepo } from "../api/github";
import { LoginModalContext } from "../App";

export default function Saved() {
  const { user, openLoginModal } = useContext(LoginModalContext);
  const [savedRepos, setSavedRepos] = useState([]);

  useEffect(() => {
    if (!user) return;
    const loaded = JSON.parse(localStorage.getItem("chort_saved")) || [];
    setSavedRepos(loaded);
  }, [user]);

  const removeRepo = async (repo, e) => {
    e.stopPropagation();

    if (!user) {
      openLoginModal("저장된 레포를 관리하려면 로그인이 필요합니다.");
      return;
    }

    const previousSaved = savedRepos;
    const newSaved = savedRepos.filter((item) => item.id !== repo.id);

    localStorage.setItem("chort_saved", JSON.stringify(newSaved));
    setSavedRepos(newSaved);

    const success = await unstarRepo(repo.owner.login, repo.name);
    if (!success) {
      alert("GitHub에서 별 취소에 실패했습니다. 다시 시도해주세요.");
      localStorage.setItem("chort_saved", JSON.stringify(previousSaved));
      setSavedRepos(previousSaved);
    }
  };

  // 비로그인 상태 안내 (App.js의 ProtectedPageFallback이 이미 모달을 띄우지만
  // 페이지 자체도 명확한 안내 제공)
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
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20">
        <h1 className="text-3xl font-bold">Saved</h1>
        <p className="text-gray-400 text-sm mt-2">
          내가 찜한 레포지토리 모아보기
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {savedRepos.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-32 text-gray-500">
            <Star className="w-12 h-12 mb-4 opacity-20" />
            <p>아직 저장된 레포지토리가 없습니다.</p>
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
              <div
                key={repo.id}
                onClick={() => window.open(repo.html_url, "_blank")}
                className="bg-black border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-gray-600 transition relative group"
              >
                <div className="flex items-center gap-3 mb-2 pr-8">
                  <img
                    src={repo.owner.avatar_url}
                    alt="avatar"
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-xs text-gray-400">
                    @{repo.owner.login}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-1 truncate text-yellow-400">
                  {repo.name}
                </h3>
                <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-snug">
                  {repo.description}
                </p>

                <div className="flex justify-between items-end">
                  <div className="flex gap-4 text-xs font-bold text-gray-300">
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400" />{" "}
                      {(repo.stargazers_count / 1000).toFixed(1)}k
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="w-4 h-4" /> {repo.forks_count}
                    </span>
                  </div>

                  <button
                    onClick={(e) => removeRepo(repo, e)}
                    className="p-2 bg-gray-800 rounded-full hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
