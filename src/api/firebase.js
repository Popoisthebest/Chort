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
  orderBy,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

// 💡 .env 파일에 저장된 환경 변수를 불러옵니다.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
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
    const credential = GithubAuthProvider.credentialFromResult(result);
    if (credential) {
      localStorage.setItem("github_token", credential.accessToken);
    }
    return result.user;
  } catch (error) {
    console.error("로그인 에러:", error);
    return null;
  }
};

// 로그아웃 함수
export const logoutUser = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem("github_token");
    console.log("✅ 로그아웃 성공");
  } catch (error) {
    console.error("로그아웃 에러:", error);
  }
};

// 댓글 조회 함수
export const getComments = async (repoId) => {
  try {
    const q = query(collection(db, "comments"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);

    const comments = querySnapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Firestore Timestamp -> Date 변환
          createdAt: data.createdAt?.toDate?.() || data.createdAt || null,
          // 구버전/신버전 필드 모두 대응
          displayName: data.displayName || data.userName || "익명",
          photoURL: data.photoURL || data.userPhoto || "",
        };
      })
      .filter((comment) => comment.repoId === String(repoId));

    return comments;
  } catch (error) {
    console.error("댓글 조회 에러:", error);
    return [];
  }
};

// 댓글 추가 함수
export const addComment = async (repoId, text, user) => {
  if (!user || !text.trim()) return null;

  try {
    const docRef = await addDoc(collection(db, "comments"), {
      repoId: String(repoId),
      text: text.trim(),
      userId: user.uid,

      // CommentsPanel과 동일한 필드명으로 저장
      displayName:
        user.displayName || user.reloadUserInfo?.screenName || "익명",
      photoURL: user.photoURL || "",
      userEmail: user.email || "",

      // 하위 호환용으로 남겨도 됨
      userName: user.displayName || user.reloadUserInfo?.screenName || "익명",
      userPhoto: user.photoURL || "",

      createdAt: new Date(),
      replyCount: 0,
    });

    return { id: docRef.id };
  } catch (error) {
    console.error("댓글 추가 에러:", error);
    return null;
  }
};

// 특정 댓글 삭제 함수
export const deleteComment = async (commentId) => {
  try {
    await deleteDoc(doc(db, "comments", commentId));
    return true;
  } catch (error) {
    console.error("댓글 삭제 에러:", error);
    return false;
  }
};

// 특정 댓글에 답글(대댓글) 추가 함수
export const addReply = async (commentId, text, user) => {
  if (!user || !text.trim()) {
    console.error("사용자 정보 또는 답글 내용이 없습니다.");
    return null;
  }

  try {
    const repliesRef = collection(db, "comments", commentId, "replies");
    const docRef = await addDoc(repliesRef, {
      userId: user.uid,
      userEmail: user.email || "",
      displayName:
        user.displayName || user.reloadUserInfo?.screenName || "익명",
      photoURL: user.photoURL || "",
      text: text.trim(),
      createdAt: new Date(),
    });
    console.log("✅ 답글이 저장되었습니다:", docRef.id);
    return { id: docRef.id };
  } catch (error) {
    console.error("답글 저장 에러:", error);
    return null;
  }
};

// 특정 댓글의 답글 조회 함수
export const getReplies = async (commentId) => {
  try {
    const repliesRef = collection(db, "comments", commentId, "replies");
    const q = query(repliesRef);
    const querySnapshot = await getDocs(q);
    const replies = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt:
        doc.data().createdAt?.toDate?.() || doc.data().createdAt || null,
    }));

    replies.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return replies;
  } catch (error) {
    console.error("답글 로드 에러:", error);
    return [];
  }
};

// 특정 답글 삭제 함수
export const deleteReply = async (commentId, replyId) => {
  try {
    await deleteDoc(doc(db, "comments", commentId, "replies", replyId));
    return true;
  } catch (error) {
    console.error("답글 삭제 에러:", error);
    return false;
  }
};
