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

export const recordView = (inputRepo, dwellMs = 0) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();

  const languageKey = normalizeInterestKey(repo.language);
  if (languageKey) {
    // 체류 시간 4단계 세분화: 3초 미만=1, 3~10초=1.5, 10~30초=2.5, 30초 이상=4
    const weight =
      dwellMs >= 30000 ? 4 : dwellMs >= 10000 ? 2.5 : dwellMs >= 3000 ? 1.5 : 1;
    addWeightedInterest(profile.languages, languageKey, weight);
  }

  if (repo.topics?.length > 0) {
    const topicWeight =
      dwellMs >= 30000 ? 3 : dwellMs >= 10000 ? 2 : dwellMs >= 3000 ? 1.5 : 1;
    repo.topics.forEach((topic) => {
      const topicKey = normalizeInterestKey(topic);
      addWeightedInterest(profile.topics, topicKey, topicWeight);
    });
  }

  profile.totalSeen = (profile.totalSeen || 0) + 1;
  saveProfile(profile);
  recordSeen(repo.id);
};

export const recordStar = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();

  const languageKey = normalizeInterestKey(repo.language);
  if (languageKey) {
    addWeightedInterest(profile.languages, languageKey, 5);
  }

  if (repo.topics?.length > 0) {
    repo.topics.forEach((topic) => {
      const topicKey = normalizeInterestKey(topic);
      addWeightedInterest(profile.topics, topicKey, 3);
    });
  }

  if (!profile.starredIds.includes(repo.id)) {
    profile.starredIds.push(repo.id);
  }

  saveProfile(profile);
};

export const recordSkip = (inputRepo) => {
  const repo = normalizeRepo(inputRepo);
  if (!repo?.id) return;

  const profile = getProfile();
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
