// src/hooks/useLoginModal.js
import { useState, useCallback } from "react";

/**
 * useLoginModal
 * 로그인 모달의 열림/닫힘 상태와 메시지를 관리하는 훅
 */
export const useLoginModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);

  const openLoginModal = useCallback((msg = "", onSuccess = null) => {
    setMessage(msg);
    // useState에 함수를 넣으면 initializer로 인식되므로 래핑
    setOnSuccessCallback(() => onSuccess);
    setIsOpen(true);
  }, []);

  const closeLoginModal = useCallback(() => {
    setIsOpen(false);
    setMessage("");
    setOnSuccessCallback(null);
  }, []);

  return {
    isLoginModalOpen: isOpen,
    loginModalMessage: message,
    loginModalOnSuccess: onSuccessCallback,
    openLoginModal,
    closeLoginModal,
  };
};
