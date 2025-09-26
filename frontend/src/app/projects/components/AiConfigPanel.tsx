"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Save } from "lucide-react";
import { toast } from "react-hot-toast";
import { API_BASE_URL } from "../../../lib/backend/api";

interface ProviderMetadata {
  id: "openai" | "openrouter" | "anthropic" | "google-gemini";
  name: string;
  description: string;
  defaultBaseUrl: string;
  documentationUrl: string;
  supportsStreaming: boolean;
}

interface AiConfigForm {
  provider: ProviderMetadata["id"];
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
}

const defaultForm: AiConfigForm = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  temperature: 0.2,
};

export function AiConfigPanel() {
  const [providers, setProviders] = useState<ProviderMetadata[]>([]);
  const [form, setForm] = useState<AiConfigForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [providersRes, configRes] = await Promise.all([
          fetch(`${API_BASE_URL}/config/ai/providers`),
          fetch(`${API_BASE_URL}/config/ai`),
        ]);

        if (!providersRes.ok) {
          throw new Error("Failed to load providers");
        }

        const providersData = await providersRes.json();
        const providerList: ProviderMetadata[] = providersData.providers || [];

        if (active) {
          setProviders(providerList);
        }

        if (!configRes.ok) {
          throw new Error("Failed to load AI configuration");
        }

        const configData = await configRes.json();
        const config = configData.config || {};

        if (active) {
          setForm({
            provider: config.provider || defaultForm.provider,
            apiKey: config.apiKey || "",
            baseUrl: config.baseUrl || defaultForm.baseUrl,
            model: config.model || defaultForm.model,
            temperature:
              typeof config.temperature === "number"
                ? config.temperature
                : defaultForm.temperature,
          });
        }
      } catch (error) {
        console.error(error);
        if (active) {
          toast.error("Unable to load AI configuration");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === form.provider),
    [providers, form.provider]
  );

  const handleChange = (
    field: keyof AiConfigForm,
    value: string | number
  ) => {
    setForm((prev) => {
      if (field === "provider") {
        const provider = providers.find((item) => item.id === value);
        return {
          ...prev,
          provider: value as AiConfigForm["provider"],
          baseUrl: provider?.defaultBaseUrl || prev.baseUrl,
        };
      }
      return {
        ...prev,
        [field]: field === "temperature" ? Number(value) : value,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/config/ai`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to save configuration");
      }

      const data = await response.json();
      setForm((prev) => ({
        ...prev,
        apiKey: data.config.apiKey,
      }));
      toast.success("AI configuration saved successfully");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save configuration"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex items-center justify-center rounded-2xl border border-white/10 bg-black/40 p-10">
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-black/60 p-8 shadow-[0_40px_80px_-24px_rgba(124,58,237,0.35)]">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-white">AI Provider Settings</h2>
        <p className="text-sm text-white/70">
          Configure API access for OpenAI, Anthropic Claude, Google Gemini, and OpenRouter providers.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white">Provider</span>
            <select
              value={form.provider}
              onChange={(event) => handleChange("provider", event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id} className="text-black">
                  {provider.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white">Model</span>
            <input
              value={form.model}
              onChange={(event) => handleChange("model", event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              placeholder="gpt-4o-mini"
              required
            />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white">API key</span>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <input
                type={showKey ? "text" : "password"}
                value={form.apiKey}
                onChange={(event) => handleChange("apiKey", event.target.value)}
                className="w-full bg-transparent text-white focus:outline-none"
                placeholder="Enter your API key"
                required
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="text-white/70 transition hover:text-white"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white">Base URL</span>
            <input
              value={form.baseUrl}
              onChange={(event) => handleChange("baseUrl", event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
              placeholder="https://api.openai.com/v1"
            />
          </label>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-white">Temperature</span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={form.temperature}
              onChange={(event) => handleChange("temperature", event.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-white/40 focus:outline-none"
            />
          </div>

          {selectedProvider && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <span className="font-medium text-white">{selectedProvider.name}</span>
              <span>{selectedProvider.description}</span>
              <a
                href={selectedProvider.documentationUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex w-fit items-center gap-2 text-violet-300 hover:text-violet-200"
              >
                Documentation
              </a>
              <span className="mt-1 text-xs text-white/60">
                Streaming {selectedProvider.supportsStreaming ? "supported" : "not supported"}.
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{saving ? "Saving" : "Save configuration"}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
