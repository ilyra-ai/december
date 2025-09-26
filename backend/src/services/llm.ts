import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import prompt from "../utils/prompt.txt";
import * as dockerService from "./docker";
import * as fileService from "./file";
import { getAiConfig } from "./ai-config";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatSession {
  id: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

const chatSessions = new Map<string, ChatSession>();

export async function createChatSession(
  containerId: string
): Promise<ChatSession> {
  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

export function getChatSession(sessionId: string): ChatSession | undefined {
  return chatSessions.get(sessionId);
}

export function getOrCreateChatSession(containerId: string): ChatSession {
  const existingSession = Array.from(chatSessions.values()).find(
    (session) => session.containerId === containerId
  );

  if (existingSession) {
    return existingSession;
  }

  const sessionId = `${containerId}-${Date.now()}`;
  const session: ChatSession = {
    id: sessionId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  chatSessions.set(sessionId, session);
  return session;
}

function buildMessageContent(
  message: string,
  attachments: Attachment[] = []
): any[] {
  const content: any[] = [{ type: "text", text: message }];

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      content.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }

  return content;
}

function buildAnthropicContent(
  message: string,
  attachments: Attachment[] = []
) {
  const content: any[] = [{ type: "text", text: message }];
  for (const attachment of attachments) {
    if (attachment.type === "image") {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: attachment.mimeType,
          data: attachment.data,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      content.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }
  return content;
}

function buildGeminiParts(message: string, attachments: Attachment[] = []) {
  const parts: any[] = [{ text: message }];
  for (const attachment of attachments) {
    if (attachment.type === "image") {
      parts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: attachment.data,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      parts.push({
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }
  return parts;
}

function toOpenAIMessages(systemPrompt: string, messages: Message[]) {
  return [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];
}

function toAnthropicMessages(messages: Message[]) {
  return messages.map((msg) => ({
    role: msg.role,
    content:
      msg.role === "user" && msg.attachments
        ? buildAnthropicContent(msg.content, msg.attachments)
        : [{ type: "text", text: msg.content }],
  }));
}

function toGeminiHistory(messages: Message[]) {
  return messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts:
      msg.role === "user" && msg.attachments
        ? buildGeminiParts(msg.content, msg.attachments)
        : [{ text: msg.content }],
  }));
}

async function getSystemPrompt(containerId: string) {
  const fileContentTree = await fileService.getFileContentTree(
    dockerService.docker,
    containerId
  );
  const codeContext = JSON.stringify(fileContentTree, null, 2);
  return `${prompt}

Current codebase structure and content:
${codeContext}`;
}

async function createAssistantMessage(session: ChatSession, content: string) {
  const assistantMsg: Message = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
  };
  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();
  return assistantMsg;
}

export async function sendMessage(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = []
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);
  const aiConfig = await getAiConfig();
  const systemPrompt = await getSystemPrompt(containerId);

  let assistantContent = "";

  if (aiConfig.provider === "openai" || aiConfig.provider === "openrouter") {
    const client = new OpenAI({
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseUrl || "https://api.openai.com/v1",
    });
    const completion = await client.chat.completions.create({
      model: aiConfig.model,
      messages: toOpenAIMessages(systemPrompt, session.messages),
      temperature: aiConfig.temperature,
    });
    assistantContent =
      completion.choices[0]?.message?.content ||
      "Sorry, I could not generate a response.";
  } else if (aiConfig.provider === "anthropic") {
    const anthropic = new Anthropic({
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseUrl,
    });
    const response = await anthropic.messages.create({
      model: aiConfig.model,
      max_tokens: 4096,
      temperature: aiConfig.temperature ?? 0.2,
      system: systemPrompt,
      messages: toAnthropicMessages(session.messages),
    });
    assistantContent = response.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
  } else {
    const baseUrl = (aiConfig.baseUrl || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    const history = toGeminiHistory(session.messages.slice(0, -1));
    const userParts = buildGeminiParts(userMsg.content, userMsg.attachments || []);
    const url = `${baseUrl}/models/${encodeURIComponent(aiConfig.model)}:generateContent?key=${encodeURIComponent(aiConfig.apiKey)}`;
    const payload = {
      contents: [...history, { role: "user", parts: userParts }],
      systemInstruction: {
        role: "system",
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: aiConfig.temperature ?? 0.2,
      },
    };
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      const errorMessage = data?.error?.message || "Gemini request failed";
      throw new Error(errorMessage);
    }
    const parts = data?.candidates?.[0]?.content?.parts || [];
    assistantContent = parts
      .map((part: any) => part.text || "")
      .join("")
      .trim();
  }

  if (!assistantContent) {
    assistantContent = "Sorry, I could not generate a response.";
  }

  const assistantMsg = await createAssistantMessage(session, assistantContent);

  return {
    userMessage: userMsg,
    assistantMessage: assistantMsg,
  };
}

export async function* sendMessageStream(
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = []
): AsyncGenerator<{ type: "user" | "assistant" | "done"; data: any }> {
  const aiConfig = await getAiConfig();
  if (aiConfig.provider !== "openai" && aiConfig.provider !== "openrouter") {
    const result = await sendMessage(containerId, userMessage, attachments);
    yield { type: "user", data: result.userMessage };
    yield { type: "assistant", data: result.assistantMessage };
    yield { type: "done", data: result.assistantMessage };
    return;
  }

  const session = getOrCreateChatSession(containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  const systemPrompt = await getSystemPrompt(containerId);
  const openaiMessages = toOpenAIMessages(systemPrompt, session.messages);

  const assistantId = `assistant-${Date.now()}`;
  let assistantContent = "";

  const client = new OpenAI({
    apiKey: aiConfig.apiKey,
    baseURL: aiConfig.baseUrl || "https://api.openai.com/v1",
  });

  const stream = await client.chat.completions.create({
    model: aiConfig.model,
    messages: openaiMessages,
    temperature: aiConfig.temperature,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      assistantContent += delta.content;
      yield {
        type: "assistant",
        data: {
          id: assistantId,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  const finalAssistantMsg = await createAssistantMessage(
    session,
    assistantContent
  );

  yield { type: "done", data: finalAssistantMsg };
}
