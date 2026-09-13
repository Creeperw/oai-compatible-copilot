/**
 * Declarative extractor for a provider balance response.
 *
 * Every field is a small expression: a JSON field path such as
 * `balance_infos[0].total_balance`, optionally combined with `+ - * /` and
 * parentheses so providers that report credits and usage separately (or in a
 * different unit) can still be expressed. A double-quoted value is a string
 * literal.
 */
export interface BalanceExtractor {
	/** Remaining balance. Evaluated to a number. */
	remaining: string;
	/** Unit shown next to the amount, for example `USD`, `CNY`, `次`, or a field path. */
	unit?: string;
	/** Plan name. Required only when a provider reports several plans. */
	planName?: string;
	/** Total quota. When set together with `remaining`, the UI can show a progress bar. */
	total?: string;
	/** Already used quota. */
	used?: string;
	/** Extra text shown in the tooltip. */
	extra?: string;
}

/**
 * How to query a provider's remaining balance.
 *
 * Stored on the provider record, so it travels with export/import and does not
 * require a second place to configure credentials.
 */
export interface ProviderBalanceConfig {
	/** Whether the query runs at all. Defaults to false. */
	enabled?: boolean;
	/** Name of a built-in preset, or `"custom"`. Selects the defaults for the fields below. */
	preset?: string;
	/** Request URL. Supports `{{baseUrl}}` and `{{apiKey}}`. A relative path is resolved against the provider Base URL. */
	url?: string;
	/** HTTP method. Defaults to `GET`. */
	method?: string;
	/**
	 * How the API key is attached.
	 * - `bearer`: `Authorization: Bearer <key>` (default)
	 * - `x-api-key`: `x-api-key: <key>`
	 * - `none`: no credential header
	 */
	auth?: "bearer" | "x-api-key" | "none";
	/** Extra request headers. Values support `{{apiKey}}` and `{{baseUrl}}`. */
	headers?: Record<string, string>;
	/** Field paths used to read the amount out of the response. */
	extract?: BalanceExtractor;
	/** Request timeout in milliseconds. Defaults to 10000. */
	timeoutMs?: number;
	/**
	 * Background refresh interval in minutes. `0` disables background refresh so
	 * the query only runs when the user asks for it. Defaults to 0.
	 */
	intervalMinutes?: number;
}

/**
 * A single underlying provider (e.g., together, groq) for a model.
 */
export interface HFProvider {
	provider: string;
	status: string;
	supports_tools?: boolean;
	supports_structured_output?: boolean;
	context_length?: number;
}

/**
 * A model entry returned by the Hugging Face router models endpoint.
 */
export interface HFArchitecture {
	input_modalities?: string[];
	output_modalities?: string[];
}

export interface HFModelItem {
	id: string;
	object?: string;
	created?: number;
	owned_by: string;
	/** Internal metadata record used to persist provider-level connection settings. */
	providerConfig?: boolean;
	configId?: string;
	displayName?: string;
	baseUrl?: string;
	providers?: HFProvider[];
	architecture?: HFArchitecture;
	context_length?: number;
	vision?: boolean;
	max_tokens?: number;
	// OpenAI new standard parameter
	max_completion_tokens?: number;
	reasoning_effort?: string;
	enable_thinking?: boolean;
	thinking_budget?: number;
	// New thinking configuration for Zai provider
	thinking?: ThinkingConfig;
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	temperature?: number | null;
	// Allow null so user can explicitly disable sending this parameter (fall back to provider default)
	top_p?: number | null;
	top_k?: number;
	min_p?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	repetition_penalty?: number;
	reasoning?: ReasoningConfig;
	/**
	 * Optional family specification for the model. This allows users to specify
	 * the model family (e.g., "gpt-4", "claude-3", "gemini") to enable family-specific
	 * optimizations and behaviors in the Copilot extension. If not specified,
	 * defaults to "oai-compatible".
	 */
	family?: string;

	/**
	 * Extra configuration parameters that can be used for custom functionality.
	 * This allows users to add any additional parameters they might need
	 * without modifying the core interface.
	 */
	extra?: Record<string, unknown>;

	/**
	 * Custom HTTP headers to be sent with every request to this model's provider.
	 * These headers will be merged with the default headers (Authorization, Content-Type, User-Agent).
	 * Example: { "X-API-Version": "v1", "X-Custom-Header": "value" }
	 */
	headers?: Record<string, string>;

	/**
	 * Name of an HTTP header used to send a stable per-conversation session ID.
	 *
	 * VS Code does not expose a conversation identifier to language model providers,
	 * so the ID is derived from the first user turn of the conversation. Required by
	 * providers that route requests by session, for example OpenCode Zen/Go, which
	 * expects `x-opencode-session`.
	 *
	 * Example: "x-opencode-session"
	 */
	session_id_header?: string;

	/**
	 * Optional balance query for this provider. Only meaningful on provider
	 * records (`providerConfig: true`).
	 */
	balance?: ProviderBalanceConfig;

	/**
	 * Whether to include reasoning_content in assistant messages sent to the API.
	 * Support deepseek-v3.2 or others.
	 */
	include_reasoning_in_request?: boolean;

	/**
	 * API mode: "openai" for OpenAI Chat Completions, "openai-responses" for OpenAI Responses,
	 * "ollama" for Ollama native API, "anthropic" for Anthropic Messages, "gemini" for Gemini native API.
	 * Default is "openai".
	 */
	apiMode?: HFApiMode;

	/**
	 * Whether this model can be used for Git commit message generation.
	 * If true, this model will be available for generating commit messages.
	 * Default is false.
	 */
	useForCommitGeneration?: boolean;

	/**
	 * Model-specific delay in milliseconds between consecutive requests.
	 * If not specified, falls back to global `oaicopilot.delay` configuration.
	 */
	delay?: number;

	/**
	 * Enable Anthropic prompt caching breakpoints (only effective when `apiMode` is `"anthropic"`).
	 *
	 * When enabled, the provider will:
	 *   - Convert `system` into a structured array and mark it with `cache_control: { type: "ephemeral" }`.
	 *   - Mark the last entry of `tools` with `cache_control: { type: "ephemeral" }`.
	 *   - Honor in-message `cache_control` markers emitted by the host (Copilot) — i.e. a
	 *     `LanguageModelDataPart` with `mimeType === "cache_control"` is converted to a real
	 *     Anthropic `cache_control` field on the preceding content block.
	 *
	 * Defaults to `true`. Set to `false` for upstream providers that reject `cache_control`.
	 */
	cache_control?: boolean;
}

/**
 * OpenRouter reasoning configuration
 */
export interface ReasoningConfig {
	effort?: string;
	exclude?: boolean;
	max_tokens?: number;
	enabled?: boolean;
}

/**
 * Supplemental model info from the Hugging Face hub API.
 */
// Deprecated: extra model info was previously fetched from the hub API
export interface HFExtraModelInfo {
	id: string;
	pipeline_tag?: string;
}

/**
 * Response envelope for the router models listing.
 */
export interface HFModelsResponse {
	object: string;
	data: HFModelItem[];
}

/**
 * Thinking configuration for Zai provider
 */
export interface ThinkingConfig {
	type?: string;
}

/**
 * Retry configuration for rate limiting
 */
export interface RetryConfig {
	enabled?: boolean;
	max_attempts?: number;
	interval_ms?: number;
	status_codes?: number[];
}

/** Supports API mode. */
export type HFApiMode = "openai" | "openai-responses" | "ollama" | "anthropic" | "gemini";

/**
 * Custom data part MIME types for vscode.LanguageModelDataPart
 */
export namespace CustomDataPartMimeTypes {
	export const CacheControl = "cache_control";
	export const StatefulMarker = "stateful_marker";
	export const ThinkingData = "thinking";
	export const ContextManagement = "context_management";
	export const PhaseData = "phase_data";
	export const Usage = "usage";
}

/**
 * Standard OpenAI token usage details.
 */
export interface TokenUsageDetails {
	cached_tokens: number;
}

/**
 * Standard OpenAI token usage structure.
 */
export interface TokenUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_tokens_details?: TokenUsageDetails;
}
