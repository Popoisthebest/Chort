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
      <AppContent user={user} setUser={setUser} />
    </BrowserRouter>
  );
}

export default App;
