"use client";

import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { streamText } from "ai";
import type { WebLLMLanguageModel, WebLLMProgress } from "@built-in-ai/web-llm";
import type { WebLLMQuality } from "./models";

// Logging utility for WebLLM transport
const LOG_PREFIX = "[WebLLM-Transport]";

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

export interface WebLLMChatTransportOptions {
  model: WebLLMLanguageModel;
  quality: WebLLMQuality;
  onProgress?: (progress: WebLLMProgress) => void;
}

/**
 * Custom ChatTransport for WebLLM that runs inference entirely on the client.
 * No server requests are made for inference - only the WebLLM model in the browser.
 */
export class WebLLMChatTransport implements ChatTransport<UIMessage> {
  private model: WebLLMLanguageModel;
  private quality: WebLLMQuality;
  private onProgress?: (progress: WebLLMProgress) => void;

  constructor(options: WebLLMChatTransportOptions) {
    this.model = options.model;
    this.quality = options.quality;
    this.onProgress = options.onProgress;
    log("info", "WebLLMChatTransport created", { quality: options.quality });
  }

  async sendMessages(options: {
    trigger: "submit-message" | "regenerate-message";
    chatId: string;
    messageId: string | undefined;
    messages: UIMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    log("info", "sendMessages called", {
      trigger: options.trigger,
      chatId: options.chatId,
      messageCount: options.messages.length,
    });

    const { messages, abortSignal } = options;

    // Convert UI messages to CoreMessage format for streamText
    const coreMessages = messages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n"),
    }));

    log("debug", "Converted messages for inference", {
      coreMessageCount: coreMessages.length,
    });

    // Check model availability and handle download if needed
    const availability = await this.model.availability();
    log("info", "Model availability", { availability });

    // Create a readable stream that will emit UIMessageChunk events
    const self = this;
    const stream = new ReadableStream<UIMessageChunk>({
      async start(controller) {
        try {
          // If model needs downloading, emit progress events
          if (availability === "downloadable" || availability === "downloading") {
            log("info", "Model needs download, starting with progress tracking");

            // Emit download start notification
            controller.enqueue({
              type: "data-part-start" as const,
              id: "download-progress",
              dataPartType: "modelDownloadProgress",
            } as unknown as UIMessageChunk);

            // Initialize the model with progress tracking
            await self.model.createSessionWithProgress((progress) => {
              log("debug", "Download progress", {
                progress: progress.progress,
                text: progress.text,
              });
              self.onProgress?.(progress);
            });

            log("info", "Model download complete");
          }

          // Generate a unique ID for this text response
          const textId = `text-${Date.now()}`;

          // Emit text-start
          controller.enqueue({
            type: "text-start",
            id: textId,
          });

          log("info", "Starting text stream with WebLLM model");

          // Run inference using streamText with the WebLLM model
          const result = streamText({
            model: self.model,
            messages: coreMessages,
            abortSignal,
          });

          // Stream the response
          let chunkCount = 0;
          for await (const chunk of result.textStream) {
            chunkCount++;
            controller.enqueue({
              type: "text-delta",
              id: textId,
              delta: chunk,
            });
          }

          log("info", "Text stream complete", { chunkCount });

          // Emit text-end
          controller.enqueue({
            type: "text-end",
            id: textId,
          });

          controller.close();
        } catch (error) {
          log("error", "Error in WebLLM inference", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          // Handle abort errors gracefully
          if (error instanceof Error && error.name === "AbortError") {
            log("info", "Stream aborted by user");
            controller.close();
            return;
          }

          // Emit error chunk
          controller.enqueue({
            type: "error",
            errorText: error instanceof Error ? error.message : "Unknown error",
          });
          controller.close();
        }
      },
    });

    return stream;
  }

  /**
   * WebLLM doesn't support reconnecting to streams since everything runs client-side.
   */
  reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    log("debug", "reconnectToStream called - not supported for WebLLM");
    return Promise.resolve(null);
  }
}
