"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WebLLMQuality } from "@/lib/ai/models";
import {
  checkWebLLMSupport,
  createWebLLMTransport,
  getWebLLMAvailability,
  type WebLLMAvailability,
  type WebLLMProgress,
} from "@/lib/ai/webllm-client";
import type { ChatMessage } from "@/lib/types";

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

/**
 * Convert ChatMessage to UIMessage format for the transport
 */
function chatMessageToUIMessage(msg: ChatMessage): UIMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: msg.parts
      .filter((p) => p.type === "text")
      .map((p) => ({
        type: "text" as const,
        text: (p as { type: "text"; text: string }).text,
      })),
  };
}

/**
 * Convert UIMessage to ChatMessage format for the UI
 */
function uiMessageToChatMessage(msg: UIMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    parts: msg.parts
      .filter((p) => p.type === "text")
      .map((p) => ({
        type: "text" as const,
        text: (p as { type: "text"; text: string }).text,
      })),
    metadata: {
      createdAt: new Date().toISOString(),
    },
  };
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

  const [modelStatus, setModelStatus] = useState<
    WebLLMAvailability | "checking" | "loading"
  >("checking");
  const [downloadProgress, setDownloadProgress] =
    useState<WebLLMProgress | null>(null);
  const [hookError, setHookError] = useState<Error | null>(null);
  const hasCheckedAvailability = useRef(false);
  const hasSavedMessages = useRef<Set<string>>(new Set());

  // Create the WebLLM transport - memoized to prevent recreation on every render
  const transport = useMemo(() => {
    log("info", "Creating WebLLM transport", { quality });
    if (!checkWebLLMSupport()) {
      log("warn", "WebLLM not supported, transport will not be created");
      return null;
    }
    return createWebLLMTransport({
      quality,
      onProgress: (progress) => {
        log("debug", "Download progress", progress);
        setDownloadProgress(progress);
        if (progress.progress >= 1) {
          setModelStatus("available");
        }
      },
    });
  }, [quality]);

  // Convert initial messages to UIMessage format
  const initialUIMessages = useMemo(
    () => initialMessages.map(chatMessageToUIMessage),
    [initialMessages]
  );

  // Use the useChat hook with our custom transport
  const {
    messages: uiMessages,
    setMessages: setUIMessages,
    sendMessage: sendUIMessage,
    status: chatStatus,
    stop: stopChat,
    error: chatError,
  } = useChat({
    id,
    transport: transport ?? undefined,
    messages: initialUIMessages,
    onFinish: ({ message }) => {
      log("info", "Chat finished", { messageId: message.id });
      onFinish?.();
    },
    onError: (error) => {
      log("error", "Chat error", { error: error.message });
      setHookError(error);
      onError?.(error);
    },
  });

  // Check WebLLM availability on mount
  useEffect(() => {
    if (hasCheckedAvailability.current) return;
    hasCheckedAvailability.current = true;

    const checkAvailability = async () => {
      log("info", "Checking WebLLM availability...", { quality });
      try {
        const availability = await getWebLLMAvailability(quality);
        log("info", "WebLLM availability result", { availability, quality });
        setModelStatus(availability);

        if (availability === "unavailable") {
          const error = new Error(
            "WebLLM is not supported in this browser. Please use a WebGPU-compatible browser like Chrome or Edge."
          );
          setHookError(error);
          onError?.(error);
        }
      } catch (err) {
        log("error", "Error checking availability", { err });
        setModelStatus("unavailable");
      }
    };

    checkAvailability();
  }, [quality, onError]);

  // Convert UI messages to ChatMessage format for the component
  const messages = useMemo(
    () => uiMessages.map(uiMessageToChatMessage),
    [uiMessages]
  );

  // Map chat status to our status type
  const status = useMemo((): WebLLMChatStatus => {
    if (hookError || chatError) return "error";
    if (modelStatus === "checking" || modelStatus === "loading")
      return "loading-model";
    if (chatStatus === "submitted") return "submitted";
    if (chatStatus === "streaming") return "streaming";
    return "ready";
  }, [chatStatus, modelStatus, hookError, chatError]);

  // Wrapper for setMessages that converts between formats
  const setMessages = useCallback(
    (
      messagesOrUpdater:
        | ChatMessage[]
        | ((prev: ChatMessage[]) => ChatMessage[])
    ) => {
      if (typeof messagesOrUpdater === "function") {
        setUIMessages((prev) => {
          const prevChatMessages = prev.map(uiMessageToChatMessage);
          const newChatMessages = messagesOrUpdater(prevChatMessages);
          return newChatMessages.map(chatMessageToUIMessage);
        });
      } else {
        setUIMessages(messagesOrUpdater.map(chatMessageToUIMessage));
      }
    },
    [setUIMessages]
  );

  // Wrapper for sendMessage that converts from our format
  const sendMessage = useCallback(
    (message: { role: "user"; parts: ChatMessage["parts"] }) => {
      log("info", "sendMessage called", {
        chatId: id,
        quality,
        messagePartsCount: message.parts.length,
      });

      if (modelStatus === "unavailable") {
        const error = new Error("WebLLM is not available in this browser");
        setHookError(error);
        onError?.(error);
        return;
      }

      // Mark model as loading if it needs to be downloaded
      if (modelStatus === "downloadable" || modelStatus === "downloading") {
        setModelStatus("loading");
      }

      // Extract text content from parts
      const textContent = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");

      log("debug", "Sending message via useChat", { textContent });

      // Send using the useChat hook - only send text parts
      const textParts = message.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => ({ type: "text" as const, text: p.text }));

      sendUIMessage({
        parts: textParts,
      });
    },
    [id, quality, modelStatus, sendUIMessage, onError]
  );

  // Save messages to server after successful completion
  useEffect(() => {
    const saveMessages = async () => {
      if (status !== "ready" || messages.length < 2) return;

      // Get the last user and assistant message pair
      const lastAssistant = messages.findLast((m) => m.role === "assistant");
      const lastUser = messages.findLast((m) => m.role === "user");

      if (!lastAssistant || !lastUser) return;

      // Check if we've already saved this pair
      const pairKey = `${lastUser.id}-${lastAssistant.id}`;
      if (hasSavedMessages.current.has(pairKey)) return;
      hasSavedMessages.current.add(pairKey);

      log("info", "Saving WebLLM messages to server...", { chatId: id });
      await saveWebLLMMessages(id, lastUser, lastAssistant);
    };

    saveMessages();
  }, [status, messages, id]);

  // Stop function
  const stop = useCallback(() => {
    log("info", "Stop called - aborting stream");
    stopChat();
  }, [stopChat]);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    modelStatus,
    downloadProgress,
    error: hookError ?? chatError ?? null,
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
