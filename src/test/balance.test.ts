import * as assert from "assert";
import {
	BalanceExpressionError,
	evaluateBalanceNumber,
	evaluateBalanceText,
	parseBalanceExpression,
} from "../balance/expression";
import { BALANCE_PRESETS, getBalancePreset, suggestBalancePreset } from "../balance/presets";
import { queryProviderBalance, resolveBalanceConfig, resolveBalanceUrl } from "../balance/query";
import { formatBalanceAmount, formatBalanceValue, getBalanceSeverity } from "../balance/format";
import { normalizeProviderBalance, createProviderConfiguration, normalizeConfiguredModel } from "../modelIdentity";
import type { ProviderBalanceConfig } from "../types";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

suite("balance expression", () => {
	const response = {
		balance_infos: [
			{ currency: "CNY", total_balance: "128.50" },
			{ currency: "USD", total_balance: "17.25" },
		],
		data: { quota: 2500000, used_quota: 1000000, group: "default", is_active: true },
		total_credits: 20,
		total_usage: 7.5,
		"odd key": 3,
	};

	test("reads nested fields and array elements", () => {
		assert.strictEqual(evaluateBalanceNumber("balance_infos[0].total_balance", response), 128.5);
		assert.strictEqual(evaluateBalanceNumber("data.quota", response), 2500000);
		assert.strictEqual(evaluateBalanceNumber("balance_infos[1].total_balance", response), 17.25);
	});

	test("reads keys that need quoting", () => {
		assert.strictEqual(evaluateBalanceNumber('["odd key"]', response), 3);
	});

	test("coerces numeric strings", () => {
		assert.strictEqual(evaluateBalanceNumber("balance_infos[0].total_balance + 1", response), 129.5);
	});

	test("evaluates arithmetic with the usual precedence", () => {
		assert.strictEqual(evaluateBalanceNumber("total_credits - total_usage", response), 12.5);
		assert.strictEqual(evaluateBalanceNumber("data.quota / 500000", response), 5);
		assert.strictEqual(evaluateBalanceNumber("(data.quota + data.used_quota) / 500000", response), 7);
		assert.strictEqual(evaluateBalanceNumber("2 + 3 * 4", response), 14);
		assert.strictEqual(evaluateBalanceNumber("(2 + 3) * 4", response), 20);
		assert.strictEqual(evaluateBalanceNumber("-data.quota", response), -2500000);
	});

	test("returns undefined for a missing path instead of throwing", () => {
		assert.strictEqual(evaluateBalanceNumber("data.missing", response), undefined);
		assert.strictEqual(evaluateBalanceNumber("data.quota.deep", response), undefined);
		assert.strictEqual(evaluateBalanceNumber("balance_infos[9].total_balance", response), undefined);
	});

	test("returns undefined when a value is not a number", () => {
		assert.strictEqual(evaluateBalanceNumber("data.group", response), undefined);
		assert.strictEqual(evaluateBalanceNumber("data.is_active", response), undefined);
	});

	test("rejects malformed expressions", () => {
		assert.throws(() => evaluateBalanceNumber("1 +", response), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("data.quota *", response), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("(data.quota", response), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("", response), BalanceExpressionError);
	});

	test("reports division by zero rather than returning Infinity", () => {
		assert.throws(() => evaluateBalanceNumber("data.quota / 0", response), BalanceExpressionError);
	});

	test("treats a bare word as a literal for text fields", () => {
		assert.strictEqual(evaluateBalanceText("CNY", response), "CNY");
		assert.strictEqual(evaluateBalanceText("次", response), "次");
		assert.strictEqual(evaluateBalanceText('"USD"', response), "USD");
	});

	test("still reads paths for text fields", () => {
		assert.strictEqual(evaluateBalanceText("data.group", response), "default");
		assert.strictEqual(evaluateBalanceText("balance_infos[0].currency", response), "CNY");
		assert.strictEqual(evaluateBalanceText("data.missing", response), undefined);
		assert.strictEqual(evaluateBalanceText("data.quota", response), "2500000");
	});
});

suite("balance array selectors", () => {
	// Usage windows come back in an array whose order the provider does not promise,
	// so they are addressed by field instead of by position.
	const plans = {
		data: {
			level: "max",
			limits: [
				{ type: "TIME_LIMIT", percentage: 7 },
				{ type: "TOKENS_LIMIT", unit: 6, number: 7, percentage: 42 },
				{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 1 },
			],
		},
		model_remains: [
			{ model_name: "video", current_interval_remaining_percent: 100 },
			{ model_name: "general", current_interval_remaining_percent: 98 },
		],
	};

	test("picks an element by a numeric field", () => {
		assert.strictEqual(evaluateBalanceNumber("data.limits[unit == 3].percentage", plans), 1);
		assert.strictEqual(evaluateBalanceNumber("data.limits[unit == 6].percentage", plans), 42);
	});

	test("picks an element by a string field", () => {
		assert.strictEqual(
			evaluateBalanceNumber("model_remains[model_name == 'general'].current_interval_remaining_percent", plans),
			98
		);
	});

	test("matches a number against a string field value", () => {
		// Providers are inconsistent about whether an enum-like field is a number or
		// a string, so both sides are compared as text.
		assert.strictEqual(evaluateBalanceNumber("data.limits[unit == '3'].percentage", plans), 1);
	});

	test("takes the first element when several match", () => {
		assert.strictEqual(evaluateBalanceNumber("data.limits[type == 'TOKENS_LIMIT'].percentage", plans), 42);
	});

	test("chains selectors to narrow the same array", () => {
		assert.strictEqual(evaluateBalanceNumber("data.limits[type == 'TOKENS_LIMIT'][unit == 3].percentage", plans), 1);
		assert.strictEqual(
			evaluateBalanceNumber("data.limits[type == 'TOKENS_LIMIT'][unit == 99].percentage", plans),
			undefined
		);
	});

	test("supports the not-equal operator", () => {
		assert.strictEqual(evaluateBalanceNumber("data.limits[type != 'TOKENS_LIMIT'].percentage", plans), 7);
	});

	test("returns undefined when nothing matches", () => {
		assert.strictEqual(evaluateBalanceNumber("data.limits[unit == 99].percentage", plans), undefined);
		assert.strictEqual(evaluateBalanceNumber("data.limits[unit == 3].missing", plans), undefined);
		assert.strictEqual(evaluateBalanceNumber("data.level[unit == 3]", plans), undefined);
	});

	test("rejects a malformed selector", () => {
		assert.throws(() => evaluateBalanceNumber("data.limits[unit].percentage", plans), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("data.limits[unit ==]", plans), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("data.limits[unit == name]", plans), BalanceExpressionError);
		assert.throws(() => evaluateBalanceNumber("data.limits[unit = 3]", plans), BalanceExpressionError);
	});
});

suite("balance presets", () => {
	test("suggests a preset from the provider base URL", () => {
		assert.strictEqual(suggestBalancePreset("https://api.deepseek.com/v1")?.id, "deepseek");
		assert.strictEqual(suggestBalancePreset("https://api.siliconflow.cn/v1")?.id, "siliconflow");
		assert.strictEqual(suggestBalancePreset("https://api.siliconflow.com/v1")?.id, "siliconflow-en");
		assert.strictEqual(suggestBalancePreset("https://openrouter.ai/api/v1")?.id, "openrouter");
		assert.strictEqual(suggestBalancePreset("https://api.stepfun.com/v1")?.id, "stepfun");
		assert.strictEqual(suggestBalancePreset("https://api.stepfun.ai/v1")?.id, "stepfun");
		assert.strictEqual(suggestBalancePreset("https://api.novita.ai/v3")?.id, "novita");
		assert.strictEqual(suggestBalancePreset("https://api.kimi.com/coding")?.id, "kimi");
		assert.strictEqual(suggestBalancePreset("https://open.bigmodel.cn/api/paas/v4")?.id, "zhipu");
		assert.strictEqual(suggestBalancePreset("https://api.z.ai/api/paas/v4")?.id, "zhipu");
		assert.strictEqual(suggestBalancePreset("https://api.minimaxi.com/v1")?.id, "minimax");
		assert.strictEqual(suggestBalancePreset("https://api.minimax.io/v1")?.id, "minimax");
	});

	test("tells the two OpenCode routes apart", () => {
		// Zen (pay as you go) publishes no usage API, so only the Go subscription may
		// be suggested — otherwise a Zen user would be handed a preset that fails.
		assert.strictEqual(suggestBalancePreset("https://opencode.ai/zen/go")?.id, "opencode-go");
		assert.strictEqual(suggestBalancePreset("https://opencode.ai/zen/go/v1")?.id, "opencode-go");
		assert.strictEqual(suggestBalancePreset("https://opencode.ai/zen/v1"), undefined);
	});

	test("returns nothing for an unrecognised host", () => {
		assert.strictEqual(suggestBalancePreset("https://relay.example.com/v1"), undefined);
		assert.strictEqual(suggestBalancePreset(undefined), undefined);
		assert.strictEqual(suggestBalancePreset("not a url"), undefined);
	});

	test("resolves a preset id", () => {
		assert.strictEqual(getBalancePreset("deepseek")?.id, "deepseek");
		assert.strictEqual(getBalancePreset("nope"), undefined);
		assert.strictEqual(getBalancePreset(undefined), undefined);
	});

	test("every preset has a unique id and a usable extractor", () => {
		const ids = new Set<string>();
		for (const preset of BALANCE_PRESETS) {
			assert.ok(!ids.has(preset.id), `duplicate preset id ${preset.id}`);
			ids.add(preset.id);
			assert.ok(preset.config.url.length > 0, `${preset.id} has no URL`);
			assert.ok(preset.config.extract.remaining.length > 0, `${preset.id} has no remaining expression`);
		}
	});

	test("every preset expression parses", () => {
		// A typo in an expression would otherwise only surface when a user pressed
		// Test against a live endpoint.
		for (const preset of BALANCE_PRESETS) {
			for (const [field, expression] of Object.entries(preset.config.extract)) {
				assert.doesNotThrow(
					() => parseBalanceExpression(expression),
					`${preset.id}.${field} does not parse: ${expression}`
				);
			}
		}
	});

	test("every preset has at least one pattern for suggesting it", () => {
		// Relays have no stable host, so newapi is the documented exception.
		for (const preset of BALANCE_PRESETS) {
			if (preset.id === "newapi") {
				assert.strictEqual(preset.urlPatterns.length, 0);
				continue;
			}
			assert.ok(preset.urlPatterns.length > 0, `${preset.id} can never be suggested`);
		}
	});

	test("presets read their provider's real response shape", () => {
		// Guards the field names and the unit conversions. Adding a preset without a
		// sample here fails the test on purpose.
		const samples: Record<string, { body: unknown; remaining: number }> = {
			deepseek: {
				body: { balance_infos: [{ currency: "CNY", total_balance: "128.50" }] },
				remaining: 128.5,
			},
			siliconflow: {
				// totalBalance is the granted credit plus the topped-up amount.
				body: { data: { balance: "10.00", chargeBalance: "100.00", totalBalance: "110.00" } },
				remaining: 110,
			},
			"siliconflow-en": {
				body: { data: { balance: "1.00", chargeBalance: "9.00", totalBalance: "10.00" } },
				remaining: 10,
			},
			openrouter: {
				body: { data: { total_credits: 20, total_usage: 7.5 } },
				remaining: 12.5,
			},
			stepfun: {
				body: { balance: "42.50", total_cash_balance: "40.00", total_voucher_balance: "2.50" },
				remaining: 42.5,
			},
			novita: {
				// The endpoint reports 0.0001 USD units.
				body: { availableBalance: 123456, cashBalance: 100000, creditLimit: 0 },
				remaining: 12.3456,
			},
			newapi: {
				body: { data: { quota: 2500000, used_quota: 1000000, group: "default" } },
				remaining: 5,
			},
			kimi: {
				body: { usage: { limit: 100, remaining: 25, resetTime: "2026-08-31T00:00:00Z" } },
				remaining: 25,
			},
			zhipu: {
				// unit 3 is the 5-hour window, unit 6 the weekly one. The order is not
				// promised, so the weekly entry deliberately comes first here.
				body: {
					data: {
						level: "max",
						limits: [
							{ type: "TOKENS_LIMIT", unit: 6, number: 7, percentage: 42 },
							{ type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 1 },
						],
					},
				},
				remaining: 99,
			},
			minimax: {
				body: {
					model_remains: [
						{ model_name: "video", current_interval_remaining_percent: 100 },
						{ model_name: "general", current_interval_remaining_percent: 98 },
					],
				},
				remaining: 98,
			},
			"opencode-go": {
				body: { usage: { rolling: { percent: 37 }, weekly: { percent: 62 } } },
				remaining: 63,
			},
		};
		for (const preset of BALANCE_PRESETS) {
			const sample = samples[preset.id];
			assert.ok(sample, `${preset.id} needs a sample response in this test`);
			assert.strictEqual(
				evaluateBalanceNumber(preset.config.extract.remaining, sample.body),
				sample.remaining,
				`${preset.id} read the wrong value`
			);
		}
	});
});

suite("balance config resolution", () => {
	test("fills missing fields from the selected preset", () => {
		const resolved = resolveBalanceConfig({ preset: "deepseek" });
		assert.strictEqual(resolved.url, "{{baseUrl}}/user/balance");
		assert.strictEqual(resolved.auth, "bearer");
		assert.strictEqual(resolved.extract?.remaining, "balance_infos[0].total_balance");
	});

	test("lets explicit values win over the preset", () => {
		const resolved = resolveBalanceConfig({
			preset: "deepseek",
			url: "https://relay.example.com/balance",
			method: "POST",
			extract: { remaining: "data.left" },
		});
		assert.strictEqual(resolved.url, "https://relay.example.com/balance");
		assert.strictEqual(resolved.method, "POST");
		assert.strictEqual(resolved.extract?.remaining, "data.left");
		// Untouched preset fields survive.
		assert.strictEqual(resolved.extract?.unit, "balance_infos[0].currency");
	});

	test("merges preset headers with user headers", () => {
		const resolved = resolveBalanceConfig({
			preset: "newapi",
			headers: { "X-Custom": "1" },
		});
		assert.strictEqual(resolved.headers?.["New-Api-User"], "1");
		assert.strictEqual(resolved.headers?.["X-Custom"], "1");
	});

	test("leaves a config without a preset alone", () => {
		const config: ProviderBalanceConfig = { url: "https://example.com/balance" };
		assert.deepStrictEqual(resolveBalanceConfig(config), config);
	});
});

suite("balance URL resolution", () => {
	test("substitutes the base URL and origin placeholders", () => {
		assert.strictEqual(
			resolveBalanceUrl("{{baseUrl}}/user/balance", "https://api.deepseek.com/v1", "sk-1"),
			"https://api.deepseek.com/v1/user/balance"
		);
		assert.strictEqual(
			resolveBalanceUrl("{{origin}}/api/user/self", "https://relay.example.com/v1", "sk-1"),
			"https://relay.example.com/api/user/self"
		);
	});

	test("does not double up slashes", () => {
		assert.strictEqual(
			resolveBalanceUrl("{{baseUrl}}/user/balance", "https://api.deepseek.com/v1/", "sk-1"),
			"https://api.deepseek.com/v1/user/balance"
		);
	});

	test("treats a relative URL as relative to the base URL", () => {
		assert.strictEqual(
			resolveBalanceUrl("user/balance", "https://api.deepseek.com/v1", "sk-1"),
			"https://api.deepseek.com/v1/user/balance"
		);
	});

	test("accepts an absolute URL", () => {
		assert.strictEqual(
			resolveBalanceUrl("https://billing.example.com/me", "https://api.deepseek.com/v1", "sk-1"),
			"https://billing.example.com/me"
		);
	});

	test("substitutes the API key placeholder", () => {
		assert.strictEqual(
			resolveBalanceUrl("https://relay.example.com/balance?key={{apiKey}}", "https://x.test/v1", "sk-abc"),
			"https://relay.example.com/balance?key=sk-abc"
		);
	});

	test("refuses non-http schemes and unusable input", () => {
		assert.strictEqual(resolveBalanceUrl("file:///etc/passwd", "https://x.test/v1", "k"), undefined);
		assert.strictEqual(resolveBalanceUrl("javascript:alert(1)", "https://x.test/v1", "k"), undefined);
		assert.strictEqual(resolveBalanceUrl("", "https://x.test/v1", "k"), undefined);
		assert.strictEqual(resolveBalanceUrl("user/balance", undefined, "k"), undefined);
	});
});

suite("balance queries", () => {
	const config: ProviderBalanceConfig = {
		preset: "deepseek",
		enabled: true,
	};

	test("returns a parsed result on success", async () => {
		const outcome = await queryProviderBalance({
			config,
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "sk-test",
			fetchImpl: async (input, init) => {
				assert.strictEqual(String(input), "https://api.deepseek.com/v1/user/balance");
				assert.strictEqual(new Headers(init?.headers).get("authorization"), "Bearer sk-test");
				return jsonResponse({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "12.34" }] });
			},
		});
		assert.strictEqual(outcome.ok, true);
		if (outcome.ok) {
			assert.strictEqual(outcome.result.remaining, 12.34);
			assert.strictEqual(outcome.result.unit, "CNY");
			assert.strictEqual(outcome.result.requestUrl, "https://api.deepseek.com/v1/user/balance");
		}
	});

	test("treats a 5xx as transient so the last known value can be kept", async () => {
		const outcome = await queryProviderBalance({
			config,
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "sk-test",
			fetchImpl: async () => jsonResponse({ error: "boom" }, 503),
		});
		assert.strictEqual(outcome.ok, false);
		if (!outcome.ok) {
			assert.strictEqual(outcome.failure.transient, true);
		}
	});

	test("treats a network error as transient", async () => {
		const outcome = await queryProviderBalance({
			config,
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "sk-test",
			fetchImpl: async () => {
				throw new Error("ECONNREFUSED");
			},
		});
		assert.strictEqual(outcome.ok, false);
		if (!outcome.ok) {
			assert.strictEqual(outcome.failure.transient, true);
		}
	});

	test("treats an auth failure as deterministic", async () => {
		const outcome = await queryProviderBalance({
			config,
			baseUrl: "https://api.deepseek.com/v1",
			apiKey: "sk-test",
			fetchImpl: async () => jsonResponse({ error: { message: "Invalid API key" } }, 401),
		});
		assert.strictEqual(outcome.ok, false);
		if (!outcome.ok) {
			assert.strictEqual(outcome.failure.transient, false);
			assert.match(outcome.failure.message, /401/);
		}
	});

	test("fails without a request when the URL cannot be resolved", async () => {
		let called = false;
		const outcome = await queryProviderBalance({
			config: { url: "user/balance" },
			baseUrl: undefined,
			apiKey: "sk-test",
			fetchImpl: async () => {
				called = true;
				return jsonResponse({});
			},
		});
		assert.strictEqual(called, false);
		assert.strictEqual(outcome.ok, false);
		if (!outcome.ok) {
			assert.strictEqual(outcome.failure.transient, false);
		}
	});

	test("reports an extractor that finds nothing instead of guessing", async () => {
		const outcome = await queryProviderBalance({
			config: { url: "https://api.deepseek.com/user/balance", extract: { remaining: "data.missing" } },
			baseUrl: undefined,
			apiKey: "sk-test",
			fetchImpl: async () => jsonResponse({ data: {} }),
		});
		assert.strictEqual(outcome.ok, false);
		if (!outcome.ok) {
			assert.strictEqual(outcome.failure.transient, false);
		}
	});

	test("does not send an Authorization header when auth is none", async () => {
		let seenAuth: string | null = "not called";
		const outcome = await queryProviderBalance({
			config: { url: "https://relay.example.com/balance", auth: "none", extract: { remaining: "left" } },
			baseUrl: undefined,
			apiKey: "sk-test",
			fetchImpl: async (_input, init) => {
				seenAuth = new Headers(init?.headers).get("authorization");
				return jsonResponse({ left: 5 });
			},
		});
		assert.strictEqual(seenAuth, null);
		assert.strictEqual(outcome.ok, true, JSON.stringify(outcome));
	});
});

suite("balance formatting", () => {
	test("formats amounts by magnitude", () => {
		assert.strictEqual(formatBalanceAmount(0), "0");
		assert.strictEqual(formatBalanceAmount(0.00123), "0.00123");
		assert.strictEqual(formatBalanceAmount(1.5), "1.50");
		assert.strictEqual(formatBalanceAmount(1234.5).startsWith("1"), true);
	});

	test("appends the unit when there is one", () => {
		assert.strictEqual(formatBalanceValue(1.5, "USD"), "1.50 USD");
		assert.strictEqual(formatBalanceValue(1.5), "1.50");
	});

	test("grades severity from the remaining share of the total", () => {
		assert.strictEqual(getBalanceSeverity({ remaining: 5, total: 100 }), "critical");
		assert.strictEqual(getBalanceSeverity({ remaining: 20, total: 100 }), "warning");
		assert.strictEqual(getBalanceSeverity({ remaining: 80, total: 100 }), "ok");
		assert.strictEqual(getBalanceSeverity({ remaining: 5 }), "unknown");
		assert.strictEqual(getBalanceSeverity(undefined), "unknown");
	});
});

suite("balance config normalisation", () => {
	test("trims strings and drops empty ones", () => {
		const normalized = normalizeProviderBalance({
			enabled: true,
			preset: "  deepseek  ",
			url: "   ",
			method: " get ",
			extract: { remaining: "  data.left  ", unit: "" },
		});
		assert.strictEqual(normalized?.preset, "deepseek");
		assert.strictEqual(normalized?.method, "GET");
		assert.strictEqual(normalized?.url, undefined);
		assert.strictEqual(normalized?.extract?.remaining, "data.left");
		assert.strictEqual(normalized?.extract?.unit, undefined);
	});

	test("keeps enabled only when it is explicitly true", () => {
		assert.strictEqual(normalizeProviderBalance({ enabled: true, url: "https://x.test/b" })?.enabled, true);
		assert.strictEqual(normalizeProviderBalance({ url: "https://x.test/b" })?.enabled, undefined);
		assert.strictEqual(normalizeProviderBalance({ enabled: false, url: "https://x.test/b" })?.enabled, undefined);
	});

	test("keeps a saved query that is switched off", () => {
		// The configuration UI tells "saved but off" apart from "never configured"
		// by looking for a stored config without `enabled`, so an off query has to
		// survive normalisation instead of being dropped.
		const provider = createProviderConfiguration("opencode", {
			baseUrl: "https://opencode.ai/zen/go/v1",
			apiMode: "openai",
			balance: { preset: "opencode-go", url: "https://opencode.ai/zen/go/v1/usage", auth: "bearer" },
		});
		assert.notStrictEqual(provider.balance, undefined);
		assert.strictEqual(provider.balance?.enabled, undefined);
		assert.strictEqual(provider.balance?.preset, "opencode-go");
		assert.strictEqual(provider.balance?.url, "https://opencode.ai/zen/go/v1/usage");
	});

	test("drops non-positive numbers", () => {
		const normalized = normalizeProviderBalance({
			url: "https://x.test/b",
			timeoutMs: -1,
			intervalMinutes: 0,
		});
		assert.strictEqual(normalized?.timeoutMs, undefined);
		assert.strictEqual(normalized?.intervalMinutes, undefined);
	});

	test("returns undefined when nothing is left", () => {
		assert.strictEqual(normalizeProviderBalance(undefined), undefined);
		assert.strictEqual(normalizeProviderBalance({}), undefined);
		assert.strictEqual(normalizeProviderBalance({ enabled: false }), undefined);
		assert.strictEqual(normalizeProviderBalance("nonsense"), undefined);
	});

	test("survives a round-trip through a provider record", () => {
		const provider = createProviderConfiguration("deepseek", {
			baseUrl: "https://api.deepseek.com/v1",
			apiMode: "openai",
			balance: { enabled: true, preset: "deepseek" },
		});
		assert.strictEqual(provider.balance?.enabled, true);

		// Saving any model rewrites the whole collection, so the config must survive normalisation.
		const normalized = normalizeConfiguredModel(provider);
		assert.strictEqual(normalized.balance?.enabled, true);
		assert.strictEqual(normalized.balance?.preset, "deepseek");
	});

	test("never lands on a real model record", () => {
		const model = normalizeConfiguredModel({
			id: "gpt-5",
			owned_by: "deepseek",
			balance: { enabled: true, preset: "deepseek" },
		});
		assert.strictEqual(model.balance, undefined);
	});
});
