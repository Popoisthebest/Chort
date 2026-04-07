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
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  where,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";

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
const authInstance = getAuth(app);
const dbInstance = getFirestore(app);

export const auth = authInstance;
export const db = dbInstance;

const githubProvider = new GithubAuthProvider();
githubProvider.addScope("public_repo");

const GITHUB_TOKEN_KEY = "github_token";
const GITHUB_PROFILE_KEY = "github_profile";
const COMMENT_COUNT_CACHE_PREFIX = "chort_comment_count:";
const COMMENT_COUNT_TTL = 1000 * 60 * 2;

const trimText = (value) => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const text = trimText(value);
    if (text) return text;
  }
  return "";
};

const normalizeDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const sortByCreatedAtDesc = (a, b) => {
  const aTime = a.createdAt ? a.createdAt.getTime() : 0;
  const bTime = b.createdAt ? b.createdAt.getTime() : 0;
  return bTime - aTime;
};

const sortByCreatedAtAsc = (a, b) => {
  const aTime = a.createdAt ? a.createdAt.getTime() : 0;
  const bTime = b.createdAt ? b.createdAt.getTime() : 0;
  return aTime - bTime;
};

const normalizeGithubProfile = (profile = {}) => {
  const login = pickFirstNonEmpty(
    profile.login,
    profile.screenName,
    profile.username,
  );

  const displayName = pickFirstNonEmpty(
    login,
    profile.name,
    profile.displayName,
    profile.email,
  );

  const photoURL = pickFirstNonEmpty(
    profile.avatar_url,
    profile.avatarUrl,
    profile.photoURL,
    profile.photoUrl,
    profile.picture,
  );

  return {
    login,
    displayName: displayName || "익명",
    photoURL,
  };
};

const saveGithubProfile = (profile) => {
  try {
    const normalized = normalizeGithubProfile(profile);
    sessionStorage.setItem(GITHUB_PROFILE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalizeGithubProfile(profile);
  }
};

const getSavedGithubProfile = () => {
  try {
    const raw = sessionStorage.getItem(GITHUB_PROFILE_KEY);
    if (!raw) return null;
    return normalizeGithubProfile(JSON.parse(raw));
  } catch {
    return null;
  }
};

const getGithubProfileFromLoginResult = (result) => {
  const profile = result?.additionalUserInfo?.profile || {};
  const user = result?.user;
  const providerProfile = user?.providerData?.find(
    (item) => item?.providerId === "github.com",
  );

  return normalizeGithubProfile({
    login: pickFirstNonEmpty(
      profile.login,
      profile.screenName,
      user?.reloadUserInfo?.screenName,
      providerProfile?.displayName,
      user?.displayName,
      user?.email,
    ),
    name: pickFirstNonEmpty(
      profile.name,
      user?.displayName,
      providerProfile?.displayName,
    ),
    avatar_url: pickFirstNonEmpty(
      profile.avatar_url,
      user?.photoURL,
      providerProfile?.photoURL,
      user?.reloadUserInfo?.photoUrl,
    ),
    email: user?.email,
  });
};

const getGithubProfileFromUser = (user) => {
  if (!user) {
    return normalizeGithubProfile({});
  }

  const providerProfile = user?.providerData?.find(
    (item) => item?.providerId === "github.com",
  );

  return normalizeGithubProfile({
    login: pickFirstNonEmpty(
      user?.reloadUserInfo?.screenName,
      providerProfile?.displayName,
      user?.displayName,
      user?.email,
    ),
    name: pickFirstNonEmpty(
      user?.displayName,
      providerProfile?.displayName,
      user?.reloadUserInfo?.displayName,
    ),
    avatar_url: pickFirstNonEmpty(
      user?.photoURL,
      providerProfile?.photoURL,
      user?.reloadUserInfo?.photoUrl,
    ),
    email: user?.email,
  });
};

const resolveGithubIdentity = (user) => {
  const cachedProfile = getSavedGithubProfile();
  const liveProfile = getGithubProfileFromUser(user);

  const merged = normalizeGithubProfile({
    login: pickFirstNonEmpty(cachedProfile?.login, liveProfile?.login),
    name: pickFirstNonEmpty(
      cachedProfile?.displayName,
      liveProfile?.displayName,
      user?.displayName,
      user?.email,
    ),
    avatar_url: pickFirstNonEmpty(
      cachedProfile?.photoURL,
      liveProfile?.photoURL,
    ),
    email: user?.email,
  });

  if (merged.displayName || merged.photoURL) {
    saveGithubProfile(merged);
  }

  return {
    displayName:
      merged.displayName || user?.displayName || user?.email || "익명",
    photoURL: merged.photoURL || user?.photoURL || "",
  };
};

const getCommentCountCacheKey = (repoId) =>
  `${COMMENT_COUNT_CACHE_PREFIX}${String(repoId)}`;

const setCommentCountCache = (repoId, count) => {
  try {
    sessionStorage.setItem(
      getCommentCountCacheKey(repoId),
      JSON.stringify({
        count,
        expiresAt: Date.now() + COMMENT_COUNT_TTL,
      }),
    );
  } catch {
    // ignore
  }
};

const getCommentCountCache = (repoId) => {
  try {
    const raw = sessionStorage.getItem(getCommentCountCacheKey(repoId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(getCommentCountCacheKey(repoId));
      return null;
    }

    return Number.isFinite(parsed.count) ? parsed.count : null;
  } catch {
    return null;
  }
};

const invalidateCommentCountCache = (repoId) => {
  try {
    sessionStorage.removeItem(getCommentCountCacheKey(repoId));
  } catch {
    // ignore
  }
};

export const loginWithGithub = async () => {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    const credential = GithubAuthProvider.credentialFromResult(result);

    if (credential?.accessToken) {
      sessionStorage.setItem(GITHUB_TOKEN_KEY, credential.accessToken);
    }

    const githubProfile = getGithubProfileFromLoginResult(result);
    saveGithubProfile(githubProfile);

    return result.user;
  } catch (error) {
    console.error("로그인 에러:", error);
    return null;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
    sessionStorage.removeItem(GITHUB_TOKEN_KEY);
    sessionStorage.removeItem(GITHUB_PROFILE_KEY);
    console.log("✅ 로그아웃 성공");
  } catch (error) {
    console.error("로그아웃 에러:", error);
  }
};

export const getGithubToken = () => {
  return sessionStorage.getItem(GITHUB_TOKEN_KEY);
};

export const getComments = async (repoId) => {
  try {
    const commentsRef = collection(db, "comments");
    const q = query(commentsRef, where("repoId", "==", String(repoId)));
    const querySnapshot = await getDocs(q);

    const comments = querySnapshot.docs
      .map((snapshot) => {
        const data = snapshot.data();

        return {
          id: snapshot.id,
          repoId: data.repoId,
          text: data.text || "",
          userId: data.userId || "",
          displayName: data.displayName || "익명",
          photoURL: data.photoURL || "",
          createdAt: normalizeDate(data.createdAt),
          replyCount: Number.isFinite(data.replyCount) ? data.replyCount : 0,
        };
      })
      .sort(sortByCreatedAtDesc);

    const totalCount = comments.reduce(
      (sum, comment) => sum + 1 + (comment.replyCount || 0),
      0,
    );
    setCommentCountCache(repoId, totalCount);

    return comments;
  } catch (error) {
    console.error("댓글 조회 에러:", error);
    return [];
  }
};

export const getCommentCount = async (repoId) => {
  const cached = getCommentCountCache(repoId);
  if (cached !== null) {
    return cached;
  }

  const comments = await getComments(repoId);
  return comments.reduce(
    (sum, comment) => sum + 1 + (comment.replyCount || 0),
    0,
  );
};

export const addComment = async (repoId, text, user) => {
  if (!user || !text.trim()) return null;

  try {
    const identity = resolveGithubIdentity(user);

    const docRef = await addDoc(collection(db, "comments"), {
      repoId: String(repoId),
      text: text.trim(),
      userId: user.uid,
      displayName: identity.displayName,
      photoURL: identity.photoURL,
      createdAt: serverTimestamp(),
      replyCount: 0,
    });

    invalidateCommentCountCache(repoId);
    return { id: docRef.id };
  } catch (error) {
    console.error("댓글 추가 에러:", error);
    return null;
  }
};

export const deleteComment = async (commentId) => {
  try {
    const commentRef = doc(db, "comments", commentId);
    const commentSnap = await getDoc(commentRef);
    const repoId = commentSnap.exists() ? commentSnap.data()?.repoId : null;

    const repliesRef = collection(db, "comments", commentId, "replies");
    const repliesSnapshot = await getDocs(repliesRef);

    const deleteJobs = repliesSnapshot.docs.map((replyDoc) =>
      deleteDoc(doc(db, "comments", commentId, "replies", replyDoc.id)),
    );

    await Promise.all(deleteJobs);
    await deleteDoc(commentRef);

    if (repoId) {
      invalidateCommentCountCache(repoId);
    }

    return true;
  } catch (error) {
    console.error("댓글 삭제 에러:", error);
    return false;
  }
};

export const addReply = async (commentId, text, user) => {
  if (!user || !text.trim()) {
    console.error("사용자 정보 또는 답글 내용이 없습니다.");
    return null;
  }

  try {
    const commentRef = doc(db, "comments", commentId);
    const commentSnap = await getDoc(commentRef);

    if (!commentSnap.exists()) {
      throw new Error("원본 댓글이 존재하지 않습니다.");
    }

    const repoId = commentSnap.data()?.repoId || null;
    const repliesRef = collection(db, "comments", commentId, "replies");
    const identity = resolveGithubIdentity(user);

    const replyDoc = await addDoc(repliesRef, {
      userId: user.uid,
      displayName: identity.displayName,
      photoURL: identity.photoURL,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });

    await runTransaction(db, async (transaction) => {
      const freshCommentSnap = await transaction.get(commentRef);
      if (!freshCommentSnap.exists()) {
        throw new Error("원본 댓글이 존재하지 않습니다.");
      }

      const current = freshCommentSnap.data()?.replyCount || 0;
      transaction.update(commentRef, {
        replyCount: current + 1,
      });
    });

    if (repoId) {
      invalidateCommentCountCache(repoId);
    }

    return { id: replyDoc.id };
  } catch (error) {
    console.error("답글 저장 에러:", error);
    return null;
  }
};

export const getReplies = async (commentId) => {
  try {
    const repliesRef = collection(db, "comments", commentId, "replies");
    const q = query(repliesRef);
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs
      .map((snapshot) => {
        const data = snapshot.data();

        return {
          id: snapshot.id,
          userId: data.userId || "",
          displayName: data.displayName || "익명",
          photoURL: data.photoURL || "",
          text: data.text || "",
          createdAt: normalizeDate(data.createdAt),
        };
      })
      .sort(sortByCreatedAtAsc);
  } catch (error) {
    console.error("답글 로드 에러:", error);
    return [];
  }
};

export const deleteReply = async (commentId, replyId) => {
  try {
    const commentRef = doc(db, "comments", commentId);
    const commentSnap = await getDoc(commentRef);
    const repoId = commentSnap.exists() ? commentSnap.data()?.repoId : null;

    const replyRef = doc(db, "comments", commentId, "replies", replyId);
    await deleteDoc(replyRef);

    await runTransaction(db, async (transaction) => {
      const freshCommentSnap = await transaction.get(commentRef);
      if (!freshCommentSnap.exists()) {
        return;
      }

      const current = freshCommentSnap.data()?.replyCount || 0;
      transaction.update(commentRef, {
        replyCount: Math.max(0, current - 1),
      });
    });

    if (repoId) {
      invalidateCommentCountCache(repoId);
    }

    return true;
  } catch (error) {
    console.error("답글 삭제 에러:", error);
    return false;
  }
};
