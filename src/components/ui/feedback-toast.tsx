"use client";

import { toast, type ExternalToast } from "sonner";

interface FeedbackOptions extends ExternalToast {
  description?: string;
}

function success(message: string, options?: FeedbackOptions) {
  return toast.success(message, options);
}

function error(message: string, options?: FeedbackOptions) {
  return toast.error(message, options);
}

function warning(message: string, options?: FeedbackOptions) {
  return toast.warning(message, options);
}

function loading(message: string, options?: FeedbackOptions) {
  return toast.loading(message, options);
}

function dismiss(toastId?: string | number) {
  return toast.dismiss(toastId);
}

export const feedbackToast = {
  success,
  error,
  warning,
  loading,
  dismiss,
};
