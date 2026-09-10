import * as assert from "assert";
import type { HFModelItem } from "../types";
import {
	createRuntimeModelId,
	createProviderConfiguration,
	getProviderConfiguration,
	isProviderPlaceholder,
	migrateLegacyModelMetadata,
	normalizeDisplayName,
	parseRuntimeModelId,
	resolveConfiguredModel,
	resolveModelConnection,
	validateModelCollection,
} from "../modelIdentity";
import { getGlobalProviderAliases, getProviderApiKey } from "../utils";

suite("modelIdentity", () => {
	const model = (overrides: Partial<HFModelItem> = {}): HFModelItem => ({
		id: "gpt-5",
		owned_by: "openai",
		displayName: "GPT-5 via OpenAI",
		baseUrl: "https://api.openai.com/v1",
		...overrides,
	});

	test("round-trips provider-aware runtime IDs without changing the raw model ID", () => {
		const runtimeId = createRuntimeModelId(model({ id: "models/acme::latest", owned_by: " Acme " }));
		assert.deepStrictEqual(parseRuntimeModelId(runtimeId), {
			provider: "acme",
			modelId: "models/acme::latest",
		});
	});

	test("allows the same Model ID across different providers", () => {
		const validation = validateModelCollection([
			model(),
			model({ owned_by: "sub2api", displayName: "GPT-5 via Sub2API" }),
		]);

		assert.strictEqual(validation.valid, true, validation.errors.join("\n"));
	});

	test("rejects the same Model ID twice within a provider regardless of configId", () => {
		const validation = validateModelCollection([
			model({ configId: "thinking" }),
			model({ configId: "fast", displayName: "GPT-5 Fast" }),
		]);

		assert.strictEqual(validation.valid, false);
		assert.ok(validation.errors.some((error) => error.includes("Duplicate model identity")));
	});

	test("requires normalized Display Names to be globally unique", () => {
		const validation = validateModelCollection([
			model({ displayName: "ＧＰＴ-5" }),
			model({ owned_by: "sub2api", displayName: "  gpt-5  " }),
		]);

		assert.strictEqual(normalizeDisplayName("ＧＰＴ-5"), normalizeDisplayName("  gpt-5  "));
		assert.strictEqual(validation.valid, false);
		assert.ok(validation.errors.some((error) => error.includes("Display Name")));
	});

	test("migrates legacy global Base URL and creates stable unique Display Names", () => {
		const migrated = migrateLegacyModelMetadata(
			[
				{ id: "gpt-5", owned_by: "OpenAI" },
				{ id: "gpt-5", owned_by: "Sub2API" },
			],
			"https://gateway.example/v1"
		);

		assert.deepStrictEqual(
			migrated
				.filter((item) => !isProviderPlaceholder(item))
				.map(({ owned_by, id, displayName, baseUrl }) => ({ owned_by, id, displayName, baseUrl })),
			[
				{
					owned_by: "openai",
					id: "gpt-5",
					displayName: "openai / gpt-5",
					baseUrl: undefined,
				},
				{
					owned_by: "sub2api",
					id: "gpt-5",
					displayName: "sub2api / gpt-5",
					baseUrl: undefined,
				},
			]
		);
		assert.strictEqual(validateModelCollection(migrated).valid, true);
		assert.strictEqual(getProviderConfiguration(migrated, "openai")?.baseUrl, "https://gateway.example/v1");
		assert.strictEqual(getProviderConfiguration(migrated, "sub2api")?.baseUrl, "https://gateway.example/v1");
	});

	test("does not let one model override become the provider default", () => {
		const migrated = migrateLegacyModelMetadata(
			[
				model({ id: "model-a", baseUrl: "https://model-a.example/v1", displayName: undefined }),
				model({ id: "model-b", baseUrl: undefined, displayName: undefined }),
			],
			"https://legacy.example/v1"
		);
		const modelB = migrated.find((item) => item.id === "model-b")!;

		assert.strictEqual(getProviderConfiguration(migrated, "openai")?.baseUrl, "https://legacy.example/v1");
		assert.strictEqual(resolveModelConnection(migrated, modelB).baseUrl, "https://legacy.example/v1");
	});

	test("does not infer provider defaults from ordinary models without metadata", () => {
		const modelA = model({ id: "model-a", baseUrl: "https://model-a.example/v1" });
		const modelB = model({ id: "model-b", baseUrl: undefined, displayName: "Model B" });

		assert.strictEqual(getProviderConfiguration([modelA, modelB], "openai"), undefined);
		assert.strictEqual(resolveModelConnection([modelA, modelB], modelB).baseUrl, undefined);
	});

	test("rejects reserved provider IDs instead of silently treating them as metadata", () => {
		const validation = validateModelCollection([
			model({ id: "__provider__custom-model", displayName: "Reserved Prefix Model" }),
		]);

		assert.strictEqual(validation.valid, false);
		assert.ok(validation.errors.some((error) => error.includes("reserved")));
	});

	test("does not reclassify a reserved legacy model ID as provider metadata", () => {
		const migrated = migrateLegacyModelMetadata([
			model({ id: "__provider__openai", displayName: "Real upstream model" }),
		]);

		assert.strictEqual(migrated[0].providerConfig, undefined);
		const validation = validateModelCollection(migrated);
		assert.strictEqual(validation.valid, false);
		assert.ok(validation.errors.some((error) => error.includes("reserved")));
	});

	test("recognizes explicit provider metadata and resolves model overrides", () => {
		const providerConfiguration = createProviderConfiguration(" OpenAI ", {
			baseUrl: "https://provider.example/v1",
			apiMode: "openai-responses",
			headers: { "X-Provider": "default" },
		});
		const configured = model({ baseUrl: "https://model.example/v1", headers: undefined });
		const resolved = resolveModelConnection([providerConfiguration, configured], configured);

		assert.strictEqual(isProviderPlaceholder(providerConfiguration), true);
		assert.strictEqual(resolved.baseUrl, "https://model.example/v1");
		assert.strictEqual(resolved.apiMode, "openai-responses");
		assert.deepStrictEqual(resolved.headers, { "X-Provider": "default" });
	});

	test("resolves provider-aware IDs exactly and rejects ambiguous legacy IDs", () => {
		const models = [model(), model({ owned_by: "sub2api", displayName: "GPT-5 via Sub2API" })];
		const sub2apiRuntimeId = createRuntimeModelId(models[1]);

		assert.strictEqual(resolveConfiguredModel(models, sub2apiRuntimeId).owned_by, "sub2api");
		assert.throws(() => resolveConfiguredModel(models, "gpt-5"), /ambiguous across providers/);
	});

	test("reads raw provider aliases from trusted global settings", () => {
		const aliases = getGlobalProviderAliases({
			inspect: () => ({
				globalValue: [
					{ id: "a", owned_by: "OpenAI" },
					{ id: "b", provider: " OPENAI " },
					{ id: "c", owned_by: "openai" },
				],
			}),
		} as never);

		assert.deepStrictEqual(aliases.get("openai"), ["OpenAI", "OPENAI"]);
	});

	test("migrates a mixed-case provider key only after canonical storage succeeds", async () => {
		const values = new Map<string, string>([["oaicopilot.apiKey.OpenAI", "legacy-key"]]);
		const secrets = {
			get: async (key: string) => values.get(key),
			store: async (key: string, value: string) => void values.set(key, value),
			delete: async (key: string) => void values.delete(key),
		} as never;

		assert.strictEqual(await getProviderApiKey(secrets, "openai", ["OpenAI"]), "legacy-key");
		assert.strictEqual(values.get("oaicopilot.apiKey.openai"), "legacy-key");
		assert.strictEqual(values.has("oaicopilot.apiKey.OpenAI"), false);
	});

	test("prefers an existing canonical provider key over legacy aliases", async () => {
		const values = new Map<string, string>([
			["oaicopilot.apiKey.openai", "canonical-key"],
			["oaicopilot.apiKey.OpenAI", "legacy-key"],
		]);
		const secrets = {
			get: async (key: string) => values.get(key),
			store: async (key: string, value: string) => void values.set(key, value),
			delete: async (key: string) => void values.delete(key),
		} as never;

		assert.strictEqual(await getProviderApiKey(secrets, "openai", ["OpenAI"]), "canonical-key");
		assert.strictEqual(values.get("oaicopilot.apiKey.OpenAI"), "legacy-key");
	});

	test("keeps a legacy provider key when canonical storage fails", async () => {
		const values = new Map<string, string>([["oaicopilot.apiKey.OpenAI", "legacy-key"]]);
		const secrets = {
			get: async (key: string) => values.get(key),
			store: async () => undefined,
			delete: async (key: string) => void values.delete(key),
		} as never;

		await assert.rejects(() => getProviderApiKey(secrets, "openai", ["OpenAI"]), /Failed to migrate/);
		assert.strictEqual(values.get("oaicopilot.apiKey.OpenAI"), "legacy-key");
	});
});
