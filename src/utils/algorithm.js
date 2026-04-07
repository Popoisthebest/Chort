// src/utils/algorithm.js
import { getProfile, getSeenIds } from "./userProfile";
import { normalizeInterestKey, normalizeRepo } from "./normalizers";

// [버그수정] seenIds를 rankRepos에서 1회만 읽어 파라미터로 전달
// 이전: scoreRepo 내부 getSeenIds() → 레포마다 localStorage 파싱 (O(n²))
// 이후: rankRepos에서 1회 읽어 전달 (O(n))
export const scoreRepo = (inputRepo, profile, seenIds) => {
  const repo = normalizeRepo(inputRepo);

  const stars = repo.stargazers_count || 0;
  const createdAt = new Date(repo.created_at || Date.now());
  const ageInDays = Math.max(
    1,
    (Date.now() - createdAt) / (1000 * 60 * 60 * 24),
  );
  const trendingScore = stars / Math.log(ageInDays + 2);

  const languageKey = normalizeInterestKey(repo.language);
  const langScore = profile.languages[languageKey] || 0;
  const langBoost = 1 + Math.min(langScore / 10, 1.0);

  const topicScore = (repo.topics || []).reduce((sum, topic) => {
    const topicKey = normalizeInterestKey(topic);
    return sum + (profile.topics[topicKey] || 0);
  }, 0);
  const topicBoost = 1 + Math.min(topicScore / 15, 0.8);

  const seenIndex = seenIds.indexOf(repo.id);
  let seenPenalty = 1.0;
  if (seenIndex !== -1) {
    seenPenalty = seenIndex < 100 ? 0.05 : 0.3;
  }

  if (profile.starredIds?.includes(repo.id)) return -1;

  return trendingScore * langBoost * topicBoost * seenPenalty;
};

export const rankRepos = (repos) => {
  const profile = getProfile();
  const seenIds = getSeenIds(); // localStorage 1회만 읽기

  const scored = repos
    .map((repo) => {
      const normalizedRepo = normalizeRepo(repo);
      return {
        repo: normalizedRepo,
        score: scoreRepo(normalizedRepo, profile, seenIds),
      };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return repos.map((repo) => normalizeRepo(repo));

  const cutoff = Math.ceil(scored.length * 0.7);
  const topRanked = scored.slice(0, cutoff).map((s) => s.repo);
  const exploratory = scored.slice(cutoff).map((s) => s.repo);

  return [...topRanked, ...shuffleArray(exploratory)];
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
