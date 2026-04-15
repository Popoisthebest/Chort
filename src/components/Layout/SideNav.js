// src/components/Layout/SideNav.js
import React from "react";
import { Home, Compass, Bookmark, User, LogOut, LogIn } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { logoutUser } from "../../api/firebase";

/**
 * SideNav
 * - 로그인/비로그인 모두 표시
 * - 비로그인 시 Saved/Profile 클릭하면 로그인 모달 표시
 * - 비로그인 시 로그아웃 대신 로그인 버튼 표시
 */
export default function SideNav({
  user,
  currentPath,
  onLogout,
  openLoginModal,
}) {
  const navigate = useNavigate();

  // 공개 접근 가능한 경로
  const publicPaths = ["/", "/explore"];

  const navItems = [
    { icon: Home, label: "홈", path: "/", requiresAuth: false },
    { icon: Compass, label: "탐색", path: "/explore", requiresAuth: false },
    { icon: Bookmark, label: "저장됨", path: "/saved", requiresAuth: true },
    { icon: User, label: "프로필", path: "/profile", requiresAuth: true },
  ];

  const handleLogout = async () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      await logoutUser();
      onLogout();
      navigate("/");
    }
  };

  const handleLoginClick = () => {
    navigate("/login");
  };

  const handleNavClick = (e, item) => {
    if (item.requiresAuth && !user) {
      e.preventDefault();
      openLoginModal(
        `${item.label} 페이지를 보려면 GitHub 로그인이 필요합니다.`,
      );
    }
  };

  return (
    <div className="fixed left-0 top-0 h-screen w-64 bg-black border-r border-gray-800 flex flex-col p-4">
      {/* 로고 */}
      <div className="mb-12 mt-2">
        <h1 className="text-2xl font-black text-white">Chort</h1>
        <p className="text-xs text-gray-500 mt-1">GitHub Trending</p>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 space-y-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.path;
          const isLocked = item.requiresAuth && !user;

          return (
            <Link
              key={item.path}
              to={item.requiresAuth && !user ? "#" : item.path}
              onClick={(e) => handleNavClick(e, item)}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : isLocked
                    ? "text-gray-600 hover:text-gray-400 hover:bg-white/5 cursor-pointer"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-base font-semibold">{item.label}</span>
              {isLocked && (
                <span className="ml-auto text-[10px] text-gray-600 border border-gray-700 px-1.5 py-0.5 rounded">
                  로그인
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 하단 버튼 */}
      {user ? (
        // 로그인 상태: 로그아웃
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition"
        >
          <LogOut className="w-6 h-6" />
          <span className="text-base font-semibold">로그아웃</span>
        </button>
      ) : (
        // 비로그인 상태: 로그인 버튼
        <button
          onClick={handleLoginClick}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-purple-400 hover:bg-purple-500/10 border border-purple-500/30 transition"
        >
          <LogIn className="w-6 h-6" />
          <span className="text-base font-semibold">GitHub 로그인</span>
        </button>
      )}
    </div>
  );
}
