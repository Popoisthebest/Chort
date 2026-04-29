// src/pages/Profile.js
import React, { useState, useEffect, useContext } from "react";
import {
  User,
  Settings,
  Trash2,
  LogOut,
  Flame,
  ExternalLink,
  X,
  Bell,
  Moon,
  Globe,
  ChevronRight,
  Info,
} from "lucide-react";
import { logoutUser, getMyComments } from "../api/firebase";
import { useNavigate } from "react-router-dom";
import { LoginModalContext } from "../App";
import { clearProfile, getProfile } from "../utils/userProfile";

const STREAK_KEY = "chort_streak";
const SETTINGS_KEY = "chort_settings";

// 기본 설정값
const DEFAULT_SETTINGS = {
  language: "ko", // 번역 기본 언어
  autoTranslate: true, // 자동 번역 사용 여부
  feedNotification: false, // 알림 (PWA용 플레이스홀더)
  theme: "dark", // 테마 (현재 dark 고정, 확장용)
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const saveSettings = (settings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // 다른 탭/컴포넌트에 설정 변경 알림
  window.dispatchEvent(new Event("storage"));
};

/**
 * Streak 계산: 처음 방문이면 무조건 1에서 시작
 */
const getOrInitStreak = () => {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!raw) {
      // 첫 방문 → 1로 시작
      localStorage.setItem(
        STREAK_KEY,
        JSON.stringify({ lastVisit: today.toISOString(), streak: 1 }),
      );
      return 1;
    }

    const { lastVisit, streak } = JSON.parse(raw);
    const last = new Date(lastVisit);
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return streak; // 오늘 이미 체크인

    if (diffDays === 1) {
      // 연속 방문 → +1
      const newStreak = streak + 1;
      localStorage.setItem(
        STREAK_KEY,
        JSON.stringify({ lastVisit: today.toISOString(), streak: newStreak }),
      );
      return newStreak;
    }

    // 2일+ 공백 → 1로 리셋
    localStorage.setItem(
      STREAK_KEY,
      JSON.stringify({ lastVisit: today.toISOString(), streak: 1 }),
    );
    return 1;
  } catch {
    return 1;
  }
};

// ─── 관심 언어 도넛 차트 ───────────────────────────────────────────────────────
function LanguageDonutChart({ languages }) {
  const COLORS = ["#A259FF", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const entries = Object.entries(languages || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-600 text-center py-4">
        아직 데이터가 없습니다. 피드를 탐색해보세요!
      </p>
    );
  }

  // SVG 도넛 계산
  const cx = 60,
    cy = 60,
    r = 45,
    stroke = 14;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = entries.map(([lang, val], i) => {
    const pct = val / total;
    const dash = pct * circumference;
    const slice = {
      lang,
      val,
      pct,
      dash,
      offset,
      color: COLORS[i % COLORS.length],
    };
    offset += dash;
    return slice;
  });

  return (
    <div className="bg-black border border-gray-800 rounded-xl p-4 mb-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        관심 언어 Top 5
      </h3>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <svg width="120" height="120" viewBox="0 0 120 120" className="shrink-0">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1f2937"
            strokeWidth={stroke}
          />
          {slices.map((s) => (
            <circle
              key={s.lang}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={circumference / 4 - s.offset}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          ))}
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fill="white"
            fontSize="10"
            fontWeight="bold"
          >
            {entries.length}개
          </text>
        </svg>
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {slices.map((s) => (
            <div key={s.lang} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-gray-300 truncate flex-1">
                {s.lang || "기타"}
              </span>
              <span className="text-gray-500 shrink-0">
                {Math.round(s.pct * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 토픽 태그 클라우드 ────────────────────────────────────────────────────────
function TopicTagCloud({ topics }) {
  const entries = Object.entries(topics || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-600 text-center py-4">
        아직 데이터가 없습니다.
      </p>
    );
  }

  const maxVal = entries[0]?.[1] || 1;
  return (
    <div className="bg-black border border-gray-800 rounded-xl p-4 mb-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        관심 토픽
      </h3>
      <div className="flex flex-wrap gap-2">
        {entries.map(([topic, val]) => {
          const weight = val / maxVal;
          const size =
            weight > 0.7 ? "text-sm" : weight > 0.4 ? "text-xs" : "text-[10px]";
          const opacity =
            weight > 0.7
              ? "opacity-100"
              : weight > 0.4
                ? "opacity-80"
                : "opacity-50";
          return (
            <span
              key={topic}
              className={`px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-300 font-semibold ${size} ${opacity}`}
            >
              #{topic}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Streak 히트맵 (GitHub contribution 스타일) ───────────────────────────────
const HEATMAP_KEY = "chort_heatmap";

const recordHeatmapToday = () => {
  try {
    const raw = localStorage.getItem(HEATMAP_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const today = new Date().toISOString().slice(0, 10);
    map[today] = (map[today] || 0) + 1;
    // 최근 365일만 유지
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    for (const key of Object.keys(map)) {
      if (key < cutoffStr) delete map[key];
    }
    localStorage.setItem(HEATMAP_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

function StreakHeatmap() {
  const raw = (() => {
    try {
      return JSON.parse(localStorage.getItem(HEATMAP_KEY) || "{}");
    } catch {
      return {};
    }
  })();

  // 최근 15주(105일) 생성
  const WEEKS = 15;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 시작일: 오늘 기준 WEEKS*7일 전의 일요일
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - WEEKS * 7 + 1);

  const cells = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ date: key, count: raw[key] || 0 });
  }

  const getColor = (count) => {
    if (count === 0) return "bg-gray-800";
    if (count === 1) return "bg-purple-900";
    if (count <= 3) return "bg-purple-600";
    return "bg-purple-400";
  };

  // 주 단위로 그룹화
  const weeks = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }

  return (
    <div className="bg-black border border-gray-800 rounded-xl p-4 mb-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
        Activity (최근 {WEEKS}주)
      </h3>
      <div className="flex gap-0.5 overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-0.5">
            {week.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count}회`}
                className={`w-3 h-3 rounded-sm ${getColor(cell.count)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[9px] text-gray-600">적음</span>
        {["bg-gray-800", "bg-purple-900", "bg-purple-600", "bg-purple-400"].map(
          (c) => (
            <div key={c} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
          ),
        )}
        <span className="text-[9px] text-gray-600">많음</span>
      </div>
    </div>
  );
}

// ─── 설정 패널 ────────────────────────────────────────────────────────────────
function SettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(loadSettings());

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#161b22] border border-gray-700 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            설정
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* 번역 언어 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-gray-200">
                번역 언어
              </span>
            </div>
            <div className="flex gap-2">
              {[
                { value: "ko", label: "한국어" },
                { value: "ja", label: "日本語" },
                { value: "zh", label: "中文" },
                { value: "en", label: "English" },
              ].map((lang) => (
                <button
                  key={lang.value}
                  onClick={() => update("language", lang.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                    settings.language === lang.value
                      ? "bg-purple-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* 자동 번역 — 토글 버그 수정 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-200">자동 번역</p>
              <p className="text-xs text-gray-500 mt-0.5">
                카드 설명을 자동으로 번역합니다
              </p>
            </div>
            {/* 토글: w-11(44px), h-6(24px). 동그라미 w-4 h-4(16px).
                비활성: left=2px (translate-x-0.5 → 0.125rem=2px)
                활성:   left=2px + (44-24)=22px → translate-x-[22px] */}
            <button
              onClick={() => update("autoTranslate", !settings.autoTranslate)}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${
                settings.autoTranslate ? "bg-purple-600" : "bg-gray-700"
              }`}
            >
              <span
                className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  settings.autoTranslate
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* 피드 알림 (플레이스홀더) */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-200 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-gray-400" />
                트렌딩 알림
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                새로운 트렌딩 레포 알림 (준비 중)
              </p>
            </div>
            <button
              disabled
              className="relative w-11 h-6 rounded-full bg-gray-700 opacity-40 cursor-not-allowed focus:outline-none"
            >
              <span className="absolute top-1 w-4 h-4 bg-white rounded-full shadow translate-x-[2px]" />
            </button>
          </div>

          {/* 테마 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Moon className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-semibold text-gray-200">테마</span>
            </div>
            <div className="flex gap-2">
              {[
                { value: "dark", label: "다크" },
                { value: "light", label: "라이트 (준비 중)", disabled: true },
              ].map((t) => (
                <button
                  key={t.value}
                  disabled={t.disabled}
                  onClick={() => !t.disabled && update("theme", t.value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
                    t.disabled
                      ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                      : settings.theme === t.value
                        ? "bg-purple-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 앱 정보 */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-start gap-3">
            <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <div className="text-xs text-gray-400 space-y-1">
              <p className="font-semibold text-gray-300">Chort v0.1</p>
              <p>GitHub Trending 숏폼 탐색 앱</p>
              <p>설정은 기기에 저장됩니다.</p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm transition"
          >
            저장 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 프로필 페이지 ──────────────────────────────────────────────────────
export default function Profile() {
  const { user, openLoginModal } = useContext(LoginModalContext);
  const [savedCount, setSavedCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [userProfile, setUserProfile] = useState({ languages: {}, topics: {} });
  const [activeTab, setActiveTab] = useState("stats"); // "stats" | "comments"
  const [myComments, setMyComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const loaded = JSON.parse(localStorage.getItem("chort_saved")) || [];
    setSavedCount(loaded.length);
    setStreak(getOrInitStreak());
    setUserProfile(getProfile());
    recordHeatmapToday();
  }, [user]);

  useEffect(() => {
    if (!user || activeTab !== "comments") return;
    setLoadingComments(true);
    getMyComments(user.uid)
      .then(setMyComments)
      .finally(() => setLoadingComments(false));
  }, [user, activeTab]);

  const clearSaved = () => {
    if (window.confirm("저장된 보관함을 모두 비우시겠습니까?")) {
      localStorage.removeItem("chort_saved");
      setSavedCount(0);
      alert("보관함이 초기화되었습니다. 🗑️");
    }
  };

  const clearPersonalization = () => {
    if (
      window.confirm("개인화 데이터(언어·토픽 선호도)를 초기화하시겠습니까?")
    ) {
      clearProfile();
      alert("개인화 데이터가 초기화되었습니다.");
    }
  };

  const handleLogout = async () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      await logoutUser();
      navigate("/");
    }
  };

  // GitHub 로그인에서 추출한 username (providerData에서 읽기)
  const githubLogin =
    user?.reloadUserInfo?.screenName ||
    user?.providerData?.find((p) => p.providerId === "github.com")
      ?.displayName ||
    null;

  // 비로그인 상태
  if (!user) {
    return (
      <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-2">
          <User className="w-8 h-8 text-gray-500" />
        </div>
        <p className="text-gray-400 text-center">
          프로필을 보려면 로그인이 필요합니다.
        </p>
        <button
          onClick={() =>
            openLoginModal(
              "프로필 페이지를 이용하려면 GitHub 로그인이 필요합니다.",
            )
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
      {/* 헤더 — 오른쪽 설정 버튼 제거 */}
      <div className="sticky top-0 bg-gray-900/90 backdrop-blur-md px-4 py-4 sm:p-6 z-20 flex items-center">
        <h1 className="text-2xl sm:text-3xl font-bold">Profile</h1>
      </div>

      {/* 탭 전환 */}
      <div className="flex border-b border-gray-800 px-4 sm:px-6 shrink-0 overflow-x-auto">
        {[
          { key: "stats", label: "통계" },
          { key: "comments", label: "내 댓글" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition ${
              activeTab === tab.key
                ? "border-purple-500 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        {activeTab === "comments" ? (
          /* 내 댓글 탭 */
          <div className="mt-4">
            {loadingComments ? (
              <div className="flex justify-center mt-16">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : myComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center mt-16 text-gray-600">
                <p>작성한 댓글이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-black border border-gray-800 rounded-xl p-4"
                  >
                    <p className="text-xs text-gray-500 mb-1">
                      레포: {comment.repoId}
                    </p>
                    <p className="text-sm text-gray-200 break-words">
                      {comment.text}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-gray-600">
                        {comment.createdAt
                          ? comment.createdAt.toLocaleString("ko-KR", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                      {comment.replyCount > 0 && (
                        <span className="text-[10px] text-purple-400">
                          답글 {comment.replyCount}개
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-6 pt-4">
            {/* 프로필 카드 */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-5 sm:p-6 flex items-center gap-4 mb-6 shadow-lg">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md border border-white/30 overflow-hidden shrink-0">
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
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold truncate">
                  {user?.displayName || "Chort User"}
                </h2>
                <p className="text-white/80 text-sm truncate">
                  {user?.email || "chort-explorer"}
                </p>
                {/* 내 GitHub 바로가기 */}
                {githubLogin && (
                  <button
                    onClick={() =>
                      window.open(`https://github.com/${githubLogin}`, "_blank")
                    }
                    className="mt-2 flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    github.com/{githubLogin}
                  </button>
                )}
              </div>
            </div>

            {/* GitHub 바로가기 버튼 (명시적) */}
            {githubLogin && (
              <button
                onClick={() =>
                  window.open(`https://github.com/${githubLogin}`, "_blank")
                }
                className="w-full flex items-center justify-center gap-2 py-3 mb-6 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-semibold text-gray-200 transition"
              >
                <ExternalLink className="w-4 h-4" />내 GitHub 프로필 보기
              </button>
            )}

            {/* 통계 */}
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
              My Stats
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-black border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-white">
                  {savedCount}
                </span>
                <span className="text-xs text-gray-500 mt-1">Saved Repos</span>
              </div>
              <div className="bg-black border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center">
                <div className="flex items-center gap-1">
                  <Flame
                    className={`w-6 h-6 ${streak > 0 ? "text-orange-500" : "text-gray-600"}`}
                  />
                  <span className="text-2xl font-black text-white">
                    {streak}
                  </span>
                </div>
                <span className="text-xs text-gray-500 mt-1">Streak Days</span>
              </div>
            </div>

            {/* 관심 언어 도넛 차트 */}
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
              Insights
            </h3>
            <LanguageDonutChart languages={userProfile.languages} />
            <TopicTagCloud topics={userProfile.topics} />
            <StreakHeatmap />

            {/* 설정 메뉴 */}
            <h3 className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-wider">
              Settings
            </h3>
            <div className="bg-black border border-gray-800 rounded-xl overflow-hidden">
              {/* 설정 패널 열기 */}
              <button
                onClick={() => setShowSettings(true)}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition border-b border-gray-800 text-gray-300"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-gray-400" />
                  <span>앱 설정</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>

              {/* 보관함 초기화 */}
              <button
                onClick={clearSaved}
                className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 transition border-b border-gray-800 text-red-400"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="w-5 h-5" />
                  <span>보관함 전체 비우기</span>
                </div>
              </button>

              {/* 개인화 데이터 초기화 */}
              <button
                onClick={clearPersonalization}
                className="w-full p-4 flex items-center justify-between hover:bg-orange-500/10 transition border-b border-gray-800 text-orange-400"
              >
                <div className="flex items-center gap-3">
                  <X className="w-5 h-5" />
                  <span>추천 데이터 초기화</span>
                </div>
              </button>

              {/* 로그아웃 */}
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
        )}{" "}
        {/* activeTab 분기 끝 */}
      </div>

      {/* 설정 패널 오버레이 */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
