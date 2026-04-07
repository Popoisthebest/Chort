// src/utils/userProfile.js
// 사용자의 관심사 프로필을 localStorage에서 읽고 쓰는 유틸리티

const PROFILE_KEY = "chort_user_profile";
const SEEN_KEY = "chort_seen_history";
const MAX_SEEN = 500;

// 기본 프로필 구조
const defaultProfile = {
  languages: {}, // { "Python": 5, "TypeScript": 3, ... }
  topics: {}, // { "AI": 4, "web3": 1, ... }
  starredIds: [], // 저장(star)한 repo id 목록
  skipCount: 0, // 빠르게 넘긴 횟수
  totalSeen: 0,
};

export const getProfile = () => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw
      ? { ...defaultProfile, ...JSON.parse(raw) }
      : { ...defaultProfile };
  } catch {
    return { ...defaultProfile };
  }
};

const saveProfile = (profile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

// 레포를 시청했을 때 호출 (카드가 화면에 들어왔을 때)
export const recordView = (repo, dwellMs = 0) => {
  if (!repo) return;
  const profile = getProfile();

  // 언어 가중치: 오래 볼수록 더 높은 점수
  if (repo.language) {
    const weight = dwellMs > 5000 ? 2 : 1;
    profile.languages[repo.language] =
      (profile.languages[repo.language] || 0) + weight;
  }

  // 토픽(태그) 가중치
  if (repo.topics?.length > 0) {
    repo.topics.forEach((topic) => {
      profile.topics[topic] = (profile.topics[topic] || 0) + 1;
    });
  }

  profile.totalSeen = (profile.totalSeen || 0) + 1;
  saveProfile(profile);

  // 본 목록 기록 (중복 노출 방지)
  recordSeen(repo.id);
};

// 저장(star) 시 호출 - 강한 긍정 신호
export const recordStar = (repo) => {
  if (!repo) return;
  const profile = getProfile();

  if (repo.language) {
    profile.languages[repo.language] =
      (profile.languages[repo.language] || 0) + 5;
  }
  if (repo.topics?.length > 0) {
    repo.topics.forEach((t) => {
      profile.topics[t] = (profile.topics[t] || 0) + 3;
    });
  }

  if (!profile.starredIds.includes(repo.id)) {
    profile.starredIds.push(repo.id);
  }

  saveProfile(profile);
};

// 빠르게 스킵했을 때 호출 - 약한 부정 신호
export const recordSkip = (repo) => {
  if (!repo) return;
  const profile = getProfile();

  if (repo.language) {
    profile.languages[repo.language] = Math.max(
      0,
      (profile.languages[repo.language] || 0) - 0.5,
    );
  }

  profile.skipCount = (profile.skipCount || 0) + 1;
  saveProfile(profile);
};

// 본 레포 기록
const recordSeen = (repoId) => {
  const seen = getSeenIds();
  if (!seen.includes(repoId)) {
    const updated = [repoId, ...seen].slice(0, MAX_SEEN);
    localStorage.setItem(SEEN_KEY, JSON.stringify(updated));
  }
};

export const getSeenIds = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY)) || [];
  } catch {
    return [];
  }
};

export const clearProfile = () => {
  localStorage.removeItem(PROFILE_KEY);
  localStorage.removeItem(SEEN_KEY);
};
