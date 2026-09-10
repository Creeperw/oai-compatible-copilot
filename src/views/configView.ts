import * as vscode from "vscode";
import { randomBytes } from "crypto";
import type { HFApiMode, HFModelItem } from "../types";
import { getGlobalProviderAliases, getGlobalUserModels, getProviderApiKey, normalizeUserModels } from "../utils";
import { fetchModels } from "../provideModel";
import { VersionManager } from "../versionManager";
import {
	assertValidModelCollection,
	canonicalizeProvider,
	createProviderConfiguration,
	getProviderConfiguration,
	getModelIdentityKey,
	isProviderPlaceholder,
	migrateLegacyModelMetadata,
	modelIdentityKeyFromParts,
	normalizeConfiguredModel,
	resolveModelConnection,
} from "../modelIdentity";

interface InitPayload {
	delay: number;
	readFileLines: number;
	retry: {
		enabled?: boolean;
		max_attempts?: number;
		interval_ms?: number;
		status_codes?: number[];
	};
	commitModel: string;
	commitLanguage: string;
	models: HFModelItem[];
	providerKeys: Record<string, boolean>;
}

interface ExportConfig {
	version: string;
	exportDate: string;
	/** Legacy fields accepted during import only. */
	baseUrl?: string;
	apiKey?: string;
	delay: number;
	retry: {
		enabled?: boolean;
		max_attempts?: number;
		interval_ms?: number;
		status_codes?: number[];
	};
	commitLanguage: string;
	commitModel: string;
	models: HFModelItem[];
	providerKeys: Record<string, string>;
	readFileLines: number;
}

type IncomingMessage =
	| { type: "requestInit" }
	| {
			type: "saveGlobalConfig";
			delay: number;
			readFileLines: number;
			retry: { enabled?: boolean; max_attempts?: number; interval_ms?: number; status_codes?: number[] };
			commitModel: string;
			commitLanguage: string;
	  }
	| {
			type: "fetchModels";
			provider: string;
	  }
	| {
			type: "addProvider";
			provider: string;
			baseUrl?: string;
			apiKey?: string;
			apiMode?: string;
			headers?: Record<string, string>;
			sessionIdHeader?: string;
	  }
	| {
			type: "updateProvider";
			provider: string;
			baseUrl?: string;
			apiKey?: string;
			apiMode?: string;
			headers?: Record<string, string>;
			sessionIdHeader?: string;
	  }
	| { type: "deleteProvider"; provider: string }
	| { type: "addModel"; model: HFModelItem }
	| { type: "updateModel"; model: HFModelItem; originalProvider: string; originalModelId: string }
	| { type: "deleteModel"; provider: string; modelId: string }
	| { type: "clearProviderApiKey"; provider: string }
	| { type: "requestConfirm"; id: string; message: string; action: string }
	| { type: "exportConfig" }
	| { type: "importConfig" };

type OutgoingMessage =
	| { type: "init"; payload: InitPayload }
	| { type: "modelsFetched"; models: HFModelItem[] }
	| { type: "modelsFetchError"; error: string }
	| { type: "confirmResponse"; id: string; confirmed: boolean }
	| { type: "operationResult"; requestId: string; success: boolean; error?: string };

type IncomingMessageWithRequestId = IncomingMessage & { requestId?: string };

const MUTATING_MESSAGE_TYPES = new Set<IncomingMessage["type"]>([
	"saveGlobalConfig",
	"addProvider",
	"updateProvider",
	"deleteProvider",
	"clearProviderApiKey",
	"addModel",
	"updateModel",
	"deleteModel",
	"importConfig",
]);

export class ConfigViewPanel {
	public static currentPanel: ConfigViewPanel | undefined;
	private readonly panel: vscode.WebviewPanel;
	private readonly extensionUri: vscode.Uri;
	private readonly secrets: vscode.SecretStorage;
	private disposables: vscode.Disposable[] = [];
	private mutationQueue: Promise<void> = Promise.resolve();

	public static openPanel(extensionUri: vscode.Uri, secrets: vscode.SecretStorage) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		if (ConfigViewPanel.currentPanel) {
			ConfigViewPanel.currentPanel.panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			"oaicopilot.config",
			"OAICopilot Configuration",
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out"), vscode.Uri.joinPath(extensionUri, "assets")],
			}
		);

		ConfigViewPanel.currentPanel = new ConfigViewPanel(panel, extensionUri, secrets);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, secrets: vscode.SecretStorage) {
		this.panel = panel;
		this.extensionUri = extensionUri;
		this.secrets = secrets;

		this.update();

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.onDidReceiveMessage(
			async (message: IncomingMessageWithRequestId) => {
				const operation = () => this.handleMessage(message);
				const pending = MUTATING_MESSAGE_TYPES.has(message.type)
					? (this.mutationQueue = this.mutationQueue.then(operation, operation))
					: operation();
				pending.catch((err) => {
					console.error("[oaicopilot] handleMessage failed", err);
					const error =
						err instanceof Error
							? err.message
							: `Unexpected error while handling configuration message[${message.type}].`;
					vscode.window.showErrorMessage(error);
					if (message.requestId) {
						void this.panel.webview.postMessage({
							type: "operationResult",
							requestId: message.requestId,
							success: false,
							error,
						} satisfies OutgoingMessage);
					}
				});
			},
			null,
			this.disposables
		);

		// Send initialization data
		this.sendInit();
	}

	private async update() {
		const webview = this.panel.webview;
		this.panel.webview.html = await this.getHtml(webview);
	}

	public dispose() {
		ConfigViewPanel.currentPanel = undefined;

		this.panel.dispose();

		while (this.disposables.length) {
			const x = this.disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	async handleMessage(message: IncomingMessageWithRequestId) {
		switch (message.type) {
			case "requestInit":
				await this.sendInit();
				break;
			case "saveGlobalConfig":
				await this.saveGlobalConfig(
					message.delay,
					message.readFileLines,
					message.retry,
					message.commitModel,
					message.commitLanguage
				);
				break;
			case "fetchModels": {
				try {
					const provider = canonicalizeProvider(message.provider);
					if (!provider) {
						throw new Error("Provider ID is required to fetch models.");
					}
					const models = getGlobalUserModels(vscode.workspace.getConfiguration());
					const providerConfiguration = getProviderConfiguration(models, provider);
					if (!providerConfiguration?.baseUrl) {
						throw new Error(`Base URL is not configured for provider "${provider}".`);
					}
					const apiKey = (await this.secrets.get(`oaicopilot.apiKey.${provider}`)) || "";
					const { models: fetchedModels } = await fetchModels(
						providerConfiguration.baseUrl,
						apiKey,
						providerConfiguration.apiMode,
						providerConfiguration.headers
					);
					this.panel.webview.postMessage({ type: "modelsFetched", models: fetchedModels });
				} catch (err) {
					console.error("[oaicopilot] fetchModels failed", err);
					const errorMessage = err instanceof Error ? err.message : String(err);
					this.panel.webview.postMessage({ type: "modelsFetchError", error: errorMessage });
				}
				break;
			}
			case "addProvider":
				await this.addProvider(
					message.provider,
					message.baseUrl,
					message.apiKey,
					message.apiMode,
					message.headers,
					message.sessionIdHeader
				);
				break;
			case "updateProvider":
				await this.updateProvider(
					message.provider,
					message.baseUrl,
					message.apiKey,
					message.apiMode,
					message.headers,
					message.sessionIdHeader
				);
				break;
			case "deleteProvider":
				await this.deleteProvider(message.provider);
				break;
			case "clearProviderApiKey":
				await this.clearProviderApiKey(message.provider);
				break;
			case "addModel":
				await this.addModel(message.model);
				break;
			case "updateModel":
				await this.updateModel(message.model, message.originalProvider, message.originalModelId);
				break;
			case "requestConfirm":
				await this.handleConfirmRequest(message.id, message.message, message.action);
				break;
			case "deleteModel":
				await this.deleteModel(message.provider, message.modelId);
				break;
			case "exportConfig":
				await this.exportConfig();
				break;
			case "importConfig":
				await this.importConfig();
				break;
			default:
				throw new Error("Unknown configuration message type.");
		}
		if (message.requestId) {
			await this.panel.webview.postMessage({
				type: "operationResult",
				requestId: message.requestId,
				success: true,
			} satisfies OutgoingMessage);
		}
	}

	private async handleConfirmRequest(id: string, message: string, action: string) {
		let confirmed: boolean | string | undefined;

		if (action === "showInfo") {
			// For informational messages, just show the message without confirmation
			await vscode.window.showInformationMessage(message);
			confirmed = true;
		} else {
			// For confirmation requests, show Yes/No dialog
			confirmed = await vscode.window.showInformationMessage(message, { modal: true }, "Yes", "No");
		}

		// Send response back to webview
		this.panel.webview.postMessage({
			type: "confirmResponse",
			id: id,
			confirmed: action === "showInfo" ? true : confirmed === "Yes",
		} as OutgoingMessage);
	}

	private async sendInit() {
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		assertValidModelCollection(models);

		const providerKeys: Record<string, boolean> = {};
		const providers = Array.from(new Set(models.map((m) => m.owned_by).filter(Boolean)));
		const providerAliases = getGlobalProviderAliases(config);
		for (const provider of providers) {
			const key = await getProviderApiKey(this.secrets, provider, providerAliases.get(provider) ?? []);
			if (key) {
				providerKeys[provider] = true;
			}
		}

		const delay = config.get<number>("oaicopilot.delay", 0);
		const retry = config.get<{
			enabled?: boolean;
			max_attempts?: number;
			interval_ms?: number;
			status_codes?: number[];
		}>("oaicopilot.retry", {
			enabled: true,
			max_attempts: 3,
			interval_ms: 1000,
		});

		const foundModel = models.find((model) => model.useForCommitGeneration === true);
		const commitModel = foundModel ? getModelIdentityKey(foundModel) : "";
		const commitLanguage = config.get<string>("oaicopilot.commitLanguage", "English");
		const readFileLines = config.get<number>("oaicopilot.readFileLines", 0);
		const payload: InitPayload = {
			delay,
			readFileLines,
			retry,
			commitModel,
			commitLanguage,
			models,
			providerKeys,
		};
		this.panel.webview.postMessage({ type: "init", payload });
	}

	private async saveGlobalConfig(
		delay: number,
		readFileLines: number,
		retry: { enabled?: boolean; max_attempts?: number; interval_ms?: number; status_codes?: number[] },
		commitModel: string,
		commitLanguage: string
	) {
		const config = vscode.workspace.getConfiguration();
		await config.update("oaicopilot.delay", delay, vscode.ConfigurationTarget.Global);
		await config.update("oaicopilot.readFileLines", readFileLines, vscode.ConfigurationTarget.Global);
		await config.update("oaicopilot.retry", retry, vscode.ConfigurationTarget.Global);
		await config.update("oaicopilot.commitLanguage", commitLanguage, vscode.ConfigurationTarget.Global);

		// Update models to set useForCommitGeneration based on selected commitModel
		const models = getGlobalUserModels(config);
		if (commitModel) {
			const selected = models.find(
				(model) => !isProviderPlaceholder(model) && getModelIdentityKey(model) === commitModel
			);
			if (!selected) {
				throw new Error("The selected commit-generation model was not found.");
			}
			if ((resolveModelConnection(models, selected).apiMode ?? "openai") === "gemini") {
				throw new Error("Gemini API mode is not supported for commit message generation.");
			}
		}
		const updatedModels = models.map((model) => {
			if (commitModel && getModelIdentityKey(model) === commitModel) {
				return { ...model, useForCommitGeneration: true };
			}
			const updated = { ...model };
			delete updated.useForCommitGeneration;
			return updated;
		});
		await config.update("oaicopilot.models", updatedModels, vscode.ConfigurationTarget.Global);

		vscode.window.showInformationMessage("OAICopilot global behavior settings have been saved.");
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async getHtml(webview: vscode.Webview) {
		const nonce = this.getNonce();
		const assetsRoot = vscode.Uri.joinPath(this.extensionUri, "assets", "configView");
		const templatePath = vscode.Uri.joinPath(assetsRoot, "configView.html");
		const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, "configView.css"));
		const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(assetsRoot, "configView.js"));
		const csp = [
			`default-src 'none'`,
			`img-src ${webview.cspSource} https:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src ${webview.cspSource} 'nonce-${nonce}'`,
		].join("; ");

		const raw = await vscode.workspace.fs.readFile(templatePath);
		let html = new TextDecoder("utf-8").decode(raw);
		html = html
			.replaceAll("%CSP_SOURCE%", csp)
			.replaceAll("%NONCE%", nonce)
			.replace("%CSS_URI%", cssUri.toString())
			.replace("%SCRIPT_URI%", jsUri.toString());
		return html;
	}

	private getNonce() {
		return randomBytes(16).toString("base64");
	}

	private async addProvider(
		provider: string,
		baseUrl?: string,
		apiKey?: string,
		apiMode?: string,
		headers?: Record<string, string>,
		sessionIdHeader?: string
	) {
		const normalizedProvider = canonicalizeProvider(provider);
		if (!normalizedProvider) {
			throw new Error("Provider ID is required.");
		}

		// Save provider configuration to the model list
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		if (models.some((model) => model.owned_by === normalizedProvider)) {
			throw new Error(`Provider "${normalizedProvider}" already exists.`);
		}
		models.push(
			createProviderConfiguration(normalizedProvider, {
				baseUrl,
				apiMode: (apiMode as HFApiMode) || "openai",
				headers,
				session_id_header: sessionIdHeader?.trim() || undefined,
			})
		);
		assertValidModelCollection(models);

		await config.update("oaicopilot.models", models, vscode.ConfigurationTarget.Global);
		if (apiKey?.trim()) {
			await this.secrets.store(`oaicopilot.apiKey.${normalizedProvider}`, apiKey.trim());
		}
		vscode.window.showInformationMessage(`Provider ${provider} has been added.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async updateProvider(
		provider: string,
		baseUrl?: string,
		apiKey?: string,
		apiMode?: string,
		headers?: Record<string, string>,
		sessionIdHeader?: string
	) {
		const normalizedProvider = canonicalizeProvider(provider);
		if (!normalizedProvider) {
			throw new Error("Provider ID is required.");
		}

		// Update the provider's configuration in the model list
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		if (!models.some((model) => model.owned_by === normalizedProvider)) {
			throw new Error(`Provider "${normalizedProvider}" was not found.`);
		}

		let foundProviderConfiguration = false;
		const updatedModels = models.map((model) => {
			if (model.owned_by === normalizedProvider && isProviderPlaceholder(model)) {
				foundProviderConfiguration = true;
				const rest = { ...model };
				delete rest.headers;
				return {
					...rest,
					baseUrl: baseUrl?.trim() || undefined,
					apiMode: (apiMode as HFApiMode) || model.apiMode,
					...(headers !== undefined && { headers }),
					...(sessionIdHeader !== undefined && { session_id_header: sessionIdHeader.trim() || undefined }),
				};
			}
			return model;
		});
		if (!foundProviderConfiguration) {
			updatedModels.push(
				createProviderConfiguration(normalizedProvider, {
					baseUrl,
					apiMode: (apiMode as HFApiMode) || "openai",
					headers,
					session_id_header: sessionIdHeader?.trim() || undefined,
				})
			);
		}
		assertValidModelCollection(updatedModels);

		await config.update("oaicopilot.models", updatedModels, vscode.ConfigurationTarget.Global);
		if (apiKey?.trim()) {
			await this.secrets.store(`oaicopilot.apiKey.${normalizedProvider}`, apiKey.trim());
		}
		vscode.window.showInformationMessage(`Provider ${provider} has been updated.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async deleteProvider(provider: string) {
		const normalizedProvider = canonicalizeProvider(provider);
		if (!normalizedProvider) {
			throw new Error("Provider ID is required.");
		}
		// Remove all models of this provider from the model list
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		const filteredModels = models.filter((model) => model.owned_by !== normalizedProvider);

		await config.update("oaicopilot.models", filteredModels, vscode.ConfigurationTarget.Global);
		// Delete the key only after the model update succeeds. An orphaned key is
		// safer and recoverable; a deleted key paired with live models is not.
		await this.secrets.delete(`oaicopilot.apiKey.${normalizedProvider}`);
		vscode.window.showInformationMessage(`Provider ${provider} and all its models have been deleted.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async clearProviderApiKey(provider: string) {
		const normalizedProvider = canonicalizeProvider(provider);
		if (!normalizedProvider) {
			throw new Error("Provider ID is required.");
		}
		await this.secrets.delete(`oaicopilot.apiKey.${normalizedProvider}`);
		vscode.window.showInformationMessage(`API key for ${normalizedProvider} has been cleared.`);
		await this.sendInit();
	}

	private async addModel(model: HFModelItem) {
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		const normalizedModel = normalizeConfiguredModel(model);
		const updatedModels = [...models, normalizedModel];
		assertValidModelCollection(updatedModels);
		models.push(normalizedModel);
		await config.update("oaicopilot.models", models, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(`Model ${normalizedModel.owned_by} / ${normalizedModel.id} has been added.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async updateModel(model: HFModelItem, originalProvider: string, originalModelId: string) {
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		const normalizedModel = normalizeConfiguredModel(model);
		const originalIdentity = modelIdentityKeyFromParts(originalProvider, originalModelId);
		let found = false;

		const updatedModels = models.map((m) => {
			if (!found && getModelIdentityKey(m) === originalIdentity) {
				found = true;
				return normalizedModel;
			}
			return m;
		});
		if (!found) {
			throw new Error(`Original model ${originalProvider} / ${originalModelId} was not found.`);
		}
		assertValidModelCollection(updatedModels);

		await config.update("oaicopilot.models", updatedModels, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(`Model ${normalizedModel.owned_by} / ${normalizedModel.id} has been updated.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async deleteModel(provider: string, modelId: string) {
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		const identity = modelIdentityKeyFromParts(provider, modelId);
		const filteredModels = models.filter((model) => getModelIdentityKey(model) !== identity);

		await config.update("oaicopilot.models", filteredModels, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(`Model ${canonicalizeProvider(provider)} / ${modelId} has been deleted.`);
		// Send refresh signal to frontend
		await this.sendInit();
	}

	private async exportConfig() {
		try {
			const confirmed = await vscode.window.showWarningMessage(
				"The exported configuration contains provider API keys in plain text. Store it securely and never commit or share it.",
				{ modal: true },
				"Export"
			);
			if (confirmed !== "Export") {
				return;
			}
			const config = vscode.workspace.getConfiguration();
			const delay = config.get<number>("oaicopilot.delay", 0);
			const retry = config.get<{
				enabled?: boolean;
				max_attempts?: number;
				interval_ms?: number;
				status_codes?: number[];
			}>("oaicopilot.retry", {
				enabled: true,
				max_attempts: 3,
				interval_ms: 1000,
			});
			const commitLanguage = config.get<string>("oaicopilot.commitLanguage", "English");
			const readFileLines = config.get<number>("oaicopilot.readFileLines", 0);
			const models = getGlobalUserModels(config);

			const foundModel = models.find((model) => model.useForCommitGeneration === true);
			const commitModel = foundModel ? getModelIdentityKey(foundModel) : "";

			const providerKeys: Record<string, string> = {};
			const providers = Array.from(new Set(models.map((m) => m.owned_by).filter(Boolean)));
			for (const provider of providers) {
				const normalized = provider.toLowerCase();
				const key = await this.secrets.get(`oaicopilot.apiKey.${normalized}`);
				if (key) {
					providerKeys[provider] = key;
				}
			}

			const exportData: ExportConfig = {
				version: VersionManager.getVersion(),
				exportDate: new Date().toISOString(),
				delay,
				retry,
				commitLanguage,
				commitModel,
				models,
				readFileLines,
				providerKeys,
			};

			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(`oaicopilot-config-${new Date().toISOString().split("T")[0]}.json`),
				filters: { "JSON Files": ["json"] },
				title: "Export OAICopilot Configuration",
			});

			if (!uri) {
				vscode.window.showInformationMessage("Export configuration cancelled.");
				return;
			}

			const encoder = new TextEncoder();
			await vscode.workspace.fs.writeFile(uri, encoder.encode(JSON.stringify(exportData, null, 2)));

			vscode.window.showInformationMessage(`Configuration exported to ${uri.fsPath}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			vscode.window.showErrorMessage(`Failed to export configuration: ${errorMessage}`);
			throw error;
		}
	}

	private async importConfig() {
		try {
			const uri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: { "JSON Files": ["json"] },
				title: "Import OAICopilot Configuration",
			});

			if (!uri || uri.length === 0) {
				vscode.window.showInformationMessage("Import configuration cancelled.");
				return;
			}

			const content = await vscode.workspace.fs.readFile(uri[0]);
			const decoder = new TextDecoder();
			const jsonContent = decoder.decode(content);
			const importData = JSON.parse(jsonContent) as ExportConfig;

			if (!Array.isArray(importData.models)) {
				throw new Error("Invalid configuration file: models must be an array");
			}

			const config = vscode.workspace.getConfiguration();
			const migratedModels = migrateLegacyModelMetadata(
				normalizeUserModels(importData.models),
				importData.baseUrl || "",
				false
			);
			assertValidModelCollection(migratedModels);
			const importedProviderKeys = new Map<string, string>();
			for (const [rawProvider, rawKey] of Object.entries(importData.providerKeys || {})) {
				const provider = canonicalizeProvider(rawProvider);
				if (!provider || typeof rawKey !== "string" || !rawKey.trim()) {
					continue;
				}
				const existing = importedProviderKeys.get(provider);
				if (existing && existing !== rawKey.trim()) {
					throw new Error(`Import contains conflicting API keys for canonical provider "${provider}".`);
				}
				importedProviderKeys.set(provider, rawKey.trim());
			}
			const providers = Array.from(new Set(migratedModels.map((model) => model.owned_by).filter(Boolean)));
			const importedSecrets = new Map<string, string>();
			for (const provider of providers) {
				const key = importedProviderKeys.get(provider) || importData.apiKey?.trim() || "";
				if (key) {
					importedSecrets.set(provider, key);
				}
			}

			// Validate everything above before changing either settings or SecretStorage.
			await config.update("oaicopilot.delay", importData.delay ?? 0, vscode.ConfigurationTarget.Global);
			await config.update(
				"oaicopilot.retry",
				importData.retry ?? { enabled: true, max_attempts: 3, interval_ms: 1000, status_codes: [] },
				vscode.ConfigurationTarget.Global
			);
			await config.update("oaicopilot.readFileLines", importData.readFileLines ?? 0, vscode.ConfigurationTarget.Global);
			await config.update(
				"oaicopilot.commitLanguage",
				importData.commitLanguage || "English",
				vscode.ConfigurationTarget.Global
			);

			await config.update("oaicopilot.models", migratedModels, vscode.ConfigurationTarget.Global);

			for (const [provider, key] of importedSecrets) {
				await this.secrets.store(`oaicopilot.apiKey.${provider}`, key);
			}
			await this.secrets.delete("oaicopilot.apiKey");
			await config.update("oaicopilot.baseUrl", undefined, vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage("Configuration imported successfully.");
			await this.sendInit();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			vscode.window.showErrorMessage(`Failed to import configuration: ${errorMessage}`);
			throw error;
		}
	}
}
