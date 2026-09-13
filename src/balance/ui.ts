import * as vscode from "vscode";
import type { BalanceService } from "./service";
import { formatBalanceLabel, formatBalanceTooltip, getBalanceSeverity } from "./format";
import { getGlobalUserModels } from "../utils";

/** Providers that have a balance query enabled, in display order. */
function configuredProviders(): string[] {
	return getGlobalUserModels(vscode.workspace.getConfiguration())
		.filter((model) => model.providerConfig === true && model.balance?.enabled === true)
		.map((model) => model.owned_by);
}

/**
 * The provider the status bar should follow: whatever the user last talked to,
 * falling back to the only configured provider so a single-provider setup shows
 * its balance without waiting for a chat request.
 */
function statusBarProvider(service: BalanceService): string | undefined {
	const providers = configuredProviders();
	if (!providers.length) {
		return undefined;
	}
	const active = service.getActiveProvider();
	if (active && providers.includes(active)) {
		return active;
	}
	return providers.length === 1 ? providers[0] : undefined;
}

function severityIcon(severity: ReturnType<typeof getBalanceSeverity>): string {
	switch (severity) {
		case "critical":
			return "$(error)";
		case "warning":
			return "$(warning)";
		default:
			return "$(credit-card)";
	}
}

/**
 * Status bar entry for the balance of the provider in use.
 *
 * It stays hidden until at least one provider has a balance query enabled, so
 * users who do not want the feature never see it.
 */
export function initBalanceStatusBar(context: vscode.ExtensionContext, service: BalanceService): vscode.StatusBarItem {
	const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
	item.name = "PolyLLM Balance";
	item.command = "oaicopilot.showBalances";
	context.subscriptions.push(item);

	const update = () => {
		const provider = statusBarProvider(service);
		const snapshot = provider ? service.getSnapshot(provider) : undefined;
		if (!provider || !snapshot) {
			item.hide();
			return;
		}
		const icon = severityIcon(getBalanceSeverity(snapshot.result));
		const label = formatBalanceLabel(snapshot);
		item.text = snapshot.refreshing && !snapshot.result ? `$(sync~spin) ${provider}` : `${icon} ${label}`;
		const tooltip = new vscode.MarkdownString(formatBalanceTooltip(snapshot));
		tooltip.appendMarkdown(`\n\nProvider: \`${provider}\``);
		tooltip.appendMarkdown("\n\nClick to list every provider balance.");
		item.tooltip = tooltip;
		item.show();
	};

	update();
	context.subscriptions.push(service.onDidChange(update));
	return item;
}

/** Quick pick listing the balance of every configured provider. */
export async function showProviderBalances(service: BalanceService): Promise<void> {
	const providers = configuredProviders();
	if (!providers.length) {
		const open = await vscode.window.showInformationMessage(
			"No provider has a balance query enabled. Open the PolyLLM configuration UI to set one up.",
			"Open Configuration"
		);
		if (open === "Open Configuration") {
			await vscode.commands.executeCommand("oaicopilot.openConfig");
		}
		return;
	}

	const items: (vscode.QuickPickItem & { provider: string })[] = providers.map((provider) => {
		const snapshot = service.getSnapshot(provider);
		const severity = getBalanceSeverity(snapshot?.result);
		const icon = snapshot ? severityIcon(severity) : "$(credit-card)";
		const details: string[] = [];
		if (snapshot?.result?.planName) {
			details.push(snapshot.result.planName);
		}
		if (typeof snapshot?.result?.total === "number") {
			details.push(`total ${snapshot.result.total}`);
		}
		if (snapshot?.stale) {
			details.push("outdated");
		}
		return {
			label: `${icon} ${provider}`,
			description: snapshot ? formatBalanceLabel(snapshot) : "not queried yet",
			detail: snapshot?.failure ? snapshot.failure.message : details.join(" · "),
			provider,
		};
	});

	const picked = await vscode.window.showQuickPick(items, {
		title: "PolyLLM Provider Balances",
		placeHolder: "Select a provider to refresh its balance",
		matchOnDetail: true,
	});
	if (!picked) {
		return;
	}
	await vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title: `Querying ${picked.provider} balance…` },
		async () => {
			const snapshot = await service.refresh(picked.provider);
			if (snapshot.result) {
				vscode.window.showInformationMessage(
					`${picked.provider}: ${formatBalanceLabel(snapshot)}${snapshot.stale ? " (last known value)" : ""}`
				);
			} else if (snapshot.failure) {
				vscode.window.showWarningMessage(`${picked.provider}: ${snapshot.failure.message}`);
			}
		}
	);
}
