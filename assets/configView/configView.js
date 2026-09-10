const vscode = acquireVsCodeApi();
const state = {
	delay: 0,
	retry: { enabled: true, max_attempts: 3, interval_ms: 1000, status_codes: [429, 500, 502, 503, 504] },
	commitModel: "",
	models: [],
	providerKeys: {},
	providerInfo: {},
};

// Store the action to be performed after confirmation
const pendingConfirmations = new Map();
const pendingOperations = new Map();

// Global Configuration elements
const delayInput = document.getElementById("delay");
const readFileLinesInput = document.getElementById("readFileLines");
const retryEnabledInput = document.getElementById("retryEnabled");
const maxAttemptsInput = document.getElementById("maxAttempts");
const intervalMsInput = document.getElementById("intervalMs");
const statusCodesInput = document.getElementById("statusCodes");

// Provider management elements
const providerTableBody = document.getElementById("providerTableBody");
const providerErrorElement = document.getElementById("providerError");

// Model management elements
const modelTableBody = document.getElementById("modelTableBody");
const modelFormSection = document.getElementById("modelFormSection");
const modelFormTitle = document.getElementById("modelFormTitle");
const modelIdInput = document.getElementById("modelIdInput");
const modelIdDropdown = document.getElementById("modelIdDropdown");
const modelProviderInput = document.getElementById("modelProvider");
const modelDisplayNameInput = document.getElementById("modelDisplayName");
const modelConfigIdInput = document.getElementById("modelConfigId");
const modelBaseUrlInput = document.getElementById("modelBaseUrl");
const modelFamilyInput = document.getElementById("modelFamily");
const modelContextLengthInput = document.getElementById("modelContextLength");
const modelMaxTokensInput = document.getElementById("modelMaxTokens");
const modelVisionInput = document.getElementById("modelVision");
const modelApiModeInput = document.getElementById("modelApiMode");
const modelTemperatureInput = document.getElementById("modelTemperature");
const modelTopPInput = document.getElementById("modelTopP");
const modelDelayInput = document.getElementById("modelDelay");
const modelTopKInput = document.getElementById("modelTopK");
const modelMinPInput = document.getElementById("modelMinP");
const modelFrequencyPenaltyInput = document.getElementById("modelFrequencyPenalty");
const modelPresencePenaltyInput = document.getElementById("modelPresencePenalty");
const modelRepetitionPenaltyInput = document.getElementById("modelRepetitionPenalty");
const modelReasoningEffortInput = document.getElementById("modelReasoningEffort");
const modelEnableThinkingInput = document.getElementById("modelEnableThinking");
const modelThinkingBudgetInput = document.getElementById("modelThinkingBudget");
const modelIncludeReasoningInput = document.getElementById("modelIncludeReasoning");
const modelMaxCompletionTokensInput = document.getElementById("modelMaxCompletionTokens");
const modelReasoningEnabledInput = document.getElementById("modelReasoningEnabled");
const modelReasoningExcludeInput = document.getElementById("modelReasoningExclude");
const modelReasoningEffortORInput = document.getElementById("modelReasoningEffortOR");
const modelReasoningMaxTokensInput = document.getElementById("modelReasoningMaxTokens");
const modelThinkingTypeInput = document.getElementById("modelThinkingType");
const modelHeadersInput = document.getElementById("modelHeaders");
const modelExtraInput = document.getElementById("modelExtra");
const saveModelBtn = document.getElementById("saveModel");
const cancelModelBtn = document.getElementById("cancelModel");
const toggleAdvancedSettingsBtn = document.getElementById("toggleAdvancedSettings");
const commitModelInput = document.getElementById("commitModel");
const commitLanguageInput = document.getElementById("commitLanguage");
const advancedSettingsContent = document.getElementById("advancedSettingsContent");

// Error message element
const modelErrorElement = document.getElementById("modelError");

// Dropdown elements
const dropdownContent = modelIdDropdown.querySelector(".dropdown-content");
const dropdownHeader = modelIdDropdown.querySelector(".dropdown-header");

function createOperationId(prefix) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function postOperation(message, onSuccess, onError) {
	const requestId = createOperationId(message.type);
	const timeout = setTimeout(() => {
		const pending = pendingOperations.get(requestId);
		if (pending) {
			pendingOperations.delete(requestId);
			pending.onError?.("The operation timed out. Refresh the configuration and try again.");
		}
	}, 15000);
	pendingOperations.set(requestId, { onSuccess, onError, timeout });
	vscode.postMessage({ ...message, requestId });
}

function showProviderError(message) {
	if (providerErrorElement) {
		providerErrorElement.textContent = message;
		providerErrorElement.style.display = message ? "block" : "none";
	}
}

function parseJsonObject(value, label) {
	if (!value || value.trim() === "") {
		return { ok: true, value: undefined };
	}
	try {
		const parsed = JSON.parse(value.trim());
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { ok: false, error: `${label} must be a JSON object.` };
		}
		return { ok: true, value: parsed };
	} catch (error) {
		return { ok: false, error: `${label} is invalid JSON: ${error.message}` };
	}
}

// Global Configuration save button event listener
document.getElementById("saveBase").addEventListener("click", () => {
	const retry = {
		enabled: retryEnabledInput.checked,
		max_attempts: parseInt(maxAttemptsInput.value) || 3,
		interval_ms: parseInt(intervalMsInput.value) || 1000,
		status_codes: statusCodesInput.value
			? statusCodesInput.value
					.split(",")
					.map((s) => parseInt(s.trim()))
					.filter((n) => !isNaN(n))
			: [],
	};

	postOperation(
		{
			type: "saveGlobalConfig",
			delay: parseInt(delayInput.value) || 0,
			readFileLines: parseInt(readFileLinesInput.value) || 0,
			retry: retry,
			commitModel: commitModelInput.value,
			commitLanguage: commitLanguageInput.value,
		},
		() => undefined,
		showProviderError
	);
});

const handleRefresh = () => {
	// Hide the model form if it's visible
	if (modelFormSection.style.display !== "none") {
		modelFormSection.style.display = "none";
		resetModelForm();
	}
	vscode.postMessage({ type: "requestInit" });
};

// Export and Import buttons event listeners
document.getElementById("exportConfig").addEventListener("click", () => {
	vscode.postMessage({ type: "exportConfig" });
});

document.getElementById("importConfig").addEventListener("click", () => {
	postOperation({ type: "importConfig" }, () => undefined, showProviderError);
});

// Refresh buttons event listeners
document.getElementById("refreshGlobalConfig").addEventListener("click", handleRefresh);
document.getElementById("refreshProviders").addEventListener("click", handleRefresh);
document.getElementById("refreshModels").addEventListener("click", handleRefresh);

// Add Provider button event listener
document.getElementById("addProvider").addEventListener("click", () => {
	// Add new provider row to the table
	const newRow = document.createElement("tr");
	for (const input of [
		createProviderInput("input", "provider", "", { type: "text", placeholder: "Provider ID" }),
		createProviderInput("input", "baseUrl", "", { type: "text", placeholder: "Base URL" }),
		createProviderInput("input", "apiKey", "", { type: "password", placeholder: "API Key" }),
	]) {
		const cell = document.createElement("td");
		cell.appendChild(input);
		newRow.appendChild(cell);
	}
	const modeCell = document.createElement("td");
	const mode = createProviderInput("select", "apiMode", "openai");
	for (const [value, label] of [
		["openai", "OpenAI"],
		["openai-responses", "OpenAI Responses"],
		["ollama", "Ollama"],
		["anthropic", "Anthropic"],
		["gemini", "Gemini"],
	]) {
		mode.appendChild(new Option(label, value));
	}
	modeCell.appendChild(mode);
	newRow.appendChild(modeCell);
	const headersCell = document.createElement("td");
	headersCell.appendChild(
		createProviderInput("textarea", "headers", "", { rows: 2, placeholder: '{"X-API-Version": "v1"}' })
	);
	newRow.appendChild(headersCell);
	const sessionIdCell = document.createElement("td");
	sessionIdCell.appendChild(
		createProviderInput("input", "sessionIdHeader", "", {
			type: "text",
			placeholder: "x-opencode-session",
		})
	);
	newRow.appendChild(sessionIdCell);
	const actions = document.createElement("td");
	for (const [className, label] of [
		["save-provider-btn secondary", "Save"],
		["cancel-provider-btn secondary", "Cancel"],
	]) {
		const button = document.createElement("button");
		button.className = className;
		button.textContent = label;
		actions.appendChild(button);
	}
	newRow.appendChild(actions);
	providerTableBody.appendChild(newRow);

	// Add event listeners for the new row
	const saveBtn = newRow.querySelector(".save-provider-btn");
	const cancelBtn = newRow.querySelector(".cancel-provider-btn");

	saveBtn.addEventListener("click", () => {
		showProviderError("");
		const inputs = newRow.querySelectorAll(".provider-input");
		const providerData = {};
		inputs.forEach((input) => {
			const field = input.getAttribute("data-field");
			providerData[field] = input.value;
		});

		if (!providerData.provider.trim()) {
			showProviderError("Provider ID is required.");
			return;
		}
		const parsedHeaders = parseJsonObject(providerData.headers, "Custom Headers");
		if (!parsedHeaders.ok) {
			showProviderError(parsedHeaders.error);
			return;
		}

		postOperation(
			{
				type: "addProvider",
				provider: providerData.provider,
				baseUrl: providerData.baseUrl || undefined,
				apiKey: providerData.apiKey || undefined,
				apiMode: providerData.apiMode || undefined,
				headers: parsedHeaders.value,
				sessionIdHeader: providerData.sessionIdHeader,
			},
			() => newRow.remove(),
			showProviderError
		);
	});

	cancelBtn.addEventListener("click", () => {
		newRow.remove();
	});
});

// Add Model button event listeners
document.getElementById("addModel").addEventListener("click", () => {
	// Show the model form
	modelFormSection.style.display = "block";
	modelFormTitle.textContent = "Add New Model";
	// Reset form
	resetModelForm();
});

// Provider dropdown change listener. Connection fields stay empty unless the
// user explicitly creates a model-level override.
modelProviderInput.addEventListener("change", () => {
	const selectedProvider = modelProviderInput.value;
	if (selectedProvider && state.providerInfo[selectedProvider]) {
		// Request to fetch remote models for the selected provider
		vscode.postMessage({
			type: "fetchModels",
			provider: selectedProvider,
		});
	}
});

// Toggle advanced settings
toggleAdvancedSettingsBtn.addEventListener("click", () => {
	const isCurrentlyVisible = advancedSettingsContent.style.display !== "none";
	advancedSettingsContent.style.display = isCurrentlyVisible ? "none" : "block";
	toggleAdvancedSettingsBtn.textContent = isCurrentlyVisible ? "Show Advanced Settings" : "Hide Advanced Settings";
});

// Save Model button event listener
saveModelBtn.addEventListener("click", () => {
	const collected = collectModelFormData();
	if (!collected.ok) {
		showModelError(collected.error);
		return;
	}
	const modelData = collected.value;
	if (!validateModelData(modelData)) {
		return;
	}

	// For updates, ensure the model ID remains unchanged
	const isEditing = modelIdInput.hasAttribute("data-editing");
	if (isEditing) {
		// Remove helper attributes from the model data before sending
		let originalProvider = modelData.originalProvider;
		let originalModelId = modelData.originalModelId;
		delete modelData.originalProvider;
		delete modelData.originalModelId;

		postOperation(
			{
				type: "updateModel",
				model: modelData,
				originalProvider: originalProvider,
				originalModelId: originalModelId,
			},
			closeModelForm,
			showModelError
		);
	} else {
		postOperation({ type: "addModel", model: modelData }, closeModelForm, showModelError);
	}
});

function closeModelForm() {
	modelFormSection.style.display = "none";
	resetModelForm();
}

// Cancel Model button event listener
cancelModelBtn.addEventListener("click", () => {
	// Hide the form and reset it
	modelFormSection.style.display = "none";
	resetModelForm();
});

window.addEventListener("message", (event) => {
	const message = event.data;

	switch (message.type) {
		case "init":
			const { delay, readFileLines, retry, commitModel, models, providerKeys, commitLanguage } = message.payload;
			state.delay = delay || 0;
			state.readFileLines = readFileLines || 0;
			state.retry = retry || {
				enabled: true,
				max_attempts: 3,
				interval_ms: 1000,
				status_codes: [],
			};
			state.models = models || [];
			state.commitModel = commitModel || "";
			state.providerKeys = providerKeys || {};

			delayInput.value = state.delay;
			readFileLinesInput.value = message.payload.readFileLines || 0;
			retryEnabledInput.checked = state.retry.enabled !== false;
			maxAttemptsInput.value = state.retry.max_attempts || 3;
			intervalMsInput.value = state.retry.interval_ms || 1000;
			statusCodesInput.value = state.retry.status_codes ? state.retry.status_codes.join(",") : "";

			// Render provider and model management
			renderProviders();
			renderModels();

			// Populate after providerInfo is available so inherited API modes are resolved.
			populateCommitModelDropdown();
			commitModelInput.value = state.commitModel || "";
			commitLanguageInput.value = commitLanguage;
			break;
		case "modelsFetched":
			// Handle the response from fetchModels
			populateModelIdDropdown(message.models);
			break;
		case "modelsFetchError":
			// Handle error from fetchModels
			dropdownHeader.textContent = "Error fetching models";
			dropdownContent.replaceChildren();
			const fetchError = document.createElement("div");
			fetchError.className = "dropdown-option error";
			fetchError.textContent = "Failed to fetch models. Check the Developer Console for details.";
			dropdownContent.appendChild(fetchError);
			console.error("[oaicopilot] Failed to fetch models:", message.error);
			break;
		case "operationResult": {
			const pending = pendingOperations.get(message.requestId);
			if (pending) {
				pendingOperations.delete(message.requestId);
				clearTimeout(pending.timeout);
				if (message.success) {
					pending.onSuccess?.();
				} else {
					pending.onError?.(message.error || "The operation failed.");
				}
			}
			break;
		}
		case "confirmResponse":
			// Handle confirmation responses
			const pendingAction = pendingConfirmations.get(message.id);
			if (pendingAction && message.confirmed) {
				if (pendingAction.action) {
					pendingAction.action();
				}
				// Clean up the pending confirmation
				pendingConfirmations.delete(message.id);
			} else if (pendingAction) {
				// Clean up the pending confirmation even if not confirmed
				pendingConfirmations.delete(message.id);
			}
			break;
	}
});

function renderProviders() {
	// Get all unique providers
	const providers = Array.from(new Set(state.models.map((m) => m.owned_by).filter(Boolean))).sort((a, b) =>
		a.localeCompare(b)
	);

	if (!providers.length) {
		providerTableBody.replaceChildren(createNoDataRow(6, "No providers"));
		// Clear the provider dropdown as well
		modelProviderInput.replaceChildren(new Option("Select Provider", ""));
		return;
	}

	providerTableBody.replaceChildren(...providers.map(createProviderRow));

	// Populate the provider dropdown in the model form and provider info
	state.providerInfo = {}; // Reset provider info
	const providerOptions = providers.map((provider) => {
		const providerModels = state.models.filter((m) => m.owned_by === provider);
		const providerConfig = providerModels.find((m) => m.providerConfig === true);
		state.providerInfo[provider] = {
			baseUrl: providerConfig?.baseUrl || "",
			apiMode: providerConfig?.apiMode || "openai",
			headers: providerConfig?.headers,
		};
		return new Option(provider, provider);
	});
	modelProviderInput.replaceChildren(new Option("Select Provider", ""), ...providerOptions);

	// Add event listeners for provider rows
	document.querySelectorAll(".update-provider-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const row = event.target.closest("tr");
			const inputs = row.querySelectorAll(".provider-input");
			const providerData = {};
			inputs.forEach((input) => {
				const field = input.getAttribute("data-field");
				providerData[field] = input.value;
			});

			const parsedHeaders = parseJsonObject(providerData.headers, "Custom Headers");
			if (!parsedHeaders.ok) {
				showProviderError(parsedHeaders.error);
				return;
			}

			postOperation(
				{
					type: "updateProvider",
					provider: provider,
					baseUrl: providerData.baseUrl || undefined,
					apiKey: providerData.apiKey || undefined,
					apiMode: providerData.apiMode || undefined,
					headers: parsedHeaders.value,
					sessionIdHeader: providerData.sessionIdHeader,
				},
				() => showProviderError(""),
				showProviderError
			);
		});
	});

	document.querySelectorAll(".delete-provider-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const confirmId = "deleteProvider_" + Date.now();

			// Store the action to be performed after confirmation
			pendingConfirmations.set(confirmId, {
				action: () => postOperation({ type: "deleteProvider", provider }, () => undefined, showProviderError),
			});

			vscode.postMessage({
				type: "requestConfirm",
				id: confirmId,
				message: `Are you sure you want to delete provider ${provider} and all its models?`,
				action: "deleteProvider",
			});
		});
	});

	document.querySelectorAll(".clear-provider-key-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const confirmId = "clearProviderApiKey_" + Date.now();
			pendingConfirmations.set(confirmId, {
				action: () =>
					postOperation({ type: "clearProviderApiKey", provider }, () => showProviderError(""), showProviderError),
			});
			vscode.postMessage({
				type: "requestConfirm",
				id: confirmId,
				message: `Clear the stored API key for ${provider}?`,
				action: "clearProviderApiKey",
			});
		});
	});
}

function createNoDataRow(columnCount, message) {
	const row = document.createElement("tr");
	const cell = document.createElement("td");
	cell.colSpan = columnCount;
	cell.className = "no-data";
	cell.textContent = message;
	row.appendChild(cell);
	return row;
}

function createCell(value = "") {
	const cell = document.createElement("td");
	cell.textContent = String(value);
	return cell;
}

function createProviderInput(tagName, field, value, attributes = {}) {
	const input = document.createElement(tagName);
	input.className = "provider-input";
	input.dataset.field = field;
	input.value = value || "";
	for (const [key, attributeValue] of Object.entries(attributes)) {
		input[key] = attributeValue;
	}
	return input;
}

function createProviderRow(provider) {
	const providerModels = state.models.filter((m) => m.owned_by === provider);
	const providerConfig = providerModels.find((m) => m.providerConfig === true) || {};
	const row = document.createElement("tr");
	row.dataset.provider = provider;
	row.appendChild(createCell(provider));

	const baseUrlCell = document.createElement("td");
	baseUrlCell.appendChild(
		createProviderInput("input", "baseUrl", providerConfig.baseUrl, { type: "text", placeholder: "Base URL" })
	);
	row.appendChild(baseUrlCell);

	const apiKeyCell = document.createElement("td");
	const apiKeyInput = createProviderInput("input", "apiKey", "", {
		type: "password",
		placeholder: state.providerKeys[provider] ? "API key saved — leave blank to keep" : "Enter API key",
	});
	apiKeyCell.appendChild(apiKeyInput);
	if (state.providerKeys[provider]) {
		const saved = document.createElement("div");
		saved.className = "field-description";
		saved.textContent = "A key is stored securely.";
		apiKeyCell.appendChild(saved);
	}
	row.appendChild(apiKeyCell);

	const modeCell = document.createElement("td");
	const select = createProviderInput("select", "apiMode", providerConfig.apiMode || "openai");
	for (const [value, label] of [
		["openai", "OpenAI"],
		["openai-responses", "OpenAI Responses"],
		["ollama", "Ollama"],
		["anthropic", "Anthropic"],
		["gemini", "Gemini"],
	]) {
		select.appendChild(new Option(label, value, false, value === (providerConfig.apiMode || "openai")));
	}
	modeCell.appendChild(select);
	row.appendChild(modeCell);

	const headersCell = document.createElement("td");
	headersCell.appendChild(
		createProviderInput(
			"textarea",
			"headers",
			providerConfig.headers ? JSON.stringify(providerConfig.headers, null, 2) : "",
			{
				rows: 2,
				placeholder: '{"X-API-Version": "v1"}',
			}
		)
	);
	row.appendChild(headersCell);

	const sessionIdCell = document.createElement("td");
	sessionIdCell.appendChild(
		createProviderInput("input", "sessionIdHeader", providerConfig.session_id_header, {
			type: "text",
			placeholder: "x-opencode-session",
		})
	);
	row.appendChild(sessionIdCell);

	const actions = document.createElement("td");
	actions.className = "action-buttons";
	for (const [className, label] of [
		["update-provider-btn", "Save"],
		["clear-provider-key-btn secondary", "Clear Key"],
		["delete-provider-btn danger", "Delete"],
	]) {
		const button = document.createElement("button");
		button.className = className;
		button.dataset.provider = provider;
		button.textContent = label;
		if (label === "Clear Key" && !state.providerKeys[provider]) {
			button.disabled = true;
		}
		actions.appendChild(button);
	}
	row.appendChild(actions);
	return row;
}

function renderModels() {
	const models = state.models.filter((m) => m.providerConfig !== true).sort((a, b) => a.id.localeCompare(b.id));
	if (!models.length) {
		modelTableBody.replaceChildren(createNoDataRow(11, "No models"));
		return;
	}

	modelTableBody.replaceChildren(...models.map(createModelRow));

	// Add event listeners for model rows
	document.querySelectorAll(".update-model-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const modelId = event.target.getAttribute("data-model-id");
			const model = state.models.find((m) => m.owned_by === provider && m.id === modelId);

			if (model) {
				// Show the model form in edit mode
				modelFormSection.style.display = "block";
				modelFormTitle.textContent = `Edit Model: ${provider} / ${modelId}`;
				populateModelForm(model);
			}
		});
	});

	document.querySelectorAll(".delete-model-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const modelId = event.target.getAttribute("data-model-id");
			const confirmId = "deleteModel_" + Date.now();

			// Store the action to be performed after confirmation
			pendingConfirmations.set(confirmId, {
				action: () => postOperation({ type: "deleteModel", provider, modelId }, () => undefined, showModelError),
			});

			vscode.postMessage({
				type: "requestConfirm",
				id: confirmId,
				message: `Are you sure you want to delete model ${provider} / ${modelId}?`,
				action: "deleteModel",
			});
		});
	});
}

function createModelRow(model) {
	const row = document.createElement("tr");
	row.dataset.provider = model.owned_by;
	row.dataset.modelId = model.id;
	for (const value of [
		model.id,
		model.owned_by,
		model.displayName || "",
		model.configId || "",
		model.context_length || "",
		model.max_tokens || model.max_completion_tokens || "",
		model.vision ? "True" : "",
		model.temperature !== undefined && model.temperature !== null ? model.temperature : "",
		model.top_p !== undefined && model.top_p !== null ? model.top_p : "",
		model.delay || "",
	]) {
		row.appendChild(createCell(value));
	}
	const actions = document.createElement("td");
	actions.className = "action-buttons";
	for (const [className, label] of [
		["update-model-btn", "Edit"],
		["delete-model-btn danger", "Delete"],
	]) {
		const button = document.createElement("button");
		button.className = className;
		button.dataset.provider = model.owned_by;
		button.dataset.modelId = model.id;
		button.textContent = label;
		actions.appendChild(button);
	}
	row.appendChild(actions);
	return row;
}

// Reset model form
function resetModelForm() {
	// Clear any error message
	showModelError("");

	modelIdInput.value = "";
	modelProviderInput.value = "";
	modelDisplayNameInput.value = "";
	modelConfigIdInput.value = "";
	modelBaseUrlInput.value = "";
	modelFamilyInput.value = "";
	modelContextLengthInput.value = 128000;
	modelMaxTokensInput.value = 4096;
	modelVisionInput.value = "";
	modelApiModeInput.value = "";
	modelTemperatureInput.value = 0;
	modelTopPInput.value = "";
	modelDelayInput.value = "";
	modelTopKInput.value = "";
	modelMinPInput.value = "";
	modelFrequencyPenaltyInput.value = "";
	modelPresencePenaltyInput.value = "";
	modelRepetitionPenaltyInput.value = "";
	modelReasoningEffortInput.value = "";
	modelEnableThinkingInput.value = "";
	modelThinkingBudgetInput.value = "";
	modelIncludeReasoningInput.value = "";
	modelMaxCompletionTokensInput.value = "";
	modelReasoningEnabledInput.value = "";
	modelReasoningExcludeInput.value = "";
	modelReasoningEffortORInput.value = "";
	modelReasoningMaxTokensInput.value = "";
	modelThinkingTypeInput.value = "";
	modelHeadersInput.value = "";
	modelExtraInput.value = "";
	advancedSettingsContent.style.display = "none";
	toggleAdvancedSettingsBtn.textContent = "Show Advanced Settings";
	// Remove editing attribute
	modelIdInput.removeAttribute("data-editing");
	modelIdInput.removeAttribute("data-original-provider");
	modelIdInput.removeAttribute("data-original-id");
	// Clear dropdown options
	dropdownContent.innerHTML = "";
}

// Collect model form data
function collectModelFormData() {
	const isEditing = modelIdInput.hasAttribute("data-editing");
	const headers = parseJsonObject(modelHeadersInput.value, "Custom Headers");
	if (!headers.ok) {
		return headers;
	}
	const extra = parseJsonObject(modelExtraInput.value, "Extra Parameters");
	if (!extra.ok) {
		return extra;
	}

	return {
		ok: true,
		value: {
			id: modelIdInput.value.trim(),
			owned_by: modelProviderInput.value.trim(),
			displayName: modelDisplayNameInput.value.normalize("NFKC").trim(),
			configId: modelConfigIdInput.value.trim() || undefined,
			baseUrl: modelBaseUrlInput.value.trim() || undefined,
			family: modelFamilyInput.value.trim() || undefined,
			context_length: modelContextLengthInput.value ? parseInt(modelContextLengthInput.value) : undefined,
			max_tokens: modelMaxTokensInput.value ? parseInt(modelMaxTokensInput.value) : undefined,
			vision: modelVisionInput.value ? modelVisionInput.value === "true" : undefined,
			apiMode: modelApiModeInput.value || undefined,
			temperature: modelTemperatureInput.value !== "" ? parseFloat(modelTemperatureInput.value) : undefined,
			top_p: modelTopPInput.value !== "" ? parseFloat(modelTopPInput.value) : undefined,
			delay: modelDelayInput.value ? parseInt(modelDelayInput.value) : undefined,
			top_k: modelTopKInput.value ? parseInt(modelTopKInput.value) : undefined,
			min_p: modelMinPInput.value !== "" ? parseFloat(modelMinPInput.value) : undefined,
			frequency_penalty:
				modelFrequencyPenaltyInput.value !== "" ? parseFloat(modelFrequencyPenaltyInput.value) : undefined,
			presence_penalty:
				modelPresencePenaltyInput.value !== "" ? parseFloat(modelPresencePenaltyInput.value) : undefined,
			repetition_penalty:
				modelRepetitionPenaltyInput.value !== "" ? parseFloat(modelRepetitionPenaltyInput.value) : undefined,
			reasoning_effort: modelReasoningEffortInput.value || undefined,
			enable_thinking: modelEnableThinkingInput.value ? modelEnableThinkingInput.value === "true" : undefined,
			thinking_budget: modelThinkingBudgetInput.value ? parseInt(modelThinkingBudgetInput.value) : undefined,
			include_reasoning_in_request: modelIncludeReasoningInput.value
				? modelIncludeReasoningInput.value === "true"
				: undefined,
			max_completion_tokens: modelMaxCompletionTokensInput.value
				? parseInt(modelMaxCompletionTokensInput.value)
				: undefined,
			// Build reasoning configuration object
			reasoning: buildReasoningConfig(),
			// Build thinking configuration object
			thinking: buildThinkingConfig(),
			// Parse headers and extra JSON
			headers: headers.value,
			extra: extra.value,
			// Include original modelId and configId for update operations
			originalProvider: isEditing ? modelIdInput.getAttribute("data-original-provider") : undefined,
			originalModelId: isEditing ? modelIdInput.getAttribute("data-original-id") : undefined,
		},
	};
}

// Build reasoning configuration object from form fields
function buildReasoningConfig() {
	const enabled = modelReasoningEnabledInput.value ? modelReasoningEnabledInput.value === "true" : undefined;
	const effort = modelReasoningEffortORInput.value || undefined;
	const exclude = modelReasoningExcludeInput.value ? modelReasoningExcludeInput.value === "true" : undefined;
	const maxTokens = modelReasoningMaxTokensInput.value ? parseInt(modelReasoningMaxTokensInput.value) : undefined;

	// Only return an object if at least one field has a value
	if (enabled !== undefined || effort !== undefined || exclude !== undefined || maxTokens !== undefined) {
		return {
			enabled,
			effort,
			exclude,
			max_tokens: maxTokens,
		};
	}
	return undefined;
}

// Build thinking configuration object from form fields
function buildThinkingConfig() {
	const type = modelThinkingTypeInput.value || undefined;

	if (type !== undefined) {
		return { type };
	}
	return undefined;
}

// Show error message in the UI
function showModelError(message) {
	if (modelErrorElement) {
		modelErrorElement.textContent = message;
		modelErrorElement.style.display = message ? "block" : "none";

		// Scroll to error message if it's visible
		if (message) {
			modelErrorElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	}
}

// Validate model data
function validateModelData(modelData) {
	// Clear any previous error
	showModelError("");

	if (!modelData.id) {
		showModelError("Model ID is required.");
		return false;
	}
	if (modelData.id.startsWith("__provider__")) {
		showModelError('Model IDs beginning with "__provider__" are reserved for internal provider metadata.');
		return false;
	}
	if (!modelData.owned_by) {
		showModelError("Provider ID is required.");
		return false;
	}
	if (!modelData.displayName) {
		showModelError("Display Name is required.");
		return false;
	}

	// Model ID is unique within a canonical provider. Config ID is descriptive only.
	const isEditing = modelIdInput.hasAttribute("data-editing");
	const hasDuplicate = state.models
		.filter((m) => {
			if (isEditing) {
				const isOrigin =
					m.owned_by.toLowerCase() === modelData.originalProvider.toLowerCase() && m.id === modelData.originalModelId;
				return !isOrigin;
			}
			return true;
		})
		.some((m) => {
			return m.owned_by.toLowerCase() === modelData.owned_by.toLowerCase() && m.id === modelData.id;
		});

	if (hasDuplicate) {
		showModelError(
			`Model ID "${modelData.id}" already exists for provider "${modelData.owned_by}". Provider and Model ID must be unique.`
		);
		return false;
	}

	const normalizedDisplayName = modelData.displayName.normalize("NFKC").trim().toLowerCase();
	const hasDuplicateDisplayName = state.models
		.filter((m) => m.providerConfig !== true)
		.filter((m) => {
			if (!isEditing) {
				return true;
			}
			return !(
				m.owned_by.toLowerCase() === modelData.originalProvider.toLowerCase() && m.id === modelData.originalModelId
			);
		})
		.some(
			(m) =>
				typeof m.displayName === "string" &&
				m.displayName.normalize("NFKC").trim().toLowerCase() === normalizedDisplayName
		);

	if (hasDuplicateDisplayName) {
		showModelError(`Display Name "${modelData.displayName}" is already used. Display Names must be globally unique.`);
		return false;
	}

	// Validate numeric fields if provided
	if (modelData.context_length !== undefined && (isNaN(modelData.context_length) || modelData.context_length <= 0)) {
		showModelError("Context Length must be a positive number.");
		return false;
	}
	if (modelData.max_tokens !== undefined && (isNaN(modelData.max_tokens) || modelData.max_tokens <= 0)) {
		showModelError("Max Tokens must be a positive number.");
		return false;
	}
	if (
		modelData.max_completion_tokens !== undefined &&
		(isNaN(modelData.max_completion_tokens) || modelData.max_completion_tokens <= 0)
	) {
		showModelError("Max Completion Tokens must be a positive number.");
		return false;
	}
	// Prevent both max_tokens and max_completion_tokens from being set simultaneously
	if (modelData.max_tokens !== undefined && modelData.max_completion_tokens !== undefined) {
		showModelError("Cannot set both 'max_tokens' and 'max_completion_tokens'. Use 'max_completion_tokens' only.");
		return false;
	}
	if (
		modelData.temperature !== undefined &&
		(isNaN(modelData.temperature) || modelData.temperature < 0 || modelData.temperature > 2)
	) {
		showModelError("Temperature must be between 0 and 2.");
		return false;
	}
	if (modelData.top_p !== undefined && (isNaN(modelData.top_p) || modelData.top_p < 0 || modelData.top_p > 1)) {
		showModelError("Top P must be between 0 and 1.");
		return false;
	}
	if (modelData.delay !== undefined && (isNaN(modelData.delay) || modelData.delay < 0)) {
		showModelError("Delay must be a non-negative number.");
		return false;
	}

	// Validate JSON fields
	if (modelData.headers && typeof modelData.headers !== "object") {
		showModelError("Custom Headers must be a valid JSON object.");
		return false;
	}
	if (modelData.extra && typeof modelData.extra !== "object") {
		showModelError("Extra Parameters must be a valid JSON object.");
		return false;
	}

	return true;
}

// Function to populate the model ID datalist
function populateModelIdDropdown(models) {
	const modelsArray = Array.from(models || []);

	// Clear existing options
	dropdownContent.innerHTML = "";

	if (!modelsArray.length) {
		dropdownHeader.textContent = "No models available";
		return;
	}

	dropdownHeader.textContent = `Select Model (${modelsArray.length} available)`;

	// Create option elements
	modelsArray.forEach((model) => {
		const option = document.createElement("div");
		option.className = "dropdown-option";
		option.textContent = model.id;
		option.dataset.modelId = model.id;

		// Add click event
		option.addEventListener("click", () => {
			modelIdInput.value = model.id;
			hideDropdown();

			// Remove selection from all options
			dropdownContent.querySelectorAll(".dropdown-option").forEach((opt) => {
				opt.classList.remove("selected");
			});

			// Add selection to clicked option
			option.classList.add("selected");
		});

		dropdownContent.appendChild(option);
	});
}

// Function to populate the commit model dropdown
function populateCommitModelDropdown() {
	// Clear existing options except the first "None" option
	while (commitModelInput.children.length > 1) {
		commitModelInput.removeChild(commitModelInput.lastChild);
	}

	// Filter models that support commit generation (openai, openai-responses, anthropic, ollama apiMode)
	const commitCompatibleModels = state.models
		.filter((model) => {
			const apiMode = model.apiMode || state.providerInfo[model.owned_by]?.apiMode || "openai";
			return apiMode !== "gemini" && model.providerConfig !== true;
		})
		.sort((a, b) => a.id.localeCompare(b.id));

	// Add options for compatible models
	commitCompatibleModels.forEach((model) => {
		const option = document.createElement("option");
		option.value = JSON.stringify([model.owned_by.toLowerCase(), model.id]);
		option.textContent = model.displayName;
		commitModelInput.appendChild(option);
	});
}

// Dropdown visibility functions
function showDropdown() {
	if (dropdownContent.children.length > 0) {
		modelIdDropdown.classList.add("show");
	}
}

function hideDropdown() {
	modelIdDropdown.classList.remove("show");
}

function toggleDropdown() {
	if (modelIdDropdown.classList.contains("show")) {
		hideDropdown();
	} else {
		showDropdown();
	}
}

// Populate model form with existing data
function populateModelForm(model) {
	// Clear any error message
	showModelError("");

	// Store the original provider/model identity for update operations
	modelIdInput.setAttribute("data-original-provider", model.owned_by || "");
	modelIdInput.setAttribute("data-original-id", model.id || "");

	modelIdInput.value = model.id || "";

	// Ensure the provider is in the dropdown options
	const currentProvider = model.owned_by || "";
	const providerExists = Array.from(modelProviderInput.options).some((option) => option.value === currentProvider);

	if (!providerExists && currentProvider) {
		// Add the provider to the dropdown if it doesn't exist
		const newOption = document.createElement("option");
		newOption.value = currentProvider;
		newOption.textContent = currentProvider;
		modelProviderInput.appendChild(newOption);
	}

	// Request to fetch remote models for the selected provider
	vscode.postMessage({
		type: "fetchModels",
		provider: currentProvider,
	});

	modelProviderInput.value = currentProvider;
	modelDisplayNameInput.value = model.displayName || "";
	modelConfigIdInput.value = model.configId || "";
	modelBaseUrlInput.value = model.baseUrl || "";
	modelFamilyInput.value = model.family || "";
	modelContextLengthInput.value = model.context_length || "";
	modelMaxTokensInput.value = model.max_tokens || "";
	modelVisionInput.value = model.vision !== undefined ? String(model.vision) : "";
	modelApiModeInput.value = model.apiMode || "";
	modelTemperatureInput.value = model.temperature !== undefined && model.temperature !== null ? model.temperature : "";
	modelTopPInput.value = model.top_p !== undefined && model.top_p !== null ? model.top_p : "";
	modelDelayInput.value = model.delay || "";
	modelTopKInput.value = model.top_k || "";
	modelMinPInput.value = model.min_p || "";
	modelFrequencyPenaltyInput.value = model.frequency_penalty || "";
	modelPresencePenaltyInput.value = model.presence_penalty || "";
	modelRepetitionPenaltyInput.value = model.repetition_penalty || "";
	modelReasoningEffortInput.value = model.reasoning_effort || "";
	modelEnableThinkingInput.value = model.enable_thinking !== undefined ? String(model.enable_thinking) : "";
	modelThinkingBudgetInput.value = model.thinking_budget || "";
	modelIncludeReasoningInput.value =
		model.include_reasoning_in_request !== undefined ? String(model.include_reasoning_in_request) : "";
	modelMaxCompletionTokensInput.value = model.max_completion_tokens || "";
	// Populate reasoning configuration
	if (model.reasoning) {
		modelReasoningEnabledInput.value = model.reasoning.enabled !== undefined ? String(model.reasoning.enabled) : "";
		modelReasoningEffortORInput.value = model.reasoning.effort || "";
		modelReasoningExcludeInput.value = model.reasoning.exclude !== undefined ? String(model.reasoning.exclude) : "";
		modelReasoningMaxTokensInput.value = model.reasoning.max_tokens || "";
	}
	// Populate thinking configuration
	if (model.thinking) {
		modelThinkingTypeInput.value = model.thinking.type || "";
	}
	// Populate headers and extra
	modelHeadersInput.value = model.headers ? JSON.stringify(model.headers, null, 2) : "";
	modelExtraInput.value = model.extra ? JSON.stringify(model.extra, null, 2) : "";
	// Mark that we're in editing mode by setting an attribute
	modelIdInput.setAttribute("data-editing", "true");
}

// Initialize dropdown event listeners
function initDropdownEvents() {
	// Show dropdown on focus
	modelIdInput.addEventListener("focus", () => {
		if (dropdownContent.children.length > 0) {
			showDropdown();
		}
	});

	// Hide dropdown when clicking outside
	document.addEventListener("click", (event) => {
		if (!modelIdDropdown.contains(event.target) && event.target !== modelIdInput) {
			hideDropdown();
		}
	});

	// Handle keyboard navigation
	modelIdInput.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			hideDropdown();
		} else if (event.key === "ArrowDown" && modelIdDropdown.classList.contains("show")) {
			event.preventDefault();
			const options = dropdownContent.querySelectorAll(".dropdown-option");
			if (options.length > 0) {
				const firstOption = options[0];
				firstOption.focus();
				firstOption.classList.add("selected");
			}
		}
	});

	// Allow user to type freely
	modelIdInput.addEventListener("input", () => {
		// Clear selection when user types
		dropdownContent.querySelectorAll(".dropdown-option").forEach((opt) => {
			opt.classList.remove("selected");
		});

		// Filter options based on input
		const searchTerm = modelIdInput.value.toLowerCase();
		const options = dropdownContent.querySelectorAll(".dropdown-option");

		options.forEach((option) => {
			const modelId = option.dataset.modelId.toLowerCase();
			if (modelId.includes(searchTerm)) {
				option.style.display = "block";
			} else {
				option.style.display = "none";
			}
		});

		// Update header with filtered count
		const visibleCount = Array.from(options).filter((opt) => opt.style.display !== "none").length;
		dropdownHeader.textContent = `Select Model (${visibleCount} matching)`;
	});
}

// Initialize dropdown events
initDropdownEvents();

vscode.postMessage({ type: "requestInit" });
