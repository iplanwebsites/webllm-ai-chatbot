"use client";

import { useEffect, useState } from "react";
import {
  checkWebLLMSupport,
  type WebLLMAvailability,
  type WebLLMProgress,
} from "@/lib/ai/webllm-client";
import { cn } from "@/lib/utils";

// Logging utility for WebLLM Status component
const LOG_PREFIX = "[WebLLM-Status]";

function log(
  level: "info" | "warn" | "error" | "debug",
  message: string,
  data?: unknown
) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] ${LOG_PREFIX} [${level.toUpperCase()}]`;

  switch (level) {
    case "error":
      console.error(prefix, message, data !== undefined ? data : "");
      break;
    case "warn":
      console.warn(prefix, message, data !== undefined ? data : "");
      break;
    case "debug":
      console.debug(prefix, message, data !== undefined ? data : "");
      break;
    default:
      console.log(prefix, message, data !== undefined ? data : "");
  }
}

interface WebLLMStatusProps {
  modelStatus: WebLLMAvailability | "checking" | "loading";
  downloadProgress: WebLLMProgress | null;
  className?: string;
}

export function WebLLMStatus({
  modelStatus,
  downloadProgress,
  className,
}: WebLLMStatusProps) {
  useEffect(() => {
    log("debug", "WebLLMStatus render", {
      modelStatus,
      hasProgress: !!downloadProgress,
    });
  }, [modelStatus, downloadProgress]);

  const statusConfig = {
    checking: {
      label: "Checking browser support...",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
    unavailable: {
      label: "WebGPU not supported",
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    downloadable: {
      label: "Model needs download (click to start)",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
    },
    downloading: {
      label: "Downloading model...",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    loading: {
      label: "Loading model...",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
    },
    available: {
      label: "Running locally",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
    },
  };

  const config = statusConfig[modelStatus];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
        config.bgColor,
        config.color,
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        {modelStatus === "checking" || modelStatus === "loading" ? (
          <LoadingSpinner />
        ) : modelStatus === "downloading" ? (
          <LoadingSpinner />
        ) : modelStatus === "available" ? (
          <CheckIcon />
        ) : modelStatus === "unavailable" ? (
          <XIcon />
        ) : (
          <DownloadIcon />
        )}
        <span>{config.label}</span>
      </div>
      {(modelStatus === "downloading" || modelStatus === "loading") &&
        downloadProgress && (
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-current transition-all duration-300"
                style={{ width: `${downloadProgress.progress * 100}%` }}
              />
            </div>
            <span>{Math.round(downloadProgress.progress * 100)}%</span>
          </div>
        )}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="size-3 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 18L18 6M6 6l12 12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WebLLMSupportCheck() {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    const isSupported = checkWebLLMSupport();
    log("info", "Browser WebGPU support check", { supported: isSupported });
    setSupported(isSupported);
  }, []);

  if (supported === null) return null;

  if (!supported) {
    log("warn", "WebGPU not supported in browser");
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
        <strong>WebGPU not supported:</strong> WebLLM requires a
        WebGPU-compatible browser like Chrome 113+ or Edge 113+.
      </div>
    );
  }

  return null;
}

interface WebLLMErrorDisplayProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

export function WebLLMErrorDisplay({
  error,
  onRetry,
  className,
}: WebLLMErrorDisplayProps) {
  if (!error) return null;

  log("error", "WebLLM error display", {
    errorMessage: error.message,
    errorName: error.name,
  });

  // Parse error type for better UX
  const isWebGPUError =
    error.message.includes("WebGPU") ||
    error.message.includes("WebLLM is not supported");
  const isNetworkError =
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.includes("Failed to load");
  const isModelError =
    error.message.includes("model") || error.message.includes("Model");

  let errorTitle = "Error";
  let errorHelp = "";

  if (isWebGPUError) {
    errorTitle = "Browser Compatibility Issue";
    errorHelp =
      "WebLLM requires WebGPU support. Try using Chrome 113+, Edge 113+, or another WebGPU-compatible browser.";
  } else if (isNetworkError) {
    errorTitle = "Network Error";
    errorHelp =
      "Failed to download the model. Please check your internet connection and try again.";
  } else if (isModelError) {
    errorTitle = "Model Loading Error";
    errorHelp =
      "There was an issue loading the AI model. The model may not be available or there may be insufficient memory.";
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 text-destructive">
          <svg
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          <div className="font-medium text-destructive">{errorTitle}</div>
          <div className="text-destructive/90">{error.message}</div>
          {errorHelp && (
            <div className="text-muted-foreground text-xs">{errorHelp}</div>
          )}
          {onRetry && (
            <button
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive/20 px-3 py-1.5 font-medium text-destructive text-xs transition-colors hover:bg-destructive/30"
              onClick={onRetry}
              type="button"
            >
              <svg
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
