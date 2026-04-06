// src/api/github.js

// 💡 공통 헤더 생성 함수: 로컬 스토리지에 토큰이 있으면 포함해서 보냅니다.
const getHeaders = () => {
  const token = localStorage.getItem("github_token");
  const headers = {
    Accept: "application/vnd.github.v3+json",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  return headers;
};

// GitHub 계정에서 repo를 star하는 함수
export const starRepo = async (owner, repo) => {
  const token = localStorage.getItem("github_token");
  if (!token) {
    console.error("❌ GitHub 토큰이 없습니다. 로그인해주세요.");
    return false;
  }

  try {
    console.log(`⭐ ${owner}/${repo} star 시도 중...`);
    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: "PUT",
        headers: getHeaders(),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 204 || response.ok) {
      console.log(`✨ GitHub에서 ${repo} star 완료!`);
      return true;
    } else {
      console.error(`❌ Star 실패: ${response.status}`, data);
      return false;
    }
  } catch (error) {
    console.error("❌ Star 중 에러:", error);
    return false;
  }
};

// GitHub 계정에서 repo의 star를 제거하는 함수
export const unstarRepo = async (owner, repo) => {
  const token = localStorage.getItem("github_token");
  if (!token) {
    console.error("❌ GitHub 토큰이 없습니다. 로그인해주세요.");
    return false;
  }

  try {
    console.log(`🗑️ ${owner}/${repo} star 제거 시도 중...`);
    const response = await fetch(
      `https://api.github.com/user/starred/${owner}/${repo}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      },
    );

    const data = await response.json().catch(() => ({}));

    if (response.status === 204 || response.ok) {
      console.log(`✨ GitHub에서 ${repo} star 제거 완료!`);
      return true;
    } else {
      console.error(`❌ Unstar 실패: ${response.status}`, data);
      return false;
    }
  } catch (error) {
    console.error("❌ Unstar 중 에러:", error);
    return false;
  }
};

// 1. 현재 피드(Feed.js)에서 사용하는 메인 데이터 호출 함수
export const getTrendingRepos = async (page = 1) => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const formattedDate = date.toISOString().split("T")[0];

  const query = `created:>${formattedDate}`;
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=10&page=${page}`;

  try {
    // 💡 토큰 헤더를 같이 보냅니다! (한도 해제)
    const response = await fetch(url, { headers: getHeaders() });
    const data = await response.json();

    // 💡 429 에러(한도 초과)가 발생하면 Feed.js가 루프를 멈출 수 있게 에러 상태를 반환합니다.
    if (!response.ok || data.message) {
      return {
        error: true,
        message: data.message || `HTTP Error: ${response.status}`,
      };
    }

    return data.items || [];
  } catch (error) {
    console.error("데이터 로드 실패:", error);
    return { error: true, message: "네트워크 에러" };
  }
};

// 2. 검색 시 사용하는 함수
export const searchRepos = async (keyword) => {
  if (!keyword) return [];

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&order=desc&per_page=20`;

  try {
    // 💡 토큰 헤더 추가
    const response = await fetch(url, { headers: getHeaders() });
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("검색 데이터를 불러오는데 실패했습니다:", error);
    return [];
  }
};

// 3. README에서 첫 번째 이미지나 GIF URL을 추출하는 함수
export const getReadmeImage = async (owner, repo, defaultBranch = "main") => {
  const urls = [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
  ];

  for (const url of urls) {
    try {
      // 💡 토큰 헤더 추가 (raw 파일 요청 시에도 토큰을 넣으면 더 안정적입니다)
      const response = await fetch(url, { headers: getHeaders() });
      if (!response.ok) continue;

      const text = await response.text();

      const markdownImgRegex =
        /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg)(?:\?.*?)?)\)/i;
      const htmlImgRegex =
        /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg)(?:\?.*?)?)["']/i;

      const mdMatch = text.match(markdownImgRegex);
      const htmlMatch = text.match(htmlImgRegex);

      let imageUrl = mdMatch ? mdMatch[1] : htmlMatch ? htmlMatch[1] : null;

      if (imageUrl && !imageUrl.startsWith("http")) {
        const branch = url.includes("/main/") ? "main" : "master";
        imageUrl = imageUrl.startsWith("/")
          ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${imageUrl}`
          : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imageUrl}`;
      }

      if (imageUrl) return imageUrl;
    } catch (error) {
      console.error("README 파싱 에러:", error);
    }
  }
  return null;
};

// ==========================================
// 아래는 이전 버전의 함수들입니다. (필요 시 사용)
// ==========================================

const MAX_SEEN_HISTORY = 300;

export const filterAndRecordSeenRepos = (newRepos) => {
  if (!newRepos || newRepos.length === 0) return [];

  const seenIds = JSON.parse(localStorage.getItem("chort_seen_history")) || [];
  const freshRepos = newRepos.filter((repo) => !seenIds.includes(repo.id));
  const freshIds = freshRepos.map((repo) => repo.id);

  const updatedSeenIds = [...freshIds, ...seenIds].slice(0, MAX_SEEN_HISTORY);
  localStorage.setItem("chort_seen_history", JSON.stringify(updatedSeenIds));

  return freshRepos;
};

export const fetchTrendingRepos = async (page = 1) => {
  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc&page=${page}&per_page=30`,
      { headers: getHeaders() }, // 💡 토큰 헤더 추가
    );
    const data = await response.json();

    if (data.message && data.message.includes("API rate limit")) {
      console.warn("GitHub API 호출 한도 초과!");
      return [];
    }

    const freshData = filterAndRecordSeenRepos(data.items);

    if (freshData.length === 0 && data.items && data.items.length > 0) {
      console.log(
        `[Chort 필터] ${page}페이지는 이미 다 보셨네요. 다음 페이지 탐색 중... 🚀`,
      );
      return fetchTrendingRepos(page + 1);
    }

    return freshData;
  } catch (error) {
    console.error("데이터 패칭 에러:", error);
    return [];
  }
};
