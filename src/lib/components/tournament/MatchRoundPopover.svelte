<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import type { TournamentParticipant } from '$lib/types/tournament';
  import { getParticipantDisplayName } from '$lib/types/tournament';
  import type { Snippet } from 'svelte';

  interface MatchLike {
    status: string;
    participantA: string;
    participantB: string;
    rounds?: Array<{
      gameNumber: number;
      roundInGame: number;
      pointsA: number | null;
      pointsB: number | null;
      twentiesA: number;
      twentiesB: number;
    }>;
  }

  interface Props {
    match: MatchLike;
    participants: TournamentParticipant[];
    isDoubles?: boolean;
    children: Snippet<[Record<string, any> | undefined]>;
  }

  let { match, participants, isDoubles = false, children }: Props = $props();

  let participantMap = $derived(new Map(participants.map(p => [p.id, p])));

  let showPopover = $derived(
    (match.status === 'COMPLETED' || match.status === 'WALKOVER' || match.status === 'IN_PROGRESS') &&
    (match.rounds?.length ?? 0) > 0
  );

  let gameGroups = $derived.by(() => {
    if (!match.rounds?.length) return [];
    const map = new Map<number, NonNullable<typeof match.rounds>>();
    for (const r of match.rounds) {
      const gn = r.gameNumber || 1;
      if (!map.has(gn)) map.set(gn, []);
      map.get(gn)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([gameNum, rounds]) => ({
        gameNumber: gameNum,
        rounds: rounds.sort((a, b) => a.roundInGame - b.roundInGame)
      }));
  });

  let hasAny20s = $derived(match.rounds?.some(r => (r.twentiesA || 0) > 0 || (r.twentiesB || 0) > 0) ?? false);

  function getShortName(participantId: string): string {
    if (participantId === 'BYE') return 'BYE';
    const participant = participantMap.get(participantId);
    if (!participant) return '?';
    const fullName = getParticipantDisplayName(participant, isDoubles);
    return fullName;
  }
</script>

{#if showPopover}
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        {@render children(props)}
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-auto max-w-[90vw] p-0" style="min-width: var(--bits-popover-anchor-width, auto)" align="center" sideOffset={8}>
      <div class="round-details">
        {#each gameGroups as game (game.gameNumber)}
          {@const gameTotalA = game.rounds.reduce((s, r) => s + (r.pointsA || 0), 0)}
          {@const gameTotalB = game.rounds.reduce((s, r) => s + (r.pointsB || 0), 0)}
          {@const game20sA = game.rounds.reduce((s, r) => s + (r.twentiesA || 0), 0)}
          {@const game20sB = game.rounds.reduce((s, r) => s + (r.twentiesB || 0), 0)}
          {@const gameWinnerA = gameTotalA > gameTotalB}
          {@const gameWinnerB = gameTotalB > gameTotalA}
          {#if gameGroups.length > 1}
            <div class="game-label">P{game.gameNumber}</div>
          {/if}
          <table class="rounds-table">
            <thead>
              <tr>
                <th class="name-col"></th>
                {#each game.rounds as _, ri (ri)}
                  <th class="round-col">R{ri + 1}</th>
                {/each}
                <th class="total-col">T</th>
              </tr>
            </thead>
            <tbody>
              <tr class={[gameWinnerA && "winner-row", gameWinnerB && "loser-row"]}>
                <td class="name-col">{getShortName(match.participantA)}</td>
                {#each game.rounds as round, ri (ri)}
                  <td class={["round-col", (round.pointsA || 0) > (round.pointsB || 0) && "round-win"]}>{round.pointsA ?? '-'}{#if hasAny20s}<span class="t20-inline"> / {round.twentiesA || 0}</span>{/if}</td>
                {/each}
                <td class="total-col">{gameTotalA}{#if hasAny20s}<span class="t20-inline"> / {game20sA}</span>{/if}</td>
              </tr>
              <tr class={[gameWinnerB && "winner-row", gameWinnerA && "loser-row"]}>
                <td class="name-col">{getShortName(match.participantB)}</td>
                {#each game.rounds as round, ri (ri)}
                  <td class={["round-col", (round.pointsB || 0) > (round.pointsA || 0) && "round-win"]}>{round.pointsB ?? '-'}{#if hasAny20s}<span class="t20-inline"> / {round.twentiesB || 0}</span>{/if}</td>
                {/each}
                <td class="total-col">{gameTotalB}{#if hasAny20s}<span class="t20-inline"> / {game20sB}</span>{/if}</td>
              </tr>
            </tbody>
          </table>
        {/each}
      </div>
    </Popover.Content>
  </Popover.Root>
{:else}
  {@render children(undefined)}
{/if}

<style>
  /* Rendered in portal - needs :global */
  :global(.round-details) {
    padding: 0.6rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  :global(.game-label) {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    padding: 0.15rem 0;
    border-bottom: 1px solid #e5e7eb;
    margin-top: 0.25rem;
  }

  :global(.game-label:first-child) {
    margin-top: 0;
  }

  :global(.rounds-table) {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  :global(.rounds-table th) {
    font-size: 0.55rem;
    font-weight: 600;
    color: #9ca3af;
    padding: 0.15rem 0.4rem;
    text-align: center;
  }

  :global(.rounds-table td) {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
    text-align: center;
    color: #374151;
  }

  :global(.rounds-table .name-col) {
    text-align: left;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 6rem;
    padding-right: 0.6rem;
  }

  :global(.rounds-table .round-col) {
    width: 3.2rem;
    white-space: nowrap;
    text-align: center;
  }

  :global(.rounds-table .total-col) {
    font-weight: 700;
    border-left: 1.5px solid #e5e7eb;
  }

  :global(.rounds-table .t20-inline) {
    font-size: 0.55rem;
    color: #d97706;
    font-weight: 600;
  }

  :global(.rounds-table .winner-row td) {
    color: #059669;
    font-weight: 600;
  }

  :global(.rounds-table .loser-row td) {
    color: #9ca3af;
  }

  :global(.rounds-table .round-win) {
    background: rgba(16, 185, 129, 0.08);
    font-weight: 700;
  }


  /* Dark mode */
  :global(:is([data-theme='dark'], [data-theme='violet']) .game-label) {
    color: #9ca3af;
    border-bottom-color: #374151;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table th) {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table td) {
    color: #e1e8ed;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .total-col) {
    border-left-color: #374151;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .winner-row td) {
    color: #10b981;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .loser-row td) {
    color: #6b7280;
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .round-win) {
    background: rgba(16, 185, 129, 0.12);
  }

  :global(:is([data-theme='dark'], [data-theme='violet']) .rounds-table .t20-inline) {
    color: #fbbf24;
  }
</style>
