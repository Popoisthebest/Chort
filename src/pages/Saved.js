import React, { useState, useEffect } from "react";
import { Star, GitFork, Trash2 } from "lucide-react";

export default function Saved() {
  const [savedRepos, setSavedRepos] = useState([]);

  // 화면이 켜질 때 로컬 스토리지에서 저장된 목록 불러오기
  useEffect(() => {
    const loaded = JSON.parse(localStorage.getItem("chort_saved")) || [];
    setSavedRepos(loaded);
  }, []);

  // 보관함에서 삭제하는 함수
  const removeRepo = (id, e) => {
    e.stopPropagation(); // 카드 클릭(링크 이동) 이벤트 무시
    const newSaved = savedRepos.filter((repo) => repo.id !== id);
    localStorage.setItem("chort_saved", JSON.stringify(newSaved));
    setSavedRepos(newSaved);
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20">
        <h1 className="text-3xl font-bold">Saved 🔖</h1>
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

                  {/* 삭제 버튼 */}
                  <button
                    onClick={(e) => removeRepo(repo.id, e)}
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
