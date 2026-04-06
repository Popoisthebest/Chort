import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import BottomNav from "./components/Layout/BottomNav";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Saved from "./pages/Saved";
import Profile from "./pages/Profile";

function App() {
  return (
    <BrowserRouter>
      <div className="bg-gray-900 min-h-screen flex justify-center">
        <div className="w-full max-w-md bg-black h-screen relative overflow-hidden shadow-2xl">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>

          <BottomNav />
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
