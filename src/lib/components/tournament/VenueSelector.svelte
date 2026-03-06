<script lang="ts">
	import { onMount } from 'svelte';
	import { createVenue, getAllVenues, updateVenue } from '$lib/firebase/venues';
	import type { Venue } from '$lib/types/venue';
	import { getVenueLocationDisplay } from '$lib/types/venue';
	import { currentUser } from '$lib/firebase/auth';
	import { isSuperAdminUser } from '$lib/stores/admin';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		// Current values (for pre-filling)
		address?: string;
		city?: string;
		country?: string;
		venueId?: string;

		// Callback when venue is selected or manual entry applied
		onselect: (venue: { address?: string; city: string; country: string; venueId?: string }) => void;

		theme?: 'light' | 'dark' | 'violet' | 'violet-light';
	}

	// Keep props as object for better reactivity
	let props: Props = $props();

	// Derived values from props for reactivity
	let currentAddress = $derived(props.address ?? '');
	let currentCity = $derived(props.city ?? '');
	let currentCountry = $derived(props.country ?? 'España');
	let currentVenueId = $derived(props.venueId);
	let theme = $derived(props.theme ?? 'light');

	// Search state
	let searchQuery = $state('');
	let allVenues = $state<Venue[]>([]);
	let searchFocused = $state(false);

	// Derived search results: show all on focus, filter on typing
	let searchResults = $derived.by(() => {
		if (!searchFocused && !searchQuery) return [];
		if (!searchQuery) return allVenues.slice(0, 8);
		const queryLower = searchQuery.toLowerCase();
		return allVenues
			.filter(
				(v) =>
					v.name.toLowerCase().includes(queryLower) ||
					v.city.toLowerCase().includes(queryLower) ||
					v.address?.toLowerCase().includes(queryLower)
			)
			.slice(0, 8);
	});

	// Find matching venue for current location (by venueId or by field match)
	let matchingVenue = $derived.by(() => {
		if (!currentCity) return null;

		// If we have a venueId, find by ID
		if (currentVenueId) {
			return allVenues.find((v) => v.id === currentVenueId) || null;
		}

		// Try exact match (city + country + address)
		let match = allVenues.find(
			(v) =>
				v.city === currentCity &&
				v.country === currentCountry &&
				(v.address || '') === (currentAddress || '')
		);

		// Fallback to city + country only
		if (!match) {
			match = allVenues.find(
				(v) => v.city === currentCity && v.country === currentCountry
			);
		}

		return match || null;
	});

	let matchingVenueName = $derived(matchingVenue?.name || null);

	// Can the current user edit this venue?
	let canEditVenue = $derived.by(() => {
		if (!matchingVenue) return false;
		if ($isSuperAdminUser) return true;
		return matchingVenue.ownerId === $currentUser?.id;
	});

	// Venue edit state
	let editingVenue = $state(false);
	let editVenueName = $state('');
	let editVenueAddress = $state('');
	let editVenueCity = $state('');
	let savingVenueEdit = $state(false);

	// Manual input state
	let manualName = $state('');
	let manualAddress = $state('');
	let manualCity = $state('');
	let manualCountry = $state('España');
	let saveAsVenue = $state(false);
	let saving = $state(false);

	// Mode: 'search' (default) or 'manual'
	let showManualForm = $state(false);

	// Sync manual values from props when manual form is closed
	$effect(() => {
		if (!showManualForm) {
			manualAddress = currentAddress;
			manualCity = currentCity;
			manualCountry = currentCountry;
		}
	});

	// Auto-propagate manual form values to parent as user types
	$effect(() => {
		if (showManualForm) {
			props.onselect({
				address: manualAddress.trim() || undefined,
				city: manualCity.trim(),
				country: manualCountry
			});
		}
	});

	// Can apply manual entry
	let canApply = $derived(manualCity.trim().length > 0 && !saving);

	// Load venues on mount
	onMount(() => {
		loadVenues();
	});

	async function loadVenues() {
		const venues = await getAllVenues();
		allVenues = venues;
	}

	function selectVenue(venue: Venue) {
		showManualForm = false;
		searchFocused = false;
		props.onselect({
			address: venue.address,
			city: venue.city,
			country: venue.country,
			venueId: venue.id
		});
		searchQuery = '';
	}

	async function applyManual() {
		if (!manualCity.trim()) return;

		saving = true;
		let newVenueId: string | undefined;

		// If checkbox checked and name provided, create venue first
		if (saveAsVenue && manualName.trim()) {
			const newVenue = await createVenue({
				name: manualName.trim(),
				address: manualAddress.trim() || undefined,
				city: manualCity.trim(),
				country: manualCountry
			});

			if (newVenue) {
				// Add to local cache
				allVenues = [...allVenues, newVenue];
				newVenueId = newVenue.id;
			}
		}

		props.onselect({
			address: manualAddress.trim() || undefined,
			city: manualCity.trim(),
			country: manualCountry,
			venueId: newVenueId
		});

		saving = false;
		showManualForm = false;
	}

	function toggleManualForm() {
		showManualForm = !showManualForm;
		if (showManualForm) {
			// Pre-fill with current values from props
			manualAddress = currentAddress;
			manualCity = currentCity;
			manualCountry = currentCountry;
		}
	}

	// Venue edit functions
	function startEditVenue() {
		if (!matchingVenue) return;
		editVenueName = matchingVenue.name;
		editVenueAddress = matchingVenue.address || '';
		editVenueCity = matchingVenue.city;
		editingVenue = true;
	}

	function cancelEditVenue() {
		editingVenue = false;
	}

	async function saveEditVenue() {
		if (!matchingVenue || !editVenueCity.trim()) return;

		savingVenueEdit = true;
		try {
			const updates: Partial<Venue> = {
				name: editVenueName.trim(),
				address: editVenueAddress.trim() || undefined,
				city: editVenueCity.trim()
			};

			const success = await updateVenue(matchingVenue.id, updates);

			if (success) {
				// Update local cache
				allVenues = allVenues.map((v) =>
					v.id === matchingVenue!.id ? { ...v, ...updates } : v
				);

				// Propagate updated fields to parent
				props.onselect({
					address: updates.address,
					city: updates.city!,
					country: matchingVenue.country,
					venueId: matchingVenue.id
				});

				editingVenue = false;
			}
		} finally {
			savingVenueEdit = false;
		}
	}
</script>

<div class="venue-selector" data-theme={theme}>
	{#if currentCity && !showManualForm}
		<!-- Location already selected: show summary -->
		<div class="selected-location">
			<span class="field-label">{m.wizard_location()}</span>

			{#if editingVenue && matchingVenue}
				<!-- Inline edit form -->
				<div class="venue-edit-form">
					<div class="edit-row">
						<div class="edit-field">
							<label for="edit-venue-name">{m.venue_name()}</label>
							<input id="edit-venue-name" type="text" bind:value={editVenueName} class="input-field" maxlength="100" />
						</div>
						<div class="edit-field">
							<label for="edit-venue-address">{m.wizard_address()}</label>
							<input id="edit-venue-address" type="text" bind:value={editVenueAddress} class="input-field" maxlength="200" />
						</div>
					</div>
					<div class="edit-row">
						<div class="edit-field">
							<label for="edit-venue-city">{m.wizard_city()}</label>
							<input id="edit-venue-city" type="text" bind:value={editVenueCity} class="input-field" maxlength="100" />
						</div>
					</div>
					<div class="edit-actions">
						<button type="button" class="edit-cancel-btn" onclick={cancelEditVenue}>{m.common_cancel()}</button>
						<button type="button" class="apply-btn" onclick={saveEditVenue} disabled={savingVenueEdit || !editVenueCity.trim()}>
							{savingVenueEdit ? '...' : m.common_save()}
						</button>
					</div>
				</div>
			{:else}
				<div class="location-chip">
					<span class="location-icon">📍</span>
					<span class="location-text">
						{#if matchingVenueName}
							<strong>{matchingVenueName}</strong> · {currentCity}, {currentCountry}
						{:else}
							{#if currentAddress}{currentAddress}, {/if}{currentCity}, {currentCountry}
						{/if}
					</span>
					{#if canEditVenue}
						<button type="button" class="edit-btn" onclick={startEditVenue} title={m.common_edit()}>
							✏️
						</button>
					{/if}
					<button type="button" class="clear-btn" onclick={() => props.onselect({ address: '', city: '', country: 'España' })}>
						✕
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- No location: show search and manual entry -->
		<div class="search-section">
			<span class="field-label">{m.venue_savedVenues()}</span>
			<div class="search-box">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={m.venue_searchPlaceholder()}
					class="input-field"
					autocomplete="off"
				onfocus={() => searchFocused = true}
				onblur={() => setTimeout(() => searchFocused = false, 200)}
				/>
				{#if searchResults.length > 0}
					<div class="search-results">
						{#each searchResults as venue (venue.id)}
							<button class="search-result-item" onclick={() => selectVenue(venue)}>
								<span class="result-name">{venue.name}</span>
								<span class="result-details">
									<span class="result-location">{getVenueLocationDisplay(venue)}</span>
									{#if venue.ownerName}
										<span class="result-owner">({venue.ownerName})</span>
									{/if}
								</span>
								<span class="result-add">+</span>
							</button>
						{/each}
					</div>
				{:else if searchFocused || searchQuery.length >= 2}
					<div class="no-results">{m.venue_noResults()}</div>
				{/if}
			</div>
		</div>

		<!-- Toggle for manual entry -->
		<button class="toggle-manual" onclick={toggleManualForm}>
			{showManualForm ? '−' : '+'} {m.venue_orEnterManually()}
		</button>

		<!-- Manual entry form (collapsible) -->
		{#if showManualForm}
		<div class="manual-form">
			<div class="form-row">
				<div class="form-field name-field">
					<label for="venue-name">{m.venue_name()}</label>
					<input
						id="venue-name"
						type="text"
						bind:value={manualName}
						placeholder={m.venue_namePlaceholder()}
						class="input-field"
						maxlength="100"
					/>
				</div>
				<div class="form-field address-field">
					<label for="venue-address">{m.wizard_address()}</label>
					<input
						id="venue-address"
						type="text"
						bind:value={manualAddress}
						placeholder=""
						class="input-field"
						maxlength="200"
					/>
				</div>
			</div>

			<div class="form-row location-row">
				<div class="form-field city-field">
					<label for="venue-city">{m.wizard_city()}</label>
					<input
						id="venue-city"
						type="text"
						bind:value={manualCity}
						placeholder=""
						class="input-field"
						maxlength="100"
					/>
				</div>
				<div class="form-field country-field">
					<label for="venue-country">{m.wizard_country()}</label>
					<CountrySelect id="venue-country" bind:value={manualCountry} />
				</div>
			</div>

			<div class="form-actions">
				<label class="save-checkbox">
					<input type="checkbox" bind:checked={saveAsVenue} disabled={!manualName.trim()} />
					<span>{m.venue_saveForFuture()}</span>
				</label>
				<button class="apply-btn" onclick={applyManual} disabled={!canApply}>
					{saving ? '...' : m.venue_apply()}
				</button>
			</div>
		</div>
		{/if}
	{/if}
</div>

<style>
	.venue-selector {
		--bg: #fff;
		--bg-input: #fff;
		--bg-hover: #f1f5f9;
		--border: #e2e8f0;
		--txt: #1e293b;
		--txt-muted: #64748b;
		--primary: #3b82f6;
		--primary-hover: #2563eb;
	}

	.venue-selector:is([data-theme='dark'], [data-theme='violet']) {
		--bg: #1a2332;
		--bg-input: #0f172a;
		--bg-hover: #1e293b;
		--border: #334155;
		--txt: #f1f5f9;
		--txt-muted: #94a3b8;
	}

	/* Selected location display */
	.selected-location {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.selected-location .field-label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--txt-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.location-chip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		border-radius: 5px;
	}

	.location-icon {
		font-size: 1rem;
	}

	.location-text {
		flex: 1;
		font-size: 0.85rem;
		color: var(--txt);
	}

	.edit-btn {
		padding: 0.15rem 0.3rem;
		background: transparent;
		border: none;
		font-size: 0.8rem;
		cursor: pointer;
		border-radius: 3px;
		opacity: 0.6;
		transition: opacity 0.15s;
	}
	.edit-btn:hover {
		opacity: 1;
	}

	.clear-btn {
		padding: 0.15rem 0.4rem;
		background: transparent;
		border: none;
		color: var(--txt-muted);
		font-size: 0.9rem;
		cursor: pointer;
		border-radius: 3px;
	}
	.clear-btn:hover {
		background: var(--border);
		color: var(--txt);
	}

	/* Venue edit form (inline) */
	.venue-edit-form {
		padding: 0.75rem;
		background: var(--bg-hover);
		border: 1px solid var(--border);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.edit-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.edit-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.edit-field label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--txt-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 0.15rem;
	}

	.edit-cancel-btn {
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: 0.8rem;
		color: var(--txt-muted);
		cursor: pointer;
	}
	.edit-cancel-btn:hover {
		background: var(--bg-hover);
		color: var(--txt);
	}

	.search-section {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.search-section .field-label,
	.form-field label {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--txt-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-field {
		flex: 1;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: 0.85rem;
		background: var(--bg-input);
		color: var(--txt);
	}
	.input-field:focus {
		outline: none;
		border-color: var(--primary);
	}
	.input-field::placeholder {
		color: var(--txt-muted);
	}

	.search-results {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 5px;
		margin-top: 2px;
		z-index: 30;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		overflow: hidden;
		max-height: 280px;
		overflow-y: auto;
	}

	.search-result-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.65rem;
		border: none;
		background: transparent;
		color: var(--txt);
		font-size: 0.85rem;
		cursor: pointer;
		text-align: left;
	}
	.search-result-item:hover {
		background: var(--bg-hover);
	}

	.result-name {
		font-weight: 500;
		flex-shrink: 0;
	}
	.result-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.1rem;
		min-width: 0;
	}
	.result-location {
		font-size: 0.75rem;
		color: var(--txt-muted);
		text-align: right;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.result-owner {
		font-size: 0.65rem;
		color: var(--txt-muted);
		opacity: 0.7;
		text-align: right;
	}
	.result-add {
		color: var(--primary);
		font-weight: 600;
		font-size: 0.9rem;
	}

	.no-results {
		padding: 0.6rem;
		font-size: 0.8rem;
		color: var(--txt-muted);
		text-align: center;
	}

	.toggle-manual {
		display: block;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.4rem;
		background: transparent;
		border: 1px dashed var(--border);
		border-radius: 5px;
		color: var(--txt-muted);
		font-size: 0.75rem;
		cursor: pointer;
		text-align: center;
	}
	.toggle-manual:hover {
		border-color: var(--primary);
		color: var(--primary);
	}

	.manual-form {
		margin-top: 0.6rem;
		padding: 0.75rem;
		background: var(--bg-hover);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.6rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.name-field {
		grid-column: 1;
	}
	.address-field {
		grid-column: 2;
	}

	.location-row {
		grid-template-columns: 1fr 1fr;
	}

	.form-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.25rem;
	}

	.save-checkbox {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--txt-muted);
		cursor: pointer;
	}
	.save-checkbox input {
		width: 14px;
		height: 14px;
		accent-color: var(--primary);
	}
	.save-checkbox input:disabled + span {
		opacity: 0.5;
	}

	.apply-btn {
		padding: 0.45rem 1rem;
		background: var(--primary);
		color: #fff;
		border: none;
		border-radius: 5px;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
	}
	.apply-btn:hover:not(:disabled) {
		background: var(--primary-hover);
	}
	.apply-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 500px) {
		.form-row,
		.edit-row {
			grid-template-columns: 1fr;
		}
		.name-field,
		.address-field {
			grid-column: 1;
		}
	}
</style>
