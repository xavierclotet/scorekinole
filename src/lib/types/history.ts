export interface MatchRound {
    team1Points: number;
    team2Points: number;
    team1Twenty: number;
    team2Twenty: number;
    hammerTeam: 1 | 2 | null;
    roundNumber: number;
}

export interface MatchGame {
    team1Points: number;
    team2Points: number;
    gameNumber: number;
    rounds: MatchRound[];
    winner: 1 | 2 | null;
}

export interface MatchHistory {
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
    startTime: number;
    endTime: number;
    duration: number;
    eventTitle?: string;
    matchPhase?: string;
    showHammer?: boolean;
    show20s?: boolean;
    // For imported tournaments without detailed rounds
    total20sTeam1?: number;
    total20sTeam2?: number;
    syncStatus?: 'local' | 'synced' | 'pending' | 'error';
    savedBy?: {
        userId: string;
        userName: string;
        userEmail: string;
    };
    players?: {
        team1?: {
            name: string;
            userId: string | null;
        };
        team2?: {
            name: string;
            userId: string | null;
        };
    };
}

export interface CurrentMatch {
    startTime: number;
    games: MatchGame[];
    rounds: MatchRound[];
}
