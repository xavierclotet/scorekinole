<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages.js';
	import SEO from '$lib/components/SEO.svelte';
	import AppMenu from '$lib/components/AppMenu.svelte';
	import { theme } from '$lib/stores/theme';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Send from '@lucide/svelte/icons/send';
	import CheckCircle2 from '@lucide/svelte/icons/circle-check';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let loadedAt = $state(0);
	let name = $state('');
	let email = $state('');
	let message = $state('');
	let honeypot = $state(''); // hidden from humans
	let status = $state<'idle' | 'sending' | 'sent' | 'error'>('idle');
	let errorMsg = $state('');

	$effect(() => {
		if (browser) {
			loadedAt = Date.now();
		}
	});

	let valid = $derived(
		name.trim().length >= 2 &&
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
		message.trim().length >= 10
	);

	let functionUrl = $derived(
		browser
			? `https://europe-west1-${import.meta.env.VITE_FIREBASE_PROJECT_ID}.cloudfunctions.net/submitContactMessage`
			: ''
	);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!valid || status === 'sending') return;
		status = 'sending';
		errorMsg = '';

		try {
			const res = await fetch(functionUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim(),
					message: message.trim(),
					_website: honeypot,
					// Elapsed time measured on the client clock — comparing a raw
					// client timestamp against the server clock silently dropped
					// messages from users whose clock runs minutes ahead.
					_elapsedMs: String(loadedAt ? Date.now() - loadedAt : 0),
					// Legacy field for the previous CF version; remove once the
					// updated submitContactMessage function is deployed.
					_loadedAt: String(loadedAt)
				})
			});

			const data = await res.json();
			if (data.success) {
				status = 'sent';
			} else {
				status = 'error';
				errorMsg = data.error || m.common_error();
			}
		} catch {
			status = 'error';
			errorMsg = m.common_error();
		}
	}

	$effect(() => {
		if (status === 'sent') {
			const t = setTimeout(() => goto('/'), 3000);
			return () => clearTimeout(t);
		}
	});
</script>

<SEO
	title="Contact · Scorekinole"
	description="Get in touch with the Scorekinole team. Send questions, suggestions, or feedback about the crokinole live scoring app."
	canonical="https://scorekinole.es/contact"
/>

<main class="contact-page">
	<nav class="top-bar">
		<div class="top-bar-left">
			<AppMenu currentPage="contact" />
		</div>
		<div class="top-bar-right">
			<ThemeToggle />
		</div>
	</nav>

	<div class="container">
		<a href="/" class="back-link">&larr; {m.common_back()}</a>
		<h1>{m.contact_title()}</h1>
		<p class="subtitle">{m.contact_subtitle()}</p>

		{#if status === 'sent'}
			<div class="success-card">
				<CheckCircle2 class="icon" />
				<h2>{m.contact_sentTitle()}</h2>
				<p>{m.contact_sentText()}</p>
			</div>
		{:else}
			<form onsubmit={handleSubmit} class="contact-form">
				<div class="field">
					<label for="name">{m.common_name()}</label>
					<input
						id="name"
						type="text"
						bind:value={name}
						placeholder={m.contact_namePlaceholder()}
						required
						maxlength="100"
					/>
				</div>

				<div class="field">
					<label for="email">{m.common_email()}</label>
					<input
						id="email"
						type="email"
						bind:value={email}
						placeholder={m.contact_emailPlaceholder()}
						required
						maxlength="100"
					/>
				</div>

				<div class="field honeypot" aria-hidden="true">
					<label for="website">{m.contact_website()}</label>
					<input id="website" type="text" bind:value={honeypot} tabindex="-1" autocomplete="off" />
				</div>

				<div class="field">
					<label for="message">{m.contact_message()}</label>
					<textarea
						id="message"
						bind:value={message}
						placeholder={m.contact_messagePlaceholder()}
						required
						maxlength="5000"
						rows="5"
					></textarea>
				</div>

				<button type="submit" disabled={!valid || status === 'sending'} class="submit-btn">
					{#if status === 'sending'}
						<LoaderCircle class="spin" />
						{m.common_sending()}
					{:else}
						<Send />
						{m.contact_send()}
					{/if}
				</button>

				{#if status === 'error'}
					<div class="error-card">
						<AlertCircle class="icon" />
						<p>{errorMsg}</p>
					</div>
				{/if}
			</form>
		{/if}
	</div>
</main>

<style>
	.contact-page {
		min-height: 100vh;
		background: var(--background);
		color: var(--foreground);
	}

	.top-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.top-bar-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.top-bar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.container {
		max-width: 600px;
		margin: 0 auto;
		padding: 2rem 1rem;
	}

	.back-link {
		color: var(--primary);
		text-decoration: none;
		font-size: 0.9rem;
		display: inline-block;
		margin-bottom: 1.5rem;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	h1 {
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: var(--muted-foreground);
		margin: 0 0 2rem;
		line-height: 1.5;
	}

	.contact-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.field label {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--foreground);
	}

	.field input,
	.field textarea {
		padding: 0.625rem 0.75rem;
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--background);
		color: var(--foreground);
		font-size: 0.95rem;
		font-family: inherit;
		transition: border-color 0.15s;
	}

	.field input:focus,
	.field textarea:focus {
		outline: none;
		border-color: var(--primary);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.honeypot {
		position: absolute;
		left: -9999px;
		opacity: 0;
		height: 0;
		overflow: hidden;
	}

	.submit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.submit-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.submit-btn:not(:disabled):hover {
		opacity: 0.9;
	}

	/* Lucide icons render inside a child component, so the class we pass never
	   gets this component's scope hash — needs :global() anchored to an ancestor. */
	.submit-btn :global(.spin) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.success-card,
	.error-card {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 8px;
		margin-top: 1rem;
	}

	.success-card {
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 3rem 1rem;
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
	}

	.success-card :global(.icon) {
		width: 2.5rem;
		height: 2.5rem;
		color: var(--primary);
	}

	.success-card h2 {
		margin: 0.5rem 0 0.25rem;
		font-size: 1.25rem;
	}

	.success-card p {
		color: var(--muted-foreground);
		margin: 0;
		line-height: 1.5;
	}

	.error-card {
		background: color-mix(in srgb, #ef4444 10%, transparent);
		border: 1px solid color-mix(in srgb, #ef4444 25%, transparent);
	}

	.error-card :global(.icon) {
		width: 1.25rem;
		height: 1.25rem;
		color: #ef4444;
		flex-shrink: 0;
		margin-top: 0.1rem;
	}

	.error-card p {
		margin: 0;
		color: #ef4444;
		font-size: 0.9rem;
	}
</style>
