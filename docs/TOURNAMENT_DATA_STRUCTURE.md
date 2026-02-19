# Tournament Data Structure

This document describes all interfaces that compose a `Tournament` object in Scorekinole, and the differences between **LIVE** tournaments (created and played in the app) and **IMPORTED** tournaments (historical data imported after completion).

## Table of Contents

- [1. Tournament (main interface)](#1-tournament-main-interface)
- [2. Enums / Types](#2-enums--types)
- [3. RankingConfig](#3-rankingconfig)
- [4. TournamentParticipant](#4-tournamentparticipant)
- [5. GroupStage](#5-groupstage)
- [6. Group](#6-group)
- [7. RoundRobinRound](#7-roundrobinround)
- [8. SwissPairing](#8-swisspairing)
- [9. GroupMatch](#9-groupmatch)
- [10. GroupStanding](#10-groupstanding)
- [11. FinalStage](#11-finalstage)
- [12. BracketWithConfig](#12-bracketwithconfig)
- [13. BracketConfig](#13-bracketconfig)
- [14. PhaseConfig](#14-phaseconfig)
- [15. BracketRound](#15-bracketround)
- [16. BracketMatch](#16-bracketmatch)
- [17. ConsolationBracket](#17-consolationbracket)
- [18. NamedBracket](#18-namedbracket)
- [19. TournamentTimeConfig](#19-tournamenttimeconfig)
- [20. TournamentTimeEstimate](#20-tournamenttimeestimate)
- [21. TournamentRecord](#21-tournamentrecord)
- [22. MatchCorrection](#22-matchcorrection)
- [23. MatchHistory (friendly matches)](#23-matchhistory-friendly-matches)
- [24. CurrentMatch](#24-currentmatch)
- [25. MatchGame](#25-matchgame)
- [26. MatchRound](#26-matchround)
- [27. MatchInvite (friendly match invitations)](#27-matchinvite-friendly-match-invitations)
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
| **Group Stage** | `groupStage` | ✅ Full structure | ❌ `undefined` or minimal |
| | `groupStage.groups[]` | ✅ All groups with data | ❌ Empty or missing |
| | `groupStage.groups[].schedule[]` | ✅ All rounds with matches | ❌ Empty `[]` |
| | `groupStage.groups[].standings[]` | ✅ Calculated standings | ❌ Empty or minimal |
| **Group Matches** | `GroupMatch.status` | Progresses through lifecycle | `COMPLETED` |
| | `GroupMatch.winner` | ✅ Set when match ends | ❌ Not present |
| | `GroupMatch.gamesWonA/B` | ✅ Game scores | ❌ Not present |
| | `GroupMatch.totalPointsA/B` | ✅ Crokinole points | ❌ Not present |
| | `GroupMatch.total20sA/B` | ✅ 20s count | ❌ Not present |
| | `GroupMatch.rounds[]` | ✅ Round-by-round details | ❌ Empty or missing |
| | `GroupMatch.startedAt/completedAt` | ✅ Timestamps | ❌ Not present |
| **Final Stage** | `finalStage` | ✅ Full structure | ✅ Minimal structure |
| | `finalStage.goldBracket.rounds[]` | ✅ All bracket rounds | ❌ Empty `[]` |
| | `finalStage.thirdPlaceMatch` | ✅ If enabled | ❌ Not present |
| | `finalStage.consolationBrackets[]` | ✅ If enabled | ❌ Not present |
| | `finalStage.winner` | ✅ Participant ID | ✅ Participant ID |
| **Bracket Matches** | `BracketMatch.status` | Progresses through lifecycle | Would be `COMPLETED` if present |
| | `BracketMatch.winner` | ✅ Set when match ends | ❌ Not present (matches missing) |
| | `BracketMatch.gamesWonA/B` | ✅ Game scores | ❌ Not present |
| | `BracketMatch.totalPointsA/B` | ✅ Crokinole points | ❌ Not present |
| | `BracketMatch.total20sA/B` | ✅ 20s count | ❌ Not present |
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

| Data Type | LIVE | IMPORTED |
|-----------|------|----------|
| Final standings (positions) | ✅ | ✅ |
| Match results (who won) | ✅ | ❌ |
| Game scores (2-1, 3-0) | ✅ | ❌ |
| Crokinole points per match | ✅ | ❌ |
| 20s count per match | ✅ | ❌ |
| Round-by-round breakdown | ✅ | ❌ |
| Match timestamps | ✅ | ❌ |
| Group stage standings | ✅ | ❌ |
| Head-to-head records | ✅ | ❌ |
| Bracket progression | ✅ | ❌ |

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
  phaseType: TournamentPhaseType;

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
type TournamentStatus =
  | 'DRAFT'
  | 'GROUP_STAGE'
  | 'TRANSITION'
  | 'FINAL_STAGE'
  | 'COMPLETED'
  | 'CANCELLED';

type TournamentPhaseType = 'ONE_PHASE' | 'TWO_PHASE';
type GroupStageType = 'ROUND_ROBIN' | 'SWISS';
type FinalStageMode = 'SINGLE_BRACKET' | 'SPLIT_DIVISIONS' | 'PARALLEL_BRACKETS';
type QualificationMode = 'WINS' | 'POINTS';
type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'WALKOVER';
type ParticipantStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';
type ParticipantType = 'REGISTERED' | 'GUEST';
type TournamentTier = 'CLUB' | 'REGIONAL' | 'NATIONAL' | 'MAJOR';
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

## 5. GroupStage

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

## 6. Group

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

## 7. RoundRobinRound

```typescript
interface RoundRobinRound {
  roundNumber: number;
  matches: GroupMatch[];
}
```

---

## 8. SwissPairing

```typescript
interface SwissPairing {
  roundNumber: number;
  matches: GroupMatch[];
}
```

---

## 9. GroupMatch

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

## 10. GroupStanding

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

## 11. FinalStage

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

## 12. BracketWithConfig

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

## 13. BracketConfig

```typescript
interface BracketConfig {
  earlyRounds: PhaseConfig;
  semifinal: PhaseConfig;
  final: PhaseConfig;
}
```

---

## 14. PhaseConfig

```typescript
interface PhaseConfig {
  gameMode: 'points' | 'rounds';
  pointsToWin?: number;                     // Only if gameMode is 'points'
  roundsToPlay?: number;                    // Only if gameMode is 'rounds'
  matchesToWin: number;                     // Best of X
}
```

---

## 15. BracketRound

```typescript
interface BracketRound {
  roundNumber: number;
  name: string;                             // "Octavos", "Cuartos", "Semifinales", "Final"
  matches: BracketMatch[];
}
```

---

## 16. BracketMatch

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
    hammerSide?: 'A' | 'B' | null;
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

## 17. ConsolationBracket

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

## 18. NamedBracket

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

## 19. TournamentTimeConfig

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

## 20. TournamentTimeEstimate

```typescript
interface TournamentTimeEstimate {
  totalMinutes: number;
  groupStageMinutes?: number;
  finalStageMinutes?: number;
  calculatedAt: number;
}
```

---

## 21. TournamentRecord

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

## 22. MatchCorrection

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

## 23. MatchHistory (friendly matches)

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

## 24. CurrentMatch

Tracks the state of an in-progress match.

```typescript
interface CurrentMatch {
  startTime: number;                        // Timestamp when match started
  games: MatchGame[];
  rounds: MatchRound[];
}
```

---

## 25. MatchGame

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

## 26. MatchRound

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

## 27. MatchInvite (friendly match invitations)

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
| `groupStage` | ✅ Full data with all matches | ❌ Empty or minimal |
| `groupStage.groups[].schedule` | ✅ All rounds with match details | ❌ Empty array `[]` |
| `groupStage.groups[].standings` | ✅ Calculated standings | ❌ Minimal or empty |
| `finalStage.goldBracket.rounds` | ✅ All bracket matches with results | ❌ Empty array `[]` |
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

  // Participants with ONLY final positions (no match history)
  participants: [
    {
      id: "p1",
      name: "World Champion",
      type: "GUEST",              // Usually GUEST for imported
      rankingSnapshot: 0,         // Unknown at import time
      finalPosition: 1,           // Imported directly
      status: "ACTIVE"
    },
    {
      id: "p2",
      name: "Runner Up",
      type: "GUEST",
      rankingSnapshot: 0,
      finalPosition: 2,
      status: "ACTIVE"
    },
    // ... more participants with finalPosition only
  ],

  // EMPTY or MINIMAL group stage
  groupStage: undefined,  // Or minimal structure with no matches

  // MINIMAL final stage (no detailed matches)
  finalStage: {
    mode: "SINGLE_BRACKET",
    goldBracket: {
      rounds: [],               // ❌ Empty - no match details
      totalRounds: 0,
      config: {
        earlyRounds: { gameMode: "points", pointsToWin: 7, matchesToWin: 1 },
        semifinal: { gameMode: "points", pointsToWin: 7, matchesToWin: 1 },
        final: { gameMode: "points", pointsToWin: 7, matchesToWin: 1 }
      }
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
| `phaseType` | ✅ From input | `ONE_PHASE` or `TWO_PHASE` |
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
| Field | Value | Notes |
|-------|-------|-------|
| `type` | ✅ `'ROUND_ROBIN'` | Hardcoded |
| `groups[].id` | ✅ Generated | |
| `groups[].name` | ✅ From input | |
| `groups[].participants` | ✅ Participant IDs | |
| `groups[].schedule` | ❌ Empty `[]` | **Missing: no match details** |
| `groups[].standings[].participantId` | ✅ | |
| `groups[].standings[].position` | ✅ | |
| `groups[].standings[].points` | ✅ Crokinole points | |
| `groups[].standings[].total20s` | ✅ Optional | |
| `groups[].standings[].totalPointsScored` | ✅ = points | |
| `groups[].standings[].matchesPlayed` | ❌ Always `0` | **Missing** |
| `groups[].standings[].matchesWon` | ❌ Always `0` | **Missing** |
| `groups[].standings[].matchesLost` | ❌ Always `0` | **Missing** |
| `groups[].standings[].matchesTied` | ❌ Always `0` | **Missing** |
| `groups[].standings[].headToHeadRecord` | ❌ Not set | **Missing** |
| `groups[].standings[].qualifiedForFinal` | ✅ `true` | |
| `currentRound` | ✅ `0` | |
| `totalRounds` | ✅ `0` | |
| `isComplete` | ✅ `true` | |
| `gameMode` | ✅ `'points'` | Hardcoded |
| `pointsToWin` | ✅ `7` | Hardcoded |
| `matchesToWin` | ✅ `1` | Hardcoded |
| `numGroups` | ✅ From input | |
| `qualificationMode` | ✅ From input | `'WINS'` or `'POINTS'` |

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

#### Priority 1: Basic Match Data
These fields are easy to add and provide useful context:

| Interface | Field | Why Missing | How to Add |
|-----------|-------|-------------|------------|
| `BracketMatch` | `gamesWonA/B` | Not in import input | Add to `HistoricalMatchInput` |
| `GroupStanding` | `matchesPlayed/Won/Lost/Tied` | Not calculated | Calculate from standings order |
| `BracketMatch` | `seedA/B` | Not tracked | Calculate from group position |

#### Priority 2: Detailed Match Data (for full enrichment)
These fields require additional data collection:

| Interface | Field | Data Needed |
|-----------|-------|-------------|
| `GroupMatch` | Full object | All group match results |
| `Group.schedule` | `RoundRobinRound[]` | Match schedule with results |
| `BracketMatch.rounds` | Round array | Round-by-round breakdown |
| `GroupStanding.headToHeadRecord` | H2H data | Who beat whom in group |

#### Priority 3: Navigation & Metadata
These improve UX but aren't essential for data completeness:

| Interface | Field | Purpose |
|-----------|-------|---------|
| `BracketMatch.nextMatchId` | Navigation | Link bracket matches |
| `BracketMatch.startedAt` | Timeline | When match started |
| `GroupMatch.tableNumber` | History | Which table was used |

---

## Transforming IMPORTED to LIVE

To enrich an imported tournament with full match data, you need to populate the following structures:

### Step 1: Determine Tournament Structure

Decide whether the tournament had:
- **ONE_PHASE**: Direct to bracket (no group stage)
- **TWO_PHASE**: Group stage + final stage

### Step 2: Populate Group Stage (if TWO_PHASE)

For each group, you need to create:

```typescript
groupStage: {
  type: "ROUND_ROBIN",  // or "SWISS"
  groups: [
    {
      id: generateId(),
      name: "Grupo A",
      participants: ["p1", "p2", "p3", "p4"],  // Participant IDs

      // Create schedule with all matches
      schedule: [
        {
          roundNumber: 1,
          matches: [
            createGroupMatch("p1", "p2", results),
            createGroupMatch("p3", "p4", results),
          ]
        },
        // ... more rounds
      ],

      // Calculate standings from match results
      standings: calculateStandings(matches)
    }
  ],
  currentRound: totalRounds,
  totalRounds: totalRounds,
  isComplete: true,
  gameMode: "points",
  pointsToWin: 7,
  matchesToWin: 1
}
```

### Step 3: Populate Final Stage

Create bracket structure with all matches:

```typescript
finalStage: {
  mode: "SINGLE_BRACKET",
  goldBracket: {
    rounds: [
      {
        roundNumber: 1,
        name: "Cuartos",
        matches: [
          createBracketMatch("p1", "p8", 0, results),
          createBracketMatch("p4", "p5", 1, results),
          createBracketMatch("p2", "p7", 2, results),
          createBracketMatch("p3", "p6", 3, results),
        ]
      },
      {
        roundNumber: 2,
        name: "Semifinales",
        matches: [
          createBracketMatch(winner1, winner2, 0, results),
          createBracketMatch(winner3, winner4, 1, results),
        ]
      },
      {
        roundNumber: 3,
        name: "Final",
        matches: [
          createBracketMatch(semifinalWinner1, semifinalWinner2, 0, results),
        ]
      }
    ],
    totalRounds: 3,
    thirdPlaceMatch: createBracketMatch(semifinalLoser1, semifinalLoser2, 0, results),
    config: {/* ... */}
  },
  isComplete: true,
  winner: "p1"
}
```

### Step 4: Required Data for Each Match

To fully populate a match, you need:

#### Minimum Required (basic enrichment):
```typescript
{
  id: string,
  participantA: string,
  participantB: string,
  status: "COMPLETED",
  winner: string,
  gamesWonA: number,
  gamesWonB: number,
}
```

#### Full Data (complete enrichment):
```typescript
{
  id: string,
  participantA: string,
  participantB: string,
  status: "COMPLETED",
  winner: string,
  gamesWonA: number,
  gamesWonB: number,
  totalPointsA: number,        // Sum of all crokinole points
  totalPointsB: number,
  total20sA: number,           // Sum of all 20s
  total20sB: number,

  // Round-by-round breakdown
  rounds: [
    {
      gameNumber: 1,
      roundInGame: 1,
      pointsA: 2,
      pointsB: 0,
      twentiesA: 1,
      twentiesB: 0,
    },
    // ... more rounds
  ],

  startedAt: timestamp,
  completedAt: timestamp,
}
```

### Step 5: Update Tournament Metadata

After enrichment, update:

```typescript
{
  // Keep import fields for historical reference
  isImported: true,           // remains true — tournament is still "imported"
  importedAt: originalImportTimestamp,

  // Add enrichment timestamp — KEY FIELD
  // Set by transformImportedToLive() in tournaments.ts
  // Used in the admin tournament list to:
  //   - Show an "enriched" badge on the tournament card
  //   - Hide the "Transform to LIVE" button (already transformed)
  enrichedAt: Date.now(),

  // Update status to reflect full data
  updatedAt: Date.now(),
}
```

> **Note:** `enrichedAt` is the canonical way to check whether a tournament has been transformed. Always check `tournament.enrichedAt` (truthy) rather than checking the presence of group/bracket data, which may vary.

### Helper Function Template

```typescript
function createGroupMatch(
  participantA: string,
  participantB: string,
  results: MatchResults
): GroupMatch {
  return {
    id: generateId(),
    participantA,
    participantB,
    status: 'COMPLETED',
    winner: results.winner,
    gamesWonA: results.gamesA,
    gamesWonB: results.gamesB,
    totalPointsA: results.pointsA,
    totalPointsB: results.pointsB,
    total20sA: results.twentiesA,
    total20sB: results.twentiesB,
    rounds: results.rounds,
    completedAt: results.timestamp,
  };
}

function createBracketMatch(
  participantA: string,
  participantB: string,
  position: number,
  results: MatchResults,
  nextMatchId?: string
): BracketMatch {
  return {
    id: generateId(),
    position,
    participantA,
    participantB,
    status: 'COMPLETED',
    winner: results.winner,
    gamesWonA: results.gamesA,
    gamesWonB: results.gamesB,
    totalPointsA: results.pointsA,
    totalPointsB: results.pointsB,
    total20sA: results.twentiesA,
    total20sB: results.twentiesB,
    rounds: results.rounds,
    completedAt: results.timestamp,
    nextMatchId,
  };
}
```

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
