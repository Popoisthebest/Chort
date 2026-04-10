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

// 2. GitHub API 헤더 설정
const getHeaders = (accept = "application/vnd.github+json") => {
  const headers = { Accept: accept };
  if (process.env.GH_TOKEN) {
    headers.Authorization = `token ${process.env.GH_TOKEN}`;
  }
  return headers;
};

// 유틸리티 함수들
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const chunkText = (text, maxLength = 800) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
};

// 3. 구글 번역 API 로직 (MyMemory 대체)
const translationCache = new Map(); // 스크립트 실행 중 중복 번역 방지용 캐시

const getTranslatedText = async (text, target = "ko") => {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";

  const cacheKey = `translate:${target}:${normalized}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  try {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(
        normalized,
      )}`,
    );
    const data = await response.json();
    const result = normalizeWhitespace(
      data?.[0]?.map((item) => item[0]).join("") || normalized,
    );

    translationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("번역 에러:", error);
    return normalized;
  }
};

const translateToKorean = async (text) => {
  if (!text) return "";
  const chunks = chunkText(text, 800);

  const translatedChunks = [];
  for (const chunk of chunks) {
    // 429 Too Many Requests 방지를 위해 Promise.all 대신 순차 호출 및 딜레이 적용
    const translated = await getTranslatedText(chunk, "ko");
    translatedChunks.push(translated);
    await delay(300);
  }
  return translatedChunks.join("\n\n").trim();
};

// 4. README 파싱 및 정제
const cleanReadmeText = (text) => {
  if (!text) return "";

  let cleaned = String(text);

  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/<picture[\s\S]*?<\/picture>/gi, "");
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/!\[.*?\]\(.*?\)/g, "");
  cleaned = cleaned.replace(/<img[^>]*>/gi, "");
  cleaned = cleaned.replace(/\[([^\]]+)\]\((.*?)\)/g, "$1");
  cleaned = cleaned.replace(/<\/?[^>]+>/g, "");
  cleaned = cleaned.replace(/^\s*[-|:]{3,}\s*$/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(english|한국어|简体中文|繁體中文|japanese|日本語)(\s*[·|/]\s*.*)?$/i.test(
          line,
        ),
    )
    .slice(0, 8);

  return lines.join("\n").trim();
};

const getReadmeRaw = async (owner, repo, defaultBranch = "main") => {
  const branches = [
    ...new Set([defaultBranch, "main", "master"].filter(Boolean)),
  ];
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
    } catch (e) {
      /* 무시 */
    }
  }
  return "";
};

const extractReadmeImage = (text, owner, repo, branch = "main") => {
  if (!text) return null;
  const markdownImgRegex =
    /!\[.*?\]\((.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)\)/i;
  const htmlImgRegex =
    /<img.*?src=["'](.*?\.(?:png|jpe?g|gif|svg|webp)(?:\?.*?)?)['"]/i;

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

  const date = new Date();
  date.setDate(date.getDate() - 7);
  const formattedDate = date.toISOString().split("T")[0];
  const q = `created:>${formattedDate}`;
  const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15`;

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

      // 1) 설명 번역 (Google API)
      const descKo = await translateToKorean(repo.description || "");

      // 2) README 텍스트 및 이미지 추출
      const rawReadme = await getReadmeRaw(
        owner,
        repoName,
        repo.default_branch,
      );
      const thumbnail = extractReadmeImage(
        rawReadme,
        owner,
        repoName,
        repo.default_branch,
      );

      // 3) 요약 및 번역 (Google API)
      const summaryEn = cleanReadmeText(rawReadme);
      const summaryKo = await translateToKorean(summaryEn);

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

      const docRef = db.collection("feed_cards").doc(cardData.repoId);
      batch.set(docRef, cardData, { merge: true });

      console.log(`✅ 완료: ${owner}/${repoName}`);
      await delay(1000); // 다음 레포지토리 처리 전 안전 딜레이
    }

    await batch.commit();
    console.log(`\n🎉 모든 데이터가 성공적으로 Firestore에 적재되었습니다.`);
  } catch (error) {
    console.error("❌ 파이프라인 실행 중 오류 발생:", error);
    process.exit(1);
  }
};

runPipeline();
