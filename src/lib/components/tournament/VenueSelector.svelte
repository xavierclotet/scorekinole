<script lang="ts">
	import { onMount } from 'svelte';
	import { createVenue, getMyVenues } from '$lib/firebase/venues';
	import type { Venue } from '$lib/types/venue';
	import { getVenueLocationDisplay } from '$lib/types/venue';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import * as m from '$lib/paraglide/messages.js';

	interface Props {
		// Current values (for pre-filling)
		address?: string;
		city?: string;
		country?: string;

		// Callback when venue is selected or manual entry applied
		onselect: (venue: { address?: string; city: string; country: string }) => void;

		theme?: 'light' | 'dark';
	}

	let {
		address: initialAddress = '',
		city: initialCity = '',
		country: initialCountry = 'España',
		onselect,
		theme = 'light'
	}: Props = $props();

	// Search state
	let searchQuery = $state('');
	let allVenues = $state<Venue[]>([]);

	// Derived search results (no $effect needed)
	let searchResults = $derived.by(() => {
		if (!searchQuery || searchQuery.length < 2) return [];
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

	// Manual input state
	let manualName = $state('');
	let manualAddress = $state(initialAddress);
	let manualCity = $state(initialCity);
	let manualCountry = $state(initialCountry);
	let saveAsVenue = $state(false);
	let saving = $state(false);

	// Mode: 'search' (default) or 'manual'
	let showManualForm = $state(false);

	// Can apply manual entry
	let canApply = $derived(manualCity.trim().length > 0 && !saving);

	// Load venues on mount
	onMount(() => {
		loadVenues();
	});

	async function loadVenues() {
		const venues = await getMyVenues();
		allVenues = venues;
	}

	function selectVenue(venue: Venue) {
		onselect({
			address: venue.address,
			city: venue.city,
			country: venue.country
		});
		searchQuery = '';
	}

	async function applyManual() {
		if (!manualCity.trim()) return;

		saving = true;

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
			}
		}

		onselect({
			address: manualAddress.trim() || undefined,
			city: manualCity.trim(),
			country: manualCountry
		});

		saving = false;
		showManualForm = false;
	}

	function toggleManualForm() {
		showManualForm = !showManualForm;
		if (showManualForm) {
			// Pre-fill with current values from props
			manualAddress = initialAddress;
			manualCity = initialCity;
			manualCountry = initialCountry;
		}
	}
</script>

<div class="venue-selector" data-theme={theme}>
	<!-- Search existing venues -->
	<div class="search-section">
		<span class="field-label">{m.venue_savedVenues()}</span>
		<div class="search-box">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder={m.venue_searchPlaceholder()}
				class="input-field"
				autocomplete="off"
			/>
			{#if searchResults.length > 0}
				<div class="search-results">
					{#each searchResults as venue (venue.id)}
						<button class="search-result-item" onclick={() => selectVenue(venue)}>
							<span class="result-name">{venue.name}</span>
							<span class="result-location">{getVenueLocationDisplay(venue)}</span>
							<span class="result-add">+</span>
						</button>
					{/each}
				</div>
			{:else if searchQuery.length >= 2}
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

	.venue-selector[data-theme='dark'] {
		--bg: #1a2332;
		--bg-input: #0f172a;
		--bg-hover: #1e293b;
		--border: #334155;
		--txt: #f1f5f9;
		--txt-muted: #94a3b8;
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
	.result-location {
		flex: 1;
		font-size: 0.75rem;
		color: var(--txt-muted);
		text-align: right;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
		.form-row {
			grid-template-columns: 1fr;
		}
		.name-field,
		.address-field {
			grid-column: 1;
		}
	}
</style>
