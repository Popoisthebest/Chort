import React from "react";
import { Home, Compass, Bookmark, User, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { logoutUser } from "../../api/firebase";

export default function SideNav({ currentPath, onLogout }) {
  const navItems = [
    { icon: Home, label: "홈", path: "/" },
    { icon: Compass, label: "탐색", path: "/explore" },
    { icon: Bookmark, label: "저장됨", path: "/saved" },
    { icon: User, label: "프로필", path: "/profile" },
  ];

  const handleLogout = async () => {
    if (window.confirm("로그아웃 하시겠습니까?")) {
      await logoutUser();
      onLogout();
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
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-3 rounded-lg transition ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-6 h-6" />
              <span className="text-base font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 로그아웃 버튼 */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-red-400 hover:bg-red-500/10 transition"
      >
        <LogOut className="w-6 h-6" />
        <span className="text-base font-semibold">로그아웃</span>
      </button>
    </div>
  );
}
