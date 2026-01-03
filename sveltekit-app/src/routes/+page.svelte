<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { APP_VERSION } from '$lib/constants';

	onMount(() => {
		gameSettings.load();
		const unsubSettings = gameSettings.subscribe($settings => {
			language.set($settings.language);
		});

		return () => {
			unsubSettings();
		};
	});

	function startScoring() {
		goto('/game');
	}

	function changeLanguage(lang: 'es' | 'ca' | 'en') {
		gameSettings.update(settings => ({ ...settings, language: lang }));
		gameSettings.save();
	}
</script>

<svelte:head>
	<title>Scorekinole - Crokinole Scorer Arena App</title>
	<meta name="description" content="Professional scoring app for Crokinole games. Track points, rounds, and matches with ease." />
</svelte:head>

<main class="landing">
	<div class="language-selector">
		<button class:active={$gameSettings.language === 'es'} on:click={() => changeLanguage('es')}>ES</button>
		<button class:active={$gameSettings.language === 'ca'} on:click={() => changeLanguage('ca')}>CA</button>
		<button class:active={$gameSettings.language === 'en'} on:click={() => changeLanguage('en')}>EN</button>
	</div>

	<div class="hero">
		<img src="/icon.png" alt="Scorekinole" class="logo" />

		<h1 class="title">Scorekinole</h1>
		<p class="subtitle">{$t('appTitle')}</p>

		<button class="cta-button" on:click={startScoring}>
			{$t('newGame')}
		</button>

		<div class="features">
			<span class="feature">⏱️ {$t('timer')}</span>
			<span class="feature">📊 {$t('rounds')}</span>
			<span class="feature">🏆 {$t('matchHistory')}</span>
			<span class="feature">🔨 {$t('hammer')}</span>
			<span class="feature">⭐ {$t('twenties')}</span>
			<span class="feature">☁️ {$t('syncAll')}</span>
		</div>
	</div>

	<footer class="footer">
		<p>v{APP_VERSION}</p>
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
		background: #0a0e1a;
		color: #fff;
		overflow-x: hidden;
	}

	.landing {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: #0a0e1a;
		overflow-y: auto;
	}

	.language-selector {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.5rem;
		z-index: 10;
	}

	.language-selector button {
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.6);
		cursor: pointer;
		transition: all 0.3s;
		font-weight: 600;
		font-size: 0.85rem;
		backdrop-filter: blur(10px);
	}

	.language-selector button:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(0, 255, 136, 0.3);
		color: #fff;
	}

	.language-selector button.active {
		background: linear-gradient(135deg, #00ff88, #00d4ff);
		border-color: #00ff88;
		color: #000;
		font-weight: 700;
	}

	.hero {
		position: relative;
		text-align: center;
		padding: 2rem;
		max-width: 600px;
		z-index: 1;
	}

	.logo {
		width: 120px;
		height: 120px;
		margin-bottom: 1.5rem;
		border-radius: 12px;
		filter: drop-shadow(0 4px 12px rgba(0, 255, 136, 0.3));
	}

	.title {
		font-size: 3rem;
		font-weight: 700;
		margin: 0 0 0.5rem 0;
		color: #00ff88;
		font-family: 'Orbitron', monospace;
		letter-spacing: 0.02em;
	}

	.subtitle {
		font-size: 1.1rem;
		color: rgba(255, 255, 255, 0.6);
		margin: 0 0 2.5rem 0;
		font-weight: 400;
	}

	.cta-button {
		padding: 1rem 3rem;
		background: #00ff88;
		border: none;
		border-radius: 8px;
		color: #0a0e1a;
		font-size: 1.3rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 16px rgba(0, 255, 136, 0.3);
		font-family: 'Orbitron', monospace;
		margin-bottom: 2.5rem;
	}

	.cta-button:hover {
		background: #00d46a;
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 255, 136, 0.4);
	}

	.cta-button:active {
		transform: translateY(0);
	}

	.features {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: center;
	}

	.feature {
		padding: 0.6rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.7);
		font-weight: 500;
	}

	.footer {
		position: absolute;
		bottom: 1rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.85rem;
		z-index: 1;
	}

	.footer p {
		margin: 0.25rem 0;
	}

	/* Responsive */
	@media (max-width: 600px) {
		.logo {
			width: 100px;
			height: 100px;
		}

		.title {
			font-size: 2.2rem;
		}

		.subtitle {
			font-size: 1rem;
		}

		.cta-button {
			padding: 0.9rem 2.5rem;
			font-size: 1.1rem;
		}

		.feature {
			font-size: 0.85rem;
		}
	}
</style>
