import * as assert from "assert";
import * as vscode from "vscode";

import { computeSessionId } from "../sessionId";

/**
 * Role value VS Code uses for the system prompt in the chat provider API. The
 * published `LanguageModelChatMessageRole` enum only declares `User` and
 * `Assistant`, so the value is spelled out here.
 */
const SYSTEM_ROLE = 3;

const USER_ROLE = vscode.LanguageModelChatMessageRole.User as unknown as number;
const ASSISTANT_ROLE = vscode.LanguageModelChatMessageRole.Assistant as unknown as number;

const SYSTEM_PROMPT = "You are an AI assistant. ".repeat(50);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function message(role: number, text: string): vscode.LanguageModelChatRequestMessage {
	return {
		role,
		content: [new vscode.LanguageModelTextPart(text)],
	} as unknown as vscode.LanguageModelChatRequestMessage;
}

suite("sessionId", () => {
	test("returns undefined when the request carries no user text", () => {
		assert.strictEqual(computeSessionId([]), undefined);
		assert.strictEqual(computeSessionId([message(ASSISTANT_ROLE, "hi")]), undefined);
		assert.strictEqual(computeSessionId([message(USER_ROLE, "   ")]), undefined);
	});

	test("returns a UUID-shaped id", () => {
		const id = computeSessionId([message(USER_ROLE, "first question")]);
		assert.ok(id);
		assert.match(id, UUID_PATTERN);
	});

	test("differs between conversations", () => {
		assert.notStrictEqual(
			computeSessionId([message(USER_ROLE, "question a")]),
			computeSessionId([message(USER_ROLE, "question b")])
		);
	});

	test("ignores a dedicated system-role message", () => {
		const conversation = [message(SYSTEM_ROLE, SYSTEM_PROMPT), message(USER_ROLE, "first question")];
		assert.strictEqual(computeSessionId(conversation), computeSessionId([message(USER_ROLE, "first question")]));
	});

	test("skips a leading user-role system prompt", () => {
		const conversation = [message(USER_ROLE, SYSTEM_PROMPT), message(USER_ROLE, "first question")];
		assert.strictEqual(computeSessionId(conversation), computeSessionId([message(USER_ROLE, "first question")]));
	});

	test("stays stable as a conversation with a system-role prompt grows", () => {
		const system = message(SYSTEM_ROLE, SYSTEM_PROMPT);
		const turns = [
			[system, message(USER_ROLE, "first question")],
			[
				system,
				message(USER_ROLE, "first question"),
				message(ASSISTANT_ROLE, "first answer"),
				message(USER_ROLE, "second question"),
			],
			[
				system,
				message(USER_ROLE, "first question"),
				message(ASSISTANT_ROLE, "first answer"),
				message(USER_ROLE, "second question"),
				message(ASSISTANT_ROLE, "second answer"),
				message(USER_ROLE, "third question"),
			],
		];
		const ids = turns.map((messages) => computeSessionId(messages));
		assert.ok(ids[0]);
		assert.deepStrictEqual(ids, [ids[0], ids[0], ids[0]]);
	});

	test("stays stable as a conversation with a leading user-role system prompt grows", () => {
		const system = message(USER_ROLE, SYSTEM_PROMPT);
		const turns = [
			[system, message(USER_ROLE, "first question")],
			[
				system,
				message(USER_ROLE, "first question"),
				message(ASSISTANT_ROLE, "first answer"),
				message(USER_ROLE, "second question"),
			],
		];
		const ids = turns.map((messages) => computeSessionId(messages));
		assert.ok(ids[0]);
		assert.deepStrictEqual(ids, [ids[0], ids[0]]);
	});

	test("stays stable as a conversation without a system prompt grows", () => {
		const turns = [
			[message(USER_ROLE, "first question")],
			[
				message(USER_ROLE, "first question"),
				message(ASSISTANT_ROLE, "first answer"),
				message(USER_ROLE, "second question"),
			],
		];
		const ids = turns.map((messages) => computeSessionId(messages));
		assert.ok(ids[0]);
		assert.deepStrictEqual(ids, [ids[0], ids[0]]);
	});
});
