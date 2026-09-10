import * as crypto from "crypto";
import * as vscode from "vscode";

import { mapRole } from "./utils";

/**
 * Concatenate the plain-text parts of a chat message.
 *
 * @param message The message to read.
 * @returns The trimmed text of the message.
 */
function getMessageText(message: vscode.LanguageModelChatRequestMessage): string {
	let text = "";
	for (const part of message.content ?? []) {
		if (part instanceof vscode.LanguageModelTextPart) {
			text += part.value;
		}
	}
	return text.trim();
}

/**
 * Render a hex digest as a UUID-shaped string.
 *
 * A UUID shape keeps the value indistinguishable from a random identifier and
 * satisfies providers that validate the header format.
 *
 * @param digest A 32+ character hex digest.
 * @returns The digest formatted as a UUID.
 */
function toUuid(digest: string): string {
	return [
		digest.slice(0, 8),
		digest.slice(8, 12),
		digest.slice(12, 16),
		digest.slice(16, 20),
		digest.slice(20, 32),
	].join("-");
}

/**
 * Derive a stable, per-conversation session ID from a chat request.
 *
 * VS Code does not expose a conversation identifier to language model providers:
 * `ProvideLanguageModelChatResponseOptions` only carries `requestInitiator`, and
 * `LanguageModelChatMessage` has no id. The ID is therefore derived from the
 * request payload. Because VS Code always sends the full conversation history,
 * the first user turn is an anchor that stays identical for every request of one
 * conversation while differing between conversations.
 *
 * The system prompt is skipped. Depending on the VS Code version it is delivered
 * either with a dedicated `system` role or as the leading user-role message, so a
 * leading user-role message is treated as the system prompt when another
 * user-role message follows it directly.
 *
 * @param messages The messages of the request.
 * @returns A UUID-shaped session ID, or `undefined` when the request carries no
 * user text at all.
 */
export function computeSessionId(messages: readonly vscode.LanguageModelChatRequestMessage[]): string | undefined {
	const userTurns: { index: number; text: string }[] = [];
	messages.forEach((message, index) => {
		if (mapRole(message) !== "user") {
			return;
		}
		const text = getMessageText(message);
		if (text) {
			userTurns.push({ index, text });
		}
	});

	const [firstTurn, secondTurn] = userTurns;
	if (!firstTurn) {
		return undefined;
	}

	// A leading user-role message is the system prompt when it is directly followed
	// by another user-role message: a real conversation always alternates between
	// user and assistant turns.
	const leadingIsSystemPrompt = firstTurn.index === 0 && !!messages[1] && mapRole(messages[1]) === "user";
	const anchor = leadingIsSystemPrompt && secondTurn ? secondTurn.text : firstTurn.text;

	return toUuid(crypto.createHash("sha256").update(anchor, "utf8").digest("hex"));
}
