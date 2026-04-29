// src/utils/userProfile.js

import { normalizeInterestKey, normalizeRepo } from "./normalizers";

const PROFILE_KEY = "chort_user_profile";
const SEEN_KEY = "chort_seen_history";
const MAX_SEEN = 500;

const defaultProfile = {
  languages: {},
  topics: {},
  starredIds: [],
  skipCount: 0,
  totalSeen: 0,
  interactionStats: {
    weakInterestCount: 0,
    clearInterestCount: 0,
    strongInterestCount: 0,
    githubOpenCount: 0,
    commentOpenCount: 0,
    starCount: 0,
  },
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

const addWeightedInterest = (bucket, key, weight) => {
  if (!key) return;
  bucket[key] = (bucket[key] || 0) + weight;
};

const bumpInterest = (profile, repo, languageWeight, topicWeight) => {
  const languageKey = normalizeInterestKey(repo.language);
  if (languageKey && languageWeight > 0) {
    addWeightedInterest(profile.languages, languageKey, languageWeight);
  }

  if (repo.topics?.length > 0 && topicWeight > 0) {
    repo.topics.forEach((topic) => {
      const topicKey = normalizeInterestKey(topic);
      addWeightedInterest(profile.topics, topicKey, topicWeight);
    });
  }
};

const ensureInteractionStats = (profile) => {
  profile.interactionStats = {
    ...defaultProfile.interactionStats,
    ...(profile.interactionStats || {}),
  };
};

const classifyImplicitInterest = ({
  dwellMs = 0,
  hadScroll = false,
  hadInteraction = false,
} = {}) => {
  if (dwellMs < 3000) return "skip";

  let tier = dwellMs >= 30000 ? 3 : dwellMs >= 10000 ? 2 : 1;

  // 방치된 화면일 가능성을 줄이기 위해 상호작용이 없으면 한 단계 낮춤
  if (!hadInteraction && !hadScroll && tier > 1) {
    tier -= 1;
  }

  // 적극적인 스크롤은 글/레포 탐색 의도로 보고 최소 clear 이상으로 반영
  if (hadScroll && dwellMs >= 10000) {
    tier = Math.max(tier, 2);
  }

  return tier === 3 ? "strong" : tier === 2 ? "clear" : "weak";
};

export const recordView = (inputRepo, signals = 0) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
  ensureInteractionStats(profile);

  const normalizedSignals =
    typeof signals === "number" ? { dwellMs: signals } : signals || {};
  const interestLevel = classifyImplicitInterest(normalizedSignals);

  if (interestLevel === "skip") {
    recordSkip(repo);
    return;
  }

  if (interestLevel === "strong") {
    bumpInterest(profile, repo, 4, 3);
    profile.interactionStats.strongInterestCount += 1;
  } else if (interestLevel === "clear") {
    bumpInterest(profile, repo, 2.5, 2);
    profile.interactionStats.clearInterestCount += 1;
  } else {
    bumpInterest(profile, repo, 1.5, 1);
    profile.interactionStats.weakInterestCount += 1;
  }

  profile.totalSeen = (profile.totalSeen || 0) + 1;
  saveProfile(profile);
  recordSeen(repo.id);
};

export const recordStar = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
  ensureInteractionStats(profile);
  bumpInterest(profile, repo, 5, 3.5);

  if (!profile.starredIds.includes(repo.id)) {
    profile.starredIds.push(repo.id);
  }

  profile.interactionStats.starCount += 1;
  saveProfile(profile);
};

export const recordGithubOpen = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
  ensureInteractionStats(profile);
  bumpInterest(profile, repo, 4, 3);
  profile.interactionStats.githubOpenCount += 1;
  saveProfile(profile);
};

export const recordCommentOpen = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
  ensureInteractionStats(profile);
  bumpInterest(profile, repo, 3, 2.5);
  profile.interactionStats.commentOpenCount += 1;
  saveProfile(profile);
};

export const recordSkip = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
  ensureInteractionStats(profile);
  const languageKey = normalizeInterestKey(repo.language);

  if (languageKey) {
    profile.languages[languageKey] = Math.max(
      0,
      (profile.languages[languageKey] || 0) - 0.5,
    );
  }

  profile.skipCount = (profile.skipCount || 0) + 1;
  saveProfile(profile);
};

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
