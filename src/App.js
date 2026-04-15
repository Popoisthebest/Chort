// src/App.js
import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import SideNav from "./components/Layout/SideNav";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Saved from "./pages/Saved";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import LoginModal from "./components/Auth/LoginModal";
import { useLoginModal } from "./hooks/useLoginModal";

// 파이어베이스 auth 객체 가져오기
import { auth } from "./api/firebase";

// Error Boundary 컴포넌트
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-black border border-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
            <h1 className="text-2xl font-bold text-white mb-4">
              오류가 발생했습니다
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              예기치 않은 오류가 발생했습니다. 페이지를 다시 로드해주세요.
            </p>
            <button
              onClick={this.handleReset}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-xl transition"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 로그인 요청 모달 Context
export const LoginModalContext = React.createContext(null);

function AppContent({ user, setUser }) {
  const location = useLocation();

  const isLoginPage = location.pathname === "/login";

  const {
    isLoginModalOpen,
    loginModalMessage,
    loginModalOnSuccess,
    openLoginModal,
    closeLoginModal,
  } = useLoginModal();

  const handleLoginSuccess = (loggedInUser) => {
    setUser(loggedInUser);
    if (loginModalOnSuccess) {
      loginModalOnSuccess(loggedInUser);
    }
  };

  return (
    <LoginModalContext.Provider value={{ user, openLoginModal }}>
      <div className="bg-gray-900 min-h-screen flex overflow-hidden">
        {/* 좌측 사이드바: 로그인 페이지 제외 모두 표시 */}
        {!isLoginPage && (
          <SideNav
            user={user}
            currentPath={location.pathname}
            onLogout={() => setUser(null)}
            openLoginModal={openLoginModal}
          />
        )}

        {/* 중앙 콘텐츠 */}
        <div
          className={`flex-1 h-screen flex overflow-hidden ${!isLoginPage ? "ml-64" : ""}`}
        >
          <Routes>
            {/* 로그인 페이지 */}
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />

            {/* 공개 라우트: 로그인 없이 접근 가능 */}
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />

            {/* 보호된 라우트: 로그인 필요 */}
            <Route
              path="/saved"
              element={
                user ? (
                  <Saved />
                ) : (
                  <ProtectedPageFallback
                    openLoginModal={openLoginModal}
                    message="저장된 레포지토리를 보려면 로그인이 필요합니다."
                  />
                )
              }
            />
            <Route
              path="/profile"
              element={
                user ? (
                  <Profile user={user} />
                ) : (
                  <ProtectedPageFallback
                    openLoginModal={openLoginModal}
                    message="프로필을 보려면 로그인이 필요합니다."
                  />
                )
              }
            />
          </Routes>
        </div>

        {/* 전역 로그인 모달 */}
        {isLoginModalOpen && (
          <LoginModal
            message={loginModalMessage}
            onClose={closeLoginModal}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
      </div>
    </LoginModalContext.Provider>
  );
}

/**
 * 로그인이 필요한 페이지에 비로그인 상태로 접근했을 때 보여주는 폴백 UI
 */
function ProtectedPageFallback({ openLoginModal, message }) {
  useEffect(() => {
    // 페이지 진입 시 즉시 로그인 모달 표시
    openLoginModal(message);
  }, [openLoginModal, message]);

  return (
    <div className="w-full h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <p className="text-gray-400 text-sm mb-4">{message}</p>
        <button
          onClick={() => openLoginModal(message)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-8 rounded-full transition"
        >
          GitHub로 로그인
        </button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900 min-h-screen flex justify-center items-center">
        <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppContent user={user} setUser={setUser} />
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
