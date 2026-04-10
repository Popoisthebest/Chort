const admin = require("firebase-admin");

// 1. Firebase Admin SDK 초기화
const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT 환경 변수가 없습니다.");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountRaw);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// 2. GitHub API 헤더 설정 (GH_TOKEN이 있으면 사용)
const getHeaders = (accept = "application/vnd.github+json") => {
  const headers = { Accept: accept };
  if (process.env.GH_TOKEN) {
    headers.Authorization = `token ${process.env.GH_TOKEN}`;
  }
  return headers;
};

// 유틸리티: 딜레이 함수 (API Rate Limit 방지)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 유틸리티: Node.js용 Base64 디코딩
const decodeBase64Utf8 = (value) => {
  if (!value || typeof value !== "string") return "";
  try {
    const sanitized = value.replace(/\s/g, "");
    return Buffer.from(sanitized, "base64").toString("utf8");
  } catch {
    return "";
  }
};

const normalizeWhitespace = (text) => {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// 3. 번역 API (MyMemory)
const translateViaMyMemory = async (text, target = "ko") => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      normalized
    )}&langpair=auto|${target}`;
    
    const response = await fetch(url);
    if (!response.ok) return normalized;

    const data = await response.json();
    const translated = data?.responseData?.translatedText;

    if (!translated || translated === normalized) return normalized;
    return normalizeWhitespace(translated);
  } catch (error) {
    console.error("번역 에러:", error.message);
    return normalized;
  }
};

// 4. README 파싱 및 정제 (클라이언트 로직 이식)
const cleanReadmeText = (text) => {
  if (!text) return "";
  let cleaned = text
    .replace(//g, "")
    .replace(/<picture[\s\S]*?<\/picture>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/\[([^\]]+)\]\((.*?)\)/g, "$1")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/^\s*[-|:]{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(english|한국어|简体中文|繁體中文|japanese|日本語)(\s*[·|/]\s*.*)?$/i.test(line)
    )
    .slice(0, 8); // 상위 8줄만 추출

  let result = lines.join("\n");
  const codeBlockCount = (result.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) result += "\n```";

  return result.trim();
};

const getReadmeRaw = async (owner, repo, defaultBranch = "main") => {
  const branches = [...new Set([defaultBranch, "main", "master"].filter(Boolean))];
  const paths = ["README.md", "readme.md", "README.MD", "Readme.md"];

  for (const branch of branches) {
    const readmeApiUrl = `https://api.github.com/repos/${owner}/${repo}/readme?ref=${encodeURIComponent(branch)}`;
    try {
      const response = await fetch(readmeApiUrl, { headers: getHeaders() });
      if (response.ok) {
        const data = await response.json();
        if (data.content && data.encoding === "base64") {
          return decodeBase64Utf8(data.content);
        }
      }
    } catch (e) { /* 무시하고 다음 후보 진행 */ }
  }
  return "";
};

const extractReadmeImage = (text, owner, repo, branch = "main") => {
  if (!text) return null;
  const markdownImgRegex = /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)\)/i;
  const htmlImgRegex = /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)['"]/i;

  const mdMatch = text.match(markdownImgRegex);
  const htmlMatch = text.match(htmlImgRegex);
  let imageUrl = mdMatch ? mdMatch[1] : htmlMatch ? htmlMatch[1] : null;

  if (imageUrl && !imageUrl.startsWith("http")) {
    imageUrl = imageUrl.startsWith("/")
      ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${imageUrl}`
      : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imageUrl}`;
  }
  return imageUrl || null;
};

// 5. 메인 파이프라인
const runPipeline = async () => {
  console.log("🚀 GitHub Trending Fetch & Process 시작...");
  
  // 최근 7일 생성된 레포지토리 중 별이 많은 순
  const date = new Date();
  date.setDate(date.getDate() - 7);
  const formattedDate = date.toISOString().split("T")[0];
  const q = `created:>${formattedDate}`;
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`; // 15개 크롤링

  try {
    const searchRes = await fetch(searchUrl, { headers: getHeaders() });
    if (!searchRes.ok) throw new Error(`GitHub 검색 실패: ${searchRes.status}`);
    
    const searchData = await searchRes.json();
    const repos = searchData.items || [];
    
    console.log(`📌 총 ${repos.length}개의 레포지토리를 처리합니다.`);

    const batch = db.batch();

    for (const repo of repos) {
      const owner = repo.owner.login;
      const repoName = repo.name;
      console.log(`\n⏳ 처리 중: ${owner}/${repoName}`);

      // 1) 설명 번역
      const descKo = await translateViaMyMemory(repo.description || "");
      await delay(500); // MyMemory API 과부하 방지

      // 2) README 텍스트 및 이미지 추출
      const rawReadme = await getReadmeRaw(owner, repoName, repo.default_branch);
      const thumbnail = extractReadmeImage(rawReadme, owner, repoName, repo.default_branch);
      
      // 3) 요약 및 번역
      const summaryEn = cleanReadmeText(rawReadme);
      let summaryKo = "";
      if (summaryEn) {
        // 긴 요약문 처리 (단순화를 위해 800자 이하로 자르고 번역)
        const chunk = summaryEn.substring(0, 800);
        summaryKo = await translateViaMyMemory(chunk);
        await delay(500); // 딜레이
      }

      // 4) Firestore 적재 데이터 구성
      const cardData = {
        repoId: String(repo.id),
        owner,
        repoName,
        description: repo.description || "",
        descriptionKo: descKo,
        summaryKo,
        thumbnail,
        stars: repo.stargazers_count,
        language: repo.language || "Unknown",
        topics: repo.topics || [],
        html_url: repo.html_url,
        ownerAvatar: repo.owner.avatar_url,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Firestore Batch Set (문서 ID를 repoId로 사용하여 자동 덮어쓰기)
      const docRef = db.collection("feed_cards").doc(cardData.repoId);
      batch.set(docRef, cardData, { merge: true });
      
      console.log(`✅ 완료: ${owner}/${repoName}`);
    }

    // 5) Firestore에 일괄 저장
    await batch.commit();
    console.log(`\n🎉 모든 데이터가 성공적으로 Firestore에 적재되었습니다.`);
    
  } catch (error) {
    console.error("❌ 파이프라인 실행 중 오류 발생:", error);
    process.exit(1);
  }
};

runPipeline();