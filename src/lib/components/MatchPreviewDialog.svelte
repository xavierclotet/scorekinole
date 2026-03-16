<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { PendingMatchInfo } from '$lib/firebase/tournamentMatches';
	import { currentUser } from '$lib/firebase/auth';
	import { getContrastColor } from '$lib/utils/colors';
	import { getHammerFromStarter } from '$lib/utils/matchStartOptions';
	import { getInitials, getPartnerInitials, getScorerWarningName } from '$lib/utils/matchPreviewHelpers';
	import { Dices } from '@lucide/svelte';

	const presetColors: string[] = [
		'#E6BD80', '#1B100E', '#DADADA', '#BB484D', '#D06249',
		'#DFC530', '#559D5E', '#3CBCFB', '#014BC6', '#DA85CE', '#8B65A0'
	];

	interface PlayOptions {
		hammerTeam?: 1 | 2 | null;
		team1Color: string;
		team2Color: string;
	}

	interface Props {
		isOpen?: boolean;
		matchInfo: PendingMatchInfo | null;
		tournamentName?: string;
		tournamentEdition?: number;
		isDoubles?: boolean;
		isLoading?: boolean;
		team1Color?: string;
		team2Color?: string;
		onplay?: (options: PlayOptions) => void;
		oncancel?: () => void;
	}

	let {
		isOpen = $bindable(false),
		matchInfo,
		tournamentName,
		tournamentEdition,
		isDoubles = false,
		isLoading = false,
		team1Color: initialTeam1Color = '#E6BD80',
		team2Color: initialTeam2Color = '#1B100E',
		onplay,
		oncancel
	}: Props = $props();

	let selectedTeam1Color = $state('#E6BD80');
	let selectedTeam2Color = $state('#1B100E');
	let showTeam1Palette = $state(false);
	let showTeam2Palette = $state(false);
	let selectedHammer = $state<1 | 2 | null>(null);

	// Reset state when dialog opens
	$effect(() => {
		if (isOpen) {
			selectedTeam1Color = initialTeam1Color;
			selectedTeam2Color = initialTeam2Color;
			selectedHammer = null;
			showTeam1Palette = false;
			showTeam2Palette = false;
		}
	});

	let showHammer = $derived(!!matchInfo?.gameConfig?.showHammer);
	let isAutoAlternate = $derived(
		matchInfo?.gameConfig?.whoStarts === 'alternate' && !!matchInfo?.autoStartParticipantId
	);

	// Detect doubles from prop OR from partner photo presence in data
	let doublesMode = $derived(
		isDoubles ||
		!!matchInfo?.participantAPartnerPhotoURL ||
		!!matchInfo?.participantBPartnerPhotoURL
	);

	function translateGroupName(name: string): string {
		if (name === 'Swiss') return m.tournament_swissSystem();
		if (name === 'SINGLE_GROUP') return m.tournament_singleGroup();
		const idMatch = name.match(/^GROUP_([A-H])$/);
		if (idMatch) return `${m.tournament_group()} ${idMatch[1]}`;
		if (name === 'Grupo Único') return m.tournament_singleGroup();
		const legacyMatch = name.match(/^Grupo ([A-H])$/);
		if (legacyMatch) return `${m.tournament_group()} ${legacyMatch[1]}`;
		return name;
	}

	function translateRoundName(name: string): string {
		const key = name.toLowerCase();
		const roundTranslations: Record<string, string> = {
			'final': m.tournament_final(),
			'finals': m.tournament_final(),
			'semifinal': m.tournament_semifinal(),
			'semifinals': m.tournament_semifinal(),
			'quarterfinal': m.import_quarterfinals?.() || 'Cuartos',
			'quarterfinals': m.import_quarterfinals?.() || 'Cuartos',
			'round of 16': m.import_round16?.() || 'Octavos',
			'round16': m.import_round16?.() || 'Octavos',
			'third place': m.tournament_thirdPlace?.() || '3º/4º'
		};
		return roundTranslations[key] || name.charAt(0).toUpperCase() + name.slice(1);
	}

	let isResuming = $derived(matchInfo?.isInProgress === true);
	let scorerName = $derived(
		getScorerWarningName((matchInfo?.match as any)?.scoringBy, $currentUser?.id)
	);

	let phaseLabel = $derived((() => {
		if (!matchInfo) return '';
		if (matchInfo.phase === 'GROUP') {
			const parts: string[] = [m.tournament_groupStage()];
			if (matchInfo.groupName) parts.push(translateGroupName(matchInfo.groupName));
			if (matchInfo.roundNumber) parts.push(`${m.tournament_round()} ${matchInfo.roundNumber}`);
			return parts.join(' · ');
		}
		const parts: string[] = [];
		if (matchInfo.isConsolation) {
			parts.push(m.bracket_consolation());
		} else if (matchInfo.isSilverBracket) {
			parts.push(m.bracket_silver());
		} else {
			parts.push(m.tournament_finalStage());
		}
		if (matchInfo.bracketRoundName) parts.push(translateRoundName(matchInfo.bracketRoundName));
		return parts.join(' · ');
	})());

	let tournamentLabel = $derived((() => {
		if (!tournamentName) return '';
		if (tournamentEdition && tournamentEdition > 1) {
			return `${tournamentEdition} ${tournamentName}`;
		}
		return tournamentName;
	})());

	let tiesAllowed = $derived(matchInfo?.phase === 'GROUP' && matchInfo?.gameConfig?.gameMode === 'rounds');

	let configLabel = $derived((() => {
		if (!matchInfo?.gameConfig) return '';
		const gc = matchInfo.gameConfig;
		let label = gc.gameMode === 'points' ? `${gc.pointsToWin}P` : `${gc.roundsToPlay} ${m.tournament_rounds()}`;
		if (tiesAllowed) label += ` (${m.scoring_canTie()})`;
		if (gc.matchesToWin > 1) label += ` · ${m.bracket_bestOf()}${gc.matchesToWin}`;
		return label;
	})());

	let hasTable = $derived(!!matchInfo?.match?.tableNumber);

	function selectColor(team: 1 | 2, color: string) {
		if (team === 1) {
			selectedTeam1Color = color;
			showTeam1Palette = false;
		} else {
			selectedTeam2Color = color;
			showTeam2Palette = false;
		}
	}

	function handleHammerSelect(startingTeam: 1 | 2) {
		selectedHammer = startingTeam;
		doPlay(getHammerFromStarter(startingTeam));
	}

	function handleRandomHammer() {
		const startingTeam: 1 | 2 = Math.random() < 0.5 ? 1 : 2;
		selectedHammer = startingTeam;
		doPlay(getHammerFromStarter(startingTeam));
	}

	function doPlay(hammerTeam?: 1 | 2 | null) {
		onplay?.({
			hammerTeam: hammerTeam ?? null,
			team1Color: selectedTeam1Color,
			team2Color: selectedTeam2Color
		});
	}

	function handlePlay() {
		if (showHammer && !isResuming && !isAutoAlternate) {
			return;
		}
		doPlay(null);
	}

	function handleClose() {
		showTeam1Palette = false;
		showTeam2Palette = false;
		oncancel?.();
	}
</script>

<Dialog.Root open={isOpen && !!matchInfo} onOpenChange={(open) => !open && handleClose()}>
	<Dialog.Content class="match-preview-modal">
		{#if matchInfo}
			<!-- Header -->
			<Dialog.Header>
				<Dialog.Title>
					<span class="dialog-title">
						{#if tournamentLabel}
							<span class="tournament-name">{tournamentLabel}</span>
							<span class="header-sep">—</span>
						{/if}
						<span class="phase-label" class:group-stage={matchInfo.phase === 'GROUP'} class:final-stage={matchInfo.phase === 'FINAL'}>
							{phaseLabel}
						</span>
					</span>
				</Dialog.Title>
			</Dialog.Header>

			<!-- Match card -->
			<div class="match-card">
				<div class="match-meta">
					<span class="table-badge" class:tbd={!hasTable}>
						{hasTable ? m.tournament_tableN({ n: matchInfo.match.tableNumber! }) : 'TBD'}
					</span>
					{#if configLabel}
						<span class="config-badge">{configLabel}</span>
					{/if}
				</div>

				<div class="matchup" class:doubles={doublesMode}>
					<!-- Team/Player A -->
					<div class="side">
						<div class="avatar-color-wrapper">
							<div class="avatars" class:doubles-avatars={doublesMode}>
								{#if matchInfo.participantAPhotoURL}
									<img src={matchInfo.participantAPhotoURL} alt="" class="avatar" referrerpolicy="no-referrer" />
								{:else}
									<span class="avatar placeholder">{getInitials(matchInfo.participantAName.split(' / ')[0])}</span>
								{/if}
								{#if doublesMode}
									{#if matchInfo.participantAPartnerPhotoURL}
										<img src={matchInfo.participantAPartnerPhotoURL} alt="" class="avatar partner-avatar" referrerpolicy="no-referrer" />
									{:else}
										<span class="avatar placeholder partner-avatar">{getPartnerInitials(matchInfo.participantAName)}</span>
									{/if}
								{/if}
							</div>
							<button
								class="color-swatch"
								style="background-color: {selectedTeam1Color}; color: {getContrastColor(selectedTeam1Color)}"
								onclick={() => { showTeam1Palette = !showTeam1Palette; showTeam2Palette = false; }}
							>●</button>
							{#if showTeam1Palette}
								<div class="color-palette">
									{#each presetColors as color}
										<button
											class="palette-dot"
											class:selected={selectedTeam1Color === color}
											style="background-color: {color}"
											onclick={() => selectColor(1, color)}
										></button>
									{/each}
								</div>
							{/if}
						</div>
						<span class="name">{matchInfo.participantAName}</span>
					</div>

					<span class="vs">vs</span>

					<!-- Team/Player B -->
					<div class="side">
						<div class="avatar-color-wrapper">
							<div class="avatars" class:doubles-avatars={doublesMode}>
								{#if matchInfo.participantBPhotoURL}
									<img src={matchInfo.participantBPhotoURL} alt="" class="avatar" referrerpolicy="no-referrer" />
								{:else}
									<span class="avatar placeholder">{getInitials(matchInfo.participantBName.split(' / ')[0])}</span>
								{/if}
								{#if doublesMode}
									{#if matchInfo.participantBPartnerPhotoURL}
										<img src={matchInfo.participantBPartnerPhotoURL} alt="" class="avatar partner-avatar" referrerpolicy="no-referrer" />
									{:else}
										<span class="avatar placeholder partner-avatar">{getPartnerInitials(matchInfo.participantBName)}</span>
									{/if}
								{/if}
							</div>
							<button
								class="color-swatch"
								style="background-color: {selectedTeam2Color}; color: {getContrastColor(selectedTeam2Color)}"
								onclick={() => { showTeam2Palette = !showTeam2Palette; showTeam1Palette = false; }}
							>●</button>
							{#if showTeam2Palette}
								<div class="color-palette">
									{#each presetColors as color}
										<button
											class="palette-dot"
											class:selected={selectedTeam2Color === color}
											style="background-color: {color}"
											onclick={() => selectColor(2, color)}
										></button>
									{/each}
								</div>
							{/if}
						</div>
						<span class="name">{matchInfo.participantBName}</span>
					</div>
				</div>
			</div>

			{#if isResuming && scorerName}
				<p class="scoring-by-warning">{m.tournament_scoringByConfirm({ name: scorerName })}</p>
			{/if}

			<!-- Hammer selection (only for fresh matches with showHammer, not auto-alternate) -->
			{#if showHammer && !isResuming && !isAutoAlternate}
				<div class="hammer-section">
					<span class="hammer-label">{m.wizard_whoStarts()}</span>
					<div class="hammer-buttons">
						<button
							class="hammer-btn"
							class:selected={selectedHammer === 1}
							style="background-color: {selectedTeam1Color}; color: {getContrastColor(selectedTeam1Color)}"
							disabled={!hasTable || isLoading}
							onclick={() => handleHammerSelect(1)}
						>
							{matchInfo.participantAName.split(' / ')[0]}
						</button>
						<button
							class="hammer-btn random-btn"
							disabled={!hasTable || isLoading}
							onclick={handleRandomHammer}
						>
							<Dices size={20} />
						</button>
						<button
							class="hammer-btn"
							class:selected={selectedHammer === 2}
							style="background-color: {selectedTeam2Color}; color: {getContrastColor(selectedTeam2Color)}"
							disabled={!hasTable || isLoading}
							onclick={() => handleHammerSelect(2)}
						>
							{matchInfo.participantBName.split(' / ')[0]}
						</button>
					</div>
				</div>
			{/if}

			<!-- Play button (only when hammer is not required) -->
			{#if !showHammer || isResuming || isAutoAlternate}
				<Dialog.Footer>
					<button class="btn-play" disabled={!hasTable || isLoading} onclick={handlePlay}>
						{isResuming ? m.tournament_resumeMatch() : m.scoring_startMatch()}
					</button>
				</Dialog.Footer>
			{/if}
		{/if}
	</Dialog.Content>
</Dialog.Root>

<style>
	/* Dialog container override */
	:global(.match-preview-modal) {
		max-width: 500px !important;
		padding: 1.8rem !important;
		gap: 1.2rem !important;
		overflow: visible !important;
	}

	:global(.match-preview-modal button[data-dialog-close]) {
		cursor: pointer;
	}

	/* Header */
	:global(.match-preview-modal [data-slot="dialog-header"]) {
		padding: 0;
		text-align: center;
	}

	:global(.match-preview-modal [data-slot="dialog-title"]) {
		font-size: 0;
	}

	.dialog-title {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		line-height: 1.4;
	}

	.tournament-name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--muted-foreground);
	}

	.header-sep {
		color: color-mix(in srgb, var(--foreground) 18%, transparent);
		font-size: 0.82rem;
	}

	.phase-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--muted-foreground);
	}

	.phase-label.group-stage {
		color: #3b82f6;
	}

	.phase-label.final-stage {
		color: #d97706;
	}

	/* Match card */
	.match-card {
		background: color-mix(in srgb, var(--muted) 50%, transparent);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1.3rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.match-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}

	.table-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 0.78rem;
		font-weight: 700;
		color: #fff;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 0.2rem 0.55rem;
		border-radius: 4px;
	}

	.table-badge.tbd {
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.config-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--foreground);
		background: color-mix(in srgb, var(--foreground) 10%, transparent);
		padding: 0.2rem 0.55rem;
		border-radius: 4px;
	}

	/* Matchup */
	.matchup {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.side {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.avatars {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		border: 2px solid var(--border);
	}

	.avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		color: var(--primary-foreground);
		font-family: 'Lexend', sans-serif;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.avatar.partner-avatar {
		margin-left: -12px;
		z-index: 0;
	}

	.avatars:not(.doubles-avatars) .avatar {
		z-index: 1;
	}

	.doubles-avatars .avatar {
		width: 46px;
		height: 46px;
		border-width: 1.5px;
	}

	.doubles-avatars .avatar:first-child {
		z-index: 1;
	}

	.name {
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 500;
		color: var(--foreground);
		text-align: center;
		word-break: break-word;
		line-height: 1.3;
	}

	.vs {
		font-family: 'Lexend', sans-serif;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.scoring-by-warning {
		text-align: center;
		font-size: 0.8rem;
		color: #f59e0b;
		margin: 0;
		padding: 0.4rem 0.8rem;
		background: rgba(245, 158, 11, 0.1);
		border-radius: 6px;
	}

	/* Play button */
	:global(.match-preview-modal [data-slot="dialog-footer"]) {
		padding: 0;
	}

	.btn-play {
		width: 100%;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		padding: 0.8rem;
		cursor: pointer;
		font-family: 'Lexend', sans-serif;
		font-size: 1rem;
		font-weight: 600;
		transition: all 0.15s ease;
	}

	.btn-play:hover {
		opacity: 0.9;
	}

	.btn-play:active {
		transform: scale(0.98);
	}

	.btn-play:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* Color picker */
	.avatar-color-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}

	.color-swatch {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 2px solid var(--border);
		cursor: pointer;
		font-size: 0;
		padding: 0;
		transition: transform 0.15s ease, border-color 0.15s ease;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
	}

	.color-swatch:hover {
		transform: scale(1.15);
		border-color: color-mix(in srgb, var(--foreground) 40%, transparent);
	}

	.color-palette {
		position: absolute;
		top: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		padding: 8px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
		z-index: 10;
		width: 145px;
		justify-content: center;
	}

	.palette-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		padding: 0;
		transition: transform 0.12s ease, border-color 0.12s ease;
	}

	.palette-dot:hover {
		transform: scale(1.2);
	}

	.palette-dot.selected {
		border-color: var(--foreground);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--foreground) 30%, transparent);
	}

	/* Hammer section */
	.hammer-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.hammer-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.hammer-buttons {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.hammer-btn {
		flex: 1;
		padding: 0.75rem 0.5rem;
		border: 2px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 600;
		transition: all 0.15s ease;
		text-align: center;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.hammer-btn:hover:not(:disabled) {
		opacity: 0.85;
		transform: scale(1.02);
	}

	.hammer-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.hammer-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.hammer-btn.selected {
		border-color: var(--foreground);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--foreground) 20%, transparent);
	}

	.hammer-btn.random-btn {
		flex: 0 0 auto;
		width: 48px;
		padding: 0.75rem 0;
		background: color-mix(in srgb, var(--foreground) 8%, transparent);
		color: var(--muted-foreground);
		border-color: var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.hammer-btn.random-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--foreground) 14%, transparent);
		color: var(--foreground);
	}

	@media (max-width: 480px) {
		:global(.match-preview-modal) {
			padding: 1.4rem !important;
			gap: 1rem !important;
		}

		.avatar {
			width: 46px;
			height: 46px;
		}

		.doubles-avatars .avatar {
			width: 38px;
			height: 38px;
		}

		.name {
			font-size: 0.9rem;
		}

		.btn-play {
			font-size: 0.95rem;
		}

		.hammer-btn {
			font-size: 0.82rem;
			padding: 0.65rem 0.35rem;
		}
	}
</style>
