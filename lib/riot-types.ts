export interface RiotLeagueEntryDTO {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
}

export interface RiotParticipantDTO {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  teamId: number;
  teamPosition: string;
  championName: string;
  win: boolean;
  
  kills: number;
  deaths: number;
  assists: number;
  
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  visionScore: number;
  champExperience: number;
  
  totalDamageDealtToChampions: number;
  totalDamageTaken: number;
  damageDealtToBuildings: number;
  
  turretTakedowns: number;
  detectorWardsPlaced: number;
  wardsPlaced: number;
  wardsCleared: number;
  
  dragons?: number;
  barons?: number;
  riftHeraldTakedowns?: number;
  
  gameEndedInEarlySurrender?: boolean;
}

export interface RiotBanDTO {
  championId: number;
  pickTurn: number;
}

export interface RiotTeamDTO {
  teamId: number;
  bans: RiotBanDTO[];
}

export interface RiotMatchInfoDTO {
  gameCreation: number;
  gameDuration: number;
  participants: RiotParticipantDTO[];
  teams: RiotTeamDTO[];
}

export interface RiotMatchDTO {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: RiotMatchInfoDTO;
}
