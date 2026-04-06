import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Search, Bookmark, User } from "lucide-react";

export default function BottomNav() {
  const location = useLocation();

  // 현재 경로에 따라 아이콘 색상을 활성화하는 헬퍼 함수
  const isActive = (path) =>
    location.pathname === path ? "text-white" : "text-gray-500";

  return (
    <div className="absolute bottom-0 w-full max-w-md bg-black border-t border-gray-800 px-6 py-4 flex justify-between items-center z-50">
      <Link
        to="/"
        className={`flex flex-col items-center gap-1 ${isActive("/")}`}
      >
        <Home className="w-6 h-6" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>

      <Link
        to="/explore"
        className={`flex flex-col items-center gap-1 ${isActive("/explore")}`}
      >
        <Search className="w-6 h-6" />
        <span className="text-[10px] font-medium">Explore</span>
      </Link>

      <Link
        to="/saved"
        className={`flex flex-col items-center gap-1 ${isActive("/saved")}`}
      >
        <Bookmark className="w-6 h-6" />
        <span className="text-[10px] font-medium">Saved</span>
      </Link>

      <Link
        to="/profile"
        className={`flex flex-col items-center gap-1 ${isActive("/profile")}`}
      >
        <User className="w-6 h-6" />
        <span className="text-[10px] font-medium">Profile</span>
      </Link>
    </div>
  );
}
