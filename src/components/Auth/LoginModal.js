// src/components/Auth/LoginModal.js
import React from "react";
import { X } from "lucide-react";
import { loginWithGithub } from "../../api/firebase";
import { useNavigate } from "react-router-dom";

const GithubLogo = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

/**
 * LoginModal
 * 로그인이 필요한 기능에 접근할 때 표시되는 모달
 * @param {string} message - 모달에 표시할 안내 메시지
 * @param {function} onClose - 모달 닫기 콜백
 * @param {function} onLoginSuccess - 로그인 성공 후 콜백 (선택)
 */
export default function LoginModal({ message, onClose, onLoginSuccess }) {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const user = await loginWithGithub();
      if (user) {
        onClose();
        if (onLoginSuccess) {
          onLoginSuccess(user);
        }
      }
    } catch (error) {
      console.error("로그인 중 에러:", error);
    }
  };

  const handleGoToLogin = () => {
    onClose();
    navigate("/login");
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#0d1117] border border-gray-700 rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-5">
          <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <GithubLogo className="w-7 h-7 text-black" />
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <h2 className="text-xl font-bold text-white mb-2">로그인이 필요해요</h2>
        <p className="text-gray-400 text-sm mb-6 leading-relaxed">
          {message || "이 기능을 사용하려면 GitHub 로그인이 필요합니다."}
        </p>

        {/* 버튼 */}
        <div className="space-y-3">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 px-6 rounded-full font-bold text-sm hover:bg-gray-200 transition-all active:scale-95 shadow-lg"
          >
            <GithubLogo className="w-5 h-5" />
            GitHub로 로그인
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 rounded-full font-bold text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 transition"
          >
            나중에 하기
          </button>
        </div>

        <p className="text-gray-600 text-[11px] text-center mt-4 leading-relaxed">
          로그인 시 API 호출 한도가 5,000회로 확장됩니다
        </p>
      </div>
    </div>
  );
}
