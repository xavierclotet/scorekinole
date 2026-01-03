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
	<title>Scorekinole - Crokinole Scorer App</title>
	<meta name="description" content="Professional scoring app for Crokinole games. Track points, rounds, and matches with ease." />
</svelte:head>

<main class="landing">
	<div class="language-selector">
		<button class:active={$gameSettings.language === 'es'} on:click={() => changeLanguage('es')}>ES</button>
		<button class:active={$gameSettings.language === 'ca'} on:click={() => changeLanguage('ca')}>CA</button>
		<button class:active={$gameSettings.language === 'en'} on:click={() => changeLanguage('en')}>EN</button>
	</div>

	<div class="hero">
		<div class="logo">
			<div class="logo-circle">
				<div class="logo-ring"></div>
				<div class="logo-center">🎯</div>
			</div>
		</div>

		<h1 class="title">Scorekinole</h1>
		<p class="subtitle">{$t('appTitle')}</p>

		<button class="cta-button" on:click={startScoring}>
			<span class="cta-icon">🎮</span>
			<span class="cta-text">{$t('newGame')}</span>
			<span class="cta-arrow">→</span>
		</button>

		<div class="features">
			<div class="feature">
				<div class="feature-icon">⏱️</div>
				<div class="feature-text">{$t('timer')}</div>
			</div>
			<div class="feature">
				<div class="feature-icon">📊</div>
				<div class="feature-text">{$t('rounds')}</div>
			</div>
			<div class="feature">
				<div class="feature-icon">🏆</div>
				<div class="feature-text">{$t('matchHistory')}</div>
			</div>
			<div class="feature">
				<div class="feature-icon">⭐</div>
				<div class="feature-text">{$t('twenties')}</div>
			</div>
		</div>
	</div>

	<footer class="footer">
		<p>v{APP_VERSION}</p>
		<p>Made with ❤️ for Crokinole players</p>
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
		background: linear-gradient(135deg, #0f1419 0%, #1a1f35 50%, #0a0e1a 100%);
		overflow-y: auto;
	}

	/* Animated background */
	.landing::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background:
			radial-gradient(circle at 20% 50%, rgba(0, 255, 136, 0.05) 0%, transparent 50%),
			radial-gradient(circle at 80% 80%, rgba(0, 212, 255, 0.05) 0%, transparent 50%);
		animation: pulse 8s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
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
		margin-bottom: 2rem;
		animation: float 3s ease-in-out infinite;
	}

	@keyframes float {
		0%, 100% { transform: translateY(0px); }
		50% { transform: translateY(-10px); }
	}

	.logo-circle {
		position: relative;
		width: 120px;
		height: 120px;
		margin: 0 auto;
	}

	.logo-ring {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border: 4px solid;
		border-image: linear-gradient(135deg, #00ff88, #00d4ff) 1;
		border-radius: 50%;
		animation: rotate 10s linear infinite;
	}

	.logo-ring::before {
		content: '';
		position: absolute;
		top: -4px;
		left: -4px;
		right: -4px;
		bottom: -4px;
		border: 2px solid rgba(0, 255, 136, 0.2);
		border-radius: 50%;
	}

	@keyframes rotate {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.logo-center {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 3.5rem;
		filter: drop-shadow(0 0 20px rgba(0, 255, 136, 0.5));
	}

	.title {
		font-size: 3.5rem;
		font-weight: 900;
		margin: 0 0 0.5rem 0;
		background: linear-gradient(135deg, #00ff88, #00d4ff);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		font-family: 'Orbitron', monospace;
		letter-spacing: 0.05em;
		animation: glow 2s ease-in-out infinite;
	}

	@keyframes glow {
		0%, 100% {
			text-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
		}
		50% {
			text-shadow: 0 0 30px rgba(0, 255, 136, 0.5);
		}
	}

	.subtitle {
		font-size: 1.2rem;
		color: rgba(255, 255, 255, 0.7);
		margin: 0 0 3rem 0;
		font-weight: 500;
	}

	.cta-button {
		display: inline-flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 2.5rem;
		background: linear-gradient(135deg, #00ff88, #00d4ff);
		border: none;
		border-radius: 16px;
		color: #000;
		font-size: 1.5rem;
		font-weight: 900;
		cursor: pointer;
		transition: all 0.3s;
		box-shadow:
			0 8px 32px rgba(0, 255, 136, 0.4),
			0 0 60px rgba(0, 255, 136, 0.2);
		position: relative;
		overflow: hidden;
		font-family: 'Orbitron', monospace;
		margin-bottom: 3rem;
	}

	.cta-button::before {
		content: '';
		position: absolute;
		top: 0;
		left: -100%;
		width: 100%;
		height: 100%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
		transition: left 0.5s;
	}

	.cta-button:hover::before {
		left: 100%;
	}

	.cta-button:hover {
		transform: translateY(-4px) scale(1.05);
		box-shadow:
			0 12px 48px rgba(0, 255, 136, 0.5),
			0 0 80px rgba(0, 255, 136, 0.3);
	}

	.cta-button:active {
		transform: translateY(-2px) scale(1.02);
	}

	.cta-icon {
		font-size: 1.8rem;
	}

	.cta-text {
		position: relative;
	}

	.cta-arrow {
		font-size: 1.8rem;
		transition: transform 0.3s;
	}

	.cta-button:hover .cta-arrow {
		transform: translateX(4px);
	}

	.features {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
		margin-top: 2rem;
	}

	.feature {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 2px solid rgba(0, 255, 136, 0.2);
		border-radius: 12px;
		transition: all 0.3s;
		backdrop-filter: blur(10px);
	}

	.feature:hover {
		background: rgba(0, 255, 136, 0.05);
		border-color: rgba(0, 255, 136, 0.4);
		transform: translateY(-4px);
		box-shadow: 0 8px 24px rgba(0, 255, 136, 0.2);
	}

	.feature-icon {
		font-size: 2.5rem;
		filter: drop-shadow(0 0 10px rgba(0, 255, 136, 0.3));
	}

	.feature-text {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.8);
		text-align: center;
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
		.hero {
			padding: 1rem;
		}

		.language-selector {
			top: 0.5rem;
			right: 0.5rem;
			gap: 0.25rem;
		}

		.language-selector button {
			padding: 0.4rem 0.8rem;
			font-size: 0.75rem;
		}

		.logo-circle {
			width: 100px;
			height: 100px;
		}

		.logo-center {
			font-size: 3rem;
		}

		.title {
			font-size: 2.5rem;
		}

		.subtitle {
			font-size: 1rem;
			margin-bottom: 2rem;
		}

		.cta-button {
			padding: 1rem 2rem;
			font-size: 1.2rem;
			gap: 0.75rem;
		}

		.cta-icon {
			font-size: 1.5rem;
		}

		.cta-arrow {
			font-size: 1.5rem;
		}

		.features {
			grid-template-columns: 1fr;
			gap: 1rem;
		}

		.feature {
			padding: 1rem;
		}

		.feature-icon {
			font-size: 2rem;
		}

		.feature-text {
			font-size: 0.85rem;
		}
	}

	@media (max-height: 700px) {
		.hero {
			padding: 1rem;
		}

		.logo {
			margin-bottom: 1rem;
		}

		.logo-circle {
			width: 80px;
			height: 80px;
		}

		.logo-center {
			font-size: 2.5rem;
		}

		.title {
			font-size: 2.5rem;
			margin-bottom: 0.25rem;
		}

		.subtitle {
			font-size: 1rem;
			margin-bottom: 1.5rem;
		}

		.cta-button {
			padding: 0.875rem 1.75rem;
			font-size: 1.2rem;
			margin-bottom: 1.5rem;
		}

		.features {
			gap: 0.75rem;
		}

		.feature {
			padding: 0.75rem;
		}

		.feature-icon {
			font-size: 1.75rem;
		}
	}

	@media (orientation: landscape) and (max-height: 700px) {
		.landing {
			justify-content: flex-start;
			padding-top: 1rem;
			padding-bottom: 1rem;
		}

		.hero {
			padding: 0.5rem 2rem;
		}

		.logo {
			margin-bottom: 0.5rem;
		}

		.logo-circle {
			width: 50px;
			height: 50px;
		}

		.logo-center {
			font-size: 1.75rem;
		}

		.title {
			font-size: 1.75rem;
			margin-bottom: 0.25rem;
		}

		.subtitle {
			font-size: 0.9rem;
			margin-bottom: 0.75rem;
		}

		.cta-button {
			padding: 0.6rem 1.25rem;
			font-size: 0.95rem;
			margin-bottom: 0.75rem;
		}

		.cta-icon {
			font-size: 1.2rem;
		}

		.cta-arrow {
			font-size: 1.2rem;
		}

		.features {
			grid-template-columns: repeat(4, 1fr);
			gap: 0.5rem;
			margin-top: 0.5rem;
		}

		.feature {
			padding: 0.4rem 0.5rem;
		}

		.feature-icon {
			font-size: 1.25rem;
		}

		.feature-text {
			font-size: 0.7rem;
		}

		.footer {
			position: relative;
			margin-top: 0.5rem;
			bottom: auto;
		}

		.footer p {
			margin: 0.1rem 0;
			font-size: 0.7rem;
		}
	}
</style>
