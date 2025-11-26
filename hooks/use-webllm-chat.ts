"use client";

import { type CoreMessage, streamText } from "ai";
import { useCallback, useRef, useState } from "react";
import type { WebLLMQuality } from "@/lib/ai/models";
import {
  createWebLLMModel,
  getWebLLMAvailability,
  type WebLLMAvailability,
  type WebLLMProgress,
} from "@/lib/ai/webllm-client";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

// Logging utility for WebLLM chat hook
const LOG_PREFIX = "[WebLLM-Chat]";

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

type WebLLMChatStatus =
  | "ready"
  | "submitted"
  | "streaming"
  | "error"
  | "loading-model";

interface UseWebLLMChatOptions {
  id: string;
  quality?: WebLLMQuality;
  initialMessages?: ChatMessage[];
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

interface UseWebLLMChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  sendMessage: (message: { role: "user"; parts: ChatMessage["parts"] }) => void;
  status: WebLLMChatStatus;
  stop: () => void;
  modelStatus: WebLLMAvailability | "checking" | "loading";
  downloadProgress: WebLLMProgress | null;
  error: Error | null;
}

export function useWebLLMChat({
  id,
  quality = "standard",
  initialMessages = [],
  onFinish,
  onError,
}: UseWebLLMChatOptions): UseWebLLMChatReturn {
  log("info", "Initializing useWebLLMChat hook", {
    chatId: id,
    quality,
    initialMessagesCount: initialMessages.length,
  });

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [status, setStatus] = useState<WebLLMChatStatus>("ready");
  const [modelStatus, setModelStatus] = useState<
    WebLLMAvailability | "checking" | "loading"
  >("checking");
  const [downloadProgress, setDownloadProgress] =
    useState<WebLLMProgress | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (message: { role: "user"; parts: ChatMessage["parts"] }) => {
      log("info", "sendMessage called", {
        chatId: id,
        quality,
        messagePartsCount: message.parts.length,
      });

      const userMessage: ChatMessage = {
        id: generateUUID(),
        role: "user",
        parts: message.parts,
        metadata: { createdAt: new Date().toISOString() },
      };

      log("debug", "Created user message", { messageId: userMessage.id });

      setMessages((prev) => [...prev, userMessage]);
      setStatus("loading-model");
      setError(null);

      try {
        log("info", "Checking WebLLM availability...", { quality });
        const availability = await getWebLLMAvailability(quality);
        setModelStatus(availability);

        log("info", "WebLLM availability result", { availability, quality });

        if (availability === "unavailable") {
          const errorMsg =
            "WebLLM is not supported in this browser. Please use a WebGPU-compatible browser like Chrome or Edge.";
          log("error", errorMsg, {
            userAgent: navigator?.userAgent,
            hasWebGPU: typeof navigator !== "undefined" && "gpu" in navigator,
          });
          throw new Error(errorMsg);
        }

        if (availability === "downloadable" || availability === "downloading") {
          log("info", "Model needs to be downloaded or is downloading", {
            availability,
          });
          setModelStatus("loading");
        }

        log("info", "Creating WebLLM model...", { quality });
        const model = createWebLLMModel({
          quality,
          onProgress: (progress) => {
            log("debug", "Download progress", {
              progress: progress.progress,
              text: progress.text,
            });
            setDownloadProgress(progress);
          },
        });

        setStatus("submitted");
        log("info", "Status set to submitted, preparing messages...");

        const allMessages: CoreMessage[] = [...messages, userMessage].map(
          (msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.parts
              .filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("\n"),
          })
        );

        log("debug", "Prepared messages for streaming", {
          messageCount: allMessages.length,
          lastMessageRole: allMessages[allMessages.length - 1]?.role,
        });

        const assistantMessageId = generateUUID();
        const assistantMessage: ChatMessage = {
          id: assistantMessageId,
          role: "assistant",
          parts: [{ type: "text", text: "" }],
          metadata: { createdAt: new Date().toISOString() },
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setStatus("streaming");
        setModelStatus("available");

        log("info", "Starting text stream...", { assistantMessageId });

        abortControllerRef.current = new AbortController();

        const result = streamText({
          model,
          messages: allMessages,
          abortSignal: abortControllerRef.current.signal,
        });

        let fullText = "";
        let chunkCount = 0;

        log("debug", "Consuming text stream...");
        for await (const chunk of result.textStream) {
          fullText += chunk;
          chunkCount++;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    parts: [{ type: "text", text: fullText }],
                  }
                : msg
            )
          );
        }

        log("info", "Stream completed", {
          assistantMessageId,
          totalChunks: chunkCount,
          totalLength: fullText.length,
        });

        log("info", "Saving WebLLM messages to server...", { chatId: id });
        await saveWebLLMMessages(id, userMessage, {
          ...assistantMessage,
          parts: [{ type: "text", text: fullText }],
        });

        setStatus("ready");
        log("info", "Message exchange completed successfully");
        onFinish?.();
      } catch (err) {
        const caughtError =
          err instanceof Error ? err : new Error("Unknown error occurred");

        log("error", "Error in sendMessage", {
          errorName: caughtError.name,
          errorMessage: caughtError.message,
          stack: caughtError.stack,
          isAbortError: caughtError.name === "AbortError",
        });

        if (caughtError.name !== "AbortError") {
          setError(caughtError);
          setStatus("error");
          onError?.(caughtError);
        } else {
          log("info", "Stream was aborted by user");
          setStatus("ready");
        }
      }
    },
    [messages, id, quality, onFinish, onError]
  );

  const stop = useCallback(() => {
    log("info", "Stop called - aborting stream");
    abortControllerRef.current?.abort();
    setStatus("ready");
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    modelStatus,
    downloadProgress,
    error,
  };
}

async function saveWebLLMMessages(
  chatId: string,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage
) {
  log("debug", "Saving WebLLM messages", {
    chatId,
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
  });

  try {
    const response = await fetch("/api/chat/webllm-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatId,
        messages: [userMessage, assistantMessage],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      log("error", "Failed to save WebLLM messages - server error", {
        status: response.status,
        statusText: response.statusText,
        errorData,
      });
      return;
    }

    log("info", "WebLLM messages saved successfully");
  } catch (err) {
    log("warn", "Failed to save WebLLM messages - network error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
