<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
	import { X, Camera, CameraOff, SwitchCamera, Flashlight } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { theme } from '$lib/stores/theme';

	interface Props {
		isOpen?: boolean;
		onScan?: (data: string) => void;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), onScan, onClose }: Props = $props();

	let scanner: Html5Qrcode | null = null;
	let isScanning = $state(false);
	let hasPermission = $state<boolean | null>(null);
	let errorMessage = $state('');
	let useFrontCamera = $state(false);
	let isFlashOn = $state(false);
	let manualCode = $state('');
	let showManualInput = $state(false);

	const SCANNER_ID = 'qr-scanner-reader';

	// Start scanning when modal opens
	$effect(() => {
		if (isOpen) {
			// Small delay to ensure DOM is ready
			setTimeout(() => {
				startScanner();
			}, 100);
		} else {
			stopScanner();
		}
	});

	onDestroy(() => {
		stopScanner();
	});

	async function startScanner() {
		if (scanner) {
			await stopScanner();
		}

		const element = document.getElementById(SCANNER_ID);
		if (!element) {
			console.error('Scanner element not found');
			return;
		}

		try {
			scanner = new Html5Qrcode(SCANNER_ID);

			const cameraFacing = useFrontCamera ? 'user' : 'environment';

			await scanner.start(
				{ facingMode: cameraFacing },
				{
					fps: 10,
					qrbox: { width: 250, height: 250 },
					aspectRatio: 1.0
				},
				(decodedText) => {
					// Success callback
					handleScanSuccess(decodedText);
				},
				() => {
					// Error callback (ignore - just means no QR detected)
				}
			);

			isScanning = true;
			hasPermission = true;
			errorMessage = '';
		} catch (err) {
			console.error('Error starting scanner:', err);
			hasPermission = false;
			isScanning = false;

			if (err instanceof Error) {
				if (err.message.includes('Permission') || err.message.includes('NotAllowed')) {
					errorMessage = m.scan_permissionDenied();
				} else if (err.message.includes('NotFound')) {
					errorMessage = m.scan_noCameraFound?.() || 'No camera found';
				} else {
					errorMessage = err.message;
				}
			}

			// Show manual input as fallback
			showManualInput = true;
		}
	}

	async function stopScanner() {
		if (scanner) {
			try {
				const state = scanner.getState();
				if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
					await scanner.stop();
				}
			} catch (err) {
				console.error('Error stopping scanner:', err);
			}
			scanner = null;
		}
		isScanning = false;
		isFlashOn = false;
	}

	function handleScanSuccess(decodedText: string) {
		// Vibrate on success if available
		if (navigator.vibrate) {
			navigator.vibrate(100);
		}

		onScan?.(decodedText);
		close();
	}

	async function toggleCamera() {
		useFrontCamera = !useFrontCamera;
		await startScanner();
	}

	async function toggleFlash() {
		if (!scanner || !isScanning) return;

		try {
			const track = scanner.getRunningTrackCameraCapabilities();
			if (track && track.torchFeature && track.torchFeature().isSupported()) {
				const newState = !isFlashOn;
				await track.torchFeature().apply(newState);
				isFlashOn = newState;
			}
		} catch (err) {
			console.error('Error toggling flash:', err);
		}
	}

	function handleManualSubmit() {
		const code = manualCode.trim().toUpperCase();
		if (code.length >= 6) {
			handleScanSuccess(code);
		}
	}

	function close() {
		stopScanner();
		isOpen = false;
		manualCode = '';
		showManualInput = false;
		errorMessage = '';
		onClose?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && isOpen) {
			close();
		}
		if (event.key === 'Enter' && showManualInput && manualCode.length >= 6) {
			handleManualSubmit();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scanner-overlay" data-theme={$theme} onclick={close}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="scanner-modal" onclick={stopPropagation}>
			<!-- Header -->
			<div class="scanner-header">
				<span class="scanner-title">{m.scan_title()}</span>
				<button class="close-btn" onclick={close} aria-label="Close">
					<X size={18} />
				</button>
			</div>

			<!-- Scanner Area -->
			<div class="scanner-content">
				{#if hasPermission !== false}
					<div class="scanner-viewport">
						<div id={SCANNER_ID} class="scanner-reader"></div>

						<!-- Scanning overlay frame -->
						{#if isScanning}
							<div class="scan-frame">
								<div class="corner top-left"></div>
								<div class="corner top-right"></div>
								<div class="corner bottom-left"></div>
								<div class="corner bottom-right"></div>
								<div class="scan-line"></div>
							</div>
						{/if}
					</div>

					<p class="scan-instruction">{m.scan_instruction()}</p>

					<!-- Camera controls -->
					{#if isScanning}
						<div class="camera-controls">
							<button
								class="control-btn"
								onclick={toggleCamera}
								title={m.scan_switchCamera()}
							>
								<SwitchCamera size={20} />
							</button>
							<button
								class="control-btn"
								class:active={isFlashOn}
								onclick={toggleFlash}
								title={m.scan_toggleFlash()}
							>
								<Flashlight size={20} />
							</button>
						</div>
					{/if}
				{/if}

				<!-- Permission denied / Error state -->
				{#if hasPermission === false || showManualInput}
					<div class="permission-denied">
						<div class="error-icon">
							<CameraOff size={32} />
						</div>
						{#if errorMessage}
							<p class="error-message">{errorMessage}</p>
						{/if}

						<!-- Manual code input -->
						<div class="manual-input-section">
							<p class="manual-label">{m.scan_manualEntry()}</p>
							<div class="manual-input-group">
								<input
									type="text"
									class="manual-input"
									bind:value={manualCode}
									placeholder="ABC123"
									maxlength="6"
									autocomplete="off"
									autocapitalize="characters"
								/>
								<button
									class="submit-btn"
									disabled={manualCode.length < 6}
									onclick={handleManualSubmit}
								>
									<Camera size={18} />
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.scanner-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
	}

	.scanner-modal {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		width: min(400px, 94vw);
		max-height: 90vh;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.scanner-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.scanner-title {
		font-family: 'Lexend', sans-serif;
		font-size: 1.1rem;
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

	.scanner-content {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.scanner-viewport {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		max-width: 300px;
		border-radius: 12px;
		overflow: hidden;
		background: #000;
	}

	.scanner-reader {
		width: 100%;
		height: 100%;
	}

	/* Override html5-qrcode styles */
	.scanner-reader :global(video) {
		object-fit: cover !important;
		border-radius: 12px;
	}

	.scanner-reader :global(#qr-shaded-region) {
		border-width: 40px !important;
	}

	/* Scanning frame overlay */
	.scan-frame {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
	}

	.corner {
		position: absolute;
		width: 30px;
		height: 30px;
		border-color: var(--primary, #3b82f6);
		border-style: solid;
		border-width: 0;
	}

	.corner.top-left {
		top: 25px;
		left: 25px;
		border-top-width: 3px;
		border-left-width: 3px;
		border-top-left-radius: 8px;
	}

	.corner.top-right {
		top: 25px;
		right: 25px;
		border-top-width: 3px;
		border-right-width: 3px;
		border-top-right-radius: 8px;
	}

	.corner.bottom-left {
		bottom: 25px;
		left: 25px;
		border-bottom-width: 3px;
		border-left-width: 3px;
		border-bottom-left-radius: 8px;
	}

	.corner.bottom-right {
		bottom: 25px;
		right: 25px;
		border-bottom-width: 3px;
		border-right-width: 3px;
		border-bottom-right-radius: 8px;
	}

	.scan-line {
		position: absolute;
		left: 30px;
		right: 30px;
		height: 2px;
		background: linear-gradient(90deg, transparent, var(--primary, #3b82f6), transparent);
		animation: scanLine 2s ease-in-out infinite;
	}

	@keyframes scanLine {
		0%, 100% { top: 30px; opacity: 0.5; }
		50% { top: calc(100% - 30px); opacity: 1; }
	}

	.scan-instruction {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
		margin: 0;
	}

	.camera-controls {
		display: flex;
		gap: 0.75rem;
	}

	.control-btn {
		width: 44px;
		height: 44px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: rgba(255, 255, 255, 0.7);
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
	}

	.control-btn.active {
		background: var(--primary, #3b82f6);
		color: #fff;
		border-color: var(--primary, #3b82f6);
	}

	/* Permission denied / Manual input */
	.permission-denied {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1rem 0;
	}

	.error-icon {
		width: 64px;
		height: 64px;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #f87171;
	}

	.error-message {
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		color: #f87171;
		text-align: center;
		margin: 0;
	}

	.manual-input-section {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.manual-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
	}

	.manual-input-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		max-width: 220px;
	}

	.manual-input {
		flex: 1;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0.65rem 0.85rem;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		text-align: center;
		color: #fff;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		transition: all 0.15s ease;
	}

	.manual-input:focus {
		outline: none;
		border-color: color-mix(in srgb, var(--primary) 40%, transparent);
		background: color-mix(in srgb, var(--primary) 5%, transparent);
	}

	.manual-input::placeholder {
		color: rgba(255, 255, 255, 0.2);
		letter-spacing: 0.15em;
		font-weight: 400;
	}

	.submit-btn {
		width: 40px;
		height: 40px;
		flex-shrink: 0;
		background: var(--primary, #3b82f6);
		border: none;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--primary-foreground, #fff);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.submit-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}

	.submit-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Mobile adjustments */
	@media (max-width: 480px) {
		.scanner-modal {
			width: 100%;
			height: 100%;
			max-height: 100vh;
			border-radius: 0;
			padding-top: env(safe-area-inset-top, 0);
		}

		.scanner-viewport {
			max-width: 280px;
		}
	}
</style>
