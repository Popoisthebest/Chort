import React, { useState, useEffect, useRef } from "react";
import {
  Star,
  Share2,
  Code,
  Terminal,
  FileText,
  AlignLeft,
  Languages,
  MessageCircle,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { getReadmeImage, starRepo, unstarRepo } from "../../api/github";
import {
  auth,
  getComments as fetchComments,
  addComment,
  deleteComment,
  getReplies as fetchReplies,
  addReply,
  deleteReply,
} from "../../api/firebase";

const translateToKorean = async (text) => {
  if (!text) return "";
  try {
    const safeText = text.substring(0, 800);
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(safeText)}`,
    );
    const data = await response.json();
    return data[0].map((item) => item[0]).join("");
  } catch (error) {
    console.error("번역 에러:", error);
    return text;
  }
};

const ChortCard = ({ repo, onCommentClick }) => {
  const [isStarred, setIsStarred] = useState(false);
  const [readmeImage, setReadmeImage] = useState(null);

  const [originalReadme, setOriginalReadme] = useState("");
  const [koDescription, setKoDescription] = useState("번역 중...");
  const [koReadme, setKoReadme] = useState("번역 중...");
  const [isKorean, setIsKorean] = useState(true);

  // 댓글 관련 state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);

  // 답글 관련 state
  const [expandedCommentId, setExpandedCommentId] = useState(null);
  const [repliesByCommentId, setRepliesByCommentId] = useState({});
  const [replyTextByCommentId, setReplyTextByCommentId] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});

  const cardRef = useRef(null);
  const hasFetched = useRef(false); // 💡 이미 데이터를 가져왔는지 기억하는 변수
  const ogImageUrl = `https://opengraph.githubassets.com/1/${repo.full_name}`;

  useEffect(() => {
    // 1. 보관함(Saved) 여부는 API를 안 쓰니 바로 계산합니다.
    const savedRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];
    setIsStarred(savedRepos.some((r) => r.id === repo.id));

    // 2. 무거운 데이터(번역, 이미지, 리드미)를 가져오는 함수
    const fetchData = async () => {
      const imgUrl = await getReadmeImage(
        repo.owner.login,
        repo.name,
        repo.default_branch,
      );
      setReadmeImage(imgUrl);

      const translatedDesc = await translateToKorean(repo.description);
      setKoDescription(translatedDesc);

      let cleanText = "";
      try {
        const urls = [
          `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/main/README.md`,
          `https://raw.githubusercontent.com/${repo.owner.login}/${repo.name}/master/README.md`,
        ];
        for (const url of urls) {
          const res = await fetch(url);
          if (res.ok) {
            const text = await res.text();

            let noHtmlText = text
              .replace(/<!--[\s\S]*?-->/g, "") // 1. HTML 주석 제거 (안에 내용을 꼭 채워주세요!)
              .replace(/!\[.*?\]\(.*?\)/g, "")
              .replace(/<picture>[\s\S]*?<\/picture>/gi, "")
              .replace(
                /<\/?(p|div|a|span|h[1-6]|br|hr|source|img|svg|path)[^>]*>/gi,
                "",
              );

            let lines = noHtmlText.split("\n").slice(0, 8).join("\n");
            const codeBlockCount = (lines.match(/```/g) || []).length;
            if (codeBlockCount % 2 !== 0) {
              lines += "\n```";
            }

            cleanText = lines;
            break;
          }
        }
      } catch (error) {
        console.error("README 파싱 에러:", error);
      }

      setOriginalReadme(cleanText ? cleanText : "");

      if (cleanText) {
        // 💡 구글 번역 API 부하를 줄이기 위해 약간의 딜레이(0.3초)를 줍니다.
        await new Promise((resolve) => setTimeout(resolve, 300));
        const translatedReadmeText = await translateToKorean(cleanText);
        setKoReadme(translatedReadmeText);
      } else {
        setKoReadme("README 데이터를 찾을 수 없습니다.");
      }

      // 💡 카드가 보일 때 댓글 개수도 함께 로드
      await loadComments();
    };

    // 3. 💡 화면 감지 센서 (Intersection Observer)
    const observer = new IntersectionObserver(
      (entries) => {
        // 카드가 화면에 조금이라도 들어왔고(isIntersecting), 아직 데이터를 안 가져왔다면(!hasFetched.current)
        if (entries[0].isIntersecting && !hasFetched.current) {
          hasFetched.current = true; // 이제 가져왔다고 표시
          fetchData(); // 데이터 패칭 시작!
        }
      },
      { threshold: 0.1 }, // 카드가 화면에 10% 이상 보일 때 작동
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [
    repo.id,
    repo.owner.login,
    repo.name,
    repo.default_branch,
    repo.description,
  ]);

  // 댓글 로드 함수
  const loadComments = async () => {
    if (loadingComments) return;
    setLoadingComments(true);
    const loadedComments = await fetchComments(repo.id);
    setComments(loadedComments);
    setLoadingComments(false);
  };

  // 댓글 추가 함수
  const handleAddComment = async () => {
    const user = auth.currentUser;
    if (!user || !commentText.trim()) {
      console.log("사용자 정보 또는 댓글 내용이 없습니다.");
      return;
    }

    const result = await addComment(repo.id, commentText, user);
    if (result) {
      setCommentText("");
      await loadComments();
    }
  };

  // 댓글 삭제 함수
  const handleDeleteComment = async (commentId) => {
    if (window.confirm("이 댓글을 삭제하시겠습니까?")) {
      const success = await deleteComment(commentId);
      if (success) {
        await loadComments();
      }
    }
  };

  // 답글 토글 함수
  const toggleReplies = async (commentId) => {
    if (expandedCommentId === commentId) {
      setExpandedCommentId(null);
    } else {
      setExpandedCommentId(commentId);
      // 답글 로드
      if (!repliesByCommentId[commentId]) {
        await loadReplies(commentId);
      }
    }
  };

  // 답글 로드 함수
  const loadReplies = async (commentId) => {
    setLoadingReplies((prev) => ({ ...prev, [commentId]: true }));
    const replies = await fetchReplies(commentId);
    setRepliesByCommentId((prev) => ({ ...prev, [commentId]: replies }));
    setLoadingReplies((prev) => ({ ...prev, [commentId]: false }));
  };

  // 답글 추가 함수
  const handleAddReply = async (commentId) => {
    const user = auth.currentUser;
    const replyText = replyTextByCommentId[commentId];
    if (!user || !replyText?.trim()) {
      return;
    }

    const result = await addReply(commentId, replyText, user);
    if (result) {
      setReplyTextByCommentId((prev) => ({ ...prev, [commentId]: "" }));
      await loadReplies(commentId);
    }
  };

  // 답글 삭제 함수
  const handleDeleteReply = async (commentId, replyId) => {
    if (window.confirm("이 답글을 삭제하시겠습니까?")) {
      const success = await deleteReply(commentId, replyId);
      if (success) {
        await loadReplies(commentId);
      }
    }
  };

  const toggleStar = async () => {
    const savedRepos = JSON.parse(localStorage.getItem("chort_saved")) || [];

    if (isStarred) {
      // Star 제거
      setIsStarred(false); // 즉시 UI 업데이트
      const success = await unstarRepo(repo.owner.login, repo.name);

      if (success) {
        const newSaved = savedRepos.filter((r) => r.id !== repo.id);
        localStorage.setItem("chort_saved", JSON.stringify(newSaved));
      } else {
        // 실패 시 원래대로
        setIsStarred(true);
      }
    } else {
      // Star 추가
      setIsStarred(true); // 즉시 UI 업데이트
      const success = await starRepo(repo.owner.login, repo.name);

      if (success) {
        savedRepos.push(repo);
        localStorage.setItem("chort_saved", JSON.stringify(savedRepos));
      } else {
        // 실패 시 원래대로
        setIsStarred(false);
      }
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`https://github.com/${repo.full_name}`);
    alert("링크가 복사되었습니다! 🚀");
  };

  const displayDescription = isKorean
    ? koDescription
    : repo.description || "No description provided.";
  const displayReadme = isKorean
    ? koReadme
    : originalReadme || "No README data found.";

  return (
    <div
      ref={cardRef}
      className="relative h-screen w-full snap-start bg-[#0d1117] flex flex-col overflow-hidden"
    >
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <img
          src={readmeImage || ogImageUrl}
          alt="background blur"
          className="w-full h-full object-cover blur-3xl scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117]/80 via-[#0d1117]/95 to-[#0d1117]"></div>
      </div>

      <div className="relative z-10 flex flex-col h-full w-full pt-10 pb-20">
        <div className="px-5 pb-4 shrink-0 flex justify-between items-start">
          <div className="pr-10">
            <div
              className="flex items-center gap-2 mb-2 cursor-pointer w-max"
              onClick={(e) => {
                e.stopPropagation();
                window.open(repo.owner.html_url, "_blank");
              }}
            >
              <img
                src={repo.owner.avatar_url}
                className="w-6 h-6 rounded-full border border-gray-600"
                alt="avatar"
              />
              <span className="font-semibold text-gray-400 text-xs tracking-wide">
                @{repo.owner.login}
              </span>
            </div>
            <h1 className="text-2xl font-black text-white leading-tight break-words">
              {repo.name}
            </h1>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsKorean(!isKorean);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-xs font-bold text-gray-200 transition-colors shrink-0"
          >
            <Languages className="w-4 h-4" />
            {isKorean ? "KR" : "EN"}
          </button>
        </div>

        {/* 💡 변경점 1: overflow-y-auto -> overflow-hidden 으로 변경 (내부 스크롤 금지) */}
        <div className="flex-1 overflow-hidden px-5 relative pr-16 flex flex-col">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 backdrop-blur-sm shrink-0">
            <h3 className="text-[10px] font-bold text-blue-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Description
            </h3>
            {/* Description이 너무 길 경우를 대비해 line-clamp 적용 */}
            <p className="text-gray-200 text-sm leading-relaxed break-keep line-clamp-3">
              {displayDescription}
            </p>
          </div>

          {readmeImage && (
            <div className="mb-4 rounded-xl overflow-hidden border border-white/10 bg-black/50 flex justify-center shrink-0">
              <img
                src={readmeImage}
                alt="Preview"
                className="w-full h-auto max-h-32 object-contain"
              />
            </div>
          )}

          <div className="bg-black/40 border border-white/10 rounded-xl p-4 backdrop-blur-sm flex-1 overflow-hidden relative">
            <h3 className="text-[10px] font-bold text-purple-400 mb-3 uppercase tracking-wider flex items-center gap-1">
              <FileText className="w-3 h-3" /> README Snippet
            </h3>
            <div className="text-gray-300 text-xs leading-relaxed break-words break-keep">
              <ReactMarkdown
                components={{
                  h1: ({ node, children, ...props }) => (
                    <h1
                      className="text-lg font-bold text-white mt-2 mb-2 border-b border-gray-700 pb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h1>
                  ),
                  h2: ({ node, children, ...props }) => (
                    <h2
                      className="text-md font-bold text-gray-100 mt-2 mb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h2>
                  ),
                  h3: ({ node, children, ...props }) => (
                    <h3
                      className="text-sm font-bold text-gray-200 mt-1 mb-1 line-clamp-1"
                      {...props}
                    >
                      {children}
                    </h3>
                  ),
                  p: ({ node, ...props }) => <p className="mb-2" {...props} />,
                  ul: ({ node, ...props }) => (
                    <ul
                      className="list-disc pl-5 mb-2 text-gray-400"
                      {...props}
                    />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="mb-1" {...props} />
                  ),
                  code({ node, inline, className, children, ...props }) {
                    return inline ? (
                      <code
                        className="bg-gray-800 text-red-300 px-1.5 py-0.5 rounded-md text-[10px] font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <div className="relative mb-2">
                        <pre className="bg-[#161b22] border border-gray-700 p-3 rounded-lg overflow-hidden text-[10px] font-mono text-green-400">
                          <code {...props}>{children}</code>
                        </pre>
                      </div>
                    );
                  },
                }}
              >
                {displayReadme}
              </ReactMarkdown>
            </div>

            {/* 💡 변경점 2: 하단 페이드아웃 그라데이션 (자연스럽게 잘린 느낌 연출) */}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#151a22] to-transparent pointer-events-none rounded-b-xl flex items-end justify-center pb-2">
              <span className="text-[10px] text-gray-500 font-semibold mb-1">
                ...Tap Repo to read more
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 shrink-0 pt-4 pr-20">
          <div className="flex flex-wrap gap-2 mb-3">
            {repo.language && (
              <span className="text-[10px] font-bold px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400">
                {repo.language}
              </span>
            )}
            {repo.topics?.slice(0, 3).map((topic) => (
              <span
                key={topic}
                className="text-[10px] font-bold px-2 py-1 bg-white/5 border border-white/10 rounded text-gray-400"
              >
                #{topic}
              </span>
            ))}
          </div>
          <div
            className="bg-black/80 border border-gray-700 rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-900 transition"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(
                `git clone https://github.com/${repo.full_name}`,
              );
              alert("클론 명령어가 복사되었습니다!");
            }}
          >
            <Terminal className="w-4 h-4 text-green-400 shrink-0" />
            <code className="text-xs text-green-400 font-mono truncate">
              git clone https://github.com/{repo.full_name}
            </code>
          </div>
        </div>
      </div>

      {/* 우측 액션 버튼 */}
      <div className="absolute right-3 bottom-24 flex flex-col gap-5 items-center z-20">
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleStar();
          }}
          className="flex flex-col items-center transition-transform active:scale-90"
        >
          <div
            className={`p-3 rounded-full backdrop-blur-md transition-all ${isStarred ? "bg-yellow-400/20 border border-yellow-400/50" : "bg-black/50 border border-white/10"}`}
          >
            <Star
              className={`w-6 h-6 ${isStarred ? "fill-yellow-400 text-yellow-400" : "text-white"}`}
            />
          </div>
          <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
            {(repo.stargazers_count / 1000).toFixed(1)}k
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCommentClick?.();
          }}
          className="flex flex-col items-center transition-transform active:scale-90"
        >
          <div className="p-3 bg-black/50 border border-white/10 rounded-full">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
            {comments.reduce(
              (sum, comment) => sum + 1 + (comment.replyCount || 0),
              0,
            )}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleShare();
          }}
          className="flex flex-col items-center transition-transform active:scale-90"
        >
          <div className="p-3 bg-black/50 border border-white/10 rounded-full">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
            Share
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(`https://github.com/${repo.full_name}`, "_blank");
          }}
          className="flex flex-col items-center transition-transform active:scale-90"
        >
          <div className="p-3 bg-black/50 border border-white/10 rounded-full">
            <Code className="w-6 h-6 text-white" />
          </div>
          <span className="text-[10px] mt-1.5 font-bold tracking-wider text-white">
            Repo
          </span>
        </button>
      </div>
    </div>
  );
};

export default ChortCard;
