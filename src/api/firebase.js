// src/api/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GithubAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";

// 💡 Firebase 콘솔 -> 프로젝트 개요 -> 앱 추가(웹)에서 나오는 설정값을 붙여넣으세요.
const firebaseConfig = {
  apiKey: "AIzaSyAfprrXGFhkQljKkE1qY53r_-atdB91ZXU",
  authDomain: "chort-3733b.firebaseapp.com",
  projectId: "chort-3733b",
  storageBucket: "chort-3733b.firebasestorage.app",
  messagingSenderId: "249933114283",
  appId: "1:249933114283:web:8188448cb5a83eeaca00ee",
  measurementId: "G-WYJV4GJJD9",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const githubProvider = new GithubAuthProvider();

// 로그인 함수
export const loginWithGithub = async () => {
  try {
    const result = await signInWithPopup(auth, githubProvider);

    // 💡 핵심: GitHub API 호출 한도를 5,000회로 늘려줄 마법의 토큰 추출!
    const credential = GithubAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;

    // 이 토큰을 로컬 스토리지에 저장해둡니다.
    if (token) {
      localStorage.setItem("github_token", token);
    }

    return result.user;
  } catch (error) {
    console.error("로그인 실패:", error);
    return null;
  }
};

// 로그아웃 함수
export const logoutUser = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("github_token"); // 로그아웃 시 토큰 삭제
    console.log("로그아웃 완료");
  } catch (error) {
    console.error("로그아웃 에러:", error);
  }
};
