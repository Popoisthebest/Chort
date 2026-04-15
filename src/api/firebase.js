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
  query,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  where,
  serverTimestamp,
  runTransaction,
  setDoc,
  orderBy,
  limit,
  startAfter,
} from "firebase/firestore";
import { safeToDate } from "../utils/formatters";

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

// GitHub OAuth access token: 메모리 + localStorage(uid 바인딩)
// Firebase 세션은 브라우저에 지속되지만, 팝업 로그인 시에만 credential이 오므로
// 토큰을 uid와 함께 저장해 재방문/새로고침 후에도 Star 등 GitHub API가 동작하게 함
// (XSS 시 노출 위험은 있으므로 스크립트 주입 방지가 중요)
let _githubTokenInMemory = null;

const GITHUB_OAUTH_TOKEN_KEY = "chort_github_oauth";

const loadStoredGithubOAuth = () => {
  try {
    const raw = localStorage.getItem(GITHUB_OAUTH_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.uid) return null;
    return { token: parsed.token, uid: parsed.uid };
  } catch {
    return null;
  }
};

const persistGithubOAuth = (token, uid) => {
  _githubTokenInMemory = token;
  try {
    localStorage.setItem(
      GITHUB_OAUTH_TOKEN_KEY,
      JSON.stringify({ token, uid }),
    );
  } catch {
    // quota 등
  }
};

const clearGithubOAuth = () => {
  _githubTokenInMemory = null;
  try {
    localStorage.removeItem(GITHUB_OAUTH_TOKEN_KEY);
  } catch {
    // ignore
  }
};

const syncGithubTokenForUser = (user) => {
  if (!user) {
    clearGithubOAuth();
    return;
  }

  const isGithub = user.providerData?.some(
    (p) => p?.providerId === "github.com",
  );
  if (!isGithub) {
    clearGithubOAuth();
    return;
  }

  const stored = loadStoredGithubOAuth();
  if (stored && stored.uid !== user.uid) {
    try {
      localStorage.removeItem(GITHUB_OAUTH_TOKEN_KEY);
    } catch {
      // ignore
    }
    _githubTokenInMemory = null;
  }

  if (!_githubTokenInMemory) {
    const again = loadStoredGithubOAuth();
    if (again && again.uid === user.uid) {
      _githubTokenInMemory = again.token;
    }
  }
};

auth.onAuthStateChanged((user) => {
  syncGithubTokenForUser(user);
});

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

const makeClientRequestId = () => {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const loginWithGithub = async () => {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    const credential = GithubAuthProvider.credentialFromResult(result);

    if (credential?.accessToken && result.user?.uid) {
      persistGithubOAuth(credential.accessToken, result.user.uid);
    }

    const githubProfile = getGithubProfileFromLoginResult(result);
    saveGithubProfile(githubProfile);

    return result.user;
  } catch (error) {
    console.error("로그인 에러:", error.code || "unknown");
    return null;
  }
};

export const logoutUser = async () => {
  try {
    await signOut(auth);
    clearGithubOAuth();
    sessionStorage.removeItem(GITHUB_PROFILE_KEY);
  } catch (error) {
    console.error("로그아웃 에러:", error.code || "unknown");
  }
};

export const getGithubToken = () => {
  return _githubTokenInMemory;
};

/**
 * GitHub Action이 Firestore에 저장한 feed_cards 컬렉션을 읽어온다.
 * 반환값:
 * {
 *   items: Repo[],
 *   lastVisible: QueryDocumentSnapshot | null,
 *   hasMore: boolean
 * }
 */
export const getFeedCards = async (lastVisible = null, pageSize = 10) => {
  try {
    const feedRef = collection(db, "feed_cards");

    let q = query(feedRef, orderBy("updatedAt", "desc"), limit(pageSize));

    if (lastVisible) {
      q = query(
        feedRef,
        orderBy("updatedAt", "desc"),
        startAfter(lastVisible),
        limit(pageSize),
      );
    }

    const snapshot = await getDocs(q);

    const items = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      const owner = data.owner || "";
      const repoName = data.repoName || "";
      const htmlUrl =
        data.html_url ||
        (owner && repoName ? `https://github.com/${owner}/${repoName}` : "");

      return {
        id: Number(data.repoId) || docSnap.id,
        repoId: String(data.repoId || docSnap.id),
        name: repoName,
        full_name: owner && repoName ? `${owner}/${repoName}` : repoName,
        description: data.description || "",
        descriptionKo: data.descriptionKo || "",
        summaryKo: data.summaryKo || "",
        thumbnail: data.thumbnail || null,
        language: data.language || "Unknown",
        topics: Array.isArray(data.topics) ? data.topics : [],
        stargazers_count: Number(data.stars) || 0,
        forks_count: Number(data.forks) || 0,
        html_url: htmlUrl,
        default_branch: data.defaultBranch || "main",
        private: false,
        owner: {
          login: owner,
          avatar_url: data.ownerAvatar || "",
          html_url: owner ? `https://github.com/${owner}` : "",
        },
        created_at: data.createdAt || null,
        updatedAt: safeToDate(data.updatedAt),
      };
    });

    return {
      items,
      lastVisible:
        snapshot.docs.length > 0
          ? snapshot.docs[snapshot.docs.length - 1]
          : null,
      hasMore: snapshot.docs.length === pageSize,
    };
  } catch (error) {
    console.error(
      "피드 카드 조회 에러:",
      error.code || error.message || "unknown",
    );
    return {
      items: [],
      lastVisible: null,
      hasMore: false,
    };
  }
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
          createdAt: safeToDate(data.createdAt),
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
    console.error("댓글 조회 에러:", error.code || "unknown");
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

export const addComment = async (repoId, text, user, clientRequestId) => {
  const trimmed = text?.trim();
  if (!user || !trimmed) return null;

  try {
    const identity = resolveGithubIdentity(user);
    const commentRef = doc(collection(db, "comments"));

    await setDoc(commentRef, {
      repoId: String(repoId),
      text: trimmed,
      userId: user.uid,
      displayName: identity.displayName,
      photoURL: identity.photoURL,
      createdAt: serverTimestamp(),
      replyCount: 0,
      clientRequestId: clientRequestId || makeClientRequestId(),
    });

    invalidateCommentCountCache(repoId);
    return { id: commentRef.id };
  } catch (error) {
    console.error("댓글 추가 에러:", error.code || "unknown");
    return null;
  }
};

export const deleteComment = async (commentId) => {
  try {
    const commentRef = doc(db, "comments", commentId);
    const commentSnap = await getDoc(commentRef);

    if (!commentSnap.exists()) return false;

    const currentUser = auth.currentUser;
    if (!currentUser || commentSnap.data()?.userId !== currentUser.uid) {
      console.error("댓글 삭제 권한이 없습니다.");
      return false;
    }

    const repoId = commentSnap.data()?.repoId || null;

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
    console.error("댓글 삭제 에러:", error.code || "unknown");
    return false;
  }
};

export const addReply = async (commentId, text, user, clientRequestId) => {
  const trimmed = text?.trim();
  if (!user || !trimmed) {
    console.error("사용자 정보 또는 답글 내용이 없습니다.");
    return null;
  }

  try {
    const commentRef = doc(db, "comments", commentId);
    const replyRef = doc(collection(db, "comments", commentId, "replies"));
    const identity = resolveGithubIdentity(user);

    const repoId = await runTransaction(db, async (transaction) => {
      const commentSnap = await transaction.get(commentRef);

      if (!commentSnap.exists()) {
        throw new Error("원본 댓글이 존재하지 않습니다.");
      }

      transaction.set(replyRef, {
        userId: user.uid,
        displayName: identity.displayName,
        photoURL: identity.photoURL,
        text: trimmed,
        createdAt: serverTimestamp(),
        clientRequestId: clientRequestId || makeClientRequestId(),
      });

      const current = commentSnap.data()?.replyCount || 0;
      transaction.update(commentRef, { replyCount: current + 1 });

      return commentSnap.data()?.repoId || null;
    });

    if (repoId) {
      invalidateCommentCountCache(repoId);
    }

    return { id: replyRef.id };
  } catch (error) {
    console.error("답글 저장 에러:", error.code || "unknown");
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
          createdAt: safeToDate(data.createdAt),
        };
      })
      .sort(sortByCreatedAtAsc);
  } catch (error) {
    console.error("답글 로드 에러:", error.code || "unknown");
    return [];
  }
};

export const deleteReply = async (commentId, replyId) => {
  try {
    const commentRef = doc(db, "comments", commentId);
    const replyRef = doc(db, "comments", commentId, "replies", replyId);

    const replySnap = await getDoc(replyRef);
    if (!replySnap.exists()) return false;

    const currentUser = auth.currentUser;
    if (!currentUser || replySnap.data()?.userId !== currentUser.uid) {
      console.error("대댓글 삭제 권한이 없습니다.");
      return false;
    }

    const repoId = await runTransaction(db, async (transaction) => {
      const [commentSnap] = await Promise.all([
        transaction.get(commentRef),
        transaction.get(replyRef),
      ]);

      if (!commentSnap.exists()) {
        throw new Error("원본 댓글이 존재하지 않습니다.");
      }

      transaction.delete(replyRef);

      const current = commentSnap.data()?.replyCount || 0;
      transaction.update(commentRef, {
        replyCount: Math.max(0, current - 1),
      });

      return commentSnap.data()?.repoId || null;
    });

    if (repoId) {
      invalidateCommentCountCache(repoId);
    }

    return true;
  } catch (error) {
    console.error("답글 삭제 에러:", error.code || "unknown");
    return false;
  }
};
