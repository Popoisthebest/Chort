// src/utils/algorithm.js
import { getProfile, getSeenIds } from "./userProfile";
import { normalizeInterestKey, normalizeRepo } from "./normalizers";

const MAX_SEEN_RATIO = 0.15; // 상위 결과에서 seen 레포 최대 15%

// seen 히스토리에서 위치가 앞(최근)일수록 더 강한 패널티 적용
const getSeenPenalty = (seenIndex) => {
  if (seenIndex < 0) return 1.0;
  if (seenIndex < 30) return 0.01;
  if (seenIndex < 100) return 0.05;
  if (seenIndex < 250) return 0.2;
  return 0.4;
};

// [개선] seen 위치 조회를 위해 Array 대신 Map 전달
// trendingPeriod: "daily" | "weekly" | "monthly" (기본 "daily")
export const scoreRepo = (
  inputRepo,
  profile,
  seenIndexMap,
  trendingPeriod = "daily",
) => {
  const repo = normalizeRepo(inputRepo);

  const stars = repo.stargazers_count || 0;
  const createdAt = new Date(repo.created_at || Date.now());
  const rawAgeInDays = Math.max(
    1,
    (Date.now() - createdAt) / (1000 * 60 * 60 * 24),
  );
  // GitHub trending 기간에 따라 최신성 가중치 조정
  const periodMultiplier =
    trendingPeriod === "monthly"
      ? 0.5
      : trendingPeriod === "weekly"
        ? 0.75
        : 1.0;
  const ageInDays = rawAgeInDays * (1 / periodMultiplier);
  const trendingScore = stars / Math.log(ageInDays + 2);

  const languageKey = normalizeInterestKey(repo.language);
  const langScore = profile.languages[languageKey] || 0;
  const langBoost = 1 + Math.min(langScore / 10, 1.0);

  const topicScore = (repo.topics || []).reduce((sum, topic) => {
    const topicKey = normalizeInterestKey(topic);
    return sum + (profile.topics[topicKey] || 0);
  }, 0);
  const topicBoost = 1 + Math.min(topicScore / 15, 0.8);

  const seenIndex = seenIndexMap.get(repo.id) ?? -1;
  const seenPenalty = getSeenPenalty(seenIndex);

  if (profile.starredIds?.includes(repo.id)) return -1;

  return trendingScore * langBoost * topicBoost * seenPenalty;
};

export const rankRepos = (repos, trendingPeriod = "daily") => {
  const profile = getProfile();
  const seenIds = getSeenIds(); // localStorage 1회만 읽기
  const seenIndexMap = new Map(seenIds.map((id, index) => [id, index]));

  const scored = repos
    .map((repo) => {
      const normalizedRepo = normalizeRepo(repo);
      return {
        repo: normalizedRepo,
        score: scoreRepo(normalizedRepo, profile, seenIndexMap, trendingPeriod),
      };
    })
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return repos.map((repo) => normalizeRepo(repo));

  // [개선] unseen 우선 노출, seen은 소량만 뒤쪽에 섞기
  const unseen = [];
  const seen = [];
  scored.forEach((item) => {
    if (seenIndexMap.has(item.repo.id)) {
      seen.push(item.repo);
    } else {
      unseen.push(item.repo);
    }
  });

  const unseenCutoff = Math.ceil(unseen.length * 0.7);
  const unseenTop = unseen.slice(0, unseenCutoff);
  const unseenExploratory = shuffleArray(unseen.slice(unseenCutoff));

  const maxSeenToInclude = Math.min(
    seen.length,
    Math.max(1, Math.floor(scored.length * MAX_SEEN_RATIO)),
  );
  const seenTail = shuffleArray(seen).slice(0, maxSeenToInclude);

  return [...unseenTop, ...unseenExploratory, ...seenTail];
};

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
