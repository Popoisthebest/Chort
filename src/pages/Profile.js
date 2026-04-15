import React, { useState, useEffect } from "react";
import { User, Settings, Trash2, LogOut, Flame } from "lucide-react";
import { logoutUser } from "../api/firebase";
import { useNavigate } from "react-router-dom";

const STREAK_KEY = "chort_streak";

const calculateStreak = () => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return 0;

    const { lastVisit, streak } = JSON.parse(raw);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const last = new Date(lastVisit);
    last.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

    // 오늘 이미 체크인했으면 현재 streak 반환
    if (diffDays === 0) return streak;

    // 어제 방문했으면 streak 유지 (내일 체크인 시 +1)
    if (diffDays === 1) return streak;

    // 2 일 이상 방문하지 않았으면 streak 리셋
    return 0;
  } catch {
    return 0;
  }
};

const updateStreak = () => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!raw) {
      // 첫 방문
      localStorage.setItem(STREAK_KEY, JSON.stringify({
        lastVisit: today.toISOString(),
        streak: 1,
      }));
      return 1;
    }

    const { lastVisit, streak } = JSON.parse(raw);
    const last = new Date(lastVisit);
    last.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // 오늘 이미 체크인
      return streak;
    }

    if (diffDays === 1) {
      // 연속 방문
      const newStreak = streak + 1;
      localStorage.setItem(STREAK_KEY, JSON.stringify({
        lastVisit: today.toISOString(),
        streak: newStreak,
      }));
      return newStreak;
    }

    // 2 일 이상 경과 - 리셋
    localStorage.setItem(STREAK_KEY, JSON.stringify({
      lastVisit: today.toISOString(),
      streak: 1,
    }));
    return 1;
  } catch {
    return 1;
  }
};

export default function Profile({ user }) {
  const [savedCount, setSavedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const navigate = useNavigate();

  // 저장된 항목 개수 및 streak 불러오기
  useEffect(() => {
    const loaded = JSON.parse(localStorage.getItem("chort_saved")) || [];
    setSavedCount(loaded.length);
    setStreak(calculateStreak());
  }, []);

  // 보관함 초기화 기능
  const clearSaved = () => {
    if (window.confirm("저장된 보관함을 모두 비우시겠습니까?")) {
      localStorage.removeItem("chort_saved");
      setSavedCount(0);
      alert("보관함이 초기화되었습니다. 🗑️");
    }
  };

  // Streak 초기화 기능
  const clearStreak = () => {
    if (window.confirm("연속 방문 기록을 초기화하시겠습니까?")) {
      localStorage.removeItem(STREAK_KEY);
      setStreak(0);
      alert("Streak 이 초기화되었습니다.");
    }
  };

  // 로그아웃 기능
  const handleLogout = async () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      await logoutUser();
      navigate("/login");
    }
  };

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col relative pb-16">
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md p-6 z-20 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Profile</h1>
        <Settings className="w-6 h-6 text-gray-400 cursor-pointer hover:text-white transition" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* 프로필 카드 */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 flex items-center gap-4 mb-8 shadow-lg">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md border border-white/30 overflow-hidden">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="프로필"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-8 h-8 text-white" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">
              {user?.displayName || "Chort User"}
            </h2>
            <p className="text-white/80 text-sm">
              {user?.email || "chort-explorer"}
            </p>
          </div>
        </div>

        {/* 통계 섹션 */}
        <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
          My Stats
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-black border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-white">{savedCount}</span>
            <span className="text-xs text-gray-500 mt-1">Saved Repos</span>
          </div>
          <div className="bg-black border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1">
              <Flame className={`w-6 h-6 ${streak > 0 ? "text-orange-500" : "text-gray-600"}`} />
              <span className="text-2xl font-black text-white">{streak}</span>
            </div>
            <span className="text-xs text-gray-500 mt-1">Streak Days</span>
          </div>
        </div>

        {/* 설정 및 메뉴 */}
        <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
          Settings
        </h3>
        <div className="bg-black border border-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={clearSaved}
            className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 transition border-b border-gray-800 text-red-400"
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-5 h-5" />
              <span>보관함 전체 비우기</span>
            </div>
          </button>

          <button
            onClick={clearStreak}
            className="w-full p-4 flex items-center justify-between hover:bg-orange-500/10 transition border-b border-gray-800 text-orange-400"
          >
            <div className="flex items-center gap-3">
              <Flame className="w-5 h-5" />
              <span>Streak 초기화</span>
            </div>
          </button>

          <button
            onClick={handleLogout}
            className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 transition text-red-400"
          >
            <div className="flex items-center gap-3">
              <LogOut className="w-5 h-5" />
              <span>로그아웃</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
