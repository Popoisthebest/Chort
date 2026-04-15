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

function AppContent({ user, setUser }) {
  const location = useLocation();

  // 로그인 페이지에서는 사이드바 숨김
  const isLoginPage = location.pathname === "/login";

  return (
    <div className="bg-gray-900 min-h-screen flex overflow-hidden">
      {/* 좌측 사이드바 */}
      {user && !isLoginPage && (
        <SideNav
          currentPath={location.pathname}
          onLogout={() => setUser(null)}
        />
      )}

      {/* 중앙 콘텐츠 */}
      <div
        className={`flex-1 h-screen flex overflow-hidden ${user && !isLoginPage ? "ml-64" : ""}`}
      >
        <Routes>
          {/* 로그인 페이지 */}
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />

          {/* 보호된 라우트들 */}
          <Route
            path="/"
            element={user ? <Home /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/explore"
            element={user ? <Explore /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/saved"
            element={user ? <Saved /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/profile"
            element={
              user ? <Profile user={user} /> : <Navigate to="/login" replace />
            }
          />
        </Routes>
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
