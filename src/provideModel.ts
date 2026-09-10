import * as vscode from "vscode";
import { CancellationToken, LanguageModelChatInformation } from "vscode";

import type { HFApiMode, HFModelItem, HFModelsResponse } from "./types";
import {
	createReasoningEffortConfigurationSchema,
	type ModelPickerChatInformation,
	isReasoningEffortValue,
} from "./modelConfiguration";
import { getGlobalUserModels } from "./utils";
import { assertValidModelCollection, createRuntimeModelId, isProviderPlaceholder } from "./modelIdentity";
import { VersionManager } from "./versionManager";
import { fetchGeminiModels } from "./gemini/geminiApi";
import { fetchOllamaModels } from "./ollama/ollamaApi";
import { logger } from "./logger";

const DEFAULT_CONTEXT_LENGTH = 128000;
const DEFAULT_MAX_TOKENS = 4096;
const EXTENSION_LABEL = "OAICopilot";

/**
 * Get the list of available language models contributed by this provider
 * @param options Options which specify the calling context of this function
 * @param token A cancellation token which signals if the user cancelled the request or not
 * @returns A promise that resolves to the list of available language models
 */
export async function prepareLanguageModelChatInformation(
	options: { silent: boolean },
	_token: CancellationToken,
	_secrets: vscode.SecretStorage
): Promise<LanguageModelChatInformation[]> {
	const config = vscode.workspace.getConfiguration();
	const userModels = getGlobalUserModels(config);
	if (userModels.length === 0) {
		if (options.silent) {
			return [];
		}
		throw new Error("No models configured. Add a provider and model in OAICopilot Configuration.");
	}
	assertValidModelCollection(userModels);

	const infos: ModelPickerChatInformation[] = userModels
		.filter((model) => !isProviderPlaceholder(model))
		.map((model) => {
			const contextLen = model.context_length ?? DEFAULT_CONTEXT_LENGTH;
			const maxOutput = model.max_completion_tokens ?? model.max_tokens ?? DEFAULT_MAX_TOKENS;
			const maxInput = Math.max(1, contextLen - maxOutput);
			const detail = `${model.owned_by} (${EXTENSION_LABEL})`;
			const reasoningEffort = isReasoningEffortValue(model.reasoning_effort) ? model.reasoning_effort : undefined;

			return {
				id: createRuntimeModelId(model),
				name: model.displayName!,
				detail,
				tooltip: detail,
				family: model.family ?? EXTENSION_LABEL,
				version: "1.0.0",
				maxInputTokens: maxInput,
				maxOutputTokens: maxOutput,
				isUserSelectable: true,
				isBYOK: true,
				...(reasoningEffort ? { configurationSchema: createReasoningEffortConfigurationSchema(reasoningEffort) } : {}),
				capabilities: {
					toolCalling: true,
					imageInput: model.vision ?? false,
				},
			} satisfies ModelPickerChatInformation;
		});

	logger.info("models.loaded", { count: infos.length, source: "config" });
	return infos;
}

/**
 * Fetch the list of models and supplementary metadata from Provider.
 */
export async function fetchModels(
	baseUrl: string,
	apiKey: string,
	apiMode?: HFApiMode | string,
	customHeaders?: Record<string, string>
): Promise<{ models: HFModelItem[] }> {
	const normalizedApiMode = apiMode ?? "openai";
	if (normalizedApiMode === "gemini") {
		const models = await fetchGeminiModels(baseUrl, apiKey, customHeaders);
		return { models };
	} else if (normalizedApiMode === "ollama") {
		const models = await fetchOllamaModels(baseUrl, apiKey, customHeaders);
		return { models };
	}

	const modelsList = (async () => {
		const baseHeaders: Record<string, string> = {
			Authorization: `Bearer ${apiKey}`,
			"User-Agent": VersionManager.getUserAgent(),
		};
		const headers = customHeaders ? { ...baseHeaders, ...customHeaders } : baseHeaders;
		const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
			method: "GET",
			headers,
		});
		if (!resp.ok) {
			let text = "";
			try {
				text = await resp.text();
			} catch (error) {
				console.error("[OAI Compatible Model Provider] Failed to read response text", error);
			}
			const err = new Error(
				`Failed to fetch OAI Compatible models: ${resp.status} ${resp.statusText}${text ? `\n${text}` : ""}`
			);
			console.error("[OAI Compatible Model Provider] Failed to fetch OAI Compatible models", err);
			throw err;
		}
		const parsed = (await resp.json()) as HFModelsResponse;
		return parsed.data ?? [];
	})();

	try {
		const models = await modelsList;
		return { models };
	} catch (err) {
		const errorObj = err instanceof Error ? err : new Error(String(err));
		console.error("[OAI Compatible Model Provider] Failed to fetch OAI Compatible models", err);
		logger.error("models.fetch.error", { baseUrl, error: errorObj.message });
		throw err;
	}
}

// Model discovery is provider-scoped by callers; global discovery is intentionally unsupported.
