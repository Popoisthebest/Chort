// src/utils/algorithm.js
// 개인화 피드 스코어링 알고리즘
// 인스타/유튜브처럼 사용자 행동 신호를 기반으로 피드를 정렬합니다.

import { getProfile, getSeenIds } from "./userProfile";

/**
 * 레포 하나의 개인화 점수를 계산합니다.
 *
 * 점수 구성:
 *  1. 트렌딩 점수       - star 수 + 최신성 (GitHub 기본 정렬 보완)
 *  2. 언어 친화도       - 사용자가 자주 본 언어면 가중치 부여
 *  3. 토픽 친화도       - 사용자가 자주 본 토픽이면 가중치 부여
 *  4. 이미 본 레포 패널티 - 최근에 본 레포면 점수 크게 낮춤
 *  5. 저장 이력 패널티  - 이미 star 한 레포는 다시 안 보여줌
 */
export const scoreRepo = (repo, profile) => {
  // --- 1. 기본 트렌딩 점수 ---
  const stars = repo.stargazers_count || 0;
  const createdAt = new Date(repo.created_at || Date.now());
  const ageInDays = Math.max(
    1,
    (Date.now() - createdAt) / (1000 * 60 * 60 * 24),
  );
  // 오래됐을수록 log로 감소 → 최신 레포 우대
  const trendingScore = stars / Math.log(ageInDays + 2);

  // --- 2. 언어 친화도 점수 ---
  const langScore = profile.languages[repo.language] || 0;
  // 언어를 많이 볼수록 최대 2배까지 부스트 (너무 편향되지 않게 cap)
  const langBoost = 1 + Math.min(langScore / 10, 1.0);

  // --- 3. 토픽 친화도 점수 ---
  const topics = repo.topics || [];
  const topicScore = topics.reduce(
    (sum, t) => sum + (profile.topics[t] || 0),
    0,
  );
  const topicBoost = 1 + Math.min(topicScore / 15, 0.8);

  // --- 4. 이미 본 레포 패널티 ---
  const seenIds = getSeenIds();
  const seenIndex = seenIds.indexOf(repo.id);
  let seenPenalty = 1.0;
  if (seenIndex !== -1) {
    // 최근에 볼수록 더 강한 패널티 (처음 100개는 거의 안 보여줌)
    seenPenalty = seenIndex < 100 ? 0.05 : 0.3;
  }

  // --- 5. 이미 star한 레포는 완전히 제외 ---
  if (profile.starredIds?.includes(repo.id)) {
    return -1;
  }

  const finalScore = trendingScore * langBoost * topicBoost * seenPenalty;
  return finalScore;
};

/**
 * 레포 배열을 개인화 점수 기준으로 정렬합니다.
 * 다양성 확보를 위해 상위 70%는 점수순, 하위 30%는 새로운 영역에서 섞습니다.
 */
export const rankRepos = (repos) => {
  const profile = getProfile();

  // 점수 계산 + 이미 star한 것 제외
  const scored = repos
    .map((repo) => ({ repo, score: scoreRepo(repo, profile) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return repos;

  const cutoff = Math.ceil(scored.length * 0.7);
  const topRanked = scored.slice(0, cutoff).map((s) => s.repo);
  const exploratory = scored.slice(cutoff).map((s) => s.repo);

  // 탐색 영역은 약간 섞어서 새로운 언어/토픽 노출
  const shuffled = shuffleArray(exploratory);

  return [...topRanked, ...shuffled];
};

/**
 * Fisher-Yates 셔플
 */
const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
