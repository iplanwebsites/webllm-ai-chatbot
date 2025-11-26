"use client";

import {
  doesBrowserSupportWebLLM,
  type WebLLMProgress,
  webLLM,
} from "@built-in-ai/web-llm";
import type { WebLLMQuality } from "./models";

export type WebLLMAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

export type { WebLLMProgress };

export interface WebLLMOptions {
  quality?: WebLLMQuality;
  onProgress?: (progress: WebLLMProgress) => void;
}

// Logging utility for WebLLM debugging
const LOG_PREFIX = "[WebLLM-Client]";

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

/**
 * Map quality hints to specific WebLLM model IDs.
 * These models are selected based on size/capability trade-offs.
 */
const QUALITY_TO_MODEL_ID: Record<WebLLMQuality, string> = {
  draft: "Qwen3-0.6B-q4f16_1-MLC", // Smallest, fastest
  standard: "Llama-3.2-3B-Instruct-q4f16_1-MLC", // Balanced
  high: "Qwen3-4B-q4f16_1-MLC", // Better quality
  best: "Llama-3.1-8B-Instruct-q4f16_1-MLC", // Best quality, slower
};

/**
 * Create a WebLLM model based on quality hint.
 * Maps quality levels to appropriate model sizes.
 */
export function createWebLLMModel(options: WebLLMOptions = {}) {
  const { quality = "standard", onProgress } = options;
  const modelId = QUALITY_TO_MODEL_ID[quality];

  log("info", "Creating WebLLM model", { quality, modelId });
  log("debug", "Model options:", {
    quality,
    hasProgressCallback: !!onProgress,
  });

  try {
    const model = webLLM(modelId, {
      initProgressCallback: (progress) => {
        log("debug", "Model init progress", {
          modelId,
          progress: progress.progress,
          text: progress.text,
        });
        onProgress?.(progress);
      },
    });

    log("info", "WebLLM model created successfully", { modelId });
    return model;
  } catch (error) {
    log("error", "Failed to create WebLLM model", {
      modelId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export function checkWebLLMSupport(): boolean {
  log("debug", "Checking WebLLM browser support...");

  if (typeof window === "undefined") {
    log("warn", "Window is undefined - likely running on server side");
    return false;
  }

  try {
    const supported = doesBrowserSupportWebLLM();
    log("info", "WebLLM browser support check", {
      supported,
      userAgent: navigator?.userAgent?.substring(0, 100),
      hasWebGPU: "gpu" in navigator,
    });
    return supported;
  } catch (error) {
    log("error", "Error checking WebLLM support", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function getWebLLMAvailability(
  quality: WebLLMQuality = "standard"
): Promise<WebLLMAvailability> {
  log("info", "Checking WebLLM availability", { quality });

  if (!checkWebLLMSupport()) {
    log("warn", "WebLLM not supported in this browser");
    return "unavailable";
  }

  const modelId = QUALITY_TO_MODEL_ID[quality];
  log("debug", "Checking availability for model", { quality, modelId });

  try {
    const model = webLLM(modelId);
    const availability = await model.availability();

    log("info", "WebLLM availability result", {
      quality,
      modelId,
      availability,
    });

    return availability;
  } catch (error) {
    log("error", "Error checking WebLLM availability", {
      quality,
      modelId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return "unavailable";
  }
}

export { webLLM };
