import * as vscode from "vscode";

export class VersionManager {
	private static _version: string | null = null;
	private static _extensionId: string | null = null;

	/**
	 * Capture the running extension's own identity.
	 * The extension ID depends on the publisher and the extension name, so it is
	 * read from the extension context instead of being hardcoded.
	 */
	static initialize(context: vscode.ExtensionContext): void {
		this._extensionId = context.extension.id;
		const version = context.extension.packageJSON?.version;
		this._version = typeof version === "string" && version ? version : null;
	}

	/**
	 * Get the current extension version
	 */
	static getVersion(): string {
		if (this._version === null) {
			const extension = this._extensionId ? vscode.extensions.getExtension(this._extensionId) : undefined;
			this._version = extension?.packageJSON?.version ?? "unknown";
		}
		return this._version!;
	}

	/**
	 * Build a descriptive User-Agent to help quantify API usage
	 * Keep UA minimal: only extension version and VS Code version
	 */
	static getUserAgent(): string {
		const vscodeVersion = vscode.version;
		return `polyllm/${this.getVersion()} VSCode/${vscodeVersion}`;
	}

	/**
	 * Get the current extension information
	 */
	static getClientInfo(): { name: string; version: string; author: string } {
		return {
			name: "polyllm",
			version: this.getVersion(),
			author: "creeperw",
		};
	}
}
