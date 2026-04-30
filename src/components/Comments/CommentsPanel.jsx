// src/components/Comments/CommentsPanel.jsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useContext,
} from "react";
import {
  X,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  LogIn,
  Flag,
} from "lucide-react";
import {
  auth,
  getComments as fetchComments,
  addComment,
  deleteComment,
  getReplies as fetchReplies,
  addReply,
  deleteReply,
  reportComment,
  subscribeComments,
} from "../../api/firebase";
import { formatDateTimeKo, formatTimeKo } from "../../utils/formatters";
import { LoginModalContext } from "../../App";

const makeClientRequestId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const REPLIES_CACHE_PREFIX = "chort_replies:";
const REPLIES_CACHE_TTL = 1000 * 60 * 5;

const getRepliesCacheKey = (commentId) => `${REPLIES_CACHE_PREFIX}${commentId}`;

const getCachedReplies = (commentId) => {
  try {
    const raw = sessionStorage.getItem(getRepliesCacheKey(commentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(getRepliesCacheKey(commentId));
      return null;
    }
    return parsed.replies;
  } catch {
    return null;
  }
};

const setCachedReplies = (commentId, replies) => {
  try {
    sessionStorage.setItem(
      getRepliesCacheKey(commentId),
      JSON.stringify({ replies, expiresAt: Date.now() + REPLIES_CACHE_TTL }),
    );
  } catch {
    // ignore quota errors
  }
};

const invalidateRepliesCache = (commentId) => {
  try {
    sessionStorage.removeItem(getRepliesCacheKey(commentId));
  } catch {
    // ignore
  }
};

export default function CommentsPanel({ repo, onClose, onCountChange }) {
  const { user, openLoginModal } = useContext(LoginModalContext);

  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(true);
  const [expandedCommentId, setExpandedCommentId] = useState(null);
  const [repliesByCommentId, setRepliesByCommentId] = useState({});
  const [replyTextByCommentId, setReplyTextByCommentId] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingReplyByCommentId, setSubmittingReplyByCommentId] = useState(
    {},
  );
  const [reportingCommentId, setReportingCommentId] = useState(null);

  const lastCommentSubmitRef = useRef("");
  const lastReplySubmitRef = useRef({});

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    const loadedComments = await fetchComments(repo.id);
    setComments(loadedComments);
    setLoadingComments(false);
  }, [repo.id]);

  useEffect(() => {
    setExpandedCommentId(null);
    setRepliesByCommentId({});
    setReplyTextByCommentId({});
    setSubmittingComment(false);
    setSubmittingReplyByCommentId({});
    lastCommentSubmitRef.current = "";
    lastReplySubmitRef.current = {};
    loadComments();

    setLoadingComments(true);
    // 실시간 구독 시작
    const unsubscribe = subscribeComments(
      repo.id,
      (loadedComments, totalCount) => {
        setComments(loadedComments);
        setLoadingComments(false);
        // 부모에게 변경된 갯수 전달
        if (onCountChange) onCountChange(repo.id, totalCount);
      },
    );

    return () => unsubscribe(); // 언마운트 시 구독 해제
  }, [loadComments, repo.id, onCountChange]);

  const handleAddComment = async () => {
    // 로그인 확인
    if (!user) {
      openLoginModal("댓글을 작성하려면 GitHub 로그인이 필요합니다.");
      return;
    }

    const currentUser = auth.currentUser;
    const trimmed = commentText.trim();
    if (!currentUser || !trimmed || submittingComment) return;
    if (lastCommentSubmitRef.current === trimmed) return;

    setSubmittingComment(true);
    lastCommentSubmitRef.current = trimmed;

    try {
      const result = await addComment(
        repo.id,
        trimmed,
        currentUser,
        makeClientRequestId(),
      );
      if (result) {
        setCommentText("");
        await loadComments();
      }
    } finally {
      setSubmittingComment(false);
      setTimeout(() => {
        if (lastCommentSubmitRef.current === trimmed) {
          lastCommentSubmitRef.current = "";
        }
      }, 800);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!user) {
      openLoginModal("댓글을 삭제하려면 GitHub 로그인이 필요합니다.");
      return;
    }
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;

    const success = await deleteComment(commentId);
    if (success) {
      if (expandedCommentId === commentId) {
        setExpandedCommentId(null);
      }
      await loadComments();
    }
  };

  const handleReportComment = async (comment) => {
    if (!user) {
      openLoginModal("댓글을 신고하려면 GitHub 로그인이 필요합니다.");
      return;
    }
    if (auth.currentUser?.uid === comment.userId) return;
    if (!window.confirm("이 댓글을 신고하시겠습니까?")) return;

    setReportingCommentId(comment.id);
    try {
      const success = await reportComment(comment, auth.currentUser);
      if (success) {
        alert("신고가 접수되었습니다.");
      } else {
        alert("신고 처리에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      setReportingCommentId(null);
    }
  };

  const loadReplies = async (commentId) => {
    const cached = getCachedReplies(commentId);
    if (cached) {
      setRepliesByCommentId((prev) => ({ ...prev, [commentId]: cached }));
      return;
    }
    setLoadingReplies((prev) => ({ ...prev, [commentId]: true }));
    const replies = await fetchReplies(commentId);
    setRepliesByCommentId((prev) => ({ ...prev, [commentId]: replies }));
    setCachedReplies(commentId, replies);
    setLoadingReplies((prev) => ({ ...prev, [commentId]: false }));
  };

  const toggleReplies = async (commentId) => {
    if (expandedCommentId === commentId) {
      setExpandedCommentId(null);
      return;
    }
    setExpandedCommentId(commentId);
    if (!repliesByCommentId[commentId]) {
      await loadReplies(commentId);
    }
  };

  const handleAddReply = async (commentId) => {
    const targetComment = comments.find((comment) => comment.id === commentId);
    if (targetComment?.deleted) return;

    // 로그인 확인
    if (!user) {
      openLoginModal("답글을 작성하려면 GitHub 로그인이 필요합니다.");
      return;
    }

    const currentUser = auth.currentUser;
    const replyText = replyTextByCommentId[commentId] || "";
    const trimmed = replyText.trim();
    const isSubmitting = !!submittingReplyByCommentId[commentId];

    if (!currentUser || !trimmed || isSubmitting) return;
    if (lastReplySubmitRef.current[commentId] === trimmed) return;

    setSubmittingReplyByCommentId((prev) => ({ ...prev, [commentId]: true }));
    lastReplySubmitRef.current = {
      ...lastReplySubmitRef.current,
      [commentId]: trimmed,
    };

    try {
      const result = await addReply(
        commentId,
        trimmed,
        currentUser,
        makeClientRequestId(),
      );
      if (result) {
        setReplyTextByCommentId((prev) => ({ ...prev, [commentId]: "" }));
        invalidateRepliesCache(commentId);
        await Promise.all([loadReplies(commentId), loadComments()]);
      }
    } finally {
      setSubmittingReplyByCommentId((prev) => ({
        ...prev,
        [commentId]: false,
      }));
      setTimeout(() => {
        if (lastReplySubmitRef.current[commentId] === trimmed) {
          lastReplySubmitRef.current = {
            ...lastReplySubmitRef.current,
            [commentId]: "",
          };
        }
      }, 800);
    }
  };

  const handleDeleteReply = async (commentId, replyId) => {
    if (!user) {
      openLoginModal("답글을 삭제하려면 GitHub 로그인이 필요합니다.");
      return;
    }
    if (!window.confirm("이 대댓글을 삭제하시겠습니까?")) return;

    const success = await deleteReply(commentId, replyId);
    if (success) {
      invalidateRepliesCache(commentId);
      await Promise.all([loadReplies(commentId), loadComments()]);
    }
  };

  const totalCount = comments.reduce(
    (sum, comment) => sum + (comment.deleted ? 0 : 1) + (comment.replyCount || 0),
    0,
  );

  return (
    <div className="w-full h-full bg-black border-l border-gray-800 flex flex-col overflow-hidden sm:w-96">
      <div className="flex justify-between items-center p-4 border-b border-gray-800 shrink-0">
        <div>
          <p className="text-sm text-gray-500">{repo.name}</p>
          <p className="text-xs text-gray-600 mt-1">댓글 ({totalCount})</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 댓글 목록 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingComments ? (
          <div className="flex justify-center items-center h-20">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center text-gray-500 py-8 text-sm">
            첫 번째 댓글을 남겨보세요! 💬
          </div>
        ) : (
          [...comments]
            .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
            .map((comment) => (
              <div key={comment.id}>
                <div className="bg-white/5 border border-white/10 rounded p-3 text-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {comment.photoURL ? (
                        <img
                          src={comment.photoURL}
                          alt="avatar"
                          className="w-6 h-6 rounded-full shrink-0"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-700 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-white text-xs truncate">
                          {comment.displayName}
                        </p>
                        <p className="text-[10px] text-gray-600">
                          {formatDateTimeKo(comment.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {auth.currentUser?.uid !== comment.userId && !comment.deleted && (
                        <button
                          onClick={() => handleReportComment(comment)}
                          disabled={reportingCommentId === comment.id}
                          className="text-gray-600 hover:text-orange-400 transition"
                          title="신고"
                        >
                          <Flag className="w-3 h-3" />
                        </button>
                      )}
                      {/* 삭제 */}
                      {user &&
                        !comment.deleted &&
                        auth.currentUser?.uid === comment.userId && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-red-400 hover:text-red-300 transition shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p
                    className={`break-words text-xs mb-2 ${
                      comment.deleted ? "text-gray-500 italic" : "text-gray-200"
                    }`}
                  >
                    {comment.deleted ? "삭제된 댓글입니다." : comment.text}
                  </p>

                  <button
                    onClick={() => toggleReplies(comment.id)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition flex items-center gap-1"
                  >
                    {expandedCommentId === comment.id ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        숨기기
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        답글 {comment.replyCount || 0}
                      </>
                    )}
                  </button>
                </div>

                {expandedCommentId === comment.id && (
                  <div className="ml-2 mt-2 border-l border-gray-700 pl-3 space-y-2 pb-2">
                    {loadingReplies[comment.id] ? (
                      <div className="flex justify-center py-2">
                        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (repliesByCommentId[comment.id] || []).length === 0 ? (
                      <p className="text-xs text-gray-600 py-2">
                        답글이 없습니다.
                      </p>
                    ) : (
                      (repliesByCommentId[comment.id] || []).map((reply) => (
                        <div
                          key={reply.id}
                          className="bg-white/3 border border-white/5 rounded p-2"
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {reply.photoURL ? (
                                <img
                                  src={reply.photoURL}
                                  alt="avatar"
                                  className="w-4 h-4 rounded-full shrink-0"
                                />
                              ) : (
                                <div className="w-4 h-4 rounded-full bg-gray-700 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {reply.displayName}
                                </p>
                                <p className="text-[9px] text-gray-700">
                                  {formatTimeKo(reply.createdAt)}
                                </p>
                              </div>
                            </div>

                            {user && auth.currentUser?.uid === reply.userId && (
                              <button
                                onClick={() =>
                                  handleDeleteReply(comment.id, reply.id)
                                }
                                className="text-red-400 hover:text-red-300 transition shrink-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          <p className="text-xs text-gray-300 break-words">
                            {reply.text}
                          </p>
                        </div>
                      ))
                    )}

                    {/* 답글 입력 */}
                    <div className="flex gap-1 pt-2">
                      {comment.deleted ? (
                        <div className="w-full rounded border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-500">
                          삭제된 댓글에는 새 답글을 작성할 수 없습니다.
                        </div>
                      ) : user ? (
                        <>
                          <input
                            type="text"
                            placeholder="답글..."
                            value={replyTextByCommentId[comment.id] || ""}
                            onChange={(e) =>
                              setReplyTextByCommentId((prev) => ({
                                ...prev,
                                [comment.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddReply(comment.id);
                              }
                            }}
                            className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 text-xs"
                          />
                          <button
                            onClick={() => handleAddReply(comment.id)}
                            disabled={
                              !replyTextByCommentId[comment.id]?.trim() ||
                              !!submittingReplyByCommentId[comment.id]
                            }
                            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded px-2 py-1 transition flex items-center"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() =>
                            openLoginModal(
                              "답글을 작성하려면 로그인이 필요합니다.",
                            )
                          }
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-purple-400 border border-purple-500/30 rounded hover:bg-purple-500/10 transition"
                          >
                            <LogIn className="w-3 h-3" />
                          로그인하고 답글 달기
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {/* 댓글 입력 영역 */}
      <div className="border-t border-gray-800 p-4 shrink-0">
        {user ? (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="댓글을 입력하세요..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAddComment();
                }
              }}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
            />
            <button
              onClick={handleAddComment}
              disabled={!commentText.trim() || submittingComment}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg px-3 py-2 transition flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() =>
              openLoginModal("댓글을 작성하려면 GitHub 로그인이 필요합니다.")
            }
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-purple-500/40 text-purple-400 hover:bg-purple-500/10 transition text-sm font-semibold"
          >
            <LogIn className="w-4 h-4" />
            로그인하고 댓글 달기
          </button>
        )}
      </div>
    </div>
  );
}
