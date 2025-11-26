"use client";

import { useEffect, useState } from "react";
import { isWebLLMModel } from "@/lib/ai/models";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { Chat } from "./chat";
import type { VisibilityType } from "./visibility-selector";
import { WebLLMChat } from "./webllm-chat";

// Logging utility for ChatWrapper
const LOG_PREFIX = "[ChatWrapper]";

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

export function ChatWrapper({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  initialLastContext,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  initialLastContext?: AppUsage;
}) {
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [messagesForSwitch] = useState<ChatMessage[]>(initialMessages);

  const isWebLLM = isWebLLMModel(currentModelId);

  // Log initial render and model routing (intentionally run once on mount)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run on mount
  useEffect(() => {
    log("info", "ChatWrapper mounted", {
      chatId: id,
      initialChatModel,
      currentModelId,
      isWebLLM,
      messagesCount: initialMessages.length,
    });
  }, []);

  // Log model changes
  useEffect(() => {
    log("info", "Model routing decision", {
      currentModelId,
      isWebLLM,
      routingTo: isWebLLM ? "WebLLMChat" : "Chat",
    });
  }, [currentModelId, isWebLLM]);

  const handleModelChange = (modelId: string) => {
    const newIsWebLLM = isWebLLMModel(modelId);
    log("info", "Model change requested in ChatWrapper", {
      from: currentModelId,
      to: modelId,
      fromIsWebLLM: isWebLLM,
      toIsWebLLM: newIsWebLLM,
      willSwitchComponent: isWebLLM !== newIsWebLLM,
    });
    setCurrentModelId(modelId);
  };

  if (isWebLLM) {
    log("debug", "Rendering WebLLMChat component", {
      chatId: id,
      modelId: currentModelId,
    });
    return (
      <WebLLMChat
        id={id}
        initialChatModel={currentModelId}
        initialMessages={messagesForSwitch}
        initialVisibilityType={initialVisibilityType}
        isReadonly={isReadonly}
        onModelChange={handleModelChange}
      />
    );
  }

  log("debug", "Rendering Cloud Chat component", {
    chatId: id,
    modelId: currentModelId,
  });
  return (
    <Chat
      autoResume={autoResume}
      id={id}
      initialChatModel={currentModelId}
      initialLastContext={initialLastContext}
      initialMessages={messagesForSwitch}
      initialVisibilityType={initialVisibilityType}
      isReadonly={isReadonly}
      onModelChange={handleModelChange}
    />
  );
}
