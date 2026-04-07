// src/utils/formatters.js

export const safeToDate = (value) => {
  if (!value) return null;

  if (typeof value?.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateTimeKo = (value, fallback = "방금 전") => {
  const date = safeToDate(value);
  if (!date) return fallback;

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTimeKo = (value, fallback = "방금 전") => {
  const date = safeToDate(value);
  if (!date) return fallback;

  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatCompactStars = (count) => {
  const value = Number(count) || 0;

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }

  return String(value);
};

export const trimText = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};
