import type { HFModelItem, ProviderBalanceConfig } from "./types";

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

const PROVIDER_RECORD_ID_PREFIX = "__provider__";

/**
 * Older releases stored provider connection records as a reserved
 * "__provider__<provider>" ID without the providerConfig marker, and treated
 * every such ID as provider metadata. Identify those records so migration can
 * adopt them instead of rejecting the whole configuration.
 *
 * A record that carries a Display Name is never adopted, because a Display Name
 * marks a record as a selectable model.
 */
function getLegacyProviderRecordProvider(model: HFModelItem): string | undefined {
	if (model.providerConfig === true) {
		return undefined;
	}
	const id = typeof model.id === "string" ? model.id.trim() : "";
	if (!id.startsWith(PROVIDER_RECORD_ID_PREFIX)) {
		return undefined;
	}
	if (typeof model.displayName === "string" && model.displayName.trim()) {
		return undefined;
	}
	const providerFromId = canonicalizeProvider(id.slice(PROVIDER_RECORD_ID_PREFIX.length));
	if (!providerFromId) {
		return undefined;
	}
	const declaredProvider = canonicalizeProvider(getModelProviderId(model));
	if (declaredProvider && declaredProvider !== providerFromId) {
		return undefined;
	}
	return providerFromId;
}

function mergeDefinedValues(base: HFModelItem, override: HFModelItem): HFModelItem {
	const merged: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value !== undefined) {
			merged[key] = value;
		}
	}
	return merged as unknown as HFModelItem;
}

/**
 * Convert legacy provider records in place, and fold a legacy record into an
 * explicit provider record instead of producing two metadata records for the
 * same provider, which validation rejects.
 */
function adoptLegacyProviderRecords(models: HFModelItem[]): HFModelItem[] {
	const adopted: HFModelItem[] = [];
	const placeholderIndexByProvider = new Map<string, number>();

	for (const model of models) {
		const legacyProvider = getLegacyProviderRecordProvider(model);
		const explicit = isProviderPlaceholder(model);
		if (!legacyProvider && !explicit) {
			adopted.push(model);
			continue;
		}

		const provider = legacyProvider ?? canonicalizeProvider(model.owned_by);
		const placeholder = legacyProvider
			? normalizeConfiguredModel({
					...model,
					id: `${PROVIDER_RECORD_ID_PREFIX}${provider}`,
					owned_by: provider,
					providerConfig: true,
				})
			: model;

		const existingIndex = placeholderIndexByProvider.get(provider);
		if (existingIndex === undefined) {
			placeholderIndexByProvider.set(provider, adopted.length);
			adopted.push(placeholder);
			continue;
		}
		// An explicit provider record wins; an adopted legacy record only fills gaps.
		adopted[existingIndex] = explicit
			? mergeDefinedValues(adopted[existingIndex], placeholder)
			: mergeDefinedValues(placeholder, adopted[existingIndex]);
	}

	return adopted;
}

/**
 * Trim a balance configuration and drop empty fields so an untouched form does
 * not persist a wall of empty strings. Returns undefined when nothing is left.
 */
export function normalizeProviderBalance(balance: unknown): ProviderBalanceConfig | undefined {
	if (!balance || typeof balance !== "object" || Array.isArray(balance)) {
		return undefined;
	}
	const source = balance as Record<string, unknown>;
	const pick = (value: unknown): string | undefined => {
		if (typeof value !== "string") {
			return undefined;
		}
		const trimmed = value.trim();
		return trimmed ? trimmed : undefined;
	};

	const extractSource =
		source.extract && typeof source.extract === "object" && !Array.isArray(source.extract)
			? (source.extract as Record<string, unknown>)
			: {};
	const remaining = pick(extractSource.remaining);
	const unit = pick(extractSource.unit);
	const planName = pick(extractSource.planName);
	const total = pick(extractSource.total);
	const used = pick(extractSource.used);
	const extra = pick(extractSource.extra);
	const hasExtractor = Boolean(remaining || unit || planName || total || used || extra);

	const headersSource =
		source.headers && typeof source.headers === "object" && !Array.isArray(source.headers)
			? (source.headers as Record<string, unknown>)
			: {};
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(headersSource)) {
		const name = key.trim();
		const headerValue = pick(value);
		if (name && headerValue) {
			headers[name] = headerValue;
		}
	}

	const auth =
		source.auth === "bearer" || source.auth === "x-api-key" || source.auth === "none" ? source.auth : undefined;
	const timeoutMs =
		typeof source.timeoutMs === "number" && Number.isFinite(source.timeoutMs) && source.timeoutMs > 0
			? Math.floor(source.timeoutMs)
			: undefined;
	const intervalMinutes =
		typeof source.intervalMinutes === "number" && Number.isFinite(source.intervalMinutes) && source.intervalMinutes > 0
			? Math.floor(source.intervalMinutes)
			: undefined;

	const normalized: ProviderBalanceConfig = {
		...(source.enabled === true ? { enabled: true } : {}),
		...(pick(source.preset) ? { preset: pick(source.preset)! } : {}),
		...(pick(source.url) ? { url: pick(source.url)! } : {}),
		...(pick(source.method) ? { method: pick(source.method)!.toUpperCase() } : {}),
		...(auth ? { auth } : {}),
		...(Object.keys(headers).length ? { headers } : {}),
		...(hasExtractor
			? {
					extract: {
						remaining: remaining ?? "",
						...(unit ? { unit } : {}),
						...(planName ? { planName } : {}),
						...(total ? { total } : {}),
						...(used ? { used } : {}),
						...(extra ? { extra } : {}),
					},
				}
			: {}),
		...(timeoutMs ? { timeoutMs } : {}),
		...(intervalMinutes ? { intervalMinutes } : {}),
	};

	return Object.keys(normalized).length ? normalized : undefined;
}

export function normalizeConfiguredModel(model: HFModelItem): HFModelItem {
	const rawProvider = getModelProviderId(model);
	const provider = canonicalizeProvider(rawProvider);
	const id = typeof model.id === "string" ? model.id.trim() : "";
	const displayName = typeof model.displayName === "string" ? model.displayName.normalize("NFKC").trim() : undefined;
	const configId = typeof model.configId === "string" ? model.configId.trim() || undefined : undefined;
	const baseUrl = typeof model.baseUrl === "string" ? model.baseUrl.trim() || undefined : undefined;

	const placeholder = model.providerConfig === true;
	// A balance query belongs to the provider, so a model record never keeps one.
	const balance = placeholder ? normalizeProviderBalance(model.balance) : undefined;
	return {
		...model,
		id,
		owned_by: provider,
		...(placeholder ? { providerConfig: true } : { providerConfig: undefined }),
		...(displayName ? { displayName } : { displayName: undefined }),
		...(configId ? { configId } : { configId: undefined }),
		...(baseUrl ? { baseUrl } : { baseUrl: undefined }),
		balance,
	};
}

export function defaultDisplayName(model: Pick<HFModelItem, "id" | "owned_by">): string {
	return `${canonicalizeProvider(model.owned_by)} / ${model.id.trim()}`;
}

export function createProviderConfiguration(
	provider: string,
	configuration: Pick<HFModelItem, "baseUrl" | "apiMode" | "headers" | "session_id_header" | "balance"> = {}
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
		session_id_header: model.session_id_header || providerConfiguration?.session_id_header,
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
	const normalized = adoptLegacyProviderRecords(models.map(normalizeConfiguredModel));

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
