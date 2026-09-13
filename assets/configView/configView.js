const vscode = acquireVsCodeApi();
const state = {
	delay: 0,
	retry: { enabled: true, max_attempts: 3, interval_ms: 1000, status_codes: [429, 500, 502, 503, 504] },
	commitModel: "",
	models: [],
	providerKeys: {},
	providerInfo: {},
	/** Latest balance outcome per provider, pushed by the extension host. */
	balances: {},
	/** Preset catalogue offered by the extension host. */
	balancePresets: [],
	/** Language currently displayed. */
	locale: "en",
	/** Languages the panel offers, sent by the host. */
	locales: [],
	/** Whether the stored preference is `auto`, i.e. following VS Code. */
	languageIsAuto: true,
};

/* ------------------------------------------------------------------ *
 * Localisation
 *
 * The host owns the catalogue: it sends the messages for the active
 * language on every init, so this file never hardcodes a user-visible
 * string and the two languages cannot drift apart here.
 * ------------------------------------------------------------------ */

/** Messages for the active language, replaced on every init. */
let messages = {};

/**
 * Translate a key.
 *
 * A missing key returns the key itself, so a gap shows up in the UI instead of
 * silently rendering as empty.
 */
function t(key, ...args) {
	const template = messages[key];
	if (typeof template !== "string") {
		return key;
	}
	return template.replace(/\{(\d+)\}/g, (match, index) => {
		const value = args[Number(index)];
		return value === undefined ? match : String(value);
	});
}

/**
 * Apply the catalogue to the static markup.
 *
 * Elements are tagged in the HTML with `data-i18n`, so a new string cannot be
 * forgotten in one language: the test suite fails if a tag has no message.
 */
function applyTranslations(root = document) {
	for (const element of root.querySelectorAll("[data-i18n]")) {
		element.textContent = t(element.dataset.i18n);
	}
	// Descriptions that embed <code> examples cannot have their text replaced
	// wholesale, so their markup lives in the catalogue instead.
	for (const element of root.querySelectorAll("[data-i18n-html]")) {
		element.innerHTML = t(element.dataset.i18nHtml);
	}
	for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
		element.placeholder = t(element.dataset.i18nPlaceholder);
	}
	for (const element of root.querySelectorAll("[data-i18n-title]")) {
		element.title = t(element.dataset.i18nTitle);
	}
	document.documentElement.lang = state.locale;
}

/** Read every editable value in the provider table. */
function captureTableEdits() {
	const captured = {};
	for (const row of providerTableBody.querySelectorAll("tr[data-provider]")) {
		captured[row.dataset.provider] = collectProviderRowValues(row);
	}
	return captured;
}

/** Put back the values captured before a re-render, so a language switch keeps unsaved edits. */
function restoreTableEdits(captured) {
	for (const row of providerTableBody.querySelectorAll("tr[data-provider]")) {
		const values = captured[row.dataset.provider];
		if (!values) {
			continue;
		}
		row.querySelectorAll(".provider-input").forEach((input) => {
			const value = values[input.getAttribute("data-field")];
			if (value !== undefined) {
				input.value = value;
			}
		});
	}
}

// Store the action to be performed after confirmation
const pendingConfirmations = new Map();
const pendingOperations = new Map();

// Global Configuration elements
const delayInput = document.getElementById("delay");
const readFileLinesInput = document.getElementById("readFileLines");
const languageSelect = document.getElementById("languageSelect");
const retryEnabledInput = document.getElementById("retryEnabled");
const maxAttemptsInput = document.getElementById("maxAttempts");
const intervalMsInput = document.getElementById("intervalMs");
const statusCodesInput = document.getElementById("statusCodes");

// Provider management elements
const providerTableBody = document.getElementById("providerTableBody");
const providerErrorElement = document.getElementById("providerError");

// Balance dialog elements
const balanceModal = document.getElementById("balanceModal");
const balanceModalTitle = document.getElementById("balanceModalTitle");
const balanceEnabledInput = document.getElementById("balanceEnabled");
const balancePresetInput = document.getElementById("balancePreset");
const balancePresetHint = document.getElementById("balancePresetHint");
const balanceUrlInput = document.getElementById("balanceUrl");
const balanceMethodInput = document.getElementById("balanceMethod");
const balanceAuthInput = document.getElementById("balanceAuth");
const balanceHeadersInput = document.getElementById("balanceHeaders");
const balanceRemainingInput = document.getElementById("balanceRemaining");
const balanceUnitInput = document.getElementById("balanceUnit");
const balancePlanNameInput = document.getElementById("balancePlanName");
const balanceTotalInput = document.getElementById("balanceTotal");
const balanceUsedInput = document.getElementById("balanceUsed");
const balanceExtraInput = document.getElementById("balanceExtra");
const balanceTimeoutInput = document.getElementById("balanceTimeout");
const balanceIntervalInput = document.getElementById("balanceInterval");
const balanceTestResultElement = document.getElementById("balanceTestResult");
/** Provider whose balance config the dialog is currently editing. */
let balanceModalProvider = "";

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
			pending.onError?.(t("error.operationTimedOut"));
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

function parseJsonObject(value, labelKey) {
	if (!value || value.trim() === "") {
		return { ok: true, value: undefined };
	}
	try {
		const parsed = JSON.parse(value.trim());
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { ok: false, error: t("error.jsonNotObject", t(labelKey)) };
		}
		return { ok: true, value: parsed };
	} catch (error) {
		return { ok: false, error: t("error.jsonInvalid", t(labelKey), error.message) };
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
		createProviderInput("input", "provider", "", { type: "text", placeholder: t("providers.placeholderId") }),
		createProviderInput("input", "baseUrl", "", { type: "text", placeholder: t("providers.placeholderBaseUrl") }),
		createProviderInput("input", "apiKey", "", { type: "password", placeholder: t("providers.placeholderApiKey") }),
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
			placeholder: t("providers.placeholderSessionId"),
		})
	);
	newRow.appendChild(sessionIdCell);
	// Keeps the new row aligned with the eight-column header; the balance cell is
	// filled in once the provider is saved and the row is re-rendered.
	const balanceCell = document.createElement("td");
	balanceCell.className = "balance-cell";
	const balanceBadge = document.createElement("div");
	balanceBadge.className = "balance-badge balance-none";
	balanceBadge.textContent = t("balance.statusNotSet");
	balanceCell.appendChild(balanceBadge);
	newRow.appendChild(balanceCell);
	const actions = document.createElement("td");
	for (const [className, label] of [
		["save-provider-btn secondary", t("common.save")],
		["cancel-provider-btn secondary", t("common.cancel")],
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
		const providerData = collectProviderRowValues(newRow);

		if (!providerData.provider.trim()) {
			showProviderError(t("error.providerIdRequired"));
			return;
		}
		const parsedHeaders = parseJsonObject(providerData.headers, "advanced.headersLabel");
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
	modelFormTitle.textContent = t("modelForm.addTitle");
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
	toggleAdvancedSettingsBtn.textContent = isCurrentlyVisible ? t("advanced.show") : t("advanced.hide");
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
			// The host owns the catalogue, so the language arrives with every init.
			state.locale = message.payload.locale || "en";
			state.locales = message.payload.locales || [];
			state.languageIsAuto = message.payload.languageIsAuto !== false;
			messages = message.payload.messages || {};
			// Translate the static markup before anything dynamic is rendered, so
			// newly created rows are built in the right language.
			applyTranslations();
			populateLanguageOptions();
			state.balancePresets = message.payload.balancePresets || [];
			populateBalancePresetOptions();
			// Seed the cached results so a reopened panel shows what the status bar
			// already shows, instead of forgetting the previous session's queries.
			state.balances = {};
			for (const entry of message.payload.balances || []) {
				if (entry && entry.provider) {
					state.balances[entry.provider] = entry;
				}
			}

			delayInput.value = state.delay;
			readFileLinesInput.value = message.payload.readFileLines || 0;
			retryEnabledInput.checked = state.retry.enabled !== false;
			maxAttemptsInput.value = state.retry.max_attempts || 3;
			intervalMsInput.value = state.retry.interval_ms || 1000;
			statusCodesInput.value = state.retry.status_codes ? state.retry.status_codes.join(",") : "";

			// Render provider and model management. The provider table holds editable
			// fields, so whatever the user has typed is carried across the re-render
			// that a language switch triggers.
			const pendingEdits = captureTableEdits();
			renderProviders();
			restoreTableEdits(pendingEdits);
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
			dropdownHeader.textContent = t("error.fetchModelsHeader");
			dropdownContent.replaceChildren();
			const fetchError = document.createElement("div");
			fetchError.className = "dropdown-option error";
			fetchError.textContent = t("error.fetchModelsFailed");
			dropdownContent.appendChild(fetchError);
			console.error("[oaicopilot] Failed to fetch models:", message.error);
			break;
		case "balanceResult":
			if (message.test) {
				// A dry run from the dialog: show it there without touching the saved value.
				renderBalanceTestResult(message);
			} else {
				state.balances[message.provider] = message;
				renderBalanceCell(message.provider);
			}
			break;
		case "operationResult": {
			const pending = pendingOperations.get(message.requestId);
			if (pending) {
				pendingOperations.delete(message.requestId);
				clearTimeout(pending.timeout);
				if (message.success) {
					pending.onSuccess?.();
				} else {
					pending.onError?.(message.error || t("error.operationFailed"));
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
		providerTableBody.replaceChildren(createNoDataRow(8, t("providers.empty")));
		// Clear the provider dropdown as well
		modelProviderInput.replaceChildren(new Option(t("common.selectProvider"), ""));
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
	modelProviderInput.replaceChildren(new Option(t("common.selectProvider"), ""), ...providerOptions);

	// Add event listeners for provider rows
	document.querySelectorAll(".update-provider-btn").forEach((btn) => {
		btn.addEventListener("click", (event) => {
			const provider = event.target.getAttribute("data-provider");
			const row = event.target.closest("tr");
			const providerData = collectProviderRowValues(row);

			const parsedHeaders = parseJsonObject(providerData.headers, "advanced.headersLabel");
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
				message: t("confirm.deleteProvider", provider),
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
				message: t("confirm.clearApiKey", provider),
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

/** Read every editable field of a provider row into a plain object. */
function collectProviderRowValues(row) {
	const providerData = {};
	row.querySelectorAll(".provider-input").forEach((input) => {
		providerData[input.getAttribute("data-field")] = input.value;
	});
	return providerData;
}

/** The saved provider record for a provider, or an empty object. */
function providerConfigOf(provider) {
	return state.models.find((model) => model.owned_by === provider && model.providerConfig === true) || {};
}

/**
 * Mirror a just-saved balance configuration into the local model list.
 *
 * The host also re-sends `init`, but the row must not keep looking unchanged
 * while that round trip is in flight.
 */
function applySavedBalanceConfig(provider, balance) {
	const record = state.models.find((model) => model.owned_by === provider && model.providerConfig === true);
	if (record) {
		record.balance = balance;
	}
	// The host drops its snapshot on every configuration change, so the number
	// still on screen is no longer backed by anything.
	delete state.balances[provider];
	renderBalanceCell(provider);
}

function createProviderRow(provider) {
	const providerModels = state.models.filter((m) => m.owned_by === provider);
	const providerConfig = providerModels.find((m) => m.providerConfig === true) || {};
	const row = document.createElement("tr");
	row.dataset.provider = provider;
	row.appendChild(createCell(provider));

	const baseUrlCell = document.createElement("td");
	baseUrlCell.appendChild(
		createProviderInput("input", "baseUrl", providerConfig.baseUrl, {
			type: "text",
			placeholder: t("providers.placeholderBaseUrl"),
		})
	);
	row.appendChild(baseUrlCell);

	const apiKeyCell = document.createElement("td");
	const apiKeyInput = createProviderInput("input", "apiKey", "", {
		type: "password",
		placeholder: state.providerKeys[provider] ? t("providers.keySavedPlaceholder") : t("providers.placeholderApiKey"),
	});
	apiKeyCell.appendChild(apiKeyInput);
	if (state.providerKeys[provider]) {
		const saved = document.createElement("div");
		saved.className = "field-description";
		saved.textContent = t("providers.keyStored");
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
			placeholder: t("providers.placeholderSessionId"),
		})
	);
	row.appendChild(sessionIdCell);

	const balanceCell = document.createElement("td");
	balanceCell.className = "balance-cell";
	row.appendChild(balanceCell);
	renderBalanceCellInto(balanceCell, provider);

	const actions = document.createElement("td");
	actions.className = "action-buttons";
	for (const [className, label] of [
		["update-provider-btn", t("common.save")],
		["clear-provider-key-btn secondary", t("providers.clearKey")],
		["delete-provider-btn danger", t("common.delete")],
	]) {
		const button = document.createElement("button");
		button.className = className;
		button.dataset.provider = provider;
		button.textContent = label;
		if (label === t("providers.clearKey") && !state.providerKeys[provider]) {
			button.disabled = true;
		}
		actions.appendChild(button);
	}
	row.appendChild(actions);
	return row;
}

/**
 * Grade a balance the same way the extension host does, so the colour in the
 * table matches the status bar.
 */
function balanceSeverity(result) {
	if (!result || typeof result.remaining !== "number") {
		return "unknown";
	}
	if (typeof result.total !== "number" || result.total <= 0) {
		return "unknown";
	}
	const ratio = result.remaining / result.total;
	if (ratio <= 0.1) {
		return "critical";
	}
	if (ratio <= 0.3) {
		return "warning";
	}
	return "ok";
}

/** Re-render a provider's balance cell after its outcome changed. */
function renderBalanceCell(provider) {
	const cell = providerTableBody.querySelector(`tr[data-provider="${CSS.escape(provider)}"] .balance-cell`);
	if (cell) {
		renderBalanceCellInto(cell, provider);
	}
}

function renderBalanceCellInto(cell, provider) {
	const configured = providerConfigOf(provider).balance;
	const enabled = configured?.enabled === true;
	const outcome = state.balances[provider];
	cell.replaceChildren();

	const badge = document.createElement("div");
	badge.className = "balance-badge";
	if (!enabled) {
		// A saved-but-switched-off query is not the same as no query at all;
		// showing "Not set" for both makes a successful save look like a failure.
		badge.classList.add("balance-none");
		badge.textContent = configured ? t("balance.statusDisabled") : t("balance.statusNotSet");
		badge.title = configured ? t("balance.configuredButOff") : t("balance.nothingConfigured");
	} else if (outcome?.result) {
		badge.classList.add(`balance-${balanceSeverity(outcome.result)}`);
		badge.textContent = outcome.stale ? t("balance.staleSuffix", outcome.result.label) : outcome.result.label;
		badge.title = outcome.result.requestUrl;
	} else if (outcome?.error) {
		badge.classList.add("balance-failed");
		badge.textContent = t("balance.statusFailed");
		badge.title = outcome.error;
	} else {
		badge.classList.add("balance-unknown");
		badge.textContent = t("balance.statusNotQueried");
	}
	cell.appendChild(badge);

	const buttons = document.createElement("div");
	buttons.className = "balance-buttons";

	const refresh = document.createElement("button");
	refresh.className = "icon-button";
	refresh.textContent = "↻";
	refresh.title = enabled ? t("balance.refreshNow") : t("balance.enableFirst");
	refresh.disabled = !enabled;
	refresh.addEventListener("click", () => {
		badge.className = "balance-badge balance-unknown";
		badge.textContent = t("balance.statusQuerying");
		vscode.postMessage({ type: "refreshBalance", provider });
	});

	const configure = document.createElement("button");
	configure.className = "icon-button";
	configure.textContent = "⚙";
	configure.title = t("balance.configureTitle");
	configure.addEventListener("click", () => openBalanceModal(provider));

	buttons.append(refresh, configure);
	cell.appendChild(buttons);
}

/** Offer the available languages, with the active one selected. */
function populateLanguageOptions() {
	languageSelect.replaceChildren();
	// "Automatic" is not a language, so it comes from the message catalogue
	// rather than from the list the host sends.
	languageSelect.appendChild(new Option(t("global.languageAuto"), "auto"));
	for (const entry of state.locales) {
		languageSelect.appendChild(new Option(entry.label, entry.id));
	}
	languageSelect.value = state.languageIsAuto ? "auto" : state.locale;
}

languageSelect.addEventListener("change", () => {
	vscode.postMessage({ type: "setLanguage", preference: languageSelect.value });
});

function populateBalancePresetOptions() {
	const current = balancePresetInput.value;
	balancePresetInput.replaceChildren(new Option(t("common.custom"), ""));
	for (const preset of state.balancePresets) {
		balancePresetInput.appendChild(new Option(preset.label, preset.id));
	}
	balancePresetInput.value = current;
}

function updateBalancePresetHint() {
	const preset = state.balancePresets.find((entry) => entry.id === balancePresetInput.value);
	balancePresetHint.textContent = preset
		? `${preset.description} ${preset.baseUrlHint}`
		: t("balance.presetDescription");
}

function openBalanceModal(provider) {
	balanceModalProvider = provider;
	const config = providerConfigOf(provider).balance || {};
	balanceModalTitle.textContent = t("balance.modalTitleFor", provider);
	balanceEnabledInput.checked = config.enabled === true;
	balancePresetInput.value = config.preset || "";
	balanceUrlInput.value = config.url || "";
	balanceMethodInput.value = (config.method || "GET").toUpperCase();
	balanceAuthInput.value = config.auth || "bearer";
	balanceHeadersInput.value = config.headers ? JSON.stringify(config.headers, null, 2) : "";
	const extract = config.extract || {};
	balanceRemainingInput.value = extract.remaining || "";
	balanceUnitInput.value = extract.unit || "";
	balancePlanNameInput.value = extract.planName || "";
	balanceTotalInput.value = extract.total || "";
	balanceUsedInput.value = extract.used || "";
	balanceExtraInput.value = extract.extra || "";
	balanceTimeoutInput.value = config.timeoutMs || "";
	balanceIntervalInput.value = config.intervalMinutes || "";
	hideBalanceTestResult();
	updateBalancePresetHint();
	balanceModal.style.display = "flex";
}

function closeBalanceModal() {
	balanceModal.style.display = "none";
	balanceModalProvider = "";
}

/** Fill only the fields the user has left empty, so a preset never overwrites typed values. */
function applyBalancePresetDefaults() {
	const preset = state.balancePresets.find((entry) => entry.id === balancePresetInput.value);
	if (!preset) {
		return;
	}
	const fill = (input, value) => {
		if (!input.value.trim() && value) {
			input.value = value;
		}
	};
	fill(balanceUrlInput, preset.config.url);
	fill(balanceMethodInput, preset.config.method);
	fill(balanceAuthInput, preset.config.auth);
	fill(balanceRemainingInput, preset.config.extract.remaining);
	fill(balanceUnitInput, preset.config.extract.unit);
	fill(balancePlanNameInput, preset.config.extract.planName);
	fill(balanceTotalInput, preset.config.extract.total);
	fill(balanceUsedInput, preset.config.extract.used);
	fill(balanceExtraInput, preset.config.extract.extra);
	if (!balanceHeadersInput.value.trim() && preset.config.headers) {
		balanceHeadersInput.value = JSON.stringify(preset.config.headers, null, 2);
	}
	// Picking a preset is a statement of intent, so switch the query on rather
	// than letting Save silently store an inactive configuration.
	balanceEnabledInput.checked = true;
}

/** Read the dialog into a `ProviderBalanceConfig`, or report the first problem. */
function collectBalanceConfig() {
	const remaining = balanceRemainingInput.value.trim();
	if (balanceEnabledInput.checked && !remaining) {
		return { ok: false, error: t("error.remainingRequired") };
	}
	const parsedHeaders = parseJsonObject(balanceHeadersInput.value, "balance.headersLabel");
	if (!parsedHeaders.ok) {
		return { ok: false, error: parsedHeaders.error };
	}
	const text = (input) => input.value.trim() || undefined;
	const number = (input) => {
		const raw = input.value.trim();
		if (!raw) {
			return undefined;
		}
		const value = Number(raw);
		return Number.isFinite(value) && value > 0 ? value : undefined;
	};
	const extract = {
		remaining,
		unit: text(balanceUnitInput),
		planName: text(balancePlanNameInput),
		total: text(balanceTotalInput),
		used: text(balanceUsedInput),
		extra: text(balanceExtraInput),
	};
	const config = {
		enabled: balanceEnabledInput.checked,
		preset: balancePresetInput.value || undefined,
		url: text(balanceUrlInput),
		method: balanceMethodInput.value,
		auth: balanceAuthInput.value,
		headers: parsedHeaders.value,
		extract,
		timeoutMs: number(balanceTimeoutInput),
		intervalMinutes: number(balanceIntervalInput),
	};
	return { ok: true, value: config };
}

function hideBalanceTestResult() {
	balanceTestResultElement.style.display = "none";
	balanceTestResultElement.replaceChildren();
}

function renderBalanceTestResult(message) {
	balanceTestResultElement.replaceChildren();
	balanceTestResultElement.className = `balance-test-result ${message.error ? "failed" : "succeeded"}`;
	if (message.error) {
		const title = document.createElement("div");
		title.className = "balance-test-title";
		title.textContent = t("balance.statusQueryFailed");
		const detail = document.createElement("div");
		detail.textContent = message.error;
		balanceTestResultElement.append(title, detail);
	} else if (message.result) {
		const title = document.createElement("div");
		title.className = "balance-test-title";
		title.textContent = t("balance.resultLabel", message.result.label);
		const detail = document.createElement("div");
		detail.className = "balance-test-detail";
		const parts = [];
		if (message.result.planName) {
			parts.push(t("balance.detailPlan", message.result.planName));
		}
		if (typeof message.result.total === "number") {
			parts.push(t("balance.detailTotal", message.result.total));
		}
		if (typeof message.result.used === "number") {
			parts.push(t("balance.detailUsed", message.result.used));
		}
		if (message.result.extra) {
			parts.push(message.result.extra);
		}
		detail.textContent = parts.join(" · ");
		const url = document.createElement("div");
		url.className = "balance-test-url";
		url.textContent = message.result.requestUrl;
		balanceTestResultElement.append(title, detail, url);
	}
	balanceTestResultElement.style.display = "block";
}

function saveBalanceConfig() {
	const provider = balanceModalProvider;
	if (!provider) {
		return;
	}
	const collected = collectBalanceConfig();
	if (!collected.ok) {
		renderBalanceTestResult({ error: collected.error });
		return;
	}
	const row = providerTableBody.querySelector(`tr[data-provider="${CSS.escape(provider)}"]`);
	if (!row) {
		// The provider row is gone; nothing sensible to save against.
		closeBalanceModal();
		return;
	}
	// The host replaces the whole provider record, so send the row's current values too.
	const providerData = collectProviderRowValues(row);
	const parsedHeaders = parseJsonObject(providerData.headers, "advanced.headersLabel");
	if (!parsedHeaders.ok) {
		showProviderError(parsedHeaders.error);
		return;
	}
	showProviderError("");
	postOperation(
		{
			type: "updateProvider",
			provider,
			baseUrl: providerData.baseUrl || undefined,
			apiKey: providerData.apiKey || undefined,
			apiMode: providerData.apiMode || undefined,
			headers: parsedHeaders.value,
			sessionIdHeader: providerData.sessionIdHeader,
			balance: collected.value,
		},
		() => {
			// Show the new configuration at once, then let the host's init refresh
			// reconcile anything else it changed.
			applySavedBalanceConfig(provider, collected.value);
			closeBalanceModal();
		},
		(error) => renderBalanceTestResult({ error })
	);
}

// Balance dialog events
document.querySelectorAll("[data-balance-dismiss]").forEach((element) => {
	element.addEventListener("click", closeBalanceModal);
});

balancePresetInput.addEventListener("change", () => {
	applyBalancePresetDefaults();
	updateBalancePresetHint();
	hideBalanceTestResult();
});

document.getElementById("balanceTest").addEventListener("click", () => {
	if (!balanceModalProvider) {
		return;
	}
	const collected = collectBalanceConfig();
	if (!collected.ok) {
		renderBalanceTestResult({ error: collected.error });
		return;
	}
	balanceTestResultElement.replaceChildren();
	balanceTestResultElement.className = "balance-test-result pending";
	balanceTestResultElement.textContent = t("balance.statusQuerying");
	balanceTestResultElement.style.display = "block";
	vscode.postMessage({ type: "testBalance", provider: balanceModalProvider, balance: collected.value });
});

document.getElementById("balanceSave").addEventListener("click", saveBalanceConfig);

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && balanceModal.style.display !== "none") {
		closeBalanceModal();
	}
});

function renderModels() {
	const models = state.models.filter((m) => m.providerConfig !== true).sort((a, b) => a.id.localeCompare(b.id));
	if (!models.length) {
		modelTableBody.replaceChildren(createNoDataRow(11, t("models.empty")));
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
				modelFormTitle.textContent = t("modelForm.editTitle", provider, modelId);
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
				message: t("confirm.deleteModel", provider, modelId),
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
		["update-model-btn", t("common.edit")],
		["delete-model-btn danger", t("common.delete")],
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
	toggleAdvancedSettingsBtn.textContent = t("advanced.show");
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
	const headers = parseJsonObject(modelHeadersInput.value, "advanced.headersLabel");
	if (!headers.ok) {
		return headers;
	}
	const extra = parseJsonObject(modelExtraInput.value, "advanced.extraLabel");
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
		showModelError(t("error.modelIdRequired"));
		return false;
	}
	if (modelData.id.startsWith("__provider__")) {
		showModelError(t("error.reservedModelIdPrefix"));
		return false;
	}
	if (!modelData.owned_by) {
		showModelError(t("error.providerIdRequired"));
		return false;
	}
	if (!modelData.displayName) {
		showModelError(t("error.displayNameRequired"));
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
		showModelError(t("error.duplicateModelId", modelData.id, modelData.owned_by));
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
		showModelError(t("error.duplicateDisplayName", modelData.displayName));
		return false;
	}

	// Validate numeric fields if provided
	if (modelData.context_length !== undefined && (isNaN(modelData.context_length) || modelData.context_length <= 0)) {
		showModelError(t("error.contextLengthPositive"));
		return false;
	}
	if (modelData.max_tokens !== undefined && (isNaN(modelData.max_tokens) || modelData.max_tokens <= 0)) {
		showModelError(t("error.maxTokensPositive"));
		return false;
	}
	if (
		modelData.max_completion_tokens !== undefined &&
		(isNaN(modelData.max_completion_tokens) || modelData.max_completion_tokens <= 0)
	) {
		showModelError(t("error.maxCompletionTokensPositive"));
		return false;
	}
	// Prevent both max_tokens and max_completion_tokens from being set simultaneously
	if (modelData.max_tokens !== undefined && modelData.max_completion_tokens !== undefined) {
		showModelError(t("error.bothMaxTokens"));
		return false;
	}
	if (
		modelData.temperature !== undefined &&
		(isNaN(modelData.temperature) || modelData.temperature < 0 || modelData.temperature > 2)
	) {
		showModelError(t("error.temperatureRange"));
		return false;
	}
	if (modelData.top_p !== undefined && (isNaN(modelData.top_p) || modelData.top_p < 0 || modelData.top_p > 1)) {
		showModelError(t("error.topPRange"));
		return false;
	}
	if (modelData.delay !== undefined && (isNaN(modelData.delay) || modelData.delay < 0)) {
		showModelError(t("error.delayNonNegative"));
		return false;
	}

	// Validate JSON fields
	if (modelData.headers && typeof modelData.headers !== "object") {
		showModelError(t("error.headersJson"));
		return false;
	}
	if (modelData.extra && typeof modelData.extra !== "object") {
		showModelError(t("error.extraJson"));
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
		dropdownHeader.textContent = t("models.emptyDropdown");
		return;
	}

	dropdownHeader.textContent = t("models.selectAvailable", modelsArray.length);

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
		dropdownHeader.textContent = t("models.selectMatching", visibleCount);
	});
}

// Initialize dropdown events
initDropdownEvents();

vscode.postMessage({ type: "requestInit" });
