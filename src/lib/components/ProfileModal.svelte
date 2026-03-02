<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { getUserProfile, isPlayerNameTaken } from '$lib/firebase/userProfile';
	import { uploadAvatar, deleteAvatar } from '$lib/firebase/avatarStorage';
	import { adminTheme } from '$lib/stores/theme';
	import { COUNTRY_CODES } from '$lib/constants';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import Check from '@lucide/svelte/icons/check';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import NotificationSettings from './NotificationSettings.svelte';

	// Get translated country name by code
	function getCountryName(code: string): string {
		const translations: Record<string, () => string> = {
			'AR': () => m.country_AR(),
			'AU': () => m.country_AU(),
			'AT': () => m.country_AT(),
			'BE': () => m.country_BE(),
			'BR': () => m.country_BR(),
			'CA': () => m.country_CA(),
			'CAT': () => m.country_CAT(),
			'CL': () => m.country_CL(),
			'CN': () => m.country_CN(),
			'CO': () => m.country_CO(),
			'CZ': () => m.country_CZ(),
			'DE': () => m.country_DE(),
			'DK': () => m.country_DK(),
			'ES': () => m.country_ES(),
			'FI': () => m.country_FI(),
			'FR': () => m.country_FR(),
			'GB': () => m.country_GB(),
			'GR': () => m.country_GR(),
			'HU': () => m.country_HU(),
			'IE': () => m.country_IE(),
			'IN': () => m.country_IN(),
			'IS': () => m.country_IS(),
			'IT': () => m.country_IT(),
			'JP': () => m.country_JP(),
			'KR': () => m.country_KR(),
			'LU': () => m.country_LU(),
			'MX': () => m.country_MX(),
			'NL': () => m.country_NL(),
			'NO': () => m.country_NO(),
			'NZ': () => m.country_NZ(),
			'PL': () => m.country_PL(),
			'PT': () => m.country_PT(),
			'RO': () => m.country_RO(),
			'RU': () => m.country_RU(),
			'SE': () => m.country_SE(),
			'SG': () => m.country_SG(),
			'CH': () => m.country_CH(),
			'US': () => m.country_US(),
			'UY': () => m.country_UY(),
			'VE': () => m.country_VE(),
			'ZA': () => m.country_ZA(),
		};
		return translations[code]?.() || code;
	}

	// Countries sorted by translated name
	const sortedCountries = $derived(
		COUNTRY_CODES.map(code => ({ code, name: getCountryName(code) }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	interface Props {
		isOpen?: boolean;
		user?: any;
		isAdmin?: boolean;
		onclose?: () => void;
		onupdate?: (data: { playerName: string; photoURL?: string; country?: string }) => void;
	}

	let { isOpen = $bindable(false), user = null, isAdmin: _isAdmin = false, onclose, onupdate }: Props = $props();

	let playerNameInput = $state('');
	let countryCode = $state('');
	let currentPhotoURL = $state<string | null>(null);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let nameError = $state<string | null>(null);
	let isCheckingName = $state(false);
	let countrySearchOpen = $state(false);
	let countrySearch = $state('');

	// Filtered countries based on search
	const filteredCountries = $derived(
		sortedCountries.filter(country =>
			country.name.toLowerCase().includes(countrySearch.toLowerCase())
		)
	);

	// Get selected country display name
	const selectedCountryName = $derived(
		countryCode ? getCountryName(countryCode) : ''
	);

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
			countryCode = profile?.country || '';
			uploadError = null;
		} catch (error) {
			console.error('Error loading player data:', error);
			playerNameInput = user.name || user.displayName || '';
			currentPhotoURL = user.photo || user.photoURL || null;
			countryCode = '';
		}
	}

	function close() {
		isOpen = false;
		onclose?.();
	}

	function hasFirstAndLastName(name: string): boolean {
		const parts = name.trim().split(/\s+/);
		return parts.length >= 2 && parts.every((p) => p.length > 0);
	}

	async function updateProfile() {
		if (!playerNameInput.trim()) return;

		if (!hasFirstAndLastName(playerNameInput)) {
			nameError = m.auth_playerNameRequired();
			return;
		}

		nameError = null;
		isCheckingName = true;

		try {
			const taken = await isPlayerNameTaken(playerNameInput.trim());
			if (taken) {
				nameError = m.auth_playerNameTaken();
				return;
			}

			onupdate?.({
				playerName: playerNameInput.trim(),
				photoURL: currentPhotoURL || undefined,
				country: countryCode || undefined
			});
		} finally {
			isCheckingName = false;
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
		if (currentPhotoURL === user?.providerPhotoURL) return;

		isUploading = true;
		uploadError = null;

		const result = await deleteAvatar();

		if (result.success) {
			// Revert to Google photo
			currentPhotoURL = user?.providerPhotoURL || null;
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

	function handleOverlayMousedown(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			close();
		}
	}

	function stopPropagation(e: Event) {
		e.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" data-theme={$adminTheme} onmousedown={handleOverlayMousedown} role="none">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" onmousedown={stopPropagation} role="dialog" tabindex="-1">
			{#if user}
				<!-- Hidden file input -->
				<input
					type="file"
					accept="image/*"
					bind:this={fileInput}
					onchange={handleFileSelect}
					style="display: none;"
				/>

				<!-- Header -->
				<div class="header">
					<div class="header-content">
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
							{#if currentPhotoURL && currentPhotoURL !== user?.providerPhotoURL}
								<button
									class="delete-photo-btn"
									onclick={handleDeleteAvatar}
									disabled={isUploading}
									aria-label={m.profile_deletePhoto()}
								>
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<line x1="18" y1="6" x2="6" y2="18"/>
										<line x1="6" y1="6" x2="18" y2="18"/>
									</svg>
								</button>
							{/if}
						</div>
						<div class="header-info">
							<h2 class="header-name">{playerNameInput || m.auth_myProfile()}</h2>
							<span class="header-email">{user.email || '-'}</span>
						</div>
					</div>
					<button class="close-btn" onclick={close} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
				</div>
				{#if uploadError}
					<p class="upload-error">{uploadError}</p>
				{/if}

				<!-- Scrollable form content -->
				<div class="form-content">
					<!-- Personal data section -->
					<div class="section-card">
						<div class="field">
							<label for="profilePlayerNameInput" class="field-label">{m.auth_playerName()}</label>
							<input
								id="profilePlayerNameInput"
								type="text"
								class={["field-input", nameError && "field-input-error"]}
								bind:value={playerNameInput}
								oninput={() => nameError = null}
								placeholder={m.auth_enterPlayerName()}
								maxlength="20"
							/>
							{#if nameError}
								<span class="field-error">{nameError}</span>
							{:else}
								<span class="field-hint">{m.auth_playerNameDescription()}</span>
							{/if}
						</div>

						<div class="section-divider"></div>

						<div class="field">
							<span class="field-label">{m.profile_country()}</span>
							<Popover.Root bind:open={countrySearchOpen}>
								<Popover.Trigger class="country-trigger">
									<span class={["country-trigger-text", !selectedCountryName && "placeholder"]}>
										{selectedCountryName || m.profile_selectCountry()}
									</span>
									<ChevronsUpDown class="size-4 shrink-0 opacity-50" />
								</Popover.Trigger>
								<Popover.Content class="country-popover-content p-0 z-[1100]" align="start" sideOffset={4}>
									<Command.Root shouldFilter={false}>
										<Command.Input
											placeholder={m.profile_searchCountry()}
											bind:value={countrySearch}
										/>
										<Command.List class="max-h-[200px]">
											<Command.Empty>{m.profile_noCountryFound()}</Command.Empty>
											{#each filteredCountries as country}
												<Command.Item
													value={country.code}
													onSelect={() => {
														countryCode = country.code;
														countrySearchOpen = false;
														countrySearch = '';
													}}
												>
													<Check class={["size-4 mr-2", countryCode === country.code ? "opacity-100" : "opacity-0"]} />
													{country.name}
												</Command.Item>
											{/each}
										</Command.List>
									</Command.Root>
								</Popover.Content>
							</Popover.Root>
						</div>
					</div>

					<!-- Appearance section -->
					<div class="section-card">
						<div class="field">
							<span class="field-label">{m.profile_colorTheme()}</span>
							<div class="theme-options">
								<button
									class="theme-swatch"
									class:selected={colorScheme === 'green'}
									onclick={() => setColorScheme('green')}
									aria-label={m.profile_themeGreen()}
								>
									<span class="swatch-color swatch-green"></span>
									{#if colorScheme === 'green'}
										<Check class="swatch-check" />
									{/if}
								</button>
								<button
									class="theme-swatch"
									class:selected={colorScheme === 'violet'}
									onclick={() => setColorScheme('violet')}
									aria-label={m.profile_themeViolet()}
								>
									<span class="swatch-color swatch-violet"></span>
									{#if colorScheme === 'violet'}
										<Check class="swatch-check" />
									{/if}
								</button>
							</div>
						</div>
					</div>

					<!-- Notifications section -->
					<div class="section-card">
						<NotificationSettings />
					</div>
				</div>

				<!-- Footer -->
				<div class="footer">
					<button class="btn-cancel" onclick={close}>{m.common_cancel()}</button>
					<button class="btn-save" onclick={updateProfile} disabled={!hasFirstAndLastName(playerNameInput) || isCheckingName}>
						{m.common_save()}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Overlay */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
		animation: overlayIn 0.15s ease-out;
	}

	@keyframes overlayIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	/* Modal */
	.modal {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 16px;
		max-width: 480px;
		width: 100%;
		max-height: calc(100dvh - 32px);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: modalIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--foreground) 4%, transparent),
			0 24px 48px -12px rgba(0, 0, 0, 0.4);
	}

	@keyframes modalIn {
		from { opacity: 0; transform: scale(0.97) translateY(4px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--primary) 3%, transparent);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 16px;
		min-width: 0;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.header-name {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		color: var(--foreground);
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-email {
		font-size: 12.5px;
		color: var(--muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.close-btn {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: color 0.15s, background 0.15s, border-color 0.15s;
		flex-shrink: 0;
	}

	.close-btn svg {
		width: 16px;
		height: 16px;
	}

	.close-btn:hover {
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
		border-color: var(--border);
		color: var(--foreground);
	}

	/* Photo */
	.photo-container {
		position: relative;
		flex-shrink: 0;
	}

	.photo-wrapper {
		position: relative;
		background: none;
		border: 2px solid color-mix(in srgb, var(--primary) 25%, transparent);
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		transition: border-color 0.15s;
	}

	.photo-wrapper:hover {
		border-color: var(--primary);
	}

	.photo-wrapper:disabled {
		cursor: wait;
	}

	.photo {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
		display: block;
	}

	.photo-placeholder {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--primary) 12%, transparent);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 22px;
		font-weight: 600;
		color: var(--primary);
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.45);
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
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.delete-photo-btn {
		position: absolute;
		top: -2px;
		right: -2px;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: var(--destructive);
		border: 2px solid var(--card);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform 0.1s;
	}

	.delete-photo-btn svg {
		width: 8px;
		height: 8px;
		color: var(--destructive-foreground);
	}

	.delete-photo-btn:hover {
		transform: scale(1.15);
	}

	.delete-photo-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.upload-error {
		padding: 6px 24px;
		margin: 0;
		font-size: 12px;
		color: var(--destructive);
		background: color-mix(in srgb, var(--destructive) 6%, transparent);
	}

	/* Scrollable form */
	.form-content {
		padding: 20px 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		-webkit-overflow-scrolling: touch;
	}

	/* Section cards */
	.section-card {
		background: color-mix(in srgb, var(--muted) 40%, transparent);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.section-divider {
		height: 1px;
		background: var(--border);
		margin: 0 -4px;
	}

	/* Fields */
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.field-input {
		width: 100%;
		padding: 10px 14px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--foreground);
		font-size: 14px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
	}

	.field-input::placeholder {
		color: var(--muted-foreground);
	}

	.field-hint {
		font-size: 12px;
		color: var(--muted-foreground);
		line-height: 1.35;
	}

	.field-error {
		font-size: 12px;
		color: var(--destructive);
	}

	:global(.field-input-error) {
		border-color: var(--destructive) !important;
	}

	/* Theme swatches */
	.theme-options {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.theme-swatch {
		position: relative;
		width: 40px;
		height: 40px;
		padding: 0;
		border: 2px solid var(--border);
		border-radius: 12px;
		background: var(--background);
		cursor: pointer;
		transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.theme-swatch:hover {
		border-color: var(--muted-foreground);
	}

	.theme-swatch.selected {
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
	}

	.theme-swatch:active {
		transform: scale(0.95);
	}

	.swatch-color {
		width: 24px;
		height: 24px;
		border-radius: 8px;
	}

	.swatch-green {
		background: #10b981;
	}

	.swatch-violet {
		background: #8b5cf6;
	}

	:global(.swatch-check) {
		position: absolute;
		bottom: -5px;
		right: -5px;
		width: 16px;
		height: 16px;
		padding: 2px;
		background: var(--primary);
		color: var(--primary-foreground);
		border-radius: 50%;
		border: 2px solid var(--card);
	}

	/* Country combobox trigger */
	:global(.country-trigger) {
		width: 100%;
		padding: 10px 14px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 10px;
		color: var(--foreground);
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	:global(.country-trigger:hover) {
		border-color: var(--muted-foreground);
	}

	:global(.country-trigger:focus) {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
	}

	:global(.country-trigger-text) {
		text-align: left;
	}

	:global(.country-trigger-text.placeholder) {
		color: var(--muted-foreground);
	}

	:global(.country-popover-content) {
		width: var(--bits-popover-anchor-width) !important;
		min-width: 200px;
	}

	/* Footer */
	.footer {
		display: flex;
		gap: 10px;
		padding: 16px 24px;
		border-top: 1px solid var(--border);
		background: color-mix(in srgb, var(--muted) 20%, transparent);
	}

	.btn-cancel,
	.btn-save {
		flex: 1;
		padding: 11px 16px;
		font-size: 13.5px;
		font-weight: 600;
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.15s, opacity 0.15s, transform 0.1s;
	}

	.btn-cancel {
		background: var(--secondary);
		border: 1px solid var(--border);
		color: var(--foreground);
	}

	.btn-cancel:hover {
		background: var(--muted);
	}

	.btn-cancel:active {
		transform: scale(0.98);
	}

	.btn-save {
		background: var(--primary);
		border: none;
		color: var(--primary-foreground);
	}

	.btn-save:hover:not(:disabled) {
		opacity: 0.92;
	}

	.btn-save:active:not(:disabled) {
		transform: scale(0.98);
	}

	.btn-save:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* Mobile fullscreen (<480px) */
	@media (max-width: 480px) {
		.modal-overlay {
			padding: 0;
			align-items: stretch;
		}

		.modal {
			max-width: 100%;
			max-height: 100dvh;
			border-radius: 0;
			border: none;
			box-shadow: none;
			animation: modalSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		}

		.footer {
			padding-bottom: max(16px, env(safe-area-inset-bottom));
		}
	}

	@keyframes modalSlideUp {
		from { opacity: 0; transform: translateY(100%); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Very small screens */
	@media (max-width: 360px) {
		.header {
			padding: 16px 18px;
		}

		.header-content {
			gap: 12px;
		}

		.photo,
		.photo-placeholder {
			width: 52px;
			height: 52px;
		}

		.photo-placeholder {
			font-size: 18px;
		}

		.header-name {
			font-size: 15px;
		}

		.form-content {
			padding: 16px 18px;
		}

		.section-card {
			padding: 14px;
		}

		.footer {
			padding: 14px 18px;
		}
	}

	/* Landscape short viewport */
	@media (max-height: 500px) and (orientation: landscape) {
		.modal-overlay {
			padding: 8px;
		}

		.modal {
			max-width: 500px;
			max-height: calc(100dvh - 16px);
			border-radius: 12px;
		}

		.header {
			padding: 12px 20px;
		}

		.header-content {
			gap: 12px;
		}

		.photo,
		.photo-placeholder {
			width: 40px;
			height: 40px;
		}

		.photo-wrapper {
			border-width: 1.5px;
		}

		.photo-placeholder {
			font-size: 15px;
		}

		.photo-overlay svg {
			width: 14px;
			height: 14px;
		}

		.delete-photo-btn {
			width: 16px;
			height: 16px;
			top: -3px;
			right: -3px;
		}

		.delete-photo-btn svg {
			width: 6px;
			height: 6px;
		}

		.header-name {
			font-size: 14px;
		}

		.header-email {
			font-size: 11px;
		}

		.close-btn {
			width: 28px;
			height: 28px;
		}

		.close-btn svg {
			width: 14px;
			height: 14px;
		}

		.form-content {
			padding: 12px 20px;
			gap: 10px;
		}

		.section-card {
			padding: 10px 12px;
			gap: 8px;
			border-radius: 10px;
		}

		.field {
			gap: 4px;
		}

		.field-label {
			font-size: 11px;
		}

		.field-input {
			padding: 7px 10px;
			font-size: 13px;
			border-radius: 8px;
		}

		.field-hint,
		.field-error {
			font-size: 11px;
		}

		.theme-swatch {
			width: 32px;
			height: 32px;
			border-radius: 8px;
		}

		.swatch-color {
			width: 20px;
			height: 20px;
			border-radius: 6px;
		}

		:global(.swatch-check) {
			width: 13px;
			height: 13px;
			bottom: -3px;
			right: -3px;
		}

		:global(.country-trigger) {
			padding: 7px 10px;
			font-size: 13px;
			border-radius: 8px;
		}

		.footer {
			padding: 10px 20px;
		}

		.btn-cancel,
		.btn-save {
			padding: 8px 12px;
			font-size: 12.5px;
			border-radius: 8px;
		}
	}
</style>
