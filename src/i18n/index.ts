import * as vscode from "vscode";
import { LOCALES, Locale, MESSAGES, MessageKey } from "./messages";

export { LOCALES, MESSAGES };
export type { Locale, MessageKey };

/** Setting that overrides the language; `auto` follows the VS Code display language. */
export const LANGUAGE_SETTING = "oaicopilot.language";

export type LanguagePreference = "auto" | Locale;

const LANGUAGE_PREFERENCES: ReadonlyArray<LanguagePreference> = ["auto", "en", "zh-CN"];

/**
 * Decide which language to display.
 *
 * Pure so it can be tested: `preference` is the stored setting and
 * `displayLanguage` is `vscode.env.language`. Any Chinese variant maps to
 * Simplified, because that is the only Chinese catalogue there is; every other
 * language falls back to English rather than showing a half-translated panel.
 */
export function resolveLocale(preference: string | undefined, displayLanguage: string | undefined): Locale {
	const normalized = (preference ?? "").trim();
	if (normalized !== "auto" && isLocale(normalized)) {
		return normalized;
	}
	return (displayLanguage ?? "").trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function isLocale(value: string): value is Locale {
	return LOCALES.some((locale) => locale.id === value);
}

/** Fill `{0}`, `{1}`, ... placeholders. */
export function format(template: string, args: ReadonlyArray<string | number>): string {
	return template.replace(/\{(\d+)\}/g, (match, index: string) => {
		const value = args[Number(index)];
		return value === undefined ? match : String(value);
	});
}

/** Translate a key, filling any placeholders. */
export function translate(locale: Locale, key: MessageKey, ...args: Array<string | number>): string {
	return format(MESSAGES[locale][key], args);
}

/** The catalogue for a language, ready to be handed to the webview. */
export function getMessages(locale: Locale): Record<MessageKey, string> {
	return MESSAGES[locale];
}

/** The language currently in effect. */
export function getLocale(config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()): Locale {
	return resolveLocale(config.get<string>(LANGUAGE_SETTING, "auto"), vscode.env.language);
}

/**
 * Translate using the language currently in effect.
 *
 * Bound to the live configuration, so a language change takes effect on the
 * next message without any of the call sites having to know about it.
 */
export function t(key: MessageKey, ...args: Array<string | number>): string {
	return translate(getLocale(), key, ...args);
}

/** Persist a language preference. */
export async function setLanguagePreference(preference: LanguagePreference): Promise<void> {
	if (!LANGUAGE_PREFERENCES.includes(preference)) {
		return;
	}
	await vscode.workspace.getConfiguration().update(LANGUAGE_SETTING, preference, vscode.ConfigurationTarget.Global);
}
