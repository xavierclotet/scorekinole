<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { APP_VERSION } from '$lib/constants';
	import Button from './Button.svelte';

	interface Props {
		isOpen?: boolean;
		latestVersion: string;
		downloadUrl: string;
		onclose?: () => void;
	}

	let { isOpen = false, latestVersion, downloadUrl, onclose }: Props = $props();

	function openDownload() {
		window.open(downloadUrl, '_blank');
		onclose?.();
	}

	function dismiss() {
		onclose?.();
	}
</script>

{#if isOpen}
	<div class="modal-overlay" role="dialog" aria-modal="true">
		<div class="modal">
			<div class="modal-header">
				<span class="modal-title">{m.update_available()}</span>
			</div>
			<div class="modal-content">
				<div class="update-icon">📱</div>

				<p class="update-text">
					{m.update_newVersionAvailable()}
				</p>

				<div class="version-info">
					<div class="version-row">
						<span class="version-label">{m.update_currentVersion()}</span>
						<span class="version-value current">{APP_VERSION}</span>
					</div>
					<div class="version-row">
						<span class="version-label">{m.update_latestVersion()}</span>
						<span class="version-value latest">{latestVersion}</span>
					</div>
				</div>

				<div class="actions">
					<Button variant="secondary" onclick={dismiss}>
						{m.common_later()}
					</Button>
					<Button variant="primary" onclick={openDownload}>
						{m.update_download()}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.modal {
		background: #1a1f35;
		padding: 2rem;
		border-radius: 12px;
		max-width: 90%;
		width: 400px;
		max-height: 90vh;
		overflow-y: auto;
		border: 2px solid rgba(0, 255, 136, 0.3);
		animation: modalAppear 0.2s ease-out;
	}

	@keyframes modalAppear {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	.modal-header {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.modal-title {
		font-size: 1.4rem;
		font-weight: 700;
		color: #fff;
	}

	.modal-content {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		align-items: center;
	}

	.update-icon {
		font-size: 3rem;
	}

	.update-text {
		color: rgba(255, 255, 255, 0.8);
		font-size: 1rem;
		text-align: center;
		margin: 0;
		line-height: 1.5;
	}

	.version-info {
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 1rem;
		width: 100%;
	}

	.version-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem 0;
	}

	.version-row:first-child {
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.version-label {
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.version-value {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.version-value.current {
		color: rgba(255, 255, 255, 0.7);
	}

	.version-value.latest {
		color: #00ff88;
	}

	.actions {
		display: flex;
		gap: 1rem;
		margin-top: 0.5rem;
		width: 100%;
	}

	.actions :global(button) {
		flex: 1;
	}

	@media (max-width: 768px) {
		.modal {
			width: 90%;
			padding: 1.5rem;
		}

		.modal-title {
			font-size: 1.25rem;
		}

		.update-icon {
			font-size: 2.5rem;
		}
	}
</style>
