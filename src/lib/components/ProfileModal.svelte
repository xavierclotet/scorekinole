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

	async function updateProfile() {
		if (!playerNameInput.trim()) return;

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

				<!-- Header with avatar and info -->
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
							{#if currentPhotoURL && currentPhotoURL !== user?.googlePhotoURL}
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
							<h2 class="header-title">{m.auth_myProfile()}</h2>
							<span class="header-email">{user.email || '-'}</span>
						</div>
					</div>
					<button class="close-btn" onclick={close} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"/>
							<line x1="6" y1="6" x2="18" y2="18"/>
						</svg>
					</button>
					{#if uploadError}
						<p class="upload-error">{uploadError}</p>
					{/if}
				</div>

				<!-- Form content -->
				<div class="form-content">
					<!-- Player name -->
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

					<!-- Country -->
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

					<!-- Color theme -->
					<div class="field">
						<span class="field-label">{m.profile_colorTheme()}</span>
						<div class="flex items-center gap-3">
							<button
								class="theme-swatch"
								class:selected={colorScheme === 'green'}
								onclick={() => setColorScheme('green')}
								aria-label={m.profile_themeGreen()}
							>
								<span class="swatch-color bg-emerald-500"></span>
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
								<span class="swatch-color bg-violet-500"></span>
								{#if colorScheme === 'violet'}
									<Check class="swatch-check" />
								{/if}
							</button>
						</div>
					</div>
				</div>

				<!-- Footer -->
				<div class="footer">
					<button class="btn-cancel" onclick={close}>{m.common_cancel()}</button>
					<button class="btn-save" onclick={updateProfile} disabled={!playerNameInput.trim() || isCheckingName}>
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
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
		animation: fadeIn 0.1s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal {
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
		max-width: 420px;
		width: 100%;
		animation: modalSlide 0.12s ease-out;
		box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.35);
	}

	@keyframes modalSlide {
		from { opacity: 0; transform: translateY(-6px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Header */
	.header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.header-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: var(--foreground);
	}

	.header-email {
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.close-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: var(--muted-foreground);
		cursor: pointer;
		transition: color 0.1s, background 0.1s;
		margin: -4px -4px 0 0;
	}

	.close-btn svg {
		width: 16px;
		height: 16px;
	}

	.close-btn:hover {
		background: var(--secondary);
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
		border: none;
		padding: 0;
		cursor: pointer;
		border-radius: 50%;
		transition: opacity 0.1s;
	}

	.photo-wrapper:hover {
		opacity: 0.9;
	}

	.photo-wrapper:disabled {
		cursor: wait;
	}

	.photo {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
	}

	.photo-placeholder {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 600;
		color: var(--primary);
	}

	.photo-overlay {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.1s;
	}

	.photo-overlay svg {
		width: 18px;
		height: 18px;
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
		width: 18px;
		height: 18px;
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
		position: absolute;
		bottom: -20px;
		left: 0;
		right: 0;
		font-size: 11px;
		color: var(--destructive);
		text-align: center;
		white-space: nowrap;
	}

	/* Form content */
	.form-content {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-label {
		font-size: 13px;
		font-weight: 500;
		color: var(--foreground);
	}

	.field-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--foreground);
		font-size: 14px;
		transition: border-color 0.1s;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--primary);
	}

	.field-input::placeholder {
		color: var(--muted-foreground);
	}

	/* Theme swatches */
	.theme-swatch {
		position: relative;
		width: 36px;
		height: 36px;
		padding: 0;
		border: 2px solid var(--border);
		border-radius: 10px;
		background: var(--background);
		cursor: pointer;
		transition: border-color 0.15s, transform 0.1s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.theme-swatch:hover {
		border-color: var(--muted-foreground);
	}

	.theme-swatch.selected {
		border-color: var(--foreground);
	}

	.theme-swatch:active {
		transform: scale(0.95);
	}

	.swatch-color {
		width: 22px;
		height: 22px;
		border-radius: 6px;
	}

	:global(.swatch-check) {
		position: absolute;
		bottom: -4px;
		right: -4px;
		width: 14px;
		height: 14px;
		padding: 2px;
		background: var(--foreground);
		color: var(--background);
		border-radius: 50%;
	}

	/* Country combobox trigger */
	:global(.country-trigger) {
		width: 100%;
		padding: 10px 12px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--foreground);
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: space-between;
		transition: border-color 0.1s;
	}

	:global(.country-trigger:hover) {
		border-color: var(--muted-foreground);
	}

	:global(.country-trigger:focus) {
		outline: none;
		border-color: var(--primary);
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

	.field-hint {
		font-size: 12px;
		color: var(--muted-foreground);
	}

	.field-error {
		font-size: 12px;
		color: var(--destructive);
	}

	:global(.field-input-error) {
		border-color: var(--destructive) !important;
	}

	/* Footer */
	.footer {
		display: flex;
		gap: 8px;
		padding: 16px 20px;
		border-top: 1px solid var(--border);
	}

	.btn-cancel,
	.btn-save {
		flex: 1;
		padding: 10px 16px;
		font-size: 13px;
		font-weight: 500;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.1s, opacity 0.1s;
	}

	.btn-cancel {
		background: var(--secondary);
		border: 1px solid var(--border);
		color: var(--foreground);
	}

	.btn-cancel:hover {
		background: var(--muted);
	}

	.btn-save {
		background: var(--primary);
		border: none;
		color: var(--primary-foreground);
	}

	.btn-save:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Responsive */
	@media (max-width: 380px) {
		.modal {
			max-width: 100%;
		}

		.header {
			padding: 16px;
		}

		.form-content {
			padding: 16px;
		}

		.footer {
			padding: 12px 16px;
		}

		.photo,
		.photo-placeholder {
			width: 48px;
			height: 48px;
		}

		.photo-placeholder {
			font-size: 18px;
		}

		.header-title {
			font-size: 15px;
		}
	}
</style>
