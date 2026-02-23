<script lang="ts">
	import * as m from '$lib/paraglide/messages.js';
	import type { PendingMatchInfo } from '$lib/firebase/tournamentMatches';

	interface Props {
		isOpen?: boolean;
		matchInfo: PendingMatchInfo | null;
		tournamentName?: string;
		tournamentEdition?: number;
		isDoubles?: boolean;
		onplay?: () => void;
		oncancel?: () => void;
	}

	let {
		isOpen = $bindable(false),
		matchInfo,
		tournamentName,
		tournamentEdition,
		isDoubles = false,
		onplay,
		oncancel
	}: Props = $props();

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

	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
		return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
	}

	function getPartnerInitials(combinedName: string): string {
		const parts = combinedName.split(' / ');
		if (parts.length >= 2) return getInitials(parts[1].trim());
		return '?';
	}

	let isResuming = $derived(matchInfo?.isInProgress === true);

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

	function handlePlay() {
		onplay?.();
	}

	function handleCancel() {
		oncancel?.();
	}
</script>

{#if isOpen && matchInfo}
	<div class="overlay">
		<div class="dialog">
			<!-- Compact header: tournament + badges inline -->
			<div class="header">
				{#if tournamentLabel}
					<span class="tournament-name">{tournamentLabel}</span>
					<span class="header-sep">—</span>
				{/if}
				<span class="phase-label" class:group-stage={matchInfo.phase === 'GROUP'} class:final-stage={matchInfo.phase === 'FINAL'}>
					{phaseLabel}
				</span>
			</div>

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
						<span class="name">{matchInfo.participantAName}</span>
					</div>

					<span class="vs">vs</span>

					<!-- Team/Player B -->
					<div class="side">
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
						<span class="name">{matchInfo.participantBName}</span>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="actions">
				<button class="btn-cancel" onclick={handleCancel}>
					{m.tournament_matchPreviewCancel()}
				</button>
				<button class="btn-play" disabled={!hasTable} onclick={handlePlay}>
					{isResuming ? m.tournament_resumeMatch() : m.tournament_startMatch()}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(6px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.dialog {
		background: #1a1d24;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 14px;
		padding: 1.4rem;
		width: min(440px, 92vw);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		line-height: 1.4;
	}

	.tournament-name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.82rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.4);
	}

	.header-sep {
		color: rgba(255, 255, 255, 0.18);
		font-size: 0.75rem;
	}

	.phase-label {
		font-family: 'Lexend', sans-serif;
		font-size: 0.82rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.6);
	}

	.phase-label.group-stage {
		color: #93c5fd;
	}

	.phase-label.final-stage {
		color: #fcd34d;
	}

	/* Match card */
	.match-card {
		background: rgba(255, 255, 255, 0.025);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 10px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.match-meta {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
	}

	.table-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
		color: #fff;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 0.18rem 0.5rem;
		border-radius: 4px;
	}

	.table-badge.tbd {
		background: #57534e;
		color: rgba(255, 255, 255, 0.6);
	}

	.config-badge {
		font-family: 'Lexend', sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		padding: 0.18rem 0.5rem;
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
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
		border: 2px solid rgba(255, 255, 255, 0.12);
	}

	.avatar.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--primary) 25%, transparent);
		color: rgba(255, 255, 255, 0.85);
		font-family: 'Lexend', sans-serif;
		font-weight: 700;
		font-size: 1rem;
	}

	.avatar.partner-avatar {
		margin-left: -12px;
		z-index: 0;
	}

	.avatars:not(.doubles-avatars) .avatar {
		z-index: 1;
	}

	.doubles-avatars .avatar {
		width: 40px;
		height: 40px;
		border-width: 1.5px;
	}

	.doubles-avatars .avatar:first-child {
		z-index: 1;
	}

	.name {
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		color: #e5e7eb;
		text-align: center;
		word-break: break-word;
		line-height: 1.3;
	}

	.vs {
		font-family: 'Lexend', sans-serif;
		font-size: 0.72rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.28);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	/* Actions */
	.actions {
		display: flex;
		gap: 0.6rem;
	}

	.btn-cancel {
		flex: 1;
		background: transparent;
		color: rgba(255, 255, 255, 0.5);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 0.75rem;
		cursor: pointer;
		font-family: 'Lexend', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.btn-cancel:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.18);
	}

	.btn-cancel:active {
		transform: scale(0.98);
	}

	.btn-play {
		flex: 1.4;
		background: var(--primary);
		color: var(--primary-foreground);
		border: none;
		border-radius: 8px;
		padding: 0.75rem;
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

	@media (max-width: 480px) {
		.dialog {
			padding: 1.2rem;
			gap: 0.85rem;
		}

		.avatar {
			width: 42px;
			height: 42px;
		}

		.doubles-avatars .avatar {
			width: 36px;
			height: 36px;
		}

		.name {
			font-size: 0.85rem;
		}

		.btn-play {
			font-size: 0.92rem;
		}

		.btn-cancel {
			font-size: 0.85rem;
		}
	}
</style>
