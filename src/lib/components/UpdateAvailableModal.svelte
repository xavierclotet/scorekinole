<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { APP_VERSION } from '$lib/constants';
	import { Browser } from '@capacitor/browser';
	import { dismissVersion } from '$lib/utils/versionCheck';
	import { theme } from '$lib/stores/theme';

	interface Props {
		isOpen?: boolean;
		latestVersion: string;
		downloadUrl: string;
		onclose?: () => void;
	}

	let { isOpen = false, latestVersion, downloadUrl, onclose }: Props = $props();

	// GitHub releases page as fallback (always works)
	const releasesUrl = 'https://github.com/xavierclotet/scorekinole/releases/latest';

	async function handleDownload() {
		try {
			// Try to open in external browser
			await Browser.open({ url: releasesUrl });
			onclose?.();
		} catch (error) {
			console.error('Failed to open browser:', error);
			// Fallback: use window.open
			window.open(releasesUrl, '_blank');
			onclose?.();
		}
	}

	function dismiss() {
		dismissVersion(latestVersion);
		onclose?.();
	}
</script>

{#if isOpen}
	<div class="overlay" data-theme={$theme} role="dialog" aria-modal="true">
		<div class="modal">
			<div class="header">
				<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="15" x2="12" y2="3" />
				</svg>
				<span class="title">{m.update_available()}</span>
			</div>

			<div class="content">
				<p class="message">{m.update_newVersionAvailable()}</p>

				<div class="versions">
					<div class="version-row">
						<span class="version-label">{m.update_currentVersion()}</span>
						<span class="version-value current">{APP_VERSION}</span>
					</div>
					<div class="version-row">
						<span class="version-label">{m.update_latestVersion()}</span>
						<span class="version-value latest">{latestVersion}</span>
					</div>
				</div>
			</div>

			<div class="footer">
				<button class="btn secondary" onclick={dismiss} type="button">
					{m.common_later()}
				</button>
				<button class="btn primary" onclick={handleDownload} type="button">
					{m.update_download()}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		width: 340px;
		max-width: 90%;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--primary);
		flex-shrink: 0;
	}

	.title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--primary);
	}

	.content {
		padding: 1.25rem;
	}

	.message {
		margin: 0 0 1rem;
		font-size: 0.875rem;
		color: var(--muted-foreground);
		line-height: 1.5;
	}

	.versions {
		background: var(--secondary);
		border-radius: 8px;
		padding: 0.5rem 0;
	}

	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 1rem;
	}

	.version-row:first-child {
		border-bottom: 1px solid var(--border);
	}

	.version-label {
		font-size: 0.8rem;
		color: var(--muted-foreground);
	}

	.version-value {
		font-size: 0.875rem;
		font-weight: 600;
	}

	.version-value.current {
		color: var(--muted-foreground);
	}

	.version-value.latest {
		color: var(--primary);
	}

	.footer {
		display: flex;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border);
		justify-content: flex-end;
	}

	.btn {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn.secondary {
		background: var(--secondary);
		border: 1px solid var(--border);
		color: var(--muted-foreground);
	}

	.btn.secondary:hover {
		background: var(--accent);
		color: var(--foreground);
	}

	.btn.primary {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
		color: var(--primary);
		min-width: 100px;
	}

	.btn.primary:hover {
		background: color-mix(in srgb, var(--primary) 25%, transparent);
	}

	.btn:active {
		transform: scale(0.98);
	}

	/* Mobile */
	@media (max-width: 400px) {
		.modal {
			width: 100%;
			max-width: calc(100% - 2rem);
		}

		.header {
			padding: 0.875rem 1rem;
		}

		.content {
			padding: 1rem;
		}

		.footer {
			padding: 0.875rem 1rem;
		}

		.btn {
			padding: 0.5rem 0.875rem;
			font-size: 0.75rem;
		}
	}
</style>
