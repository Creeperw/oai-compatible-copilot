import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { format, getMessages, LOCALES, MESSAGES, resolveLocale, translate } from "../i18n";
import { BALANCE_PRESETS } from "../balance/presets";
import type { MessageKey } from "../i18n";

/**
 * The project root, derived from the compiled test location (`out/test/`).
 *
 * The tests read the sources rather than a copy, so a string that is added to
 * the UI without a message fails here instead of showing up as a raw key.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const HTML_PATH = path.join(ROOT, "assets", "configView", "configView.html");
const WEBVIEW_JS_PATH = path.join(ROOT, "assets", "configView", "configView.js");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const NLS_EN_PATH = path.join(ROOT, "package.nls.json");
const NLS_ZH_PATH = path.join(ROOT, "package.nls.zh-cn.json");

const HTML = fs.readFileSync(HTML_PATH, "utf8");
const WEBVIEW_JS = fs.readFileSync(WEBVIEW_JS_PATH, "utf8");

function keysIn(source: string, pattern: RegExp): string[] {
	return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** Every TypeScript file below `dir`, so a rule can be checked against the sources. */
function walk(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			return walk(full);
		}
		return entry.name.endsWith(".ts") ? [full] : [];
	});
}

/** The `...(...)` call starting at `start`, up to its balanced closing parenthesis. */
function callTextAt(source: string, start: number): string {
	let depth = 0;
	for (let index = start; index < source.length; index++) {
		if (source[index] === "(") {
			depth++;
		} else if (source[index] === ")") {
			depth--;
			if (depth === 0) {
				return source.slice(start, index + 1);
			}
		}
	}
	return source.slice(start);
}

suite("i18n locale resolution", () => {
	test("follows the VS Code display language by default", () => {
		assert.strictEqual(resolveLocale("auto", "zh-cn"), "zh-CN");
		assert.strictEqual(resolveLocale("auto", "en"), "en");
		assert.strictEqual(resolveLocale("auto", "de"), "en");
		assert.strictEqual(resolveLocale(undefined, "zh-cn"), "zh-CN");
		assert.strictEqual(resolveLocale("", "zh-tw"), "zh-CN");
	});

	test("treats every Chinese variant as Simplified", () => {
		// Only a Simplified catalogue exists, so a Traditional user is better
		// served by Simplified than by falling back to English.
		assert.strictEqual(resolveLocale("auto", "zh-tw"), "zh-CN");
		assert.strictEqual(resolveLocale("auto", "zh-hk"), "zh-CN");
		assert.strictEqual(resolveLocale("auto", "ZH-CN"), "zh-CN");
	});

	test("an explicit choice wins over the display language", () => {
		assert.strictEqual(resolveLocale("en", "zh-cn"), "en");
		assert.strictEqual(resolveLocale("zh-CN", "en"), "zh-CN");
	});

	test("ignores a value that is not a known language", () => {
		assert.strictEqual(resolveLocale("klingon", "zh-cn"), "zh-CN");
		assert.strictEqual(resolveLocale("  ", "en"), "en");
	});
});

suite("i18n messages", () => {
	test("fills placeholders by index", () => {
		assert.strictEqual(format("{0} / {1}", ["a", "b"]), "a / b");
		assert.strictEqual(format("{1} then {0}", ["a", "b"]), "b then a");
		assert.strictEqual(format("no placeholders", []), "no placeholders");
	});

	test("leaves an unfilled placeholder alone rather than printing undefined", () => {
		assert.strictEqual(format("{0} and {1}", ["only"]), "only and {1}");
	});

	test("translates through the catalogue", () => {
		assert.strictEqual(translate("en", "common.save"), "Save");
		assert.strictEqual(translate("zh-CN", "common.save"), "保存");
		assert.strictEqual(translate("zh-CN", "host.providerAdded", "deepseek"), "已添加供应商 deepseek。");
	});

	test("every language covers every key", () => {
		const english = Object.keys(MESSAGES.en).sort();
		for (const locale of LOCALES) {
			assert.deepStrictEqual(
				Object.keys(MESSAGES[locale.id]).sort(),
				english,
				`${locale.id} does not cover the same keys as English`
			);
		}
	});

	test("no message is left empty", () => {
		for (const locale of LOCALES) {
			for (const [key, value] of Object.entries(MESSAGES[locale.id])) {
				assert.ok(value.trim().length > 0, `${locale.id} has an empty message for ${key}`);
			}
		}
	});

	test("every message key is namespaced", () => {
		for (const key of Object.keys(MESSAGES.en)) {
			assert.ok(/^[a-z][a-zA-Z]*\.[a-zA-Z0-9.-]+$/.test(key), `"${key}" is not namespaced`);
		}
	});

	test("only the known strings are identical in both languages", () => {
		// Product names, HTTP verbs and sample JSON are deliberately shared, so
		// the check is a whitelist rather than "nothing may match".
		const allowed = new Set([
			// Product names.
			"preset.deepseek.label",
			"preset.openrouter.label",
			"preset.stepfun.label",
			"preset.novita.label",
			"preset.kimi.label",
			"preset.opencode-go.label",
			// Protocol vocabulary, written the same way in both languages.
			"providers.placeholderSessionId",
			"models.columnTopP",
			"modelForm.topPLabel",
			"advanced.topKLabel",
			"advanced.minPLabel",
			"balance.authBearer",
		]);
		const identical = Object.keys(MESSAGES.en).filter(
			(key) => MESSAGES.en[key as MessageKey] === MESSAGES["zh-CN"][key as MessageKey]
		);
		const unexpected = identical.filter((key) => !allowed.has(key));
		assert.deepStrictEqual(unexpected, [], "these messages were never translated");
	});
});

suite("configuration UI translations", () => {
	test("every tagged element has a message", () => {
		const keys = keysIn(HTML, /data-i18n(?:-html|-placeholder|-title)?="([^"]+)"/g);
		assert.ok(keys.length > 150, `expected the markup to be tagged, found ${keys.length}`);
		const missing = keys.filter((key) => !(key in MESSAGES.en));
		assert.deepStrictEqual(missing, [], "the markup references messages that do not exist");
	});

	test("every message the webview asks for exists", () => {
		const keys = keysIn(WEBVIEW_JS, /\bt\("([^"]+)"/g);
		assert.ok(keys.length > 20, `expected translation calls, found ${keys.length}`);
		const missing = keys.filter((key) => !(key in MESSAGES.en));
		assert.deepStrictEqual(missing, [], "the webview asks for messages that do not exist");
	});

	test("no message is defined but never used", () => {
		// A stale message is a translation that silently stops being applied.
		const htmlKeys = new Set(keysIn(HTML, /data-i18n(?:-html|-placeholder|-title)?="([^"]+)"/g));
		const jsKeys = new Set(keysIn(WEBVIEW_JS, /\bt\("([^"]+)"/g));
		// `parseJsonObject` takes the key of the field it is parsing rather than a
		// translated label, so those keys never appear in a `t(...)` call.
		for (const key of keysIn(WEBVIEW_JS, /parseJsonObject\([^;]*?"([a-zA-Z][a-zA-Z0-9.-]*\.[a-zA-Z0-9.-]+)"\s*\)/g)) {
			jsKeys.add(key);
		}
		const hostKeys = new Set(
			keysIn(fs.readFileSync(path.join(ROOT, "src", "views", "configView.ts"), "utf8"), /\bt\("([^"]+)"/g)
		);
		const dynamic = (key: string) =>
			key.startsWith("preset.") ||
			key.startsWith("host.") ||
			// Reached through a variable rather than a literal call.
			["common.yes", "common.no", "common.export"].includes(key);
		const unused = Object.keys(MESSAGES.en).filter(
			(key) => !htmlKeys.has(key) && !jsKeys.has(key) && !hostKeys.has(key) && !dynamic(key)
		);
		assert.deepStrictEqual(unused, [], "these messages are never shown");
	});

	test("every preset is translated", () => {
		for (const preset of BALANCE_PRESETS) {
			for (const field of ["label", "description", "hint"]) {
				const key = `preset.${preset.id}.${field}`;
				assert.ok(key in MESSAGES.en, `missing ${key}`);
				assert.ok(key in MESSAGES["zh-CN"], `missing ${key}`);
			}
		}
	});

	test("a dialog result is never compared against a hardcoded label", () => {
		// A confirmation button is labelled with t(...), so what the API returns is a
		// translated string. Comparing it with a literal is correct only in the
		// language the literal was written in: `confirmed === "Yes"` silently turned
		// every Chinese confirmation into a cancellation, and the only visible symptom
		// was that deleting a model did nothing.
		//
		// A literal is legitimate when it is one of the labels of the very dialog the
		// value came from, because then the two always agree.
		const offenders: string[] = [];
		const assignment = /(?:const|let)\s+(\w+)\s*=\s*await\s+vscode\.window\.show(?:Information|Warning|Error)Message/g;
		for (const file of walk(path.join(ROOT, "src"))) {
			if (file.includes(`${path.sep}test${path.sep}`)) {
				continue;
			}
			const source = fs.readFileSync(file, "utf8");
			for (const match of source.matchAll(assignment)) {
				const variable = match[1];
				const labels = new Set(keysIn(callTextAt(source, match.index), /"([^"]*)"/g));
				const compared = new RegExp(`\\b${variable}\\s*[!=]==?\\s*"([^"]*)"`, "g");
				for (const [, literal] of source.matchAll(compared)) {
					if (!labels.has(literal)) {
						offenders.push(`${path.relative(ROOT, file)}: ${variable} compared with "${literal}"`);
					}
				}
			}
		}
		assert.deepStrictEqual(offenders, [], "a localised dialog result is compared against a literal");
	});

	test("the markup keeps its English text as the default", () => {
		// The HTML is readable on its own and still renders correctly if the
		// catalogue ever fails to arrive.
		const english = getMessages("en");
		const mismatched: string[] = [];
		for (const match of HTML.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]+)</g)) {
			const [, key, text] = match;
			const expected = english[key as MessageKey];
			if (expected === undefined) {
				continue;
			}
			const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
			if (normalize(text) !== normalize(expected)) {
				mismatched.push(`${key}: markup has "${normalize(text)}", catalogue has "${normalize(expected)}"`);
			}
		}
		assert.deepStrictEqual(mismatched, [], "the markup drifted from the English catalogue");
	});
});

suite("manifest translations", () => {
	const nlsEn = JSON.parse(fs.readFileSync(NLS_EN_PATH, "utf8")) as Record<string, string>;
	const nlsZh = JSON.parse(fs.readFileSync(NLS_ZH_PATH, "utf8")) as Record<string, string>;
	const pkg = fs.readFileSync(PACKAGE_PATH, "utf8");

	test("both languages cover the same keys", () => {
		assert.deepStrictEqual(Object.keys(nlsZh).sort(), Object.keys(nlsEn).sort());
	});

	test("every placeholder in package.json resolves", () => {
		const referenced = keysIn(pkg, /%([a-zA-Z0-9._]+)%/g);
		assert.ok(referenced.length > 15, `expected placeholders, found ${referenced.length}`);
		const missing = referenced.filter((key) => !(key in nlsEn));
		assert.deepStrictEqual(missing, [], "package.json references messages that do not exist");
	});

	test("the manifest placeholders are used, not defined for nothing", () => {
		const referenced = new Set(keysIn(pkg, /%([a-zA-Z0-9._]+)%/g));
		const unused = Object.keys(nlsEn).filter((key) => !referenced.has(key));
		assert.deepStrictEqual(unused, [], "these manifest messages are never used");
	});

	test("Chinese covers everything English does, apart from product names", () => {
		const allowed = new Set(["config.oaicopilot.language.en", "config.oaicopilot.language.zhCN"]);
		const identical = Object.keys(nlsEn).filter((key) => nlsEn[key] === nlsZh[key] && !allowed.has(key));
		assert.deepStrictEqual(identical, [], "these manifest messages were never translated");
	});
});
