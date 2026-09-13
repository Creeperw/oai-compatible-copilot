import type { BalanceSnapshot } from "./service";

/** How urgent a remaining balance is, used to colour the UI. */
export type BalanceSeverity = "ok" | "warning" | "critical" | "unknown";

export function formatBalanceAmount(value: number): string {
	if (!Number.isFinite(value)) {
		return "-";
	}
	const abs = Math.abs(value);
	if (abs === 0) {
		return "0";
	}
	if (abs >= 1000) {
		return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
	}
	if (abs >= 1) {
		return value.toFixed(2);
	}
	if (abs >= 0.01) {
		return value.toFixed(4);
	}
	return value.toPrecision(3);
}

/** `12.50 USD`, or just the amount when the provider does not report a unit. */
export function formatBalanceValue(remaining: number, unit?: string): string {
	const amount = formatBalanceAmount(remaining);
	return unit ? `${amount} ${unit}` : amount;
}

/**
 * Judge how much is left. Only possible when the provider reports a total;
 * otherwise the balance is shown without a colour judgement.
 */
export function getBalanceSeverity(result: { remaining?: number; total?: number } | undefined): BalanceSeverity {
	if (!result || typeof result.remaining !== "number" || typeof result.total !== "number" || result.total <= 0) {
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

/** A short label for the status bar and list rows. */
export function formatBalanceLabel(snapshot: BalanceSnapshot | undefined): string {
	if (!snapshot) {
		return "";
	}
	if (snapshot.result) {
		return formatBalanceValue(snapshot.result.remaining ?? 0, snapshot.result.unit);
	}
	return "unavailable";
}

export function formatBalanceTooltip(snapshot: BalanceSnapshot | undefined): string {
	if (!snapshot) {
		return "No balance information yet.";
	}
	const lines: string[] = [];
	if (snapshot.result) {
		lines.push(`**${formatBalanceValue(snapshot.result.remaining ?? 0, snapshot.result.unit)}**`);
		if (snapshot.result.planName) {
			lines.push(`Plan: ${snapshot.result.planName}`);
		}
		if (typeof snapshot.result.total === "number") {
			lines.push(`Total: ${formatBalanceAmount(snapshot.result.total)}`);
		}
		if (typeof snapshot.result.used === "number") {
			lines.push(`Used: ${formatBalanceAmount(snapshot.result.used)}`);
		}
		if (snapshot.result.extra) {
			lines.push(snapshot.result.extra);
		}
		lines.push(`Updated: ${new Date(snapshot.result.checkedAt).toLocaleString()}`);
	}
	if (snapshot.failure) {
		lines.push(
			snapshot.stale
				? `Last refresh failed, showing an older value. ${snapshot.failure.message}`
				: `Error: ${snapshot.failure.message}`
		);
	}
	if (snapshot.result) {
		lines.push(`Endpoint: ${snapshot.result.requestUrl}`);
	} else if (snapshot.failure?.requestUrl) {
		lines.push(`Endpoint: ${snapshot.failure.requestUrl}`);
	}
	return lines.join("\n\n");
}
