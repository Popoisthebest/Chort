// src/api/github.js
export const getTrendingRepos = async (page = 1) => {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const formattedDate = date.toISOString().split("T")[0];

  // page 파라미터를 추가하여 다음 데이터를 불러올 수 있게 합니다.
  const query = `created:>${formattedDate}`;
  const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=10&page=${page}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("데이터 로드 실패:", error);
    return [];
  }
};

export const searchRepos = async (keyword) => {
  if (!keyword) return [];

  // 입력받은 키워드로 별(Star)이 많은 순서대로 20개를 검색합니다.
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(keyword)}&sort=stars&order=desc&per_page=20`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("검색 데이터를 불러오는데 실패했습니다:", error);
    return [];
  }
};

// README에서 첫 번째 이미지나 GIF URL을 추출하는 함수
export const getReadmeImage = async (owner, repo, defaultBranch = "main") => {
  // README 파일의 raw 텍스트를 가져옵니다. (main 브랜치 또는 master 브랜치)
  const urls = [
    `https://raw.githubusercontent.com/${owner}/${repo}/main/README.md`,
    `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const text = await response.text();

      // 마크다운 이미지 ![alt](url) 또는 HTML <img src="url"> 형식에서 URL 추출
      const markdownImgRegex =
        /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg)(?:\?.*?)?)\)/i;
      const htmlImgRegex =
        /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg)(?:\?.*?)?)["']/i;

      const mdMatch = text.match(markdownImgRegex);
      const htmlMatch = text.match(htmlImgRegex);

      let imageUrl = mdMatch ? mdMatch[1] : htmlMatch ? htmlMatch[1] : null;

      // 상대 경로인 경우 절대 경로로 변환
      if (imageUrl && !imageUrl.startsWith("http")) {
        // 상대 경로 앞에 raw.githubusercontent 주소를 붙여줍니다.
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
  return null; // 이미지를 못 찾으면 null 반환
};

const MAX_SEEN_HISTORY = 300;

// 1. 중복 필터링 알고리즘
export const filterAndRecordSeenRepos = (newRepos) => {
  if (!newRepos || newRepos.length === 0) return [];

  const seenIds = JSON.parse(localStorage.getItem("chort_seen_history")) || [];
  const freshRepos = newRepos.filter((repo) => !seenIds.includes(repo.id));
  const freshIds = freshRepos.map((repo) => repo.id);

  const updatedSeenIds = [...freshIds, ...seenIds].slice(0, MAX_SEEN_HISTORY);
  localStorage.setItem("chort_seen_history", JSON.stringify(updatedSeenIds));

  return freshRepos;
};

// 2. 피드에 띄울 레포지토리 목록 가져오기
export const fetchTrendingRepos = async (page = 1) => {
  try {
    // 예시: 2024년 1월 1일 이후 생성된 레포 중 별이 많은 순 (날짜는 원하시는 대로 수정 가능)
    const response = await fetch(
      `https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc&page=${page}&per_page=30`,
    );
    const data = await response.json();

    // API 에러(Rate Limit 등) 방어 로직
    if (data.message && data.message.includes("API rate limit")) {
      console.warn("GitHub API 호출 한도 초과!");
      return [];
    }

    // 💡 방금 만든 함수로 중복 제거!
    const freshData = filterAndRecordSeenRepos(data.items);

    // 만약 30개를 가져왔는데 30개 다 어제 본 거라면? -> 화면이 멈추지 않게 다음 페이지 자동 호출
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
