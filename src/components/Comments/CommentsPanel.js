import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Send, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  auth,
  getComments as fetchComments,
  addComment,
  deleteComment,
  getReplies as fetchReplies,
  addReply,
  deleteReply,
} from "../../api/firebase";
import { formatDateTimeKo, formatTimeKo } from "../../utils/formatters";

const makeClientRequestId = () =>
  `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const REPLIES_CACHE_PREFIX = "chort_replies:";
const REPLIES_CACHE_TTL = 1000 * 60 * 5; // 5 분

const getRepliesCacheKey = (commentId) =>
  `${REPLIES_CACHE_PREFIX}${commentId}`;

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
    sessionStorage.setItem(getRepliesCacheKey(commentId), JSON.stringify({
      replies,
      expiresAt: Date.now() + REPLIES_CACHE_TTL,
    }));
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

export default function CommentsPanel({ repo, onClose }) {
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
  }, [loadComments]);

  const handleAddComment = async () => {
    const user = auth.currentUser;
    const trimmed = commentText.trim();

    if (!user || !trimmed || submittingComment) return;
    if (lastCommentSubmitRef.current === trimmed) return;

    setSubmittingComment(true);
    lastCommentSubmitRef.current = trimmed;

    try {
      const result = await addComment(
        repo.id,
        trimmed,
        user,
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
    if (!window.confirm("이 댓글을 삭제하시겠습니까?")) return;

    const success = await deleteComment(commentId);
    if (success) {
      if (expandedCommentId === commentId) {
        setExpandedCommentId(null);
      }
      await loadComments();
    }
  };

  const loadReplies = async (commentId) => {
    // 캐시 확인
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
    const user = auth.currentUser;
    const replyText = replyTextByCommentId[commentId] || "";
    const trimmed = replyText.trim();
    const isSubmitting = !!submittingReplyByCommentId[commentId];

    if (!user || !trimmed || isSubmitting) return;
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
        user,
        makeClientRequestId(),
      );

      if (result) {
        setReplyTextByCommentId((prev) => ({ ...prev, [commentId]: "" }));
        // [수정] 대댓글 추가 시 해당 댓글의 캐시 무효화
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
    if (!window.confirm("이 대댓글을 삭제하시겠습니까?")) return;

    const success = await deleteReply(commentId, replyId);
    if (success) {
      // [수정] 대댓글 삭제 시 해당 댓글의 캐시 무효화
      invalidateRepliesCache(commentId);
      await Promise.all([loadReplies(commentId), loadComments()]);
    }
  };

  const totalCount = comments.reduce(
    (sum, comment) => sum + 1 + (comment.replyCount || 0),
    0,
  );

  return (
    <div className="w-96 h-full bg-black border-l border-gray-800 flex flex-col overflow-hidden">
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
          comments.map((comment) => (
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

                  {auth.currentUser?.uid === comment.userId && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="text-red-400 hover:text-red-300 transition shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <p className="text-gray-200 break-words text-xs mb-2">
                  {comment.text}
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

                          {auth.currentUser?.uid === reply.userId && (
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

                  <div className="flex gap-1 pt-2">
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
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-gray-800 p-4 shrink-0">
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
      </div>
    </div>
  );
}
