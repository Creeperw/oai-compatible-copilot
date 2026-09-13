import type { BalanceExtractor } from "../types";

/**
 * A built-in balance query template.
 *
 * Presets only ever pre-fill the form. Nothing is applied automatically, so a
 * provider whose endpoint differs from the preset still works — the user edits
 * the URL and presses Test.
 */
export interface BalancePreset {
	/** Stable identifier stored in the configuration. */
	id: string;
	/** Shown in the preset picker. */
	label: string;
	/** One-line explanation of what the preset queries. */
	description: string;
	/** Which Base URL the preset expects, shown under the URL field. */
	baseUrlHint: string;
	/** Defaults applied when the preset is selected. */
	config: {
		url: string;
		method: string;
		auth: "bearer" | "x-api-key" | "none";
		headers?: Record<string, string>;
		extract: BalanceExtractor;
	};
	/**
	 * Patterns that identify this preset in a provider Base URL.
	 *
	 * Tested against the host and path together, so a preset can claim one route
	 * of a shared host (`/zen/go` but not `/zen/v1`). Used only to suggest a
	 * default, never to force one.
	 */
	urlPatterns: readonly RegExp[];
}

/**
 * Placeholders understood by the query engine.
 *
 * - `{{baseUrl}}` — the provider Base URL, trailing slashes removed
 * - `{{origin}}`  — scheme and host of the provider Base URL, with no path
 * - `{{apiKey}}`  — the stored API key for the provider
 *
 * The list holds two kinds of query. The first group reads an account balance,
 * which the provider reports as money. The second reads a coding-plan quota,
 * which the provider reports as a percentage of a rolling window; those presets
 * expose the window as `remaining` out of a total of 100 and set the unit to
 * `%`, so both kinds share one column and one severity rule.
 */
export const BALANCE_PRESETS: readonly BalancePreset[] = [
	// ── Account balances ─────────────────────────────────────────────────
	{
		id: "deepseek",
		label: "DeepSeek",
		description: "Reads the account balance from the DeepSeek user balance endpoint.",
		baseUrlHint: "Expects the root Base URL, for example https://api.deepseek.com without a /v1 suffix.",
		config: {
			url: "{{baseUrl}}/user/balance",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "balance_infos[0].total_balance",
				unit: "balance_infos[0].currency",
			},
		},
		urlPatterns: [/api\.deepseek\.com/i],
	},
	{
		id: "siliconflow",
		label: "SiliconFlow (China)",
		description: "Reads the account balance from the SiliconFlow user info endpoint.",
		baseUrlHint:
			"Expects https://api.siliconflow.cn/v1. The total balance adds the granted credit and the topped-up amount.",
		config: {
			url: "{{baseUrl}}/user/info",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "data.totalBalance",
				unit: '"CNY"',
			},
		},
		urlPatterns: [/api\.siliconflow\.cn/i],
	},
	{
		id: "siliconflow-en",
		label: "SiliconFlow (International)",
		description: "Reads the account balance from the SiliconFlow user info endpoint on the international site.",
		baseUrlHint: "Expects https://api.siliconflow.com/v1. The international site reports USD.",
		config: {
			url: "{{baseUrl}}/user/info",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "data.totalBalance",
				unit: '"USD"',
			},
		},
		urlPatterns: [/api\.siliconflow\.com/i],
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		description: "Reads remaining credits from the OpenRouter credits endpoint.",
		baseUrlHint: "Expects https://openrouter.ai/api/v1.",
		config: {
			url: "{{baseUrl}}/credits",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "data.total_credits - data.total_usage",
				total: "data.total_credits",
				used: "data.total_usage",
				unit: '"USD"',
			},
		},
		urlPatterns: [/openrouter\.ai/i],
	},
	{
		id: "stepfun",
		label: "StepFun",
		description: "Reads the account balance from the StepFun accounts endpoint.",
		baseUrlHint: "Expects https://api.stepfun.com/v1 or https://api.stepfun.ai/v1.",
		config: {
			url: "{{origin}}/v1/accounts",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "balance",
				unit: '"CNY"',
				planName: '"StepFun"',
			},
		},
		urlPatterns: [/api\.stepfun\.(ai|com)/i],
	},
	{
		id: "novita",
		label: "Novita AI",
		description: "Reads the available balance from the Novita AI user balance endpoint.",
		baseUrlHint:
			"Expects https://api.novita.ai/v3. The endpoint reports the balance in units of 0.0001 USD, which the preset converts.",
		config: {
			url: "{{origin}}/v3/user/balance",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "availableBalance / 10000",
				unit: '"USD"',
				planName: '"Novita AI"',
			},
		},
		urlPatterns: [/api\.novita\.ai/i],
	},
	{
		id: "newapi",
		label: "New API / One API relay",
		description: "Reads the quota of a New API or One API relay site. Requires the numeric user ID header.",
		baseUrlHint:
			"Expects any Base URL on the relay host. The query targets {{origin}}, so a /v1 suffix is fine. " +
			"Set the New-Api-User header to your numeric user ID.",
		config: {
			url: "{{origin}}/api/user/self",
			method: "GET",
			auth: "bearer",
			headers: { "New-Api-User": "1" },
			extract: {
				remaining: "data.quota / 500000",
				total: "(data.quota + data.used_quota) / 500000",
				used: "data.used_quota / 500000",
				planName: "data.group",
				unit: '"USD"',
			},
		},
		urlPatterns: [],
	},
	// ── Coding-plan quotas ──────────────────────────────────────────────
	{
		id: "kimi",
		label: "Kimi For Coding",
		description: "Reads the overall usage window of a Kimi For Coding plan, as the percentage of the quota left.",
		baseUrlHint:
			"Expects https://api.kimi.com/coding. Reads the overall window; point the remaining expression at " +
			"limits[0].detail to watch the 5-hour window instead.",
		config: {
			url: "{{baseUrl}}/v1/usages",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "100 * usage.remaining / usage.limit",
				total: "100",
				used: "100 * (usage.limit - usage.remaining) / usage.limit",
				unit: '"%"',
				planName: '"Kimi For Coding (overall)"',
			},
		},
		urlPatterns: [/api\.kimi\.com/i],
	},
	{
		id: "zhipu",
		label: "Zhipu GLM coding plan",
		description: "Reads the 5-hour usage window of a Zhipu GLM coding plan, as the percentage of the quota left.",
		baseUrlHint:
			"Expects https://open.bigmodel.cn/api/paas/v4 or https://api.z.ai/api/paas/v4. These endpoints want " +
			"the API key in the Authorization header with no Bearer prefix, so the preset uses the None auth mode " +
			"with an explicit header.",
		config: {
			url: "{{origin}}/api/monitor/usage/quota/limit",
			method: "GET",
			auth: "none",
			headers: { Authorization: "{{apiKey}}" },
			extract: {
				remaining: "100 - data.limits[type == 'TOKENS_LIMIT'][unit == 3].percentage",
				total: "100",
				used: "data.limits[type == 'TOKENS_LIMIT'][unit == 3].percentage",
				unit: '"%"',
				planName: '"Zhipu GLM (5-hour)"',
			},
		},
		urlPatterns: [/open\.bigmodel\.cn/i, /api\.z\.ai/i],
	},
	{
		id: "minimax",
		label: "MiniMax coding plan",
		description: "Reads the 5-hour usage window of a MiniMax coding plan, as the percentage of the quota left.",
		baseUrlHint: "Expects https://api.minimaxi.com/v1 (China) or https://api.minimax.io/v1 (international).",
		config: {
			url: "{{origin}}/v1/api/openplatform/coding_plan/remains",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "model_remains[model_name == 'general'].current_interval_remaining_percent",
				total: "100",
				used: "100 - model_remains[model_name == 'general'].current_interval_remaining_percent",
				unit: '"%"',
				planName: '"MiniMax (5-hour)"',
			},
		},
		urlPatterns: [/api\.minimaxi\.com/i, /api\.minimax\.io/i],
	},
	{
		id: "opencode-go",
		label: "OpenCode Go",
		description:
			"Reads the rolling 5-hour usage window of an OpenCode Go subscription, as the percentage of the quota left.",
		baseUrlHint:
			"The endpoint is absolute, so the provider Base URL does not matter. OpenCode Zen (pay as you go) " +
			"publishes no balance API and cannot be queried.",
		config: {
			url: "https://opencode.ai/zen/go/v1/usage",
			method: "GET",
			auth: "bearer",
			extract: {
				remaining: "100 - usage.rolling.percent",
				total: "100",
				used: "usage.rolling.percent",
				unit: '"%"',
				planName: '"OpenCode Go (5-hour rolling)"',
			},
		},
		urlPatterns: [/opencode\.ai\/zen\/go/i],
	},
];

export function getBalancePreset(id: string | undefined): BalancePreset | undefined {
	if (!id) {
		return undefined;
	}
	return BALANCE_PRESETS.find((preset) => preset.id === id);
}

/**
 * Suggest a preset for a Base URL. The result only seeds the picker; the user
 * can always choose a different preset or write a custom query.
 */
export function suggestBalancePreset(baseUrl: string | undefined): BalancePreset | undefined {
	const trimmed = (baseUrl ?? "").trim();
	if (!trimmed) {
		return undefined;
	}
	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return undefined;
	}
	// Host and path together, so a preset can target one route of a shared host.
	const target = `${parsed.host}${parsed.pathname}`;
	return BALANCE_PRESETS.find((preset) => preset.urlPatterns.some((pattern) => pattern.test(target)));
}
