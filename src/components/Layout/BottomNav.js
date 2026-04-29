import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Search, Bookmark, User } from "lucide-react";

export default function BottomNav({ user, openLoginModal }) {
  const location = useLocation();

  // 현재 경로에 따라 아이콘 색상을 활성화하는 헬퍼 함수
  const isActive = (path) =>
    location.pathname === path ? "text-white" : "text-gray-500";

  const items = [
    { icon: Home, label: "Home", path: "/", requiresAuth: false },
    { icon: Search, label: "Explore", path: "/explore", requiresAuth: false },
    { icon: Bookmark, label: "Saved", path: "/saved", requiresAuth: true },
    { icon: User, label: "Profile", path: "/profile", requiresAuth: true },
  ];

  const handleProtectedClick = (e, item) => {
    if (item.requiresAuth && !user) {
      e.preventDefault();
      openLoginModal?.(
        `${item.label} 페이지를 보려면 GitHub 로그인이 필요합니다.`,
      );
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-800 bg-black/95 px-4 py-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-md items-center justify-between">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.requiresAuth && !user ? "#" : item.path}
              onClick={(e) => handleProtectedClick(e, item)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 ${isActive(item.path)}`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
