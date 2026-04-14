# Tournament Data Structure

This document describes all interfaces that compose a `Tournament` object in Scorekinole, and the differences between **LIVE** tournaments (created and played in the app) and **IMPORTED** tournaments (historical data imported after completion).

## Table of Contents

- [1. Tournament (main interface)](#1-tournament-main-interface)
- [2. Enums / Types](#2-enums--types)
- [3. RankingConfig](#3-rankingconfig)
- [4. TournamentParticipant](#4-tournamentparticipant)
- [5. Tournament Registration](#5-tournament-registration)
- [6. GroupStage](#6-groupstage)
- [7. Group](#7-group)
- [8. RoundRobinRound](#8-roundrobinround)
- [9. SwissPairing](#9-swisspairing)
- [10. GroupMatch](#10-groupmatch)
- [11. GroupStanding](#11-groupstanding)
- [12. FinalStage](#12-finalstage)
- [13. BracketWithConfig](#13-bracketwithconfig)
- [14. BracketConfig](#14-bracketconfig)
- [15. PhaseConfig](#15-phaseconfig)
- [16. BracketRound](#16-bracketround)
- [17. BracketMatch](#17-bracketmatch)
- [18. ConsolationBracket](#18-consolationbracket)
- [19. NamedBracket](#19-namedbracket)
- [20. TournamentTimeConfig](#20-tournamenttimeconfig)
- [21. TournamentTimeEstimate](#21-tournamenttimeestimate)
- [22. TournamentRecord](#22-tournamentrecord)
- [23. MatchCorrection](#23-matchcorrection)
- [24. MatchHistory (friendly matches)](#24-matchhistory-friendly-matches)
- [25. CurrentMatch](#25-currentmatch)
- [26. MatchGame](#26-matchgame)
- [27. MatchRound](#27-matchround)
- [28. MatchInvite (friendly match invitations)](#28-matchinvite-friendly-match-invitations)
- [LIVE vs IMPORTED: Key Differences](#live-vs-imported-key-differences)
- [Current Import Implementation](#current-import-implementation)
- [Transforming IMPORTED to LIVE](#transforming-imported-to-live)

---

## Quick Reference: LIVE vs IMPORTED Comparison

| Category | Field | LIVE | IMPORTED |
|----------|-------|------|----------|
| **Status** | `status` | Progresses: `DRAFT` → `GROUP_STAGE` → `TRANSITION` → `FINAL_STAGE` → `COMPLETED` | Always `COMPLETED` |
| **Import Flag** | `isImported` | `undefined` or `false` | `true` |
| **Import Metadata** | `importedAt` | ❌ Not present | ✅ Timestamp |
| | `importedBy` | ❌ Not present | ✅ `{ userId, userName }` |
| | `importNotes` | ❌ Not present | ✅ Optional string |
| | `externalLink` | ❌ Not present | ✅ Optional URL |
| | `posterUrl` | ❌ Not present | ✅ Optional image URL |
| **Enrichment** | `enrichedAt` | ❌ Not present | ✅ Set after `transformImportedToLive()` — indicates the tournament has been enriched with full LIVE-like data. Used to hide the "Transform" button and show an "enriched" badge in the admin list. |
| **Participants** | `participants[].type` | `REGISTERED` or `GUEST` | Usually `GUEST` |
| | `participants[].userId` | ✅ For registered users | ❌ Rarely present |
| | `participants[].rankingSnapshot` | ✅ Captured at registration | `0` (unknown) |
| | `participants[].finalPosition` | Calculated at completion | ✅ Imported directly |
| **Group Stage** | `groupStage` | ✅ Full structure | ✅ Round-based / ❌ Standings-only |
| | `groupStage.groups[]` | ✅ All groups with data | ✅ Both formats |
| | `groupStage.groups[].schedule[]` | ✅ All rounds with matches | ✅ Round-based / ❌ Standings-only |
| | `groupStage.groups[].standings[]` | ✅ Calculated standings | ✅ Both formats (with tiebreaker for round-based) |
| | `groupStage.qualificationMode` | ✅ WINS or POINTS | ✅ Configurable in import wizard |
| | `groupStage.tiebreakerPriority` | ✅ If configured | ✅ Configurable (round-based only) |
| **Group Matches** | `GroupMatch.status` | Progresses through lifecycle | ✅ `COMPLETED` (round-based) / ❌ (standings-only) |
| | `GroupMatch.winner` | ✅ Set when match ends | ✅ Round-based / ❌ Standings-only |
| | `GroupMatch.gamesWonA/B` | ✅ Game scores | ❌ Not present |
| | `GroupMatch.totalPointsA/B` | ✅ Crokinole points | ✅ Round-based / ❌ Standings-only |
| | `GroupMatch.total20sA/B` | ✅ 20s count | ✅ Round-based / ❌ Standings-only |
| | `GroupMatch.rounds[]` | ✅ Round-by-round details | ✅ Round-based / ❌ Standings-only |
| | `GroupMatch.startedAt/completedAt` | ✅ Timestamps | ❌ Not present |
| **Final Stage** | `finalStage` | ✅ Full structure | ✅ From text-based bracket input |
| | `finalStage.goldBracket.rounds[]` | ✅ All bracket rounds | ✅ From bracket text input |
| | `finalStage.thirdPlaceMatch` | ✅ If enabled | ✅ Auto-calculated from losers |
| | `finalStage.consolationBrackets[]` | ✅ If enabled | ❌ Not present |
| | `finalStage.winner` | ✅ Participant ID | ✅ Participant ID |
| **Bracket Matches** | `BracketMatch.status` | Progresses through lifecycle | ✅ `COMPLETED` or `WALKOVER` |
| | `BracketMatch.winner` | ✅ Set when match ends | ✅ From scores |
| | `BracketMatch.gamesWonA/B` | ✅ Game scores | ❌ Not present |
| | `BracketMatch.totalPointsA/B` | ✅ Crokinole points | ✅ From bracket input |
| | `BracketMatch.total20sA/B` | ✅ 20s count | ✅ Optional (from bracket input) |
| | `BracketMatch.rounds[]` | ✅ Round-by-round details | ❌ Not present |
| | `BracketMatch.nextMatchId` | ✅ Navigation links | ❌ Not present |
| **Timestamps** | `createdAt` | ✅ When draft created | ✅ When imported |
| | `createdBy` | ✅ Original creator | ✅ Importer |
| | `startedAt` | ✅ When tournament started | ❌ Usually not present |
| | `completedAt` | ✅ When tournament ended | ✅ Original tournament date |
| **Time Config** | `timeConfig` | ✅ If configured | ❌ Not present |
| | `timeEstimate` | ✅ If calculated | ❌ Not present |
| **Ranking** | `rankingConfig.enabled` | `true` or `false` | Usually `true` |
| | `rankingConfig.tier` | ✅ Set by organizer | ✅ Set at import |
| **Video** | `videoUrl` / `videoId` | ✅ Optional | ✅ Optional |

### Data Availability Summary

Imported tournaments support two input formats. **Standings-only** provides minimal data; **Round-based** (SS R1/RR R1 format) provides rich match data comparable to LIVE.

| Data Type | LIVE | IMPORTED (standings-only) | IMPORTED (round-based) |
|-----------|------|--------------------------|------------------------|
| Final standings (positions) | ✅ | ✅ | ✅ |
| Match results (who won) | ✅ | ❌ | ✅ |
| Game scores (2-1, 3-0) | ✅ | ❌ | ❌ |
| Crokinole points per match | ✅ | ❌ | ✅ |
| 20s count per match | ✅ | ❌ | ✅ |
| Round-by-round breakdown | ✅ | ❌ | ✅ |
| Match timestamps | ✅ | ❌ | ❌ |
| Group stage standings | ✅ | ✅ (from input) | ✅ (computed with BYE bonus) |
| Head-to-head records | ✅ | ❌ | ✅ |
| Tiebreaker resolution | ✅ | ❌ | ✅ (configurable priority) |
| Buchholz scores | ✅ | ❌ | ✅ |
| BYE bonus (odd players) | ✅ | ❌ | ✅ (auto-calculated) |
| Bracket progression | ✅ | ✅ (from text input) | ✅ (from text input) |
| QualificationMode toggle | ✅ | ❌ | ✅ (WINS/POINTS) |

---

## 1. Tournament (main interface)

```typescript
interface Tournament {
  // Metadata
  id: string;
  key: string;                              // 6-character alphanumeric identifier
  name: string;
  description?: string;
  descriptionLanguage?: string;             // Language code (es, en, ca) for translation
  edition?: number;                         // Edition number (1st, 2nd, etc.)
  country: string;
  city: string;
  address?: string;
  tournamentDate?: number;
  status: TournamentStatus;
  phaseType: TournamentPhaseType;           // ONE_PHASE | TWO_PHASE | GROUP_ONLY

  // Game configuration
  gameType: 'singles' | 'doubles';
  show20s: boolean;
  showHammer: boolean;

  // Tournament configuration
  numTables: number;
  numGroups?: number;                       // For Round Robin (legacy)
  numSwissRounds?: number;                  // For Swiss (legacy)

  // Ranking
  rankingConfig: RankingConfig;

  // Participants
  participants: TournamentParticipant[];

  // Phases
  groupStage?: GroupStage;
  finalStage: FinalStage;

  // Time configuration
  timeConfig?: TournamentTimeConfig;
  timeEstimate?: TournamentTimeEstimate;

  // Timestamps
  createdAt: number;
  createdBy: { userId: string; userName: string };
  startedAt?: number;
  completedAt?: number;
  updatedAt: number;

  // Ownership & permissions
  ownerId?: string;
  ownerName?: string;
  adminIds?: string[];

  // Import fields (for historical tournaments)
  isImported?: boolean;
  importedAt?: number;
  importedBy?: { userId: string; userName: string };
  importNotes?: string;
  externalLink?: string;
  posterUrl?: string;

  // Enrichment fields (set when an IMPORTED tournament is transformed to LIVE-like structure)
  enrichedAt?: number;                      // Timestamp when transform was applied

  // Video
  videoUrl?: string;
  videoId?: string;

  // Test flag
  isTest?: boolean;
}
```

---

## 2. Enums / Types

```typescript
// TWO_PHASE: DRAFT → GROUP_STAGE → TRANSITION → FINAL_STAGE → COMPLETED
// ONE_PHASE: DRAFT → FINAL_STAGE → COMPLETED
// GROUP_ONLY: DRAFT → GROUP_STAGE → TRANSITION → COMPLETED (no FINAL_STAGE)
type TournamentStatus =
  | 'DRAFT'
  | 'GROUP_STAGE'
  | 'TRANSITION'
  | 'FINAL_STAGE'
  | 'COMPLETED'
  | 'CANCELLED';

// ONE_PHASE: Direct elimination bracket (no group stage)
// TWO_PHASE: Group stage → Final bracket
// GROUP_ONLY: Group stage → Transition (tiebreaker config) → Completed (no final stage)
type TournamentPhaseType = 'ONE_PHASE' | 'TWO_PHASE' | 'GROUP_ONLY';
type GroupStageType = 'ROUND_ROBIN' | 'SWISS';
type FinalStageMode = 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' | 'PARALLEL_BRACKETS';
type QualificationMode = 'WINS' | 'POINTS';
type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WALKOVER';
type ParticipantStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';
type ParticipantType = 'REGISTERED' | 'GUEST';
type TournamentTier = 'SERIES_35' | 'SERIES_25' | 'SERIES_15';
```

---

## 3. RankingConfig

```typescript
interface RankingConfig {
  enabled: boolean;
  tier?: TournamentTier;                    // Affects ranking points
}
```

---

## 4. TournamentParticipant

```typescript
interface TournamentParticipant {
  id: string;

  // Primary player
  type: ParticipantType;
  userId?: string;                          // Only for REGISTERED
  name: string;                             // Player 1's REAL name
  email?: string;
  photoURL?: string;

  // Optional team name for doubles (display only)
  teamName?: string;                        // e.g., "Los Invencibles"

  // Second player (only for doubles)
  partner?: {
    type: ParticipantType;
    userId?: string;
    name: string;                           // Player 2's REAL name
    email?: string;
    photoURL?: string;
  };

  // Ranking tracking
  rankingSnapshot: number;                  // Ranking at tournament start (seeding)
  finalPosition?: number;                   // Final position (for points calculation)

  // Status
  status: ParticipantStatus;
  withdrawnAt?: number;
  disqualifiedAt?: number;
}
```

---

## 5. Tournament Registration

Self-registration allows logged-in players to sign up for DRAFT tournaments from the public page `/tournaments/[id]`.

### `TournamentRegistration` interface

Stored as `tournament.registration` (optional).

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | `boolean` | Admin toggle to open/close registration |
| `deadline` | `number?` | Epoch ms — client-side check closes registration after this time |
| `maxParticipants` | `number?` | Capacity limit — triggers waitlist when `participants.length >= maxParticipants` |
| `entryFee` | `string?` | Informational display text (e.g. "10€", "Gratuito") |
| `rulesUrl` | `string?` | External URL to rules document |
| `rulesText` | `string?` | Inline rules text shown on public page |
| `notifyOnRegistration` | `boolean` | Send push notification to owner + adminIds on new signup |
| `showParticipantList` | `boolean` | Show enrolled players publicly on the registration page |

### `WaitlistEntry` interface

Stored as `tournament.waitlist[]` (optional). Created when `participants.length >= registration.maxParticipants`.

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Firebase Auth user ID |
| `userName` | `string` | Display name at registration time |
| `userKey` | `string` | 6-char public key from user profile |
| `registeredAt` | `number` | Epoch ms timestamp of waitlist registration |
| `partner` | `object?` | Optional doubles partner (type, userId?, name) |

### Behavior

- Only `type: 'REGISTERED'` users (logged-in) can self-register. Guests are added by admin only.
- `registration.enabled` is automatically set to `false` when the tournament transitions from DRAFT to GROUP_STAGE.
- Push notifications use the `onTournamentRegistration` Cloud Function.

---

## 6. GroupStage

```typescript
interface GroupStage {
  type: GroupStageType;
  groups: Group[];
  currentRound: number;
  totalRounds: number;
  isComplete: boolean;

  // Game configuration for this phase
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;                     // For points mode
  roundsToPlay?: number;                    // For rounds mode
  matchesToWin: number;                     // Best of X

  // Type-specific configuration
  numGroups?: number;                       // For Round Robin
  numSwissRounds?: number;                  // For Swiss
  qualificationMode?: QualificationMode;   // 'WINS' (2/1/0) or 'POINTS' (total scored)
}
```

---

## 7. Group

```typescript
interface Group {
  id: string;
  name: string;                             // "Grupo A", "Grupo B", etc.
  participants: string[];                   // Participant IDs

  // Round Robin specific
  schedule?: RoundRobinRound[];

  // Swiss specific
  pairings?: SwissPairing[];

  // Standings
  standings: GroupStanding[];
}
```

---

## 8. RoundRobinRound

```typescript
interface RoundRobinRound {
  roundNumber: number;
  matches: GroupMatch[];
}
```

---

## 9. SwissPairing

```typescript
interface SwissPairing {
  roundNumber: number;
  matches: GroupMatch[];
}
```

---

## 10. GroupMatch

```typescript
interface GroupMatch {
  id: string;
  groupId?: string;
  participantA: string;                     // Participant ID
  participantB: string;                     // Participant ID or 'BYE'
  tableNumber?: number;                     // undefined = waiting for table
  status: MatchStatus;

  // Results
  matchId?: string;                         // Link to MatchHistory
  winner?: string;
  gamesWonA?: number;
  gamesWonB?: number;
  totalPointsA?: number;
  totalPointsB?: number;
  total20sA?: number;
  total20sB?: number;

  // Round-by-round details
  rounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
  }>;

  // No-show handling
  noShowParticipant?: string;
  walkedOverAt?: number;

  // Timestamps
  startedAt?: number;
  completedAt?: number;

  // Video
  videoUrl?: string;
  videoId?: string;
}
```

---

## 11. GroupStanding

```typescript
interface GroupStanding {
  participantId: string;
  position: number;

  // Match statistics
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTied: number;

  // Points (2 for win, 1 for tie, 0 for loss)
  points: number;
  swissPoints?: number;                     // For Swiss system

  // Tie-breaker criteria
  total20s: number;                         // Tie-breaker 1
  totalPointsScored: number;                // Tie-breaker 2
  headToHeadRecord?: {                      // Tie-breaker 3
    [participantId: string]: {
      result: 'WIN' | 'LOSS' | 'TIE';
      twenties: number;
    };
  };

  // Qualification
  qualifiedForFinal: boolean;

  // Tie resolution
  tiedWith?: string[];
  tieReason?: 'head-to-head' | 'twenties' | 'unresolved';
}
```

---

## 12. FinalStage

```typescript
interface FinalStage {
  mode: FinalStageMode;
  consolationEnabled?: boolean;             // Consolation brackets for eliminated players
  thirdPlaceMatchEnabled?: boolean;         // 3rd/4th place match
  goldBracket: BracketWithConfig;
  silverBracket?: BracketWithConfig;        // Only for SPLIT_DIVISIONS
  parallelBrackets?: NamedBracket[];        // Only for PARALLEL_BRACKETS
  isComplete: boolean;
  winner?: string;                          // Gold bracket winner
  silverWinner?: string;                    // Silver bracket winner
}
```

---

## 13. BracketWithConfig

```typescript
interface BracketWithConfig {
  rounds: BracketRound[];
  totalRounds: number;
  thirdPlaceMatch?: BracketMatch;
  config: BracketConfig;
  consolationBrackets?: ConsolationBracket[];
}
```

---

## 14. BracketConfig

```typescript
interface BracketConfig {
  earlyRounds: PhaseConfig;
  semifinal: PhaseConfig;
  final: PhaseConfig;
}
```

---

## 15. PhaseConfig

```typescript
interface PhaseConfig {
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;                     // Only if gameMode is 'points'
  roundsToPlay?: number;                    // Only if gameMode is 'rounds'
  matchesToWin: number;                     // Best of X
}
```

---

## 16. BracketRound

```typescript
interface BracketRound {
  roundNumber: number;
  name: string;                             // "Octavos", "Cuartos", "Semifinales", "Final"
  matches: BracketMatch[];
}
```

---

## 17. BracketMatch

```typescript
interface BracketMatch {
  id: string;
  position: number;                         // Position in bracket (for visual rendering)
  participantA?: string;                    // Participant ID (undefined if TBD)
  participantB?: string;
  seedA?: number;
  seedB?: number;
  tableNumber?: number;
  status: MatchStatus;

  // Results
  matchId?: string;                         // Link to MatchHistory
  winner?: string;
  gamesWonA?: number;
  gamesWonB?: number;
  totalPointsA?: number;
  totalPointsB?: number;
  total20sA?: number;
  total20sB?: number;

  // Round-by-round details
  rounds?: Array<{
    gameNumber: number;
    roundInGame: number;
    pointsA: number | null;
    pointsB: number | null;
    twentiesA: number;
    twentiesB: number;
    hammer?: string | null;  // Participant ID who had hammer this round
  }>;

  // No-show
  noShowParticipant?: string;
  walkedOverAt?: number;

  // Timestamps
  startedAt?: number;
  completedAt?: number;

  // Navigation
  nextMatchId?: string;                     // Where winner advances
  nextMatchIdForLoser?: string;             // Where loser goes (consolation)

  // Consolation specific
  isThirdPlace?: boolean;                   // True if loser's match (7-8, 11-12)

  // Video
  videoUrl?: string;
  videoId?: string;
}
```

---

## 18. ConsolationBracket

```typescript
interface ConsolationBracket {
  source: 'QF' | 'R16';                     // Which round's losers
  rounds: BracketRound[];
  totalRounds: number;
  startPosition: number;                    // Starting position (5 for QF, 9 for R16)
  numLosers?: number;                       // Actual losers count (may be less due to BYEs)
  isComplete: boolean;
}
```

---

## 19. NamedBracket

Used for `PARALLEL_BRACKETS` mode (A/B/C Finals).

```typescript
interface NamedBracket {
  id: string;
  name: string;                             // "A Finals", "B Finals", "C Finals"
  label: string;                            // "A", "B", "C"
  bracket: BracketWithConfig;
  sourcePositions: number[];                // Group positions that qualify (e.g., [1,2])
  winner?: string;
}
```

---

## 20. TournamentTimeConfig

```typescript
interface TournamentTimeConfig {
  minutesPer4RoundsSingles: number;         // default: 10
  minutesPer4RoundsDoubles: number;         // default: 15
  avgRoundsForPointsMode: Record<number, number>;  // e.g., {5: 4, 7: 6, 9: 8}
  breakBetweenMatches: number;              // default: 5 minutes
  breakBetweenPhases: number;               // default: 10 minutes
  parallelSemifinals: boolean;              // default: true
  parallelFinals: boolean;                  // default: true
}
```

---

## 21. TournamentTimeEstimate

```typescript
interface TournamentTimeEstimate {
  totalMinutes: number;
  groupStageMinutes?: number;
  finalStageMinutes?: number;
  calculatedAt: number;
}
```

---

## 22. TournamentRecord

Stored in user profile to track ranking history.

```typescript
interface TournamentRecord {
  tournamentId: string;
  tournamentName: string;
  tournamentDate: number;                   // completedAt timestamp
  finalPosition: number;
  totalParticipants: number;
  rankingBefore: number;
  rankingAfter: number;
  rankingDelta: number;
}
```

---

## 23. MatchCorrection

Audit trail for corrected matches.

```typescript
interface MatchCorrection {
  matchId: string;
  correctedAt: number;
  correctedBy: { userId: string; userName: string };
  previousResult: { winner: string; scoreA: number; scoreB: number };
  newResult: { winner: string; scoreA: number; scoreB: number };
  reason?: string;
}
```

---

## 24. MatchHistory (friendly matches)

Stored in localStorage and optionally synced to Firestore. Referenced by `GroupMatch.matchId` and `BracketMatch.matchId` in tournaments.

```typescript
interface MatchHistory {
  id: string;
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
  team1Score: number;
  team2Score: number;
  team1Rounds?: number;
  team2Rounds?: number;
  totalRounds?: number;
  winner: 1 | 2 | null;
  gameMode: 'points' | 'rounds';
  gameType: 'singles' | 'doubles';
  pointsToWin?: number;
  roundsToPlay?: number;
  matchesToWin: number;
  games: MatchGame[];

  // Timing
  startTime: number;                        // Timestamp when match started
  endTime: number;                          // Timestamp when match ended
  duration: number;                         // Duration in milliseconds

  // Optional metadata
  eventTitle?: string;
  matchPhase?: string;
  showHammer?: boolean;
  show20s?: boolean;

  // For imported tournaments without detailed rounds
  total20sTeam1?: number;
  total20sTeam2?: number;

  // Sync
  syncStatus?: 'local' | 'synced' | 'pending' | 'error';
  savedBy?: {
    userId: string;
    userName: string;
    userEmail: string;
  };

  // Player identification (for linking to user profiles)
  players?: {
    team1?: { name: string; userId: string | null };
    team2?: { name: string; userId: string | null };
  };
}
```

---

## 25. CurrentMatch

Tracks the state of an in-progress match.

```typescript
interface CurrentMatch {
  startTime: number;                        // Timestamp when match started
  games: MatchGame[];
  rounds: MatchRound[];
}
```

---

## 26. MatchGame

```typescript
interface MatchGame {
  team1Points: number;
  team2Points: number;
  gameNumber: number;
  rounds: MatchRound[];
  winner: 1 | 2 | null;
}
```

---

## 27. MatchRound

```typescript
interface MatchRound {
  team1Points: number;
  team2Points: number;
  team1Twenty: number;
  team2Twenty: number;
  hammerTeam: 1 | 2 | null;
  roundNumber: number;
}
```

---

## 28. MatchInvite (friendly match invitations)

Used for inviting players to join friendly matches. Supports both singles and doubles.

```typescript
type InviteStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

/**
 * Type of invitation - determines where the guest joins
 * - 'opponent': Guest joins opposite team as player (default, for singles or doubles main player)
 * - 'my_partner': Guest joins host's team as partner (doubles only)
 * - 'opponent_partner': Guest joins opposite team as partner (doubles only)
 */
type InviteType = 'opponent' | 'my_partner' | 'opponent_partner';

interface MatchInvite {
  id: string;
  inviteCode: string;                        // 6-character alphanumeric code
  createdAt: Timestamp;
  expiresAt: Timestamp;                      // 1 hour from creation
  status: InviteStatus;

  // Host (inviter) information
  hostUserId: string;
  hostUserName: string;
  hostUserPhotoURL: string | null;
  hostTeamNumber: 1 | 2;
  inviteType: InviteType;

  // Guest (invitee) information - populated when accepted
  guestUserId?: string;
  guestUserName?: string;
  guestUserPhotoURL?: string | null;
  guestTeamNumber?: 1 | 2;
  guestRole?: 'player' | 'partner';          // partner for doubles teammates

  // Match context displayed to guest
  matchContext: {
    team1Name: string;
    team1Color: string;
    team2Name: string;
    team2Color: string;
    gameMode: 'points' | 'rounds';
    pointsToWin: number;
    roundsToPlay: number;
    matchesToWin: number;
  };
}
```

**Store structure** (`stores/matchInvite.ts`):
```typescript
// Each invite type has its own active invitation (for doubles support)
type ActiveInvitesMap = Record<InviteType, MatchInvite | null>;

// Example: In doubles, host can have 3 active invites simultaneously
{
  opponent: MatchInvite,           // Code: "ABC123"
  my_partner: MatchInvite,         // Code: "DEF456"
  opponent_partner: MatchInvite    // Code: "GHI789"
}
```

---

## LIVE vs IMPORTED: Key Differences

### Summary Table

| Field | LIVE Tournament | IMPORTED Tournament |
|-------|-----------------|---------------------|
| `isImported` | `undefined` or `false` | `true` |
| `importedAt` | ❌ Not present | ✅ Timestamp when imported |
| `importedBy` | ❌ Not present | ✅ `{ userId, userName }` |
| `importNotes` | ❌ Not present | ✅ Optional notes about data source |
| `externalLink` | ❌ Not present | ✅ Optional link to original results |
| `posterUrl` | ❌ Not present | ✅ Optional poster/banner image |
| `status` | Any status (progresses through lifecycle) | Always `'COMPLETED'` |
| `groupStage` | ✅ Full data with all matches | ✅ Round-based / minimal for standings-only |
| `groupStage.groups[].schedule` | ✅ All rounds with match details | ✅ Round-based / ❌ Empty `[]` standings-only |
| `groupStage.groups[].standings` | ✅ Calculated standings | ✅ Both formats (tiebreaker-resolved for round-based) |
| `groupStage.qualificationMode` | ✅ | ✅ Configurable in wizard |
| `groupStage.tiebreakerPriority` | ✅ Optional | ✅ Optional (round-based) |
| `finalStage.goldBracket.rounds` | ✅ All bracket matches with results | ✅ From bracket text input (with scores) |
| `participants[].finalPosition` | Calculated when tournament completes | Imported directly from source |

### LIVE Tournament Structure

```typescript
{
  // Metadata
  id: "abc123",
  key: "XYZ789",
  name: "Club Championship 2024",
  status: "COMPLETED",  // Progresses: DRAFT → GROUP_STAGE → TRANSITION → FINAL_STAGE → COMPLETED

  // Game configuration
  gameType: "singles",
  show20s: true,
  showHammer: true,
  numTables: 4,

  // Full participant data with match history
  participants: [{
    id: "p1",
    name: "John Doe",
    type: "REGISTERED",
    userId: "user123",
    rankingSnapshot: 1500,
    finalPosition: 1,        // Calculated at completion
    status: "ACTIVE"
  }],

  // FULL group stage with all match details
  groupStage: {
    type: "ROUND_ROBIN",
    groups: [{
      id: "g1",
      name: "Grupo A",
      participants: ["p1", "p2", "p3", "p4"],
      schedule: [{
        roundNumber: 1,
        matches: [{
          id: "m1",
          participantA: "p1",
          participantB: "p2",
          status: "COMPLETED",
          winner: "p1",
          gamesWonA: 2,
          gamesWonB: 1,
          totalPointsA: 15,
          totalPointsB: 12,
          total20sA: 3,
          total20sB: 1,
          rounds: [
            { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
            { gameNumber: 1, roundInGame: 2, pointsA: 0, pointsB: 2, twentiesA: 0, twentiesB: 1 },
            // ... more rounds
          ],
          startedAt: 1700000000000,
          completedAt: 1700001000000
        }]
      }],
      standings: [{
        participantId: "p1",
        position: 1,
        matchesPlayed: 3,
        matchesWon: 3,
        matchesLost: 0,
        matchesTied: 0,
        points: 6,
        total20s: 8,
        totalPointsScored: 45,
        qualifiedForFinal: true
      }]
    }],
    currentRound: 3,
    totalRounds: 3,
    isComplete: true,
    gameMode: "points",
    pointsToWin: 7,
    matchesToWin: 2
  },

  // FULL final stage with bracket matches
  finalStage: {
    mode: "SINGLE_BRACKET",
    goldBracket: {
      rounds: [{
        roundNumber: 1,
        name: "Semifinales",
        matches: [{
          id: "b1",
          position: 0,
          participantA: "p1",
          participantB: "p4",
          status: "COMPLETED",
          winner: "p1",
          gamesWonA: 2,
          gamesWonB: 0,
          rounds: [/* detailed round data */],
          nextMatchId: "b3"
        }]
      }],
      totalRounds: 2,
      config: {
        earlyRounds: { gameMode: "points", pointsToWin: 7, matchesToWin: 2 },
        semifinal: { gameMode: "points", pointsToWin: 7, matchesToWin: 2 },
        final: { gameMode: "points", pointsToWin: 9, matchesToWin: 3 }
      }
    },
    isComplete: true,
    winner: "p1"
  },

  // Timestamps
  createdAt: 1699900000000,
  createdBy: { userId: "admin1", userName: "Admin" },
  startedAt: 1700000000000,
  completedAt: 1700100000000,
  updatedAt: 1700100000000,

  // ❌ NO import fields
  isImported: undefined
}
```

### IMPORTED Tournament Structure

There are two import formats, producing different data richness:

#### Standings-only Import (minimal data)

```typescript
{
  // Metadata
  id: "imported123",
  key: "IMP456",
  name: "World Championship 2023",
  status: "COMPLETED",  // Always COMPLETED

  // Game configuration (may be estimated/default)
  gameType: "singles",
  show20s: true,
  showHammer: true,
  numTables: 8,

  // Participants with final positions
  participants: [
    {
      id: "p1",
      name: "World Champion",
      type: "GUEST",              // Usually GUEST for imported
      rankingSnapshot: 0,         // Unknown at import time
      finalPosition: 1,           // Imported directly
      status: "ACTIVE"
    },
    // ... more participants
  ],

  // MINIMAL group stage — standings from input, no matches
  groupStage: {
    type: "ROUND_ROBIN",
    groups: [{
      id: "g1",
      name: "Grupo 1",
      participants: ["p1", "p2", "p3"],
      schedule: [],              // ❌ Empty - no match data
      standings: [{
        participantId: "p1",
        position: 1,
        points: 63,              // From input (Name,Points,20s)
        total20s: 90,
        matchesPlayed: 0,        // Unknown
        matchesWon: 0,
        matchesLost: 0,
        matchesTied: 0,
      }]
    }],
    isComplete: true
  },

  // Final stage with bracket matches from text input
  finalStage: {
    mode: "SINGLE_BRACKET",
    goldBracket: {
      rounds: [{
        roundNumber: 1,
        matches: [{
          id: "b1",
          participantA: "p1",
          participantB: "p4",
          status: "COMPLETED",
          winner: "p1",
          totalPointsA: 15,
          totalPointsB: 12,
        }]
      }],
      totalRounds: 2,
      config: { /* ... */ }
    },
    isComplete: true,
    winner: "p1"
  },

  // Timestamps
  createdAt: 1699900000000,
  createdBy: { userId: "admin1", userName: "Admin" },
  completedAt: 1680000000000,   // Original tournament date
  updatedAt: 1699900000000,

  // ✅ IMPORT-SPECIFIC FIELDS
  isImported: true,
  importedAt: 1699900000000,
  importedBy: { userId: "admin1", userName: "Admin" },
  importNotes: "Data from official WCA results page",
  externalLink: "https://worldcrokinole.com/results/2023",
  posterUrl: "https://example.com/poster-2023.jpg"
}
```

#### Round-based Import (rich data)

When importing with round-based format (SS R1/RR R1), the system builds full match data, computes standings with BYE bonus, builds head-to-head records, and resolves tiebreakers — producing data comparable to LIVE tournaments.

```typescript
{
  // Same metadata as above...
  id: "imported456",
  key: "RND789",
  name: "Regional Championship 2024",
  status: "COMPLETED",
  gameType: "singles",

  participants: [
    {
      id: "p1",
      name: "Harry Rowe",
      type: "REGISTERED",         // Auto-linked if user found in Firebase
      userId: "user123",          // Linked user ID
      rankingSnapshot: 0,
      finalPosition: 1,
      status: "ACTIVE"
    },
    // ...
  ],

  // FULL group stage — matches, standings, h2h, tiebreakers
  groupStage: {
    type: "ROUND_ROBIN",
    qualificationMode: "WINS",    // ✅ Configurable in import wizard
    tiebreakerPriority: ["h2h", "total20s", "totalPoints", "buchholz"],  // ✅ Custom order
    groups: [{
      id: "g1",
      name: "Grupo 1",
      participants: ["p1", "p2", "p3", "p4", "p5"],  // 5 players → BYE rounds
      schedule: [{
        roundNumber: 1,
        matches: [{
          id: "m1",
          participantA: "p1",
          participantB: "p2",
          status: "COMPLETED",
          winner: "p1",
          totalPointsA: 8,
          totalPointsB: 2,
          total20sA: 2,
          total20sB: 0,
          rounds: [
            { gameNumber: 1, roundInGame: 1, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
            { gameNumber: 1, roundInGame: 2, pointsA: 2, pointsB: 0, twentiesA: 1, twentiesB: 0 },
            { gameNumber: 1, roundInGame: 3, pointsA: 2, pointsB: 0, twentiesA: 0, twentiesB: 0 },
            { gameNumber: 1, roundInGame: 4, pointsA: 2, pointsB: 2, twentiesA: 0, twentiesB: 0 },
          ],
          completedAt: 1700000000000,
        }]
      }],
      standings: [{
        participantId: "p1",
        position: 1,
        points: 10,              // WINS mode: won*2 + tied*1, includes BYE bonus
        total20s: 15,
        totalPointsScored: 78,   // Includes BYE bonus (8 pts per BYE)
        matchesPlayed: 4,        // Actual matches (BYEs not counted)
        matchesWon: 5,           // Includes BYE wins
        matchesLost: 0,
        matchesTied: 0,
        buchholz: 12,            // Computed by resolveTiebreaker()
        headToHeadRecord: {      // ✅ Built from match data
          "p2": { result: "WIN", twenties: 2 },
          "p3": { result: "WIN", twenties: 3 },
          "p4": { result: "WIN", twenties: 1 },
          // p5 was BYE — no h2h entry
        },
        qualifiedForFinal: true
      }]
    }],
    currentRound: 0,
    totalRounds: 5,
    isComplete: true,
    numGroups: 2,
    gameMode: "points",
    pointsToWin: 7,
    matchesToWin: 1
  },

  // Final stage with bracket matches (same as standings-only)
  finalStage: { /* ... same bracket structure ... */ },

  // ✅ IMPORT-SPECIFIC FIELDS
  isImported: true,
  importedAt: 1699900000000,
  importedBy: { userId: "admin1", userName: "Admin" },
}
```

### Transform to LIVE

The import wizard supports a **Transform to LIVE** mode (`?transform_to_live=<id>`) that converts an existing IMPORTED tournament into a new LIVE tournament with full configuration:

- Loads all participants from the existing tournament
- Allows configuring: group stage type (RR/Swiss), number of groups/rounds, match format, final stage mode
- Creates a new tournament in `DRAFT` status with `isImported: false`
- Sets `enrichedAt` timestamp on the original tournament to mark it as transformed
- The original imported tournament is preserved for historical reference

---

## Current Import Implementation

This section documents what fields are **currently filled** when creating an imported tournament via `createHistoricalTournament()` in `tournamentImport.ts`, and what fields are **missing** that could be added for future enrichment.

### Fields Currently Set

#### Tournament Level
| Field | Value | Notes |
|-------|-------|-------|
| `id` | ✅ Generated | `tournament-{timestamp}-{random}` |
| `key` | ✅ Generated | 6-character unique code |
| `name` | ✅ From input | |
| `description` | ✅ Optional | |
| `edition` | ✅ Optional | |
| `city` | ✅ From input | |
| `country` | ✅ From input | |
| `address` | ✅ Optional | |
| `tournamentDate` | ✅ From input | |
| `status` | ✅ `'COMPLETED'` | Always completed |
| `phaseType` | ✅ From input | `ONE_PHASE`, `TWO_PHASE`, or `GROUP_ONLY` |
| `gameType` | ✅ From input | `singles` or `doubles` |
| `show20s` | ✅ Default `true` | |
| `showHammer` | ✅ Default `false` | |
| `isTest` | ✅ Default `false` | |
| `numTables` | ✅ Calculated | Max of numGroups or first round matches |
| `rankingConfig` | ✅ From input | `{ enabled, tier }` |
| `createdAt` | ✅ Server timestamp | |
| `createdBy` | ✅ Current user | `{ userId, userName }` |
| `startedAt` | ✅ = tournamentDate | |
| `completedAt` | ✅ = tournamentDate | |
| `updatedAt` | ✅ Server timestamp | |
| `isImported` | ✅ `true` | |
| `importedAt` | ✅ Server timestamp | |
| `importedBy` | ✅ Current user | `{ userId, userName }` |
| `externalLink` | ✅ Optional | |
| `posterUrl` | ✅ Optional | |

#### Participants
| Field | Value | Notes |
|-------|-------|-------|
| `id` | ✅ Generated | |
| `type` | ✅ `GUEST` or `REGISTERED` | Based on userId presence |
| `name` | ✅ From input | |
| `userId` | ✅ Optional | If linked to registered user |
| `partner` | ✅ For doubles | `{ type, name, userId? }` |
| `rankingSnapshot` | ⚠️ Always `0` | **Could be improved** |
| `finalPosition` | ✅ From input | |
| `status` | ✅ `'ACTIVE'` | |

#### Group Stage (if TWO_PHASE)

**Two import formats**: standings-only (Name,Points,20s) and round-based (SS R1/RR R1 with match lines).
Round-based imports populate full match data, BYE bonus, h2h records, and tiebreaker resolution.

| Field | Standings-only | Round-based | Notes |
|-------|---------------|-------------|-------|
| `type` | ✅ `'ROUND_ROBIN'` | ✅ `'ROUND_ROBIN'` | Hardcoded |
| `groups[].id` | ✅ Generated | ✅ Generated | |
| `groups[].name` | ✅ From input | ✅ From input | |
| `groups[].participants` | ✅ Participant IDs | ✅ Participant IDs | |
| `groups[].schedule` | ❌ Empty `[]` | ✅ Full match schedule | Round-based builds GroupMatch[] per round |
| `groups[].standings[].participantId` | ✅ | ✅ | |
| `groups[].standings[].position` | ✅ | ✅ Resolved by tiebreaker | |
| `groups[].standings[].points` | ✅ From input | ✅ Computed (WINS or POINTS mode) | Includes BYE bonus for odd-player groups |
| `groups[].standings[].total20s` | ✅ Optional | ✅ Summed from rounds | |
| `groups[].standings[].totalPointsScored` | ✅ = points | ✅ Summed from matches + BYE bonus | |
| `groups[].standings[].matchesPlayed` | ❌ `0` | ✅ From match data | |
| `groups[].standings[].matchesWon` | ❌ `0` | ✅ Includes BYE wins | |
| `groups[].standings[].matchesLost` | ❌ `0` | ✅ From match data | |
| `groups[].standings[].matchesTied` | ❌ `0` | ✅ From match data | |
| `groups[].standings[].headToHeadRecord` | ❌ Not set | ✅ Built from matches | Enables resolveTiebreaker() |
| `groups[].standings[].qualifiedForFinal` | ✅ `true` | ✅ `true` | |
| `currentRound` | ✅ `0` | ✅ `0` | |
| `totalRounds` | ✅ `0` | ✅ From schedule length | |
| `isComplete` | ✅ `true` | ✅ `true` | |
| `gameMode` | ✅ `'points'` | ✅ `'points'` | Hardcoded |
| `pointsToWin` | ✅ `7` | ✅ `7` | Hardcoded |
| `matchesToWin` | ✅ `1` | ✅ `1` | Hardcoded |
| `numGroups` | ✅ From input | ✅ From input | |
| `qualificationMode` | ✅ From input | ✅ From input | `'WINS'` or `'POINTS'`, configurable in Step 2 |
| `tiebreakerPriority` | ❌ Not set | ✅ Optional | Admin-configurable order: h2h, total20s, totalPoints, buchholz |

#### Final Stage - Bracket Matches
| Field | Value | Notes |
|-------|-------|-------|
| `id` | ✅ Generated | |
| `position` | ✅ Index | |
| `participantA` | ✅ Participant ID | |
| `participantB` | ✅ Participant ID | |
| `status` | ✅ `'COMPLETED'` or `'WALKOVER'` | |
| `winner` | ✅ Calculated | From scoreA vs scoreB |
| `totalPointsA` | ✅ From input | |
| `totalPointsB` | ✅ From input | |
| `total20sA` | ✅ Optional | Default `0` |
| `total20sB` | ✅ Optional | Default `0` |
| `completedAt` | ✅ = tournamentDate | |
| `gamesWonA` | ❌ Not set | **Missing** |
| `gamesWonB` | ❌ Not set | **Missing** |
| `rounds` | ❌ Not set | **Missing: no round-by-round data** |
| `startedAt` | ❌ Not set | **Missing** |
| `seedA` | ❌ Not set | **Missing** |
| `seedB` | ❌ Not set | **Missing** |
| `nextMatchId` | ❌ Not set | **Missing** |
| `tableNumber` | ❌ Not set | **Missing** |

### Missing Fields Summary

Many fields that were previously missing are now populated for **round-based imports**. The remaining gaps are:

#### Still Missing (both formats)
| Interface | Field | Notes |
|-----------|-------|-------|
| `BracketMatch` | `gamesWonA/B` | Not in import input — only total points |
| `BracketMatch` | `seedA/B` | Not tracked — could calculate from group position |
| `BracketMatch` | `nextMatchId` | Navigation links not built |
| `BracketMatch` | `rounds[]` | No round-by-round bracket data |
| `GroupMatch` | `startedAt/completedAt` | No timestamps in import format |
| `GroupMatch` | `tableNumber` | Not applicable for historical data |

#### Still Missing (standings-only format)
| Interface | Field | Notes |
|-----------|-------|-------|
| `GroupStanding` | `matchesPlayed/Won/Lost/Tied` | No match data to calculate from |
| `GroupStanding` | `headToHeadRecord` | No match data |
| `GroupStanding` | `buchholz` | No match data |
| `Group.schedule` | All | No match data |

#### Now Populated (round-based format)
These were previously missing but are now filled automatically:
- ✅ `GroupMatch` — Full match objects with scores, 20s, rounds
- ✅ `Group.schedule` — Complete `RoundRobinRound[]` with matches
- ✅ `GroupStanding.matchesPlayed/Won/Lost/Tied` — Calculated from match data
- ✅ `GroupStanding.headToHeadRecord` — Built from matches
- ✅ `GroupStanding.buchholz` — Computed by `resolveTiebreaker()`
- ✅ `GroupStanding.totalPointsScored` — Summed from matches + BYE bonus
- ✅ BYE bonus — Auto-calculated for odd-player groups

---

## Transforming IMPORTED to LIVE

There are two ways to "transform" an imported tournament:

### Option 1: Import with Round-based Data (Recommended)

Use the import wizard with **round-based format** (SS R1/RR R1) to directly create a richly populated IMPORTED tournament. This automatically:

1. **Builds full match schedule** from round-based input (GroupMatch objects with scores, 20s, rounds)
2. **Computes standings** with WINS or POINTS classification mode
3. **Calculates BYE bonus** for odd-player groups (wins + points for missed rounds)
4. **Builds `headToHeadRecord`** from match data for each standing
5. **Resolves tiebreakers** using `resolveTiebreaker()` with configurable priority order
6. **Computes Buchholz** scores for all standings

The result is an IMPORTED tournament with data quality comparable to a LIVE tournament's group stage.

**Implementation**: `createHistoricalTournament()` in `src/lib/firebase/tournamentImport.ts`

### Option 2: Transform to LIVE Tournament

Use the import wizard's **Transform to LIVE** mode (`?transform_to_live=<id>`) to create a brand new LIVE tournament from an existing IMPORTED one:

1. Navigate to `/admin/tournaments/import?transform_to_live=<tournamentId>`
2. The wizard loads all participants from the existing tournament
3. Configure full LIVE tournament settings:
   - Group stage type (Round Robin / Swiss), number of groups and rounds
   - Qualification mode (WINS / POINTS)
   - Match format (points/rounds, best-of)
   - Final stage mode (Single bracket / Split divisions / Parallel brackets)
   - Third place match, consolation brackets
4. Submit creates a new tournament in `DRAFT` status with `isImported: false`
5. The original tournament gets `enrichedAt` timestamp to mark it as transformed

**Key fields after transform:**

```typescript
// Original imported tournament
{
  isImported: true,
  enrichedAt: Date.now(),     // ← Marks as transformed
  // Used in admin list to:
  //   - Show an "enriched" badge
  //   - Hide the "Transform to LIVE" button
}

// New LIVE tournament
{
  isImported: false,          // ← This is a real LIVE tournament
  status: "DRAFT",            // Ready to start
  // Full tournament configuration from wizard
}
```

> **Note:** `enrichedAt` is the canonical way to check whether a tournament has been transformed. Always check `tournament.enrichedAt` (truthy) rather than checking the presence of group/bracket data.

---

## Pre-Tournament Settings Backup

When a user transitions from friendly mode to tournament mode, their current friendly match settings are backed up to `localStorage` so they can be restored later. This ensures the user doesn't lose their team names, colors, game mode, etc.

**localStorage key:** `crokinolePreTournamentBackup`

**Source file:** `src/routes/game/+page.svelte`

### Backup Data Structure

```typescript
interface PreTournamentBackup {
  // Team data (including user assignments)
  team1Name: string;
  team1Color: string;
  team1UserId: string | null;
  team1UserPhotoURL: string | null;
  team1Partner?: Partner;
  team2Name: string;
  team2Color: string;
  team2UserId: string | null;
  team2UserPhotoURL: string | null;
  team2Partner?: Partner;

  // Game settings
  gameMode: 'points' | 'rounds';
  pointsToWin: number;
  roundsToPlay: number;
  matchesToWin: number;
  show20s: boolean;
  showHammer: boolean;
  gameType: 'singles' | 'doubles';
  timerMinutes: number;
  timerSeconds: number;
  showTimer: boolean;
}
```

### Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SAVE: User starts a tournament match                         │
│    → handleTournamentMatchStarted()                             │
│    → Only saves if NO backup exists yet (preserves original)    │
│    → localStorage.setItem('crokinolePreTournamentBackup', ...)  │
├─────────────────────────────────────────────────────────────────┤
│ 2. TOURNAMENT: User plays one or more tournament matches        │
│    → Backup remains untouched in localStorage                   │
│    → justExitedTournamentMode = true after each match ends      │
├─────────────────────────────────────────────────────────────────┤
│ 3. RESTORE: User clicks "New Match" (friendly)                  │
│    → handleResetMatch() → restorePreTournamentData(force=true)  │
│    → Reads backup from localStorage                             │
│    → Applies team names, colors, user assignments, settings     │
│    → localStorage.removeItem('crokinolePreTournamentBackup')    │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **First backup wins**: If the user plays multiple tournament matches without returning to friendly mode, only the first backup is kept. This preserves the original friendly settings, not intermediate tournament data.
- **`justExitedTournamentMode` flag**: When `exitTournamentMode()` is called after a tournament match completes, this flag is set to `true`. It prevents any accidental auto-restoration. Restoration only happens when the user explicitly clicks "New Match" (friendly).
- **Force restore**: `restorePreTournamentData(force=true)` is called from `handleResetMatch()` when transitioning back to friendly mode, bypassing the `justExitedTournamentMode` guard.
- **Confirmation modal**: After a tournament match, clicking "New Match" always shows a confirmation dialog before restoring friendly settings.

---

## Data Sources for Enrichment

When transforming an imported tournament, data can come from:

1. **Video recordings**: Extract round-by-round scores from game videos
2. **Score sheets**: Paper or digital score sheets from the event
3. **Tournament software exports**: Data from other tournament management systems
4. **Manual entry**: Organizer enters data from memory or notes

The level of detail available will determine how complete the enrichment can be. At minimum, you need game scores (gamesWonA/B). Ideally, you have full round-by-round data including 20s.
