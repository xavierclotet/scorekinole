<script lang="ts">
	import QRCode from 'qrcode';
	import { QrCode, X } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { PRODUCTION_URL } from '$lib/constants';

	interface Props {
		tournamentKey: string;
		compact?: boolean;
		showQRButton?: boolean;
	}

	let { tournamentKey, compact = false, showQRButton = false }: Props = $props();

	let copied = $state(false);
	let showQRModal = $state(false);
	let qrCodeSvg = $state('');

	async function copyKey() {
		if (!tournamentKey) return;
		try {
			await navigator.clipboard.writeText(tournamentKey);
			copied = true;
			setTimeout(() => copied = false, 2000);
		} catch (err) {
			console.error('Error copying key:', err);
		}
	}

	async function openQRModal() {
		showQRModal = true;
		await generateQRCode();
	}

	async function generateQRCode() {
		if (!tournamentKey) return;
		try {
			const url = `${PRODUCTION_URL}/game?key=${tournamentKey}`;
			qrCodeSvg = await QRCode.toString(url, {
				type: 'svg',
				width: 200,
				margin: 1,
				color: {
					dark: '#000000',
					light: '#ffffff'
				}
			});
		} catch (err) {
			console.error('Error generating QR code:', err);
		}
	}

	function closeQRModal() {
		showQRModal = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showQRModal) {
			closeQRModal();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="key-container" class:compact>
	<button
		class="tournament-key-badge"
		class:compact
		onclick={copyKey}
		title={m.common_clickToCopy()}
	>
		{copied ? `✓` : tournamentKey}
	</button>

	{#if showQRButton}
		<button
			class="qr-btn"
			class:compact
			onclick={openQRModal}
			title={m.tournament_showQR()}
			aria-label={m.tournament_showQR()}
		>
			<QrCode size={compact ? 12 : 14} />
		</button>
	{/if}
</div>

{#if showQRModal}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="qr-modal-overlay" onclick={closeQRModal}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="qr-modal" onclick={stopPropagation}>
			<div class="qr-modal-header">
				<span class="qr-modal-title">{m.tournament_showQR()}</span>
				<button class="close-btn" onclick={closeQRModal} aria-label="Close">
					<X size={18} />
				</button>
			</div>
			<div class="qr-modal-content">
				<div class="qr-code-container">
					{@html qrCodeSvg}
				</div>
				<p class="qr-key-display">{tournamentKey}</p>
				<p class="qr-hint">{m.scan_instruction()}</p>
			</div>
		</div>
	</div>
{/if}

<style>
	.key-container {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.key-container.compact {
		gap: 0.25rem;
	}

	.tournament-key-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.75rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 1rem;
		font-size: 0.85rem;
		font-weight: 600;
		color: #3b82f6;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.2s;
		font-family: monospace;
	}

	.tournament-key-badge.compact {
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		border-radius: 4px;
	}

	.tournament-key-badge:hover {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	.qr-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		background: rgba(59, 130, 246, 0.1);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 4px;
		color: #3b82f6;
		cursor: pointer;
		transition: all 0.2s;
	}

	.qr-btn.compact {
		padding: 0.15rem;
	}

	.qr-btn:hover {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	:global([data-theme='dark']) .tournament-key-badge {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.3);
		color: #60a5fa;
	}

	:global([data-theme='dark']) .tournament-key-badge:hover {
		background: rgba(96, 165, 250, 0.25);
		border-color: rgba(96, 165, 250, 0.5);
	}

	:global([data-theme='dark']) .qr-btn {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.3);
		color: #60a5fa;
	}

	:global([data-theme='dark']) .qr-btn:hover {
		background: rgba(96, 165, 250, 0.25);
		border-color: rgba(96, 165, 250, 0.5);
	}

	/* QR Modal */
	.qr-modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.85);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}

	.qr-modal {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		width: min(340px, 90vw);
		overflow: hidden;
	}

	.qr-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.qr-modal-title {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		color: #fff;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.5);
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.qr-modal-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.qr-code-container {
		background: #fff;
		padding: 0.75rem;
		border-radius: 8px;
	}

	.qr-code-container :global(svg) {
		display: block;
	}

	.qr-key-display {
		font-family: monospace;
		font-size: 1.5rem;
		font-weight: 700;
		color: #60a5fa;
		letter-spacing: 0.15em;
		margin: 0;
	}

	.qr-hint {
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		margin: 0;
	}
</style>
