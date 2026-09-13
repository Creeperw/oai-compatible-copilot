import * as vscode from "vscode";
import type { BalanceFailure, BalanceResult } from "./query";
import { getProviderBalanceConfig, queryProviderBalance } from "./query";
import { getGlobalProviderAliases, getGlobalUserModels, getProviderApiKey } from "../utils";

/**
 * How long a successful result stays on screen after a transient failure.
 *
 * A single blip should not blank out a balance the user was just looking at,
 * but a stale number must never outlive a credential change, which is why a
 * deterministic failure clears it immediately.
 */
export const STALE_GRACE_MS = 10 * 60 * 1000;

/** How often the service looks for providers whose refresh interval has elapsed. */
const TICK_INTERVAL_MS = 60 * 1000;

export interface BalanceSnapshot {
	provider: string;
	/** The latest successful result, possibly kept from an earlier query. */
	result?: BalanceResult;
	/** The latest failure, if the most recent query did not succeed. */
	failure?: BalanceFailure;
	/** True when `result` predates the most recent failure. */
	stale?: boolean;
	/** True while a query is running. */
	refreshing?: boolean;
}

function isWithinGrace(result: BalanceResult | undefined, now: number): boolean {
	return Boolean(result) && now - result!.checkedAt <= STALE_GRACE_MS;
}

/**
 * Owns balance snapshots for every configured provider.
 *
 * The service is deliberately independent of the webview and the status bar:
 * both subscribe to `onDidChange` and read snapshots, so a query started from
 * the configuration UI also updates the status bar and the command palette.
 */
export class BalanceService implements vscode.Disposable {
	private readonly cache = new Map<string, BalanceSnapshot>();
	private readonly inflight = new Map<string, Promise<BalanceSnapshot>>();
	private readonly emitter = new vscode.EventEmitter<void>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private activeProvider = "";

	readonly onDidChange = this.emitter.event;

	constructor(private readonly secrets: vscode.SecretStorage) {}

	dispose(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
		this.emitter.dispose();
	}

	/** Remember which provider the user is currently talking to, for the status bar. */
	setActiveProvider(provider: string): void {
		if (this.activeProvider === provider) {
			return;
		}
		this.activeProvider = provider;
		this.emitter.fire();
	}

	getActiveProvider(): string {
		return this.activeProvider;
	}

	getSnapshot(provider: string): BalanceSnapshot | undefined {
		return this.cache.get(provider);
	}

	getSnapshots(): BalanceSnapshot[] {
		return [...this.cache.values()];
	}

	/** Drop cached state for providers that no longer configure a balance query. */
	private prune(): void {
		const models = getGlobalUserModels(vscode.workspace.getConfiguration());
		const configured = new Set(
			models
				.filter((model) => model.providerConfig === true && model.balance?.enabled === true)
				.map((model) => model.owned_by)
		);
		let changed = false;
		for (const provider of [...this.cache.keys()]) {
			if (!configured.has(provider)) {
				this.cache.delete(provider);
				changed = true;
			}
		}
		if (changed) {
			this.emitter.fire();
		}
	}

	/** Forget one provider's snapshot, for example after its configuration changed. */
	invalidate(provider?: string): void {
		if (provider) {
			this.cache.delete(provider);
		} else {
			this.cache.clear();
		}
		this.emitter.fire();
	}

	/**
	 * Query one provider. Concurrent calls for the same provider share a single
	 * request instead of racing each other.
	 */
	async refresh(provider: string): Promise<BalanceSnapshot> {
		const existing = this.inflight.get(provider);
		if (existing) {
			return existing;
		}
		const running = this.runQuery(provider).finally(() => {
			this.inflight.delete(provider);
		});
		this.inflight.set(provider, running);
		return running;
	}

	private async runQuery(provider: string): Promise<BalanceSnapshot> {
		const config = vscode.workspace.getConfiguration();
		const models = getGlobalUserModels(config);
		const balance = getProviderBalanceConfig(models, provider);
		const previous = this.cache.get(provider);

		if (!balance?.enabled) {
			this.cache.delete(provider);
			this.emitter.fire();
			return { provider };
		}

		this.cache.set(provider, { ...previous, provider, refreshing: true });
		this.emitter.fire();

		const providerRecord = models.find((model) => model.providerConfig === true && model.owned_by === provider);
		const aliases = getGlobalProviderAliases(config).get(provider) ?? [];
		const apiKey = (await getProviderApiKey(this.secrets, provider, aliases)) ?? "";

		const outcome = await queryProviderBalance({
			config: balance,
			baseUrl: providerRecord?.baseUrl,
			apiKey,
		});

		const now = Date.now();
		let snapshot: BalanceSnapshot;
		if (outcome.ok) {
			snapshot = { provider, result: outcome.result };
		} else if (outcome.failure.transient && isWithinGrace(previous?.result, now)) {
			// Keep the last good value visible, but say that it is old.
			snapshot = { provider, result: previous?.result, failure: outcome.failure, stale: true };
		} else {
			snapshot = { provider, failure: outcome.failure };
		}

		this.cache.set(provider, snapshot);
		this.emitter.fire();
		return snapshot;
	}

	/** Query every provider that has balance queries enabled. */
	async refreshAll(): Promise<void> {
		const models = getGlobalUserModels(vscode.workspace.getConfiguration());
		const providers = models
			.filter((model) => model.providerConfig === true && model.balance?.enabled === true)
			.map((model) => model.owned_by);
		await Promise.all(providers.map((provider) => this.refresh(provider)));
	}

	/** Start the background tick. Providers with `intervalMinutes: 0` are skipped. */
	start(): void {
		if (this.timer) {
			return;
		}
		this.timer = setInterval(() => {
			void this.tick();
		}, TICK_INTERVAL_MS);
	}

	private async tick(): Promise<void> {
		this.prune();
		const models = getGlobalUserModels(vscode.workspace.getConfiguration());
		const now = Date.now();
		const due = models.filter((model) => {
			if (model.providerConfig !== true || model.balance?.enabled !== true) {
				return false;
			}
			const interval = model.balance.intervalMinutes ?? 0;
			if (interval <= 0) {
				return false;
			}
			const last = this.cache.get(model.owned_by)?.result?.checkedAt ?? 0;
			return now - last >= interval * 60 * 1000;
		});
		await Promise.all(due.map((model) => this.refresh(model.owned_by)));
	}
}
