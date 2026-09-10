import * as vscode from "vscode";
import { HuggingFaceChatModelProvider } from "./provider";
import { initStatusBar } from "./statusBar";
import { ConfigViewPanel } from "./views/configView";
import { logger } from "./logger";
import { getGlobalUserModels } from "./utils";
import { assertValidModelCollection, canonicalizeProvider, migrateLegacyModelMetadata } from "./modelIdentity";
import { abortCommitGeneration, generateCommitMsg } from "./gitCommit/commitMessageGenerator";
import { TokenizerManager } from "./tokenizer/tokenizerManager";
import { VersionManager } from "./versionManager";

const PROVIDER_CONFIG_MIGRATION_KEY = "oaicopilot.providerConfigMigration.v2";
const LEGACY_DEFAULT_BASE_URL = "https://router.huggingface.co/v1";

export async function activate(context: vscode.ExtensionContext) {
	// Initialize logger
	logger.init();
	await migrateLegacyGlobalConfiguration(context);

	// Capture this extension's own identity; the ID depends on publisher and name
	VersionManager.initialize(context);

	// Initialize TokenizerManager with extension path
	TokenizerManager.initialize(context.extensionPath);

	const tokenCountStatusBarItem: vscode.StatusBarItem = initStatusBar(context);
	const provider = new HuggingFaceChatModelProvider(context.secrets, tokenCountStatusBarItem);
	// Register the Hugging Face provider under the vendor id used in package.json
	vscode.lm.registerLanguageModelChatProvider("oaicopilot", provider);

	// Management command to configure provider-specific API keys
	context.subscriptions.push(
		vscode.commands.registerCommand("oaicopilot.setProviderApikey", async () => {
			// Get provider list from configuration
			const config = vscode.workspace.getConfiguration();
			const userModels = getGlobalUserModels(config);

			// Extract unique providers (case-insensitive)
			const providers = Array.from(
				new Set(userModels.map((m) => m.owned_by.toLowerCase()).filter((p) => p && p.trim() !== ""))
			).sort();

			if (providers.length === 0) {
				vscode.window.showErrorMessage(
					"No providers found in oaicopilot.models configuration. Please configure models first."
				);
				return;
			}

			// Let user select provider
			const selectedProvider = await vscode.window.showQuickPick(providers, {
				title: "Select Provider",
				placeHolder: "Select a provider to configure API key",
			});

			if (!selectedProvider) {
				return; // user canceled
			}

			// Get existing API key for selected provider
			const providerKey = `oaicopilot.apiKey.${selectedProvider}`;
			const existing = await context.secrets.get(providerKey);

			// Prompt for API key
			const apiKey = await vscode.window.showInputBox({
				title: `PolyLLM API Key for ${selectedProvider}`,
				prompt: existing ? `Update API key for ${selectedProvider}` : `Enter API key for ${selectedProvider}`,
				ignoreFocusOut: true,
				password: true,
				value: existing ?? "",
			});

			if (apiKey === undefined) {
				return; // user canceled
			}

			if (!apiKey.trim()) {
				await context.secrets.delete(providerKey);
				vscode.window.showInformationMessage(`API key for ${selectedProvider} cleared.`);
				return;
			}

			await context.secrets.store(providerKey, apiKey.trim());
			vscode.window.showInformationMessage(`API key for ${selectedProvider} saved.`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("oaicopilot.openConfig", async () => {
			ConfigViewPanel.openPanel(context.extensionUri, context.secrets);
		})
	);

	// Register the generateGitCommitMessage command handler
	context.subscriptions.push(
		vscode.commands.registerCommand("oaicopilot.generateGitCommitMessage", async (scm) => {
			generateCommitMsg(context.secrets, scm);
		}),
		vscode.commands.registerCommand("oaicopilot.abortGitCommitMessage", () => {
			abortCommitGeneration();
		})
	);

	// Watch for logLevel configuration changes
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration("oaicopilot.logLevel")) {
				logger.reloadConfig();
			}
		})
	);
}

export function deactivate() {}

async function migrateLegacyGlobalConfiguration(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get<boolean>(PROVIDER_CONFIG_MIGRATION_KEY, false)) {
		return;
	}

	const config = vscode.workspace.getConfiguration();
	const explicitLegacyBaseUrl = config.inspect<string>("oaicopilot.baseUrl")?.globalValue?.trim() || "";
	const legacyBaseUrl = explicitLegacyBaseUrl || LEGACY_DEFAULT_BASE_URL;
	const legacyApiKey = await context.secrets.get("oaicopilot.apiKey");
	const currentModels = getGlobalUserModels(config);
	const hasLegacyConfiguration = Boolean(explicitLegacyBaseUrl || legacyApiKey || currentModels.length > 0);
	if (!hasLegacyConfiguration) {
		await context.globalState.update(PROVIDER_CONFIG_MIGRATION_KEY, true);
		return;
	}

	const migratedModels = migrateLegacyModelMetadata(
		currentModels,
		legacyBaseUrl,
		currentModels.length === 0 && Boolean(explicitLegacyBaseUrl || legacyApiKey)
	);
	const providers = Array.from(
		new Set(migratedModels.map((model) => canonicalizeProvider(model.owned_by)).filter(Boolean))
	);
	try {
		assertValidModelCollection(migratedModels);
	} catch (error) {
		const details = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(
			`PolyLLM could not migrate the legacy global connection settings. The legacy Base URL and API key were kept unchanged. Resolve the model identity conflicts and reload VS Code. ${details}`
		);
		return;
	}

	if (legacyApiKey) {
		for (const provider of providers) {
			const providerKey = `oaicopilot.apiKey.${provider}`;
			if (!(await context.secrets.get(providerKey))) {
				await context.secrets.store(providerKey, legacyApiKey);
			}
		}
	}

	if (JSON.stringify(migratedModels) !== JSON.stringify(currentModels)) {
		await config.update("oaicopilot.models", migratedModels, vscode.ConfigurationTarget.Global);
	}
	await context.secrets.delete("oaicopilot.apiKey");
	await config.update("oaicopilot.baseUrl", undefined, vscode.ConfigurationTarget.Global);
	await context.globalState.update(PROVIDER_CONFIG_MIGRATION_KEY, true);
}
