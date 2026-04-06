import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import BottomNav from "./components/Layout/BottomNav";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Saved from "./pages/Saved";
import Profile from "./pages/Profile";
import Login from "./pages/Login"; // 💡 새로 만든 로그인 페이지

// 파이어베이스 auth 객체 가져오기
import { auth } from "./api/firebase";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // 처음 앱 켤 때 로그인 상태 확인 중인지 여부

  useEffect(() => {
    // 💡 파이어베이스가 사용자의 로그인 상태를 확인합니다.
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false); // 확인이 끝나면 로딩 해제
    });
    return () => unsubscribe();
  }, []);

  // 로그인 상태를 확인하는 동안 보여줄 로딩 화면
  if (loading) {
    return (
      <div className="bg-gray-900 min-h-screen flex justify-center">
        <div className="w-full max-w-md bg-black h-screen flex justify-center items-center">
          <div className="w-8 h-8 border-4 border-gray-600 border-t-white rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="bg-gray-900 min-h-screen flex justify-center">
        <div className="w-full max-w-md bg-black h-screen relative overflow-hidden shadow-2xl">
          <Routes>
            {/* 로그인 페이지 라우트: 이미 로그인했다면 홈으로 튕겨냄 */}
            <Route
              path="/login"
              element={user ? <Navigate to="/" replace /> : <Login />}
            />

            {/* 💡 아래의 페이지들은 로그인을 안 했다면 모두 /login 으로 튕겨냅니다 (Auth Guard) */}
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
                user ? (
                  <Profile user={user} />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
          </Routes>

          {/* 💡 로그인한 사용자에게만 하단 네비게이션 바를 보여줍니다. */}
          {user && <BottomNav />}
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
