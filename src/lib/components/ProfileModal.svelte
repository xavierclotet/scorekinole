<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getUserProfile } from '$lib/firebase/userProfile';
	import { uploadAvatar, deleteAvatar } from '$lib/firebase/avatarStorage';
	import { adminTheme } from '$lib/stores/theme';

	interface Props {
		isOpen?: boolean;
		user?: any;
		isAdmin?: boolean;
		onclose?: () => void;
		onupdate?: (data: { playerName: string; photoURL?: string }) => void;
	}

	let { isOpen = $bindable(false), user = null, isAdmin = false, onclose, onupdate }: Props = $props();

	let playerNameInput = $state('');
	let currentPhotoURL = $state<string | null>(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	// Color theme: 'green' or 'violet'
	let colorScheme = $derived(
		$adminTheme === 'violet' || $adminTheme === 'violet-light' ? 'violet' : 'green'
	);

	function setColorScheme(color: 'green' | 'violet') {
		if (color === 'violet') {
			adminTheme.set($adminTheme === 'light' || $adminTheme === 'violet-light' ? 'violet-light' : 'violet');
		} else {
			adminTheme.set($adminTheme === 'light' || $adminTheme === 'violet-light' ? 'light' : 'dark');
		}
	}

	// Load player data from Firestore when modal opens
	$effect(() => {
		if (isOpen && user) {
			loadPlayerData();
		}
	});

	async function loadPlayerData() {
		try {
			const profile = await getUserProfile();
			playerNameInput = profile?.playerName || user.name || user.displayName || '';
			currentPhotoURL = profile?.photoURL || user.photo || user.photoURL || null;
			uploadError = null;
		} catch (error) {
			console.error('Error loading player data:', error);
			playerNameInput = user.name || user.displayName || '';
			currentPhotoURL = user.photo || user.photoURL || null;
		}
	}

	function close() {
		isOpen = false;
		onclose?.();
	}

	function updateProfile() {
		if (playerNameInput.trim()) {
			onupdate?.({ playerName: playerNameInput.trim(), photoURL: currentPhotoURL || undefined });
		}
	}

	function triggerFileSelect() {
		fileInput?.click();
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isUploading = true;
		uploadError = null;

		const result = await uploadAvatar(file);

		if (result.success && result.url) {
			currentPhotoURL = result.url;
		} else {
			uploadError = result.error || m.common_error();
		}

		isUploading = false;
		// Reset input so same file can be selected again
		input.value = '';
	}

	async function handleDeleteAvatar() {
		if (!currentPhotoURL) return;
		// Don't delete if already showing Google photo
		if (currentPhotoURL === user?.googlePhotoURL) return;

		isUploading = true;
		uploadError = null;

		const result = await deleteAvatar();

		if (result.success) {
			// Revert to Google photo
			currentPhotoURL = user?.googlePhotoURL || null;
		} else {
			uploadError = result.error || m.common_error();
		}

		isUploading = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		} else if (event.key === 'Enter' && playerNameInput.trim()) {
			updateProfile();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={close} role="none">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onclick={stopPropagation} role="dialog" tabindex="-1">
			<!-- Close button -->
			<button class="close-btn" onclick={close} aria-label="Close">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"/>
					<line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>

			{#if user}
				<!-- Hidden file input -->
				<input
					type="file"
					accept="image/*"
					bind:this={fileInput}
					onchange={handleFileSelect}
					style="display: none;"
				/>

				<!-- Profile header with photo -->
				<div class="profile-header">
					<div class="photo-container">
						<button
							class="photo-wrapper"
							onclick={triggerFileSelect}
							disabled={isUploading}
							aria-label={m.profile_changePhoto()}
						>
							{#if currentPhotoURL}
								<img src={currentPhotoURL} alt="" class="photo" />
							{:else}
								<div class="photo-placeholder">
									{user.email?.charAt(0).toUpperCase() || '?'}
								</div>
							{/if}
							<div class="photo-overlay" class:uploading={isUploading}>
								{#if isUploading}
									<svg class="spinner" viewBox="0 0 24 24">
										<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="31.4" stroke-linecap="round"/>
									</svg>
								{:else}
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
										<circle cx="12" cy="13" r="4"/>
									</svg>
								{/if}
							</div>
						</button>
						{#if currentPhotoURL && currentPhotoURL !== user?.googlePhotoURL}
							<button
								class="delete-photo-btn"
								onclick={handleDeleteAvatar}
								disabled={isUploading}
								aria-label={m.profile_deletePhoto()}
								title={m.profile_deletePhoto()}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="18" y1="6" x2="6" y2="18"/>
									<line x1="6" y1="6" x2="18" y2="18"/>
								</svg>
							</button>
						{/if}
					</div>
					<h2 class="profile-title">{m.auth_myProfile()}</h2>
					{#if uploadError}
						<p class="upload-error">{uploadError}</p>
					{/if}
				</div>

				<!-- Info grid -->
				<div class="info-grid single">
					<div class="info-item">
						<span class="info-label">{m.auth_email()}</span>
						<span class="info-value">{user.email || '-'}</span>
					</div>
				</div>

				<!-- Editable section -->
				<div class="edit-section">
					<label for="profilePlayerNameInput" class="edit-label">
						{m.auth_playerName()}
					</label>
					<div class="input-wrapper">
						<input
							id="profilePlayerNameInput"
							type="text"
							class="input"
							bind:value={playerNameInput}
							placeholder={m.auth_enterPlayerName()}
							maxlength="20"
						/>
					</div>
					<p class="input-hint">{m.auth_playerNameDescription()}</p>
				</div>

				<!-- Color theme selector -->
				<div class="edit-section">
					<span class="edit-label">{m.profile_colorTheme()}</span>
					<div class="color-selector">
						<button
							class="color-option"
							class:selected={colorScheme === 'green'}
							onclick={() => setColorScheme('green')}
							title={m.profile_themeGreen()}
						>
							<span class="color-swatch green"></span>
							<span class="color-name">{m.profile_themeGreen()}</span>
						</button>
						<button
							class="color-option"
							class:selected={colorScheme === 'violet'}
							onclick={() => setColorScheme('violet')}
							title={m.profile_themeViolet()}
						>
							<span class="color-swatch violet"></span>
							<span class="color-name">{m.profile_themeViolet()}</span>
						</button>
					</div>
				</div>

				<!-- Actions -->
				<div class="actions">
					<button class="btn-cancel" onclick={close}>{m.common_cancel()}</button>
					<button class="btn-save" onclick={updateProfile} disabled={!playerNameInput.trim()}>
						{m.common_save()}
					</button>
				</div>
			{/if}
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
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		background: #0f1218;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 16px;
		max-width: 360px;
		width: 100%;
		position: relative;
		animation: modalSlide 0.2s ease-out;
		overflow: hidden;
	}

	@keyframes modalSlide {
		from {
			opacity: 0;
			transform: translateY(-16px) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.close-btn {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		transition: all 0.15s;
		z-index: 10;
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	/* Profile header */
	.profile-header {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem 1.5rem 1rem;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, transparent 100%);
	}

	.photo-container {
		position: relative;
		margin-bottom: 0.75rem;
	}

	.photo-wrapper {
		position: relative;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		transition: transform 0.15s;
	}

	.photo-wrapper:hover {
		transform: scale(1.05);
	}

	.photo-wrapper:disabled {
		cursor: wait;
		transform: none;
	}

	.photo {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(255, 255, 255, 0.1);
	}

	.photo-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: linear-gradient(135deg, #1e3a5f 0%, #0d2137 100%);
		border: 2px solid rgba(255, 255, 255, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 600;
		color: #64b5f6;
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s;
	}

	.photo-overlay svg {
		width: 20px;
		height: 20px;
		color: #fff;
	}

	.photo-wrapper:hover .photo-overlay,
	.photo-overlay.uploading {
		opacity: 1;
	}

	.photo-overlay .spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.delete-photo-btn {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #ef4444;
		border: 2px solid #0f1218;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s;
		z-index: 5;
	}

	.delete-photo-btn svg {
		width: 12px;
		height: 12px;
		color: #fff;
	}

	.delete-photo-btn:hover {
		background: #dc2626;
		transform: scale(1.1);
	}

	.delete-photo-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.upload-error {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: #ef4444;
		text-align: center;
	}

	.profile-title {
		font-size: 1rem;
		font-weight: 600;
		color: #fff;
		margin: 0;
	}

	/* Info grid */
	.info-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: rgba(255, 255, 255, 0.04);
		border-top: 1px solid rgba(255, 255, 255, 0.04);
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
	}

	.info-grid.single {
		grid-template-columns: 1fr;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.75rem 1rem;
		background: #0f1218;
	}

	.info-label {
		font-size: 0.65rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.4);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.info-value {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.85);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Edit section */
	.edit-section {
		padding: 1rem 1.25rem;
	}

	.edit-label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		margin-bottom: 0.5rem;
	}

	.input-wrapper {
		position: relative;
	}

	.input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		color: #fff;
		font-size: 0.875rem;
		transition: all 0.15s;
	}

	.input:focus {
		outline: none;
		border-color: rgba(59, 130, 246, 0.5);
		background: rgba(255, 255, 255, 0.06);
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.input-hint {
		margin: 0.375rem 0 0;
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.35);
	}

	/* Color selector */
	.color-selector {
		display: flex;
		gap: 0.75rem;
	}

	.color-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.color-option:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.15);
	}

	.color-option.selected {
		border-color: var(--primary, #00ff88);
		background: rgba(255, 255, 255, 0.06);
	}

	.color-swatch {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.2);
	}

	.color-swatch.green {
		background: linear-gradient(135deg, #00ff88 0%, #10b981 100%);
	}

	.color-swatch.violet {
		background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
	}

	.color-name {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.85);
	}

	/* Actions */
	.actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem 1.25rem;
		justify-content: flex-end;
	}

	.btn-cancel,
	.btn-save {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-cancel {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.15);
		color: #fff;
	}

	.btn-save {
		background: #3b82f6;
		border: none;
		color: #fff;
	}

	.btn-save:hover:not(:disabled) {
		background: #2563eb;
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 400px) {
		.modal {
			max-width: 100%;
		}

		.profile-header {
			padding: 1.25rem 1rem 0.875rem;
		}

		.photo,
		.photo-placeholder {
			width: 56px;
			height: 56px;
		}

		.photo-placeholder {
			font-size: 1.25rem;
		}

		.info-item {
			padding: 0.625rem 0.875rem;
		}

		.edit-section {
			padding: 0.875rem 1rem;
		}

		.actions {
			padding: 0.625rem 1rem 1rem;
		}
	}
</style>
