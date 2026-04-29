// src/components/Repo/RepoDetailModal.js
// Explore 상세보기 & Saved 상세보기 공용 모달
// - README 렌더링 (번역 포함)
// - 프로필 클릭 → GitHub 프로필 정보 팝업
// - Star/Unstar 지원
import React, { useState, useEffect, useContext, useRef } from "react";
import DOMPurify from "dompurify";
import ReactMarkdown from "react-markdown";
import {
  X,
  ExternalLink,
  Star,
  GitFork,
  Languages,
  FileText,
  AlignLeft,
  Terminal,
  MapPin,
  Link as LinkIcon,
  Users,
  BookOpen,
  Loader2,
  MessageCircle,
} from "lucide-react";
import {
  getReadmeRaw,
  getRenderedReadmeHtml,
  getReadmeSummary,
  prepareReadmeForLocalRender,
  translateToKorean,
  starRepo,
  unstarRepo,
  invalidateStarredCache,
} from "../../api/github";
import { LoginModalContext } from "../../App";
import CommentsPanel from "../Comments/CommentsPanel"; // 추가
import { subscribeComments } from "../../api/firebase"; // 추가
import { recordCommentOpen, recordGithubOpen } from "../../utils/userProfile";

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "i",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  ALLOWED_ATTR: ["href", "title", "rel", "target"],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: true,
  ALLOWED_URI_REGEXP: /^https?:\/\//i,
};

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noreferrer noopener");
  }
});

const sanitizeHtml = (html) => {
  if (!html || typeof window === "undefined") return "";
  try {
    return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
  } catch {
    return "";
  }
};

// ─── GitHub 유저 프로필 팝업 ─────────────────────────────────────────────────
function OwnerProfilePopup({ login, avatarUrl, onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const popupRef = useRef(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`https://api.github.com/users/${login}`);
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [login]);

  // 팝업 외부 클릭 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className="absolute z-50 w-72 bg-[#161b22] border border-gray-700 rounded-2xl shadow-2xl p-4 top-12 left-0"
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <div className="flex justify-center items-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : profile ? (
        <>
          <div className="flex items-center gap-3 mb-3">
            <img
              src={profile.avatar_url || avatarUrl}
              alt={login}
              className="w-12 h-12 rounded-full border border-gray-600"
            />
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">
                {profile.name || login}
              </p>
              <p className="text-gray-400 text-xs truncate">@{login}</p>
            </div>
          </div>

          {profile.bio && (
            <p className="text-gray-300 text-xs leading-relaxed mb-3 line-clamp-3">
              {profile.bio}
            </p>
          )}

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400 mb-3">
            {profile.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {profile.location}
              </span>
            )}
            {profile.blog && (
              <span className="flex items-center gap-1 truncate max-w-full">
                <LinkIcon className="w-3 h-3 shrink-0" />
                <a
                  href={
                    profile.blog.startsWith("http")
                      ? profile.blog
                      : `https://${profile.blog}`
                  }
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-400 hover:underline truncate"
                >
                  {profile.blog}
                </a>
              </span>
            )}
          </div>

          <div className="flex gap-4 text-xs text-gray-300 mb-4">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              팔로워 {(profile.followers || 0).toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />
              레포 {profile.public_repos || 0}
            </span>
          </div>

          <button
            onClick={() => window.open(`https://github.com/${login}`, "_blank")}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold transition"
          >
            <ExternalLink className="w-3 h-3" />
            GitHub 프로필 보기
          </button>
        </>
      ) : (
        <div className="text-center text-gray-500 text-xs py-4">
          프로필을 불러올 수 없습니다.
        </div>
      )}
    </div>
  );
}

// ─── 메인 모달 ────────────────────────────────────────────────────────────────
export default function RepoDetailModal({
  repo,
  onClose,
  isStarred: initialStarred = false,
  onStarChange,
}) {
  const { user, openLoginModal } = useContext(LoginModalContext);

  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [renderedHtml, setRenderedHtml] = useState("");
  const [readmeMarkdown, setReadmeMarkdown] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const [koDescription, setKoDescription] = useState("");
  const [isKorean, setIsKorean] = useState(true);
  const [loadingReadme, setLoadingReadme] = useState(true);
  const [isStarred, setIsStarred] = useState(initialStarred);
  const [showOwnerProfile, setShowOwnerProfile] = useState(false);

  const owner = repo?.owner?.login || "unknown";
  const avatarUrl = repo?.owner?.avatar_url || "";

  // Escape key close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Sync starred state
  useEffect(() => {
    setIsStarred(initialStarred);
  }, [initialStarred]);

  // Load README & translations
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    setLoadingReadme(true);
    setRenderedHtml("");
    setReadmeMarkdown("");
    setFallbackText("");
    setKoDescription("");

    const load = async () => {
      try {
        const hasGithubAuth = !!user;
        const readmePromise = hasGithubAuth
          ? getRenderedReadmeHtml(
              repo.owner.login,
              repo.name,
              repo.default_branch,
            )
          : getReadmeRaw(repo.owner.login, repo.name, repo.default_branch);

        const [readmeContent, summary, koDesc] = await Promise.all([
          readmePromise,
          getReadmeSummary(repo.owner.login, repo.name, repo.default_branch),
          translateToKorean(repo.description || ""),
        ]);

        if (cancelled) return;

        setRenderedHtml(hasGithubAuth ? sanitizeHtml(readmeContent || "") : "");
        setReadmeMarkdown(
          hasGithubAuth ? "" : prepareReadmeForLocalRender(readmeContent || ""),
        );
        setFallbackText(summary || "README 데이터를 찾을 수 없습니다.");
        setKoDescription(koDesc || repo.description || "설명이 없습니다.");
      } catch {
        if (!cancelled) {
          setFallbackText("README 데이터를 불러오는 중 오류가 발생했습니다.");
          setKoDescription(repo.description || "설명이 없습니다.");
        }
      } finally {
        if (!cancelled) setLoadingReadme(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [repo, user]);

  // 모달이 열리면 해당 레포의 댓글 수를 실시간으로 가져옴
  useEffect(() => {
    if (!repo?.id) return;

    // 댓글창을 열지 않아도 갯수를 실시간으로 업데이트함
    const unsubscribe = subscribeComments(repo.id, (comments, totalCount) => {
      setCommentCount(totalCount);
    });

    return () => unsubscribe(); // 모달 닫히면 구독 해제
  }, [repo?.id]);

  const handleToggleStar = async (e) => {
    e.stopPropagation();
    if (!user) {
      openLoginModal("Star를 누르려면 GitHub 로그인이 필요합니다.");
      return;
    }

    const prev = isStarred;
    setIsStarred(!prev);

    const success = prev
      ? await unstarRepo(owner, repo.name)
      : await starRepo(owner, repo.name);

    if (success) {
      invalidateStarredCache();
      onStarChange?.(!prev, repo);
    } else {
      setIsStarred(prev);
    }
  };

  const displayDescription = isKorean
    ? koDescription || repo?.description || "설명이 없습니다."
    : repo?.description || "No description provided.";

  if (!repo) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-3xl border border-gray-700 bg-[#0d1117] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1">
          <div className={`min-h-0 flex-1 flex flex-col ${isCommentsOpen ? "lg:border-r lg:border-gray-800" : ""}`}>
            {/* ── 헤더 ── */}
            <div className="flex items-start justify-between gap-4 p-5 border-b border-gray-800 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="relative inline-block mb-2">
                  <button
                    className="flex items-center gap-2 hover:opacity-80 transition"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowOwnerProfile((v) => !v);
                    }}
                  >
                    <img
                      src={avatarUrl}
                      alt={owner}
                      className="w-8 h-8 rounded-full border border-gray-600"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="text-left">
                      <p className="text-xs text-gray-400">@{owner}</p>
                      <h2 className="text-xl font-bold text-white leading-tight truncate max-w-xs">
                        {repo.name}
                      </h2>
                    </div>
                  </button>

                  {showOwnerProfile && (
                    <OwnerProfilePopup
                      login={owner}
                      avatarUrl={avatarUrl}
                      onClose={() => setShowOwnerProfile(false)}
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-bold text-gray-300">
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-yellow-400" />
                    {(repo.stargazers_count / 1000).toFixed(1)}k
                  </span>
                  <span className="flex items-center gap-1">
                    <GitFork className="w-3.5 h-3.5" />
                    {repo.forks_count}
                  </span>
                  {repo.language && (
                    <span className="text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded">
                      {repo.language}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsKorean(!isKorean);
                  }}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-gray-200 transition"
                >
                  <Languages className="w-3.5 h-3.5" />
                  {isKorean ? "KR" : "EN"}
                </button>

                <button
                  onClick={() =>
                    setIsCommentsOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        recordCommentOpen(repo);
                      }
                      return next;
                    })
                  }
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition ${
                    isCommentsOpen
                      ? "bg-purple-600 text-white"
                      : "bg-white/10 text-gray-300"
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{commentCount}</span>
                </button>

                <button
                  onClick={handleToggleStar}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition ${
                    isStarred
                      ? "bg-yellow-400/20 border border-yellow-400/50 text-yellow-400"
                      : "bg-white/10 hover:bg-white/20 text-gray-300"
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${isStarred ? "fill-yellow-400" : ""}`}
                  />
                  {isStarred ? "Starred" : "Star"}
                </button>

                <button
                  onClick={() => {
                    recordGithubOpen(repo);
                    window.open(repo.html_url, "_blank");
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  GitHub
                </button>

                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlignLeft className="w-3 h-3" /> Description
                </h3>
                <p className="text-sm text-gray-300 leading-relaxed break-words">
                  {displayDescription}
                </p>
              </div>

              <div
                className="bg-black/60 border border-gray-700 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-900 transition"
                onClick={() => {
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

              {repo.topics?.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3">
                    Topics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {repo.topics.map((topic) => (
                      <span
                        key={topic}
                        className="text-xs font-bold px-2.5 py-1 bg-white/5 border border-white/10 rounded text-gray-300"
                      >
                        #{topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-black/40 border border-white/10 rounded-2xl p-4">
                <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> README
                </h3>

                {loadingReadme ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  </div>
                ) : renderedHtml ? (
                  <div
                    className="readme-rendered text-gray-300 text-xs leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                ) : readmeMarkdown ? (
                  <div className="readme-rendered text-gray-300 text-xs leading-relaxed break-words">
                    <ReactMarkdown>{readmeMarkdown}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="text-gray-300 text-xs leading-relaxed whitespace-pre-wrap break-words break-keep">
                    {fallbackText || "README 없음"}
                  </pre>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                  Repo Info
                </h3>
                <div className="space-y-1.5 text-xs text-gray-300">
                  <p>
                    <span className="text-gray-500">Full name: </span>
                    {repo.full_name}
                  </p>
                  <p>
                    <span className="text-gray-500">Default branch: </span>
                    {repo.default_branch || "main"}
                  </p>
                  <p>
                    <span className="text-gray-500">Visibility: </span>
                    {repo.private ? "Private" : "Public"}
                  </p>
                  <p>
                    <span className="text-gray-500">License: </span>
                    {repo.license?.spdx_id || "N/A"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {isCommentsOpen && (
            <div className="hidden lg:flex lg:w-[360px] lg:min-h-0 lg:flex-col">
              <CommentsPanel
                repo={repo}
                onClose={() => setIsCommentsOpen(false)}
                onCountChange={(id, count) => setCommentCount(count)}
              />
            </div>
          )}
        </div>

        {isCommentsOpen && (
          <div className="fixed inset-0 z-[60] bg-black/80 lg:hidden">
            <CommentsPanel
              repo={repo}
              onClose={() => setIsCommentsOpen(false)}
              onCountChange={(id, count) => setCommentCount(count)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
