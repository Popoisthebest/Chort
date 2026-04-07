// src/utils/normalizers.js

import { safeToDate, trimText } from "./formatters";

export const normalizeInterestKey = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

export const normalizeRepo = (repo = {}) => {
  const topics = Array.isArray(repo.topics)
    ? repo.topics.map((topic) => String(topic).trim()).filter(Boolean)
    : [];

  return {
    ...repo,
    id: repo.id,
    name: trimText(repo.name, "unknown-repo"),
    full_name: trimText(repo.full_name, ""),
    description: trimText(repo.description, ""),
    language: trimText(repo.language, ""),
    topics,
    owner: {
      ...repo.owner,
      login: trimText(repo?.owner?.login, "unknown"),
      avatar_url: trimText(repo?.owner?.avatar_url, ""),
      html_url: trimText(repo?.owner?.html_url, ""),
    },
    stargazers_count: Number(repo.stargazers_count) || 0,
    forks_count: Number(repo.forks_count) || 0,
    default_branch: trimText(repo.default_branch, "main"),
    html_url: trimText(repo.html_url, ""),
    created_at: repo.created_at || null,
    private: Boolean(repo.private),
  };
};

export const normalizeComment = (comment = {}) => {
  return {
    id: comment.id || "",
    repoId: String(comment.repoId || ""),
    text: trimText(comment.text, ""),
    userId: String(comment.userId || ""),
    displayName: trimText(comment.displayName, "익명"),
    photoURL: trimText(comment.photoURL, ""),
    createdAt: safeToDate(comment.createdAt),
    replyCount: Math.max(0, Number(comment.replyCount) || 0),
  };
};

export const normalizeReply = (reply = {}) => {
  return {
    id: reply.id || "",
    userId: String(reply.userId || ""),
    displayName: trimText(reply.displayName, "익명"),
    photoURL: trimText(reply.photoURL, ""),
    text: trimText(reply.text, ""),
    createdAt: safeToDate(reply.createdAt),
  };
};
