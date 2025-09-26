import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

export type AiProvider = "openai" | "openrouter" | "anthropic" | "google-gemini";

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
}

interface ProviderMetadata {
  id: AiProvider;
  name: string;
  description: string;
  defaultBaseUrl: string;
  documentationUrl: string;
  supportsStreaming: boolean;
}

const providerMetadata: ProviderMetadata[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT and GPT-4 family with native streaming",
    defaultBaseUrl: "https://api.openai.com/v1",
    documentationUrl: "https://platform.openai.com/docs/overview",
    supportsStreaming: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified access to multiple models with OpenAI-compatible API",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    documentationUrl: "https://openrouter.ai/docs",
    supportsStreaming: true,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    description: "Claude 3 family with native JSON and vision support",
    defaultBaseUrl: "https://api.anthropic.com",
    documentationUrl: "https://docs.anthropic.com/claude/reference",
    supportsStreaming: false,
  },
  {
    id: "google-gemini",
    name: "Google Gemini",
    description: "Gemini models with native multimodal capabilities",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    documentationUrl: "https://ai.google.dev/gemini-api/docs",
    supportsStreaming: false,
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configDirectory = path.resolve(__dirname, "../../config");
const configPath = path.join(configDirectory, "ai.json");

let cachedConfig: AiConfig | null = null;

function normalizeConfig(raw: Partial<AiConfig>): AiConfig {
  const provider = (raw.provider as AiProvider) || "openai";
  const providerDefaults = providerMetadata.find((item) => item.id === provider);
  const baseUrl = raw.baseUrl?.trim() || providerDefaults?.defaultBaseUrl || "https://api.openai.com/v1";
  const temperature = raw.temperature === undefined ? 0.2 : Number(raw.temperature);
  return {
    provider,
    apiKey: raw.apiKey?.trim() || "",
    baseUrl,
    model: raw.model?.trim() || "gpt-4o-mini",
    temperature,
  };
}

async function readConfig(): Promise<AiConfig> {
  try {
    const content = await readFile(configPath, "utf8");
    const parsed = JSON.parse(content) as Partial<AiConfig>;
    return normalizeConfig(parsed);
  } catch (error: any) {
    if (error && error.code === "ENOENT") {
      const defaults = normalizeConfig({});
      await writeConfig(defaults);
      return defaults;
    }
    throw error;
  }
}

async function writeConfig(config: AiConfig): Promise<void> {
  await mkdir(configDirectory, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2));
}

export async function getAiConfig(): Promise<AiConfig> {
  if (!cachedConfig) {
    cachedConfig = await readConfig();
  }
  return cachedConfig;
}

export async function updateAiConfig(update: Partial<AiConfig>): Promise<AiConfig> {
  const current = await getAiConfig();
  const merged = normalizeConfig({ ...current, ...update });

  if (!merged.apiKey) {
    throw new Error("API key is required");
  }

  if (!merged.model) {
    throw new Error("Model is required");
  }

  if (Number.isNaN(merged.temperature || 0)) {
    throw new Error("Temperature must be a number");
  }

  if (merged.temperature !== undefined) {
    if (merged.temperature < 0 || merged.temperature > 2) {
      throw new Error("Temperature must be between 0 and 2");
    }
  }

  cachedConfig = merged;
  await writeConfig(merged);
  return merged;
}

export function getSupportedProviders(): ProviderMetadata[] {
  return providerMetadata;
}
