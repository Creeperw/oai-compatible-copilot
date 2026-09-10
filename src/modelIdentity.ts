import type { HFModelItem } from "./types";

const RUNTIME_MODEL_ID_PREFIX = "oaicopilot-v1-";

export interface RuntimeModelIdentity {
	provider: string;
	modelId: string;
}

export interface ModelCollectionValidation {
	valid: boolean;
	errors: string[];
}

export function getModelProviderId(model: unknown): string {
	if (!model || typeof model !== "object") {
		return "";
	}
	const obj = model as Record<string, unknown>;
	const pick = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
	return (
		pick(obj.owned_by) ||
		pick(obj.provide) ||
		pick(obj.provider) ||
		pick(obj.ownedBy) ||
		pick(obj.owner) ||
		pick(obj.vendor)
	);
}

export function canonicalizeProvider(provider: unknown): string {
	return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}

export function normalizeDisplayName(displayName: unknown): string {
	return typeof displayName === "string" ? displayName.normalize("NFKC").trim().toLowerCase() : "";
}

type ProviderPlaceholderCandidate = Pick<HFModelItem, "id"> & Partial<Pick<HFModelItem, "owned_by" | "providerConfig">>;

export function isProviderPlaceholder(candidate: ProviderPlaceholderCandidate): boolean {
	return candidate.providerConfig === true;
}

export function normalizeConfiguredModel(model: HFModelItem): HFModelItem {
	const rawProvider = getModelProviderId(model);
	const provider = canonicalizeProvider(rawProvider);
	const id = typeof model.id === "string" ? model.id.trim() : "";
	const displayName = typeof model.displayName === "string" ? model.displayName.normalize("NFKC").trim() : undefined;
	const configId = typeof model.configId === "string" ? model.configId.trim() || undefined : undefined;
	const baseUrl = typeof model.baseUrl === "string" ? model.baseUrl.trim() || undefined : undefined;

	const placeholder = model.providerConfig === true;
	return {
		...model,
		id,
		owned_by: provider,
		...(placeholder ? { providerConfig: true } : { providerConfig: undefined }),
		...(displayName ? { displayName } : { displayName: undefined }),
		...(configId ? { configId } : { configId: undefined }),
		...(baseUrl ? { baseUrl } : { baseUrl: undefined }),
	};
}

export function defaultDisplayName(model: Pick<HFModelItem, "id" | "owned_by">): string {
	return `${canonicalizeProvider(model.owned_by)} / ${model.id.trim()}`;
}

export function createProviderConfiguration(
	provider: string,
	configuration: Pick<HFModelItem, "baseUrl" | "apiMode" | "headers"> = {}
): HFModelItem {
	const canonicalProvider = canonicalizeProvider(provider);
	if (!canonicalProvider) {
		throw new Error("Provider ID is required.");
	}
	return normalizeConfiguredModel({
		id: `__provider__${canonicalProvider}`,
		owned_by: canonicalProvider,
		providerConfig: true,
		...configuration,
	});
}

export function getProviderConfiguration(models: readonly HFModelItem[], provider: string): HFModelItem | undefined {
	const canonicalProvider = canonicalizeProvider(provider);
	return models
		.map(normalizeConfiguredModel)
		.find((model) => model.owned_by === canonicalProvider && isProviderPlaceholder(model));
}

export function resolveModelConnection(models: readonly HFModelItem[], model: HFModelItem): HFModelItem {
	const providerConfiguration = getProviderConfiguration(models, model.owned_by);
	return normalizeConfiguredModel({
		...providerConfiguration,
		...model,
		baseUrl: model.baseUrl || providerConfiguration?.baseUrl,
		apiMode: model.apiMode || providerConfiguration?.apiMode,
		headers: model.headers || providerConfiguration?.headers,
		providerConfig: undefined,
	});
}

/**
 * Normalize legacy model records, fill missing display names, and move a legacy
 * global Base URL onto provider/model records that do not already have one.
 */
export function migrateLegacyModelMetadata(
	models: readonly HFModelItem[],
	legacyBaseUrl = "",
	createDefaultProvider = false
): HFModelItem[] {
	const fallbackBaseUrl = legacyBaseUrl.trim();
	const normalized = models.map(normalizeConfiguredModel);

	if (normalized.length === 0 && createDefaultProvider) {
		normalized.push(
			createProviderConfiguration("default", {
				...(fallbackBaseUrl ? { baseUrl: fallbackBaseUrl } : {}),
				apiMode: "openai",
			})
		);
	}

	const providersWithMetadata = new Set(
		normalized.filter(isProviderPlaceholder).map((model) => canonicalizeProvider(model.owned_by))
	);
	const providers = new Set(normalized.map((model) => canonicalizeProvider(model.owned_by)).filter(Boolean));
	for (const provider of providers) {
		if (!providersWithMetadata.has(provider)) {
			normalized.push(
				createProviderConfiguration(provider, {
					baseUrl: fallbackBaseUrl || undefined,
					apiMode: "openai",
				})
			);
		}
	}

	const providerBaseUrls = new Map<string, string>();
	for (const model of normalized) {
		if (isProviderPlaceholder(model) && model.owned_by && model.baseUrl && !providerBaseUrls.has(model.owned_by)) {
			providerBaseUrls.set(model.owned_by, model.baseUrl);
		}
	}

	const migrated = normalized.map((model) => {
		const inheritedBaseUrl = providerBaseUrls.get(model.owned_by) || fallbackBaseUrl || undefined;
		if (isProviderPlaceholder(model)) {
			return {
				...model,
				baseUrl: model.baseUrl || inheritedBaseUrl,
			};
		}

		return {
			...model,
			displayName: model.displayName || defaultDisplayName(model),
		};
	});

	const usedDisplayNames = new Set<string>();
	return migrated.map((model) => {
		if (isProviderPlaceholder(model)) {
			return model;
		}

		const preferredName = model.displayName || defaultDisplayName(model);
		let displayName = preferredName;
		let normalizedName = normalizeDisplayName(displayName);
		if (usedDisplayNames.has(normalizedName)) {
			displayName = `${preferredName} (${model.owned_by})`;
			normalizedName = normalizeDisplayName(displayName);
		}
		if (usedDisplayNames.has(normalizedName)) {
			displayName = `${preferredName} (${model.owned_by} / ${model.id})`;
			normalizedName = normalizeDisplayName(displayName);
		}
		let suffix = 2;
		while (usedDisplayNames.has(normalizedName)) {
			displayName = `${preferredName} (${model.owned_by} / ${model.id}) ${suffix++}`;
			normalizedName = normalizeDisplayName(displayName);
		}
		usedDisplayNames.add(normalizedName);
		return { ...model, displayName };
	});
}

export function modelIdentityKeyFromParts(provider: string, modelId: string): string {
	return JSON.stringify([canonicalizeProvider(provider), modelId.trim()]);
}

export function getModelIdentityKey(model: Pick<HFModelItem, "id" | "owned_by">): string {
	return modelIdentityKeyFromParts(model.owned_by, model.id);
}

export function createRuntimeModelId(model: Pick<HFModelItem, "id" | "owned_by">): string {
	const identity: RuntimeModelIdentity = {
		provider: canonicalizeProvider(model.owned_by),
		modelId: model.id.trim(),
	};
	if (!identity.provider || !identity.modelId) {
		throw new Error("Provider ID and Model ID are required to create a runtime model ID.");
	}
	const encoded = Buffer.from(JSON.stringify([identity.provider, identity.modelId]), "utf8").toString("base64url");
	return `${RUNTIME_MODEL_ID_PREFIX}${encoded}`;
}

export function parseRuntimeModelId(runtimeModelId: string): RuntimeModelIdentity | null {
	if (!runtimeModelId.startsWith(RUNTIME_MODEL_ID_PREFIX)) {
		return null;
	}

	try {
		const encoded = runtimeModelId.slice(RUNTIME_MODEL_ID_PREFIX.length);
		const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
		if (!Array.isArray(parsed) || parsed.length !== 2) {
			return null;
		}
		const provider = canonicalizeProvider(parsed[0]);
		const modelId = typeof parsed[1] === "string" ? parsed[1].trim() : "";
		if (!provider || !modelId) {
			return null;
		}
		return { provider, modelId };
	} catch {
		return null;
	}
}

export function validateModelCollection(models: readonly HFModelItem[]): ModelCollectionValidation {
	const errors: string[] = [];
	const identities = new Map<string, string>();
	const displayNames = new Map<string, string>();
	const providerConfigurations = new Set<string>();

	for (const rawModel of models) {
		const rawId = typeof rawModel.id === "string" ? rawModel.id.trim() : "";
		const rawProvider = canonicalizeProvider(getModelProviderId(rawModel));
		if (rawModel.providerConfig === true && rawId !== `__provider__${rawProvider}`) {
			errors.push(`Provider metadata for "${rawProvider || "<missing>"}" has an invalid internal ID.`);
			continue;
		}
		if (rawModel.providerConfig !== true && rawId.startsWith("__provider__")) {
			errors.push(`Model ID "${rawId}" uses the reserved "__provider__" prefix.`);
			continue;
		}
		const model = normalizeConfiguredModel(rawModel);
		if (isProviderPlaceholder(model)) {
			if (!model.owned_by) {
				errors.push("Provider metadata is missing a Provider ID.");
				continue;
			}
			if (providerConfigurations.has(model.owned_by)) {
				errors.push(`Provider "${model.owned_by}" has more than one provider metadata record.`);
			} else {
				providerConfigurations.add(model.owned_by);
			}
			continue;
		}

		if (!model.owned_by) {
			errors.push(`Model "${model.id || "<missing>"}" is missing a Provider ID.`);
			continue;
		}
		if (!model.id) {
			errors.push(`Provider "${model.owned_by}" contains a model without a Model ID.`);
			continue;
		}
		const label = `${model.owned_by} / ${model.id}`;
		const identityKey = getModelIdentityKey(model);
		const previousIdentity = identities.get(identityKey);
		if (previousIdentity) {
			errors.push(`Duplicate model identity "${label}". A Model ID may appear only once within the same provider.`);
		} else {
			identities.set(identityKey, label);
		}

		const normalizedName = normalizeDisplayName(model.displayName);
		if (!normalizedName) {
			errors.push(`Model "${label}" is missing a Display Name.`);
			continue;
		}
		const previousDisplayName = displayNames.get(normalizedName);
		if (previousDisplayName) {
			errors.push(
				`Display Name "${model.displayName}" is already used by "${previousDisplayName}". Display Names must be globally unique.`
			);
		} else {
			displayNames.set(normalizedName, label);
		}
	}

	return { valid: errors.length === 0, errors };
}

export function assertValidModelCollection(models: readonly HFModelItem[]): void {
	const validation = validateModelCollection(models);
	if (!validation.valid) {
		throw new Error(`Invalid model configuration:\n${validation.errors.join("\n")}`);
	}
}

/** Resolve a VS Code runtime ID, with unambiguous legacy IDs supported. */
export function resolveConfiguredModel(models: readonly HFModelItem[], runtimeModelId: string): HFModelItem {
	const configuredModels = models.map(normalizeConfiguredModel).filter((model) => !isProviderPlaceholder(model));
	const runtimeIdentity = parseRuntimeModelId(runtimeModelId);

	if (runtimeIdentity) {
		const match = configuredModels.find(
			(model) => model.owned_by === runtimeIdentity.provider && model.id === runtimeIdentity.modelId
		);
		if (match) {
			return match;
		}
		throw new Error(
			`Model configuration not found for provider "${runtimeIdentity.provider}" and model "${runtimeIdentity.modelId}".`
		);
	}

	// Older versions registered the raw model ID, optionally followed by ::configId.
	let legacyMatches = configuredModels.filter((model) => model.id === runtimeModelId);
	if (legacyMatches.length === 0) {
		const separator = runtimeModelId.indexOf("::");
		if (separator > 0) {
			const baseId = runtimeModelId.slice(0, separator);
			const configId = runtimeModelId.slice(separator + 2);
			legacyMatches = configuredModels.filter((model) => model.id === baseId && model.configId === configId);
		}
	}

	if (legacyMatches.length === 1) {
		return legacyMatches[0];
	}
	if (legacyMatches.length > 1) {
		throw new Error(
			`Legacy model ID "${runtimeModelId}" is ambiguous across providers. Re-select the model in Copilot Chat.`
		);
	}
	throw new Error(`Model configuration not found for "${runtimeModelId}".`);
}
