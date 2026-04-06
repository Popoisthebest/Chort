import React from "react";
import { useNavigate } from "react-router-dom";
import { loginWithGithub } from "../api/firebase";

// 💡 별도의 import 없이 바로 사용할 수 있는 GitHub SVG 아이콘 컴포넌트
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

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const user = await loginWithGithub();
      if (user) {
        navigate("/");
      }
    } catch (error) {
      console.error("로그인 중 에러:", error);
    }
  };

  return (
    <div className="w-full h-full bg-[#0d1117] flex flex-col items-center justify-center p-6 overflow-hidden">
      <div className="flex flex-col items-center mb-16">
        {/* 상단 로고 박스 */}
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(255,255,255,0.15)]">
          <GithubLogo className="w-12 h-12 text-black" />
        </div>

        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
          Chort
        </h1>
        <p className="text-gray-400 text-sm font-medium text-center">
          GitHub 트렌딩을 숏폼처럼 넘겨보세요
        </p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={handleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white text-black py-4 px-6 rounded-full font-bold text-base hover:bg-gray-200 transition-all active:scale-95 shadow-lg"
        >
          <GithubLogo className="w-5 h-5" />
          GitHub로 계속하기
        </button>

        <p className="text-gray-500 text-[11px] text-center leading-relaxed">
          원활한 시청을 위해 로그인이 필요합니다.
          <br />
          (API 호출 한도가 5,000회로 확장됩니다)
        </p>
      </div>
    </div>
  );
}
