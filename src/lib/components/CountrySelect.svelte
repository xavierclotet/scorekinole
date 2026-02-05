<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import { DEVELOPED_COUNTRIES } from '$lib/constants';

	interface Props {
		value: string;
		id?: string;
		hasError?: boolean;
		onchange?: (value: string) => void;
		onblur?: () => void;
	}

	let { value = $bindable(''), id, hasError = false, onchange, onblur }: Props = $props();

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		value = target.value;
		onchange?.(target.value);
	}
</script>

<select
	{id}
	{value}
	class="country-select"
	class:input-error={hasError}
	onchange={handleChange}
	{onblur}
>
	<option value="">{m.wizard_selectOption()}</option>
	{#each DEVELOPED_COUNTRIES as countryOption}
		<option value={countryOption}>{countryOption}</option>
	{/each}
</select>

<style>
	.country-select {
		width: 100%;
		padding: 0.5rem 0.7rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 0.875rem;
		color: #1a1a1a;
		background: #fafafa;
		font-family: inherit;
	}

	.country-select:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.15);
	}

	.country-select.input-error {
		border-color: #ef4444;
	}

	:global([data-theme='dark']) .country-select {
		background: #0f1419;
		border-color: #2d3748;
		color: #e1e8ed;
	}
</style>
