<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { language, t } from '$lib/stores/language';
	import { gameSettings } from '$lib/stores/gameSettings';
	import { team1, team2, loadTeams, saveTeams, addPoints, resetTeams, switchSides, switchColors } from '$lib/stores/teams';
	import { timerDisplay, timerWarning, timerTimeout, timerRunning, timeRemaining, startTimer, stopTimer, toggleTimer, resetTimer, cleanupTimer } from '$lib/stores/timer';
	import { matchState, loadMatchState, resetMatchState, startMatch, setTwentyTeam } from '$lib/stores/matchState';
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import NumberControl from '$lib/components/NumberControl.svelte';
	import ColorPicker from '$lib/components/ColorPicker.svelte';

	// Modal states
	let showSettingsModal = false;
	let showColorModal = false;

	// Color picker state
	let team1Color = '#00ff88';
	let team2Color = '#ff3366';

	onMount(() => {
		gameSettings.load();
		loadTeams();
		loadMatchState();

		// Sync team colors with color pickers
		const unsub1 = team1.subscribe($t1 => {
			team1Color = $t1.color;
		});
		const unsub2 = team2.subscribe($t2 => {
			team2Color = $t2.color;
		});

		const unsubSettings = gameSettings.subscribe($settings => {
			language.set($settings.language);
		});

		return () => {
			unsub1();
			unsub2();
			unsubSettings();
		};
	});

	onDestroy(() => {
		cleanupTimer();
	});

	function changeLanguage(lang: 'es' | 'ca' | 'en') {
		gameSettings.update(settings => ({ ...settings, language: lang }));
		gameSettings.save();
	}

	function handleColorSave() {
		team1.update(t => ({ ...t, color: team1Color }));
		team2.update(t => ({ ...t, color: team2Color }));
		saveTeams();
		showColorModal = false;
	}

	function handleResetTimer() {
		resetTimer($gameSettings.timerMinutes * 60 + $gameSettings.timerSeconds);
	}

	function handleStartMatch() {
		startMatch('Player 1', 1);
	}
</script>

<main>
	<h1>🎯 Crokinole Scorer - Fase 6 Completa</h1>

	<div style="text-align: center; margin: 2rem 0;">
		<a href="/game" style="display: inline-block; padding: 1.5rem 3rem; background: linear-gradient(135deg, #00ff88, #00d4ff); color: #000; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 1.5rem; box-shadow: 0 4px 20px rgba(0, 255, 136, 0.4); transition: all 0.3s;">
			🎮 Probar Game Page Completa (Fases 5-6)
		</a>
		<p style="margin-top: 1rem; color: rgba(255, 255, 255, 0.7);">Prueba TeamCard, Timer, gestos swipe y scoring completo</p>
	</div>

	<section class="test-section">
		<h2>✅ Fase 6: Timer Component</h2>
		<ul>
			<li>✅ Timer.svelte - Componente reutilizable con props</li>
			<li>✅ Click para play/pause con toggle automático</li>
			<li>✅ Botón reset integrado</li>
			<li>✅ Estados visuales (normal, warning, timeout)</li>
			<li>✅ Animaciones (pulse, flash)</li>
			<li>✅ 3 tamaños (small, medium, large)</li>
			<li>✅ showResetButton configurable</li>
			<li>✅ Integrado con timer store</li>
			<li>✅ Responsive design completo</li>
		</ul>
	</section>

	<section class="test-section">
		<h2>✅ Fase 5: TeamCard Component</h2>
		<ul>
			<li>✅ TeamCard.svelte - Componente complejo con swipe gestures</li>
			<li>✅ Detección de swipe up/down (touch + mouse)</li>
			<li>✅ Score increment/decrement con vibración</li>
			<li>✅ Win condition logic (points mode)</li>
			<li>✅ Edición de nombre de equipo</li>
			<li>✅ Indicador de hammer animado</li>
			<li>✅ Badge de ganador con animación</li>
			<li>✅ Responsive design completo</li>
		</ul>
	</section>

	<section class="test-section">
		<h2>✅ Fase 3: Componentes Base</h2>
		<ul>
			<li>✅ Modal.svelte - Modal reutilizable con overlay y animaciones</li>
			<li>✅ Button.svelte - Botón con 3 variantes y 3 tamaños</li>
			<li>✅ NumberControl.svelte - Control numérico con +/-</li>
			<li>✅ ColorPicker.svelte - Selector de colores con grid y custom</li>
		</ul>
	</section>

	<section class="test-section">
		<h2>✅ Fase 4: Stores de Estado</h2>
		<ul>
			<li>✅ teams.ts - Store para equipos con helpers</li>
			<li>✅ timer.ts - Store para timer con derived display</li>
			<li>✅ matchState.ts - Store para estado de partida</li>
			<li>✅ Types completos (Team, MatchState, GameData, RoundData)</li>
		</ul>
	</section>

	<section class="test-section">
		<h2>🎨 Demostración de Componentes</h2>

		<div class="demo-group">
			<h3>Button Component</h3>
			<div class="button-row">
				<Button variant="primary">Primary</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="danger">Danger</Button>
			</div>
			<div class="button-row">
				<Button variant="primary" size="small">Small</Button>
				<Button variant="primary" size="medium">Medium</Button>
				<Button variant="primary" size="large">Large</Button>
			</div>
			<div class="button-row">
				<Button variant="secondary" disabled>Disabled</Button>
				<Button variant="primary" fullWidth>Full Width</Button>
			</div>
		</div>

		<div class="demo-group">
			<h3>NumberControl Component</h3>
			<NumberControl
				label={$t('pointsToWin')}
				bind:value={$gameSettings.pointsToWin}
				min={1}
				max={20}
				step={1}
			/>
			<NumberControl
				label={$t('roundsToPlay')}
				bind:value={$gameSettings.roundsToPlay}
				min={1}
				max={16}
				step={1}
			/>
		</div>

		<div class="demo-group">
			<h3>Modal + ColorPicker Components</h3>
			<Button variant="primary" on:click={() => (showColorModal = true)}>
				🎨 Abrir Color Picker
			</Button>
			<Button variant="secondary" on:click={() => (showSettingsModal = true)}>
				⚙️ Abrir Settings Modal
			</Button>
		</div>
	</section>

	<section class="test-section">
		<h2>{$t('language')}</h2>
		<div class="button-group">
			<Button
				variant={$gameSettings.language === 'es' ? 'primary' : 'secondary'}
				on:click={() => changeLanguage('es')}
			>
				🇪🇸 Español
			</Button>
			<Button
				variant={$gameSettings.language === 'ca' ? 'primary' : 'secondary'}
				on:click={() => changeLanguage('ca')}
			>
				🇨🇦 Català
			</Button>
			<Button
				variant={$gameSettings.language === 'en' ? 'primary' : 'secondary'}
				on:click={() => changeLanguage('en')}
			>
				🇬🇧 English
			</Button>
		</div>
	</section>

	<section class="test-section">
		<h2>📊 Estado Actual</h2>
		<div class="state-grid">
			<div class="state-item">
				<span class="state-label">{$t('language')}:</span>
				<span class="state-value">{$gameSettings.language}</span>
			</div>
			<div class="state-item">
				<span class="state-label">{$t('pointsToWin')}:</span>
				<span class="state-value">{$gameSettings.pointsToWin}</span>
			</div>
			<div class="state-item">
				<span class="state-label">{$t('roundsToPlay')}:</span>
				<span class="state-value">{$gameSettings.roundsToPlay}</span>
			</div>
			<div class="state-item">
				<span class="state-label">Team 1 Color:</span>
				<span class="state-value">
					<span class="color-box" style="background: {team1Color}"></span>
					{team1Color}
				</span>
			</div>
			<div class="state-item">
				<span class="state-label">Team 2 Color:</span>
				<span class="state-value">
					<span class="color-box" style="background: {team2Color}"></span>
					{team2Color}
				</span>
			</div>
		</div>
	</section>

	<section class="test-section">
		<h2>⚡ Prueba de Stores (Fase 4)</h2>

		<div class="demo-group">
			<h3>Team Stores</h3>
			<div class="teams-demo">
				<div class="team-box" style="border-color: {$team1.color}">
					<h4>{$team1.name}</h4>
					<p class="team-score">{$team1.points}</p>
					<div class="team-controls">
						<Button size="small" on:click={() => addPoints(1, -1)}>-1</Button>
						<Button size="small" on:click={() => addPoints(1, 1)}>+1</Button>
					</div>
					<p class="team-stats">Rounds: {$team1.rounds} | Matches: {$team1.matches}</p>
				</div>

				<div class="team-box" style="border-color: {$team2.color}">
					<h4>{$team2.name}</h4>
					<p class="team-score">{$team2.points}</p>
					<div class="team-controls">
						<Button size="small" on:click={() => addPoints(2, -1)}>-1</Button>
						<Button size="small" on:click={() => addPoints(2, 1)}>+1</Button>
					</div>
					<p class="team-stats">Rounds: {$team2.rounds} | Matches: {$team2.matches}</p>
				</div>
			</div>
			<div class="button-row" style="margin-top: 1rem;">
				<Button variant="secondary" size="small" on:click={resetTeams}>Reset Teams</Button>
				<Button variant="secondary" size="small" on:click={switchSides}>Switch Sides</Button>
				<Button variant="secondary" size="small" on:click={switchColors}>Switch Colors</Button>
			</div>
		</div>

		<div class="demo-group">
			<h3>Timer Store</h3>
			<div class="timer-demo">
				<div class="timer-display-large"
					class:warning={$timerWarning}
					class:timeout={$timerTimeout}
				>
					{$timerDisplay}
				</div>
				<div class="button-row">
					<Button variant={$timerRunning ? 'danger' : 'primary'} on:click={toggleTimer}>
						{$timerRunning ? '⏸ Pause' : '▶ Start'}
					</Button>
					<Button variant="secondary" on:click={handleResetTimer}>⟲ Reset</Button>
					<Button variant="secondary" size="small" on:click={() => resetTimer(10)}>Set 10s</Button>
				</div>
				<p class="info-text">
					Status: {$timerRunning ? '🟢 Running' : '🔴 Stopped'} |
					Remaining: {$timeRemaining}s
					{#if $timerWarning}
						| ⚠️ Warning
					{/if}
					{#if $timerTimeout}
						| 🔔 Time Out!
					{/if}
				</p>
			</div>
		</div>

		<div class="demo-group">
			<h3>Match State Store</h3>
			<div class="match-state-demo">
				<p><strong>Started by:</strong> {$matchState.matchStartedBy || 'Not started'}</p>
				<p><strong>Start Hammer:</strong> Team {$matchState.currentGameStartHammer || 'N/A'}</p>
				<p><strong>Current 20s Team:</strong> {$matchState.currentTwentyTeam === 0 ? 'None' : `Team ${$matchState.currentTwentyTeam}`}</p>
				<p><strong>Games played:</strong> {$matchState.currentMatchGames.length}</p>
				<div class="button-row" style="margin-top: 1rem;">
					<Button variant="primary" size="small" on:click={handleStartMatch}>Start Match</Button>
					<Button variant="secondary" size="small" on:click={() => setTwentyTeam(1)}>20s Team 1</Button>
					<Button variant="secondary" size="small" on:click={() => setTwentyTeam(2)}>20s Team 2</Button>
					<Button variant="danger" size="small" on:click={resetMatchState}>Reset Match</Button>
				</div>
			</div>
		</div>
	</section>

	<footer>
		<p>✨ Fase 4 completada: Stores con reactividad completa y TypeScript</p>
		<p>Puerto: 5174 | Versión: {$gameSettings.appVersion}</p>
	</footer>
</main>

<!-- Modal for Settings -->
<Modal
	isOpen={showSettingsModal}
	title={$t('settings')}
	onClose={() => (showSettingsModal = false)}
>
	<div class="modal-content-inner">
		<p>Este es un ejemplo de modal con contenido personalizado.</p>
		<p>Puedes poner cualquier contenido aquí usando slots.</p>

		<NumberControl
			label="Minutos del temporizador"
			bind:value={$gameSettings.timerMinutes}
			min={0}
			max={30}
			step={1}
		/>

		<div class="modal-actions">
			<Button variant="secondary" on:click={() => (showSettingsModal = false)}>
				{$t('cancel')}
			</Button>
			<Button
				variant="primary"
				on:click={() => {
					gameSettings.save();
					showSettingsModal = false;
				}}
			>
				{$t('save')}
			</Button>
		</div>
	</div>
</Modal>

<!-- Modal for Color Picker -->
<Modal
	isOpen={showColorModal}
	title={$t('chooseColor')}
	onClose={() => (showColorModal = false)}
>
	<div class="modal-content-inner">
		<div class="color-section">
			<h4>Team 1 Color</h4>
			<ColorPicker bind:selectedColor={team1Color} />
		</div>

		<div class="color-section">
			<h4>Team 2 Color</h4>
			<ColorPicker bind:selectedColor={team2Color} />
		</div>

		<div class="modal-actions">
			<Button variant="secondary" on:click={() => (showColorModal = false)}>
				{$t('cancel')}
			</Button>
			<Button variant="primary" on:click={handleColorSave}>
				{$t('save')}
			</Button>
		</div>
	</div>
</Modal>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Lexend', system-ui, -apple-system, sans-serif;
		background: #0a0e1a;
		color: #fff;
	}

	:global(:root) {
		--bg-primary: #0a0e1a;
		--bg-header: #151b2d;
		--bg-modal: #1a1f35;
		--accent-green: #00ff88;
		--accent-green-light: #00ffaa;
		--accent-red: #ff3366;
		--accent-red-dark: #ff1a4d;
		--text-color: #fff;
	}

	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	h1 {
		color: var(--accent-green);
		text-align: center;
		margin-bottom: 2rem;
		font-size: 2rem;
	}

	h2 {
		color: var(--accent-green);
		font-size: 1.5rem;
		margin-bottom: 1rem;
	}

	h3 {
		color: var(--accent-green);
		font-size: 1.2rem;
		margin-bottom: 0.75rem;
	}

	h4 {
		color: var(--accent-green);
		font-size: 1rem;
		margin-bottom: 0.5rem;
	}

	.test-section {
		background: var(--bg-header);
		padding: 1.5rem;
		border-radius: 12px;
		margin-bottom: 1.5rem;
	}

	.test-section ul {
		list-style: none;
		padding: 0;
	}

	.test-section li {
		padding: 0.5rem 0;
		border-bottom: 1px solid #1a2035;
	}

	.test-section li:last-child {
		border-bottom: none;
	}

	.demo-group {
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid #1a2035;
	}

	.demo-group:last-child {
		border-bottom: none;
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.button-row {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.button-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.state-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.state-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 8px;
	}

	.state-label {
		color: var(--accent-green);
		font-size: 0.9rem;
		font-weight: 500;
	}

	.state-value {
		font-size: 1.1rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.color-box {
		display: inline-block;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: 2px solid rgba(255, 255, 255, 0.3);
	}

	.modal-content-inner {
		min-width: 300px;
	}

	.color-section {
		margin-bottom: 2rem;
		padding-bottom: 2rem;
		border-bottom: 1px solid #1a2035;
	}

	.color-section:last-of-type {
		border-bottom: none;
	}

	.modal-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	footer {
		text-align: center;
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid #1a2035;
		color: #666;
	}

	footer p {
		margin: 0.5rem 0;
	}

	/* Stores demo styles */
	.teams-demo {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.team-box {
		background: rgba(0, 0, 0, 0.3);
		border: 3px solid;
		border-radius: 12px;
		padding: 1.5rem;
		text-align: center;
	}

	.team-box h4 {
		margin-top: 0;
		margin-bottom: 0.5rem;
	}

	.team-score {
		font-size: 3rem;
		font-weight: bold;
		margin: 1rem 0;
		color: var(--accent-green);
	}

	.team-controls {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
		margin-bottom: 1rem;
	}

	.team-stats {
		font-size: 0.9rem;
		color: #aaa;
		margin: 0;
	}

	.timer-demo {
		text-align: center;
	}

	.timer-display-large {
		font-size: 4rem;
		font-weight: bold;
		color: var(--accent-green);
		margin: 2rem 0;
		padding: 2rem;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 12px;
		font-family: 'Orbitron', monospace;
	}

	.timer-display-large.warning {
		color: var(--accent-red);
		animation: pulse 1s infinite;
	}

	.timer-display-large.timeout {
		color: var(--accent-red);
		animation: flash 0.5s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	@keyframes flash {
		0%, 100% {
			background: rgba(255, 51, 102, 0.1);
		}
		50% {
			background: rgba(255, 51, 102, 0.3);
		}
	}

	.info-text {
		color: #aaa;
		font-size: 0.9rem;
		margin-top: 1rem;
	}

	.match-state-demo p {
		margin: 0.75rem 0;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 6px;
	}

	/* Mobile optimizations */
	@media (max-width: 600px) {
		main {
			padding: 1rem;
		}

		h1 {
			font-size: 1.5rem;
		}

		.button-row,
		.button-group {
			flex-direction: column;
		}

		.state-grid {
			grid-template-columns: 1fr;
		}

		.teams-demo {
			grid-template-columns: 1fr;
		}

		.timer-display-large {
			font-size: 3rem;
			padding: 1.5rem;
		}
	}
</style>
