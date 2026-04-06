// src/api/firebase.js
import { initializeApp } from "firebase/app";
import {
  getAuth,
  GithubAuthProvider,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

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
export const db = getFirestore(app);
const githubProvider = new GithubAuthProvider();

// 💡 GitHub provider에 필요한 스코프 추가 (star 권한)
githubProvider.addScope("public_repo");

// 로그인 함수
export const loginWithGithub = async () => {
  try {
    const result = await signInWithPopup(auth, githubProvider);

    // 💡 핵심: GitHub API 호출 한도를 5,000회로 늘려줄 마법의 토큰 추출!
    const credential = GithubAuthProvider.credentialFromResult(result);
    const token = credential.accessToken;

    // 이 토큰을 로컬 스토리지에 저장해둡니다.
    if (token) {
      console.log("✅ GitHub 토큰 저장 완료!");
      localStorage.setItem("github_token", token);
    } else {
      console.warn("⚠️ GitHub 토큰을 받지 못했습니다.");
    }

    return result.user;
  } catch (error) {
    console.error("❌ 로그인 실패:", error);
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

// ==========================================
// Firestore 댓글 관련 함수들
// ==========================================

// 댓글 추가 함수
export const addComment = async (repoId, text, user) => {
  if (!user || !text.trim()) {
    console.error("사용자 정보 또는 댓글 내용이 없습니다.");
    return null;
  }

  try {
    const docRef = await addDoc(collection(db, "comments"), {
      repoId,
      userId: user.uid,
      userEmail: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      text: text.trim(),
      createdAt: new Date(),
    });
    console.log("✅ 댓글이 저장되었습니다:", docRef.id);
    return { id: docRef.id };
  } catch (error) {
    console.error("댓글 저장 에러:", error);
    return null;
  }
};

// 특정 repo의 댓글 조회 함수
export const getComments = async (repoId) => {
  try {
    const q = query(collection(db, "comments"), where("repoId", "==", repoId));
    const querySnapshot = await getDocs(q);
    const comments = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate(),
    }));
    // 클라이언트 사이드에서 최신순 정렬
    comments.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    console.log("✅ 댓글 조회 완료:", comments.length);
    return comments;
  } catch (error) {
    console.error("댓글 조회 에러:", error);
    return [];
  }
};

// 댓글 삭제 함수
export const deleteComment = async (commentId) => {
  try {
    await deleteDoc(doc(db, "comments", commentId));
    console.log("✅ 댓글이 삭제되었습니다:", commentId);
    return true;
  } catch (error) {
    console.error("댓글 삭제 에러:", error);
    return false;
  }
};
