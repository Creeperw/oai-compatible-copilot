import type * as vscode from "vscode";
import type { HFModelItem } from "./types";

export type ReasoningEffortPickerValue = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const REASONING_EFFORT_VALUES: readonly ReasoningEffortPickerValue[] = [
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
];

export const REASONING_EFFORT_CONFIGURATION_SCHEMA = {
	properties: {
		reasoningEffort: {
			type: "string",
			title: "Reasoning Effort",
			enum: REASONING_EFFORT_VALUES,
			enumItemLabels: ["Minimal", "Low", "Medium", "High", "XHigh", "Max"],
			enumDescriptions: [
				"Smallest reasoning budget",
				"Low reasoning budget",
				"Balanced reasoning budget",
				"High reasoning budget",
				"Very high reasoning budget",
				"Maximum reasoning budget",
			],
			default: "medium",
			group: "navigation",
		},
	},
} as const;

export function createReasoningEffortConfigurationSchema(defaultValue: ReasoningEffortPickerValue) {
	return {
		properties: {
			reasoningEffort: {
				...REASONING_EFFORT_CONFIGURATION_SCHEMA.properties.reasoningEffort,
				default: defaultValue,
			},
		},
	} as const;
}

export type ModelConfigurationOptions = vscode.ProvideLanguageModelChatResponseOptions & {
	readonly modelConfiguration?: Record<string, unknown>;
	readonly configuration?: Record<string, unknown>;
};

export type ModelPickerChatInformation = vscode.LanguageModelChatInformation & {
	readonly isUserSelectable?: boolean;
	readonly detail?: string;
	readonly tooltip?: string;
	readonly configurationSchema?: ReturnType<typeof createReasoningEffortConfigurationSchema>;
};

export function isReasoningEffortPickerEnabled(
	model: HFModelItem | undefined
): model is HFModelItem & { reasoning_effort: ReasoningEffortPickerValue } {
	return isReasoningEffortValue(model?.reasoning_effort);
}

export function getConfiguredReasoningEffort(
	options: vscode.ProvideLanguageModelChatResponseOptions | undefined,
	fallback: ReasoningEffortPickerValue = "medium"
): ReasoningEffortPickerValue {
	const modelOptions = options as ModelConfigurationOptions | undefined;
	const configuredEffort =
		modelOptions?.modelConfiguration?.reasoningEffort ?? modelOptions?.configuration?.reasoningEffort;

	if (isReasoningEffortValue(configuredEffort)) {
		return configuredEffort;
	}
	return fallback;
}

export function isReasoningEffortValue(value: unknown): value is ReasoningEffortPickerValue {
	return typeof value === "string" && REASONING_EFFORT_VALUES.includes(value as ReasoningEffortPickerValue);
}

/** Numeric model fields the batch editor is allowed to write. */
const BATCH_NUMBER_FIELDS = [
	"context_length",
	"max_tokens",
	"max_completion_tokens",
	"temperature",
	"top_p",
	"top_k",
	"min_p",
	"frequency_penalty",
	"presence_penalty",
	"repetition_penalty",
	"thinking_budget",
	"delay",
];

/** Boolean model fields the batch editor is allowed to write. */
const BATCH_BOOLEAN_FIELDS = ["vision", "enable_thinking"];

/**
 * Accept only the fields a bulk edit is allowed to write.
 *
 * The panel sends a partial model, so without this an arbitrary key could be written
 * into a model record and then handed to the provider on every request.
 */
export function validateModelPatch(patch: unknown): Record<string, unknown> {
	if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
		throw new Error("A bulk update needs a patch object.");
	}

	const validated: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
		if (key === "reasoning_effort") {
			if (!isReasoningEffortValue(value)) {
				throw new Error(`Unsupported reasoning effort: ${String(value)}`);
			}
		} else if (BATCH_BOOLEAN_FIELDS.includes(key)) {
			if (typeof value !== "boolean") {
				throw new Error(`${key} must be true or false.`);
			}
		} else if (BATCH_NUMBER_FIELDS.includes(key)) {
			if (typeof value !== "number" || !Number.isFinite(value)) {
				throw new Error(`${key} must be a finite number.`);
			}
		} else {
			throw new Error(`${key} cannot be set in bulk.`);
		}
		validated[key] = value;
	}
	return validated;
}
