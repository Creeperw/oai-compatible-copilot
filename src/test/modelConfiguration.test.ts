import * as assert from "assert";
import * as vscode from "vscode";
import { AnthropicApi } from "../anthropic/anthropicApi";
import { buildGeminiGenerateContentUrl, GeminiApi } from "../gemini/geminiApi";
import {
	createReasoningEffortConfigurationSchema,
	getConfiguredReasoningEffort,
	isReasoningEffortPickerEnabled,
	type ModelPickerChatInformation,
	REASONING_EFFORT_CONFIGURATION_SCHEMA,
} from "../modelConfiguration";
import { OllamaApi } from "../ollama/ollamaApi";
import { OpenaiApi } from "../openai/openaiApi";
import { OpenaiResponsesApi } from "../openai/openaiResponsesApi";
import { prepareLanguageModelChatInformation } from "../provideModel";
import { createRuntimeModelId } from "../modelIdentity";
import type { HFModelItem } from "../types";

suite("modelConfiguration", () => {
	const deepSeekModel: HFModelItem = {
		id: "deepseek-v4-pro",
		displayName: "DeepSeek V4 Pro",
		owned_by: "deepseek",
		baseUrl: "https://api.deepseek.com",
		apiMode: "openai",
		context_length: 1_000_000,
		max_tokens: 384_000,
		reasoning_effort: "medium",
	};

	test("only enables the picker when the model has a reasoning effort default", () => {
		assert.strictEqual(isReasoningEffortPickerEnabled({ id: "m", owned_by: "p" }), false);
		assert.strictEqual(isReasoningEffortPickerEnabled({ id: "m", owned_by: "p", reasoning_effort: "" }), false);
		assert.strictEqual(isReasoningEffortPickerEnabled({ id: "m", owned_by: "p", reasoning_effort: "custom" }), false);
		assert.strictEqual(isReasoningEffortPickerEnabled({ id: "m", owned_by: "p", reasoning_effort: "high" }), true);
	});

	test("defines reasoning effort choices for provider configuration", () => {
		const schema = REASONING_EFFORT_CONFIGURATION_SCHEMA.properties.reasoningEffort;
		assert.strictEqual(schema.title, "Reasoning Effort");
		assert.strictEqual(schema.default, "medium");
		assert.deepStrictEqual(schema.enum, ["minimal", "low", "medium", "high", "xhigh", "max"]);
		assert.strictEqual(createReasoningEffortConfigurationSchema("high").properties.reasoningEffort.default, "high");
	});

	test("reads the selected reasoning effort from VS Code model configuration", () => {
		assert.strictEqual(getConfiguredReasoningEffort(undefined), "medium");
		assert.strictEqual(getConfiguredReasoningEffort(undefined, "low"), "low");
		assert.strictEqual(
			getConfiguredReasoningEffort({ modelConfiguration: { reasoningEffort: "high" } } as never),
			"high"
		);
		assert.strictEqual(getConfiguredReasoningEffort({ configuration: { reasoningEffort: "max" } } as never), "max");
		assert.strictEqual(
			getConfiguredReasoningEffort({ modelConfiguration: { reasoningEffort: "invalid" } } as never, "xhigh"),
			"xhigh"
		);
	});

	test("registers deepseek-v4-flash with reasoning effort metadata", async () => {
		const config = vscode.workspace.getConfiguration();
		const previousModels = config.get<unknown>("oaicopilot.models", []);
		const cts = new vscode.CancellationTokenSource();
		const model: HFModelItem = { ...deepSeekModel, id: "deepseek-v4-flash", displayName: "DeepSeek V4 Flash" };

		try {
			await config.update("oaicopilot.models", [model], vscode.ConfigurationTarget.Global);

			const infos = await prepareLanguageModelChatInformation({ silent: true }, cts.token, {} as vscode.SecretStorage);
			const info = infos.find((item) => item.id === createRuntimeModelId(model)) as
				| ModelPickerChatInformation
				| undefined;

			assert.ok(info, "deepseek-v4-flash should be registered");
			assert.strictEqual(info.name, "DeepSeek V4 Flash");
			assert.strictEqual(info.detail, "deepseek (PolyLLM)");
			assert.strictEqual(info.isUserSelectable, true);
			assert.strictEqual(info.isBYOK, true);
			assert.deepStrictEqual(info.configurationSchema, createReasoningEffortConfigurationSchema("medium"));
		} finally {
			cts.dispose();
			await config.update("oaicopilot.models", previousModels, vscode.ConfigurationTarget.Global);
		}
	});

	test("does not register reasoning effort metadata when the default is empty", async () => {
		const config = vscode.workspace.getConfiguration();
		const previousModels = config.get<unknown>("oaicopilot.models", []);
		const cts = new vscode.CancellationTokenSource();
		const model: HFModelItem = {
			...deepSeekModel,
			id: "deepseek-v4-flash",
			displayName: "DeepSeek V4 Flash",
			reasoning_effort: undefined,
		};

		try {
			await config.update("oaicopilot.models", [model], vscode.ConfigurationTarget.Global);

			const infos = await prepareLanguageModelChatInformation({ silent: true }, cts.token, {} as vscode.SecretStorage);
			const info = infos.find((item) => item.id === createRuntimeModelId(model)) as
				| ModelPickerChatInformation
				| undefined;

			assert.ok(info, "deepseek-v4-flash should be registered");
			assert.strictEqual(info.configurationSchema, undefined);
		} finally {
			cts.dispose();
			await config.update("oaicopilot.models", previousModels, vscode.ConfigurationTarget.Global);
		}
	});

	test("applies selected reasoning effort to OpenAI-compatible chat requests", () => {
		const requestBody = new OpenaiApi("deepseek-v4-pro").prepareRequestBody(
			{ model: "deepseek-v4-pro", messages: [], stream: true },
			deepSeekModel,
			{ modelConfiguration: { reasoningEffort: "high" } } as never
		);

		assert.strictEqual(requestBody.reasoning_effort, "high");
	});

	test("falls back to the configured default reasoning effort when Copilot has no temporary override", () => {
		const requestBody = new OpenaiApi("deepseek-v4-pro").prepareRequestBody(
			{ model: "deepseek-v4-pro", messages: [], stream: true },
			{ ...deepSeekModel, reasoning_effort: "low" },
			undefined
		);

		assert.strictEqual(requestBody.reasoning_effort, "low");
	});

	test("applies selected reasoning effort to OpenAI Responses requests", () => {
		const requestBody = new OpenaiResponsesApi("deepseek-v4-pro").prepareRequestBody(
			{ model: "deepseek-v4-pro", input: [], stream: true },
			{ ...deepSeekModel, apiMode: "openai-responses" },
			{ modelConfiguration: { reasoningEffort: "max" } } as never
		);

		assert.deepStrictEqual(requestBody.reasoning, { effort: "max" });
	});

	test("does not send the unsupported top-level thinking parameter to OpenAI Responses", () => {
		const requestBody = new OpenaiResponsesApi("deepseek-v4-pro").prepareRequestBody(
			{ model: "deepseek-v4-pro", input: [], stream: true },
			{
				...deepSeekModel,
				apiMode: "openai-responses",
				thinking: { type: "enabled" },
			},
			undefined
		);

		assert.strictEqual(requestBody.thinking, undefined);
	});

	test("never lets extra.model override the configured raw model ID", () => {
		const extra = { model: "attacker-model", custom: true };
		const openaiBody = new OpenaiApi("raw-model").prepareRequestBody(
			{ model: "raw-model", messages: [], stream: true },
			{ ...deepSeekModel, id: "raw-model", extra }
		);
		const responsesBody = new OpenaiResponsesApi("raw-model").prepareRequestBody(
			{ model: "raw-model", input: [], stream: true },
			{ ...deepSeekModel, id: "raw-model", apiMode: "openai-responses", extra }
		);
		const anthropicBody = new AnthropicApi("raw-model").prepareRequestBody(
			{ model: "raw-model", messages: [], max_tokens: 1024, stream: true },
			{ ...deepSeekModel, id: "raw-model", apiMode: "anthropic", extra }
		) as unknown as Record<string, unknown>;
		const ollamaBody = new OllamaApi("raw-model").prepareRequestBody(
			{ model: "raw-model", messages: [], stream: true },
			{ ...deepSeekModel, id: "raw-model", apiMode: "ollama", extra }
		) as unknown as Record<string, unknown>;
		const geminiBody = new GeminiApi("raw-model").prepareRequestBody(
			{ contents: [] },
			{ ...deepSeekModel, id: "raw-model", apiMode: "gemini", extra }
		) as Record<string, unknown>;

		for (const body of [openaiBody, responsesBody, anthropicBody, ollamaBody]) {
			assert.strictEqual(body.model, "raw-model");
			assert.strictEqual(body.custom, true);
		}
		assert.strictEqual(geminiBody.model, undefined);
		assert.strictEqual(geminiBody.custom, true);
	});

	test("preserves Gemini raw resource paths containing slashes", () => {
		assert.strictEqual(
			new URL(buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com", "gemini-2.5-pro", true))
				.pathname,
			"/v1beta/models/gemini-2.5-pro:streamGenerateContent"
		);
		assert.strictEqual(
			new URL(
				buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-pro", false)
			).pathname,
			"/v1beta/models/gemini-2.5-pro:generateContent"
		);
		assert.strictEqual(
			new URL(
				buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com/v1beta/models", "gemini-2.5-pro", true)
			).pathname,
			"/v1beta/models/gemini-2.5-pro:streamGenerateContent"
		);
		assert.strictEqual(
			new URL(buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com", "tunedModels/my-model", true))
				.pathname,
			"/v1beta/tunedModels/my-model:streamGenerateContent"
		);
		assert.strictEqual(
			new URL(
				buildGeminiGenerateContentUrl("https://generativelanguage.googleapis.com", "publishers/acme/models/foo", false)
			).pathname,
			"/v1beta/publishers/acme/models/foo:generateContent"
		);
		assert.strictEqual(
			new URL(
				buildGeminiGenerateContentUrl(
					"https://generativelanguage.googleapis.com/v1beta/models/old:generateContent",
					"ignored-model-id",
					true
				)
			).pathname,
			"/v1beta/models/old:streamGenerateContent"
		);
	});

	test("keeps the picker out of unsupported native API request bodies", () => {
		const options = { modelConfiguration: { reasoningEffort: "high" } } as never;
		const anthropicBody = new AnthropicApi("claude").prepareRequestBody(
			{ model: "claude", messages: [], max_tokens: 1024, stream: true },
			{ ...deepSeekModel, apiMode: "anthropic" },
			options
		) as unknown as Record<string, unknown>;
		const ollamaBody = new OllamaApi("qwen3").prepareRequestBody(
			{ model: "qwen3", messages: [], stream: true },
			{ ...deepSeekModel, apiMode: "ollama" },
			options
		) as unknown as Record<string, unknown>;
		const geminiBody = new GeminiApi("gemini").prepareRequestBody(
			{ contents: [] },
			{ ...deepSeekModel, apiMode: "gemini" },
			options
		) as Record<string, unknown>;

		assert.strictEqual(anthropicBody.reasoning_effort, undefined);
		assert.strictEqual(anthropicBody.thinking, undefined);
		assert.strictEqual(ollamaBody.reasoning_effort, undefined);
		assert.strictEqual(ollamaBody.think, undefined);
		assert.strictEqual(geminiBody.reasoning_effort, undefined);
		assert.strictEqual(geminiBody.thinkingConfig, undefined);
	});
});
