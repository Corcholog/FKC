export interface StandardStats {
  durationMinutes: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  score: number; // match performance score (0-100)
  damageDealt: number;
  goldEarned: number;
  visionScore: number;
  damageTaken: number;
  role: string;
  win?: boolean;
  team_total_damage?: number;
  team_total_gold?: number;
  team_total_kills?: number;
  team_total_deaths?: number;
}

export interface RadarStats {
  carry: number;
  farming: number;
  fightPresence: number;
  survivability: number;
  consistency: number;
}

export interface ArchetypeProfile {
  name: string;
  description: string;
  badgeColor: string; // Tailored Hextech CSS classes
  borderColor: string;
  glowColor: string;
  keyTraits: string[];
}

export interface PlaystyleBadge {
  name: string;
  type: 'positive' | 'negative';
  description: string;
  formula: string;
  icon: string;
}

/**
 * Calculates role-adjusted radar chart scores on a 0-100 scale.
 * Custom axes per role:
 * Top: Isolation Tolerance, CS Gooning, Meatshield Index, 1v9 Aggression, TP Criminality
 * Jungle: Objective Gooning, Taxation Rate, Gank Desperado, Smite Gambler, Terrorism Score
 * Mid: Roamcel Factor, DPS Engine, Main Character Aura, Survival Paranoia, CS Vacuum
 * ADC: Fight Pilled, DPS Spitfire, KDA Princess, Glass Clunkiness, Gold Vacuum
 * Support: Income Allergies, Visionmaxxing, Psycho Engage, ADC Babysitter, Map Roamer
 */
export function normalizeRole(role: string): string {
  const r = (role || '').toLowerCase().trim();
  if (r === 'jg') return 'jungle';
  if (r === 'supp') return 'support';
  return r;
}

export function calculateRadarStats(performances: StandardStats[]): RadarStats {
  if (!performances || performances.length === 0) {
    return { carry: 50, farming: 50, fightPresence: 50, survivability: 50, consistency: 50 };
  }

  // Determine the dominant role in these performances to adjust targets
  const roleCounts: Record<string, number> = {};
  performances.forEach(p => {
    const role = (p.role || 'top').toLowerCase();
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });
  const dominantRole = Object.keys(roleCounts).reduce(
    (a, b) => (roleCounts[a] > roleCounts[b] ? a : b),
    'top'
  );

  // Check if we need to fall back to estimations due to missing database columns (pre-backfill)
  const needsEstimation = performances.every(p => (p.damageDealt || 0) === 0 && (p.goldEarned || 0) === 0);

  const count = performances.length;
  let winCount = 0;
  let totalScore = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;

  const matchMetrics = performances.map(p => {
    const dur = p.durationMinutes > 0 ? p.durationMinutes : 20;
    if (p.win) winCount++;
    totalScore += p.score || 50;
    totalKills += p.kills;
    totalDeaths += p.deaths;
    totalAssists += p.assists;

    if (needsEstimation) {
      const role = (p.role || 'top').toLowerCase();
      let estDpm = 150;
      let estGpm = 200;
      let estVspm = 0.4;
      let estDtpm = 300;

      if (role === 'adc') {
        estDpm = 400 + (p.kills * 40) + (p.cs * 1.5);
        estGpm = 220 + (p.cs * 25) + (p.kills * 15);
        estVspm = 0.5;
        estDtpm = 350;
      } else if (role === 'mid') {
        estDpm = 380 + (p.kills * 35) + (p.cs * 1.2);
        estGpm = 220 + (p.cs * 24) + (p.kills * 15);
        estVspm = 0.6;
        estDtpm = 380;
      } else if (role === 'top') {
        estDpm = 300 + (p.kills * 30) + (p.cs * 1.0);
        estGpm = 210 + (p.cs * 23) + (p.kills * 15);
        estVspm = 0.6;
        estDtpm = 550 + (p.deaths * 80);
      } else if (role === 'jungle') {
        estDpm = 280 + (p.kills * 25) + (p.cs * 1.0);
        estGpm = 220 + (p.cs * 23) + (p.kills * 15);
        estVspm = 0.8;
        estDtpm = 500 + (p.deaths * 70);
      } else if (role === 'support') {
        estDpm = 100 + (p.assists * 10);
        estGpm = 160 + (p.assists * 10);
        estVspm = 1.6;
        estDtpm = 400 + (p.deaths * 60);
      }

      const estTeamDpm = estDpm / 0.22;
      const estTeamGpm = estGpm / 0.21;
      const estTeamKills = Math.max(p.kills + p.assists, p.kills / 0.35);
      const estTeamDeaths = Math.max(p.deaths, p.deaths / 0.20);

      return {
        cspm: p.cs / dur,
        dpm: estDpm,
        gpm: estGpm,
        vspm: estVspm,
        dtpm: estDtpm,
        killsPerMin: p.kills / dur,
        assistsPerMin: p.assists / dur,
        deathsPerMin: p.deaths / dur,
        damageShare: 0.22,
        goldShare: 0.21,
        killParticipation: 0.50,
        deathShare: 0.20,
        killsDeathsPerMin: (p.kills + p.deaths) / dur,
        assistsDeathsPerMin: (p.assists + p.deaths) / dur,
        goldEarned: estGpm * dur,
        assists: p.assists
      };
    } else {
      const dmg = p.damageDealt || 0;
      const gold = p.goldEarned || 0;
      const vs = p.visionScore || 0;
      const dt = p.damageTaken || 0;

      const teamDmg = p.team_total_damage || (dmg / 0.22);
      const teamGold = p.team_total_gold || (gold / 0.21);
      const teamKills = p.team_total_kills || Math.max(p.kills + p.assists, p.kills / 0.35);
      const teamDeaths = p.team_total_deaths || Math.max(p.deaths, p.deaths / 0.20);

      return {
        cspm: p.cs / dur,
        dpm: dmg / dur,
        gpm: gold / dur,
        vspm: vs / dur,
        dtpm: dt / dur,
        killsPerMin: p.kills / dur,
        assistsPerMin: p.assists / dur,
        deathsPerMin: p.deaths / dur,
        damageShare: teamDmg > 0 ? (dmg / teamDmg) : 0.22,
        goldShare: teamGold > 0 ? (gold / teamGold) : 0.21,
        killParticipation: teamKills > 0 ? ((p.kills + p.assists) / teamKills) : 0.50,
        deathShare: teamDeaths > 0 ? (p.deaths / teamDeaths) : 0.20,
        killsDeathsPerMin: (p.kills + p.deaths) / dur,
        assistsDeathsPerMin: (p.assists + p.deaths) / dur,
        goldEarned: gold,
        assists: p.assists
      };
    }
  });

  const avgCspm = matchMetrics.reduce((sum, m) => sum + m.cspm, 0) / count;
  const avgDpm = matchMetrics.reduce((sum, m) => sum + m.dpm, 0) / count;
  const avgGpm = matchMetrics.reduce((sum, m) => sum + m.gpm, 0) / count;
  const avgVspm = matchMetrics.reduce((sum, m) => sum + m.vspm, 0) / count;
  const avgDtpm = matchMetrics.reduce((sum, m) => sum + m.dtpm, 0) / count;

  const avgKills = totalKills / count;
  const avgDeaths = totalDeaths / count;
  const avgAssists = totalAssists / count;
  const avgScore = totalScore / count;
  const winrate = winCount / count;

  const avgDamageShare = matchMetrics.reduce((sum, m) => sum + m.damageShare, 0) / count;
  const avgGoldShare = matchMetrics.reduce((sum, m) => sum + m.goldShare, 0) / count;
  const avgKillParticipation = matchMetrics.reduce((sum, m) => sum + m.killParticipation, 0) / count;
  const avgDeathShare = matchMetrics.reduce((sum, m) => sum + m.deathShare, 0) / count;

  const kdaRatio = avgDeaths === 0 ? (avgKills + avgAssists) : (avgKills + avgAssists) / avgDeaths;

  let axis1 = 50; // Consistency / Role Base
  let axis2 = 50; // Carry / DPM Focus
  let axis3 = 50; // Fight Presence
  let axis4 = 50; // Survivability
  let axis5 = 50; // Farming

  if (dominantRole === 'top') {
    // 1. Isolation Tolerance: survival score * (1.25 - gold share)
    const baseSurvival = 100 - Math.min(80, avgDeaths * 12);
    axis1 = baseSurvival * (1.25 - avgGoldShare);

    // 2. 1v9 Aggression: DPM relative to 550
    axis2 = (avgDpm / 550) * 80;

    // 3. TP Criminality: KP% relative to 50%
    axis3 = (avgKillParticipation / 0.50) * 80;

    // 4. Meatshield Index: Damage taken per death relative to 4000
    const avgDamageTakenTotal = performances.reduce((sum, p) => sum + (p.damageTaken || 0), 0);
    const dmgPerDeath = avgDamageTakenTotal / Math.max(1, totalDeaths);
    axis4 = (dmgPerDeath / 4000) * 80;

    // 5. CS Gooning: CS/Min relative to 8.5
    axis5 = (avgCspm / 8.5) * 80;

  } else if (dominantRole === 'jungle') {
    // 1. Objective Gooning: Winrate + VSPM
    axis1 = (avgVspm / 1.2 * 50) + (winrate * 50);

    // 2. Taxation Rate: Gold share + CS/Min
    axis2 = (avgGoldShare / 0.18 * 50) + (avgCspm / 6.0 * 50);

    // 3. Gank Desperado: K+A/Min relative to 0.40
    const avgAssistsKillsPerMin = matchMetrics.reduce((sum, m) => sum + m.killsPerMin + m.assistsPerMin, 0) / count;
    axis3 = (avgAssistsKillsPerMin / 0.40) * 80;

    // 4. Smite Gambler: Objective focus score
    axis4 = (winrate * 70) + (avgScore * 0.3);

    // 5. Terrorism Score: Combat density (kills + deaths per minute)
    const avgKillsDeathsPerMin = matchMetrics.reduce((sum, m) => sum + m.killsDeathsPerMin, 0) / count;
    axis5 = (avgKillsDeathsPerMin / 0.50) * 80;

  } else if (dominantRole === 'mid') {
    // 1. Roamcel Factor: Assists/Min + VSPM
    const avgAssistsPerMin = matchMetrics.reduce((sum, m) => sum + m.assistsPerMin, 0) / count;
    axis1 = (avgAssistsPerMin / 0.25 * 50) + (avgVspm / 0.8 * 50);

    // 2. DPS Engine: DPM relative to 650
    axis2 = (avgDpm / 650) * 80;

    // 3. Main Character Aura: Gold Share * Kill Share
    const avgKillShare = performances.reduce((sum, p) => sum + p.kills, 0) / Math.max(1, performances.reduce((sum, p) => sum + (p.team_total_kills || 0), 0));
    axis3 = (avgGoldShare * (avgKillShare || 0.25) * 1500);

    // 4. Survival Paranoia: Low deaths
    axis4 = (100 / (avgDeaths + 1)) * 1.5;

    // 5. CS Vacuum: CS/Min relative to 8.8
    axis5 = (avgCspm / 8.8) * 80;

  } else if (dominantRole === 'adc') {
    // 1. Fight Pilled: Kill Participation
    axis1 = (avgKillParticipation / 0.70) * 80;

    // 2. DPS Spitfire: DPM relative to 700
    axis2 = (avgDpm / 700) * 80;

    // 3. KDA Princess: KDA Ratio
    axis3 = (kdaRatio / 4.5) * 80;

    // 4. Glass Clunkiness: Inverted death rate per damage dealt
    axis4 = Math.max(15, 100 - (avgDeaths / (avgDpm || 1)) * 15000);

    // 5. Gold Vacuum: Gold Share
    axis5 = (avgGoldShare / 0.26) * 80;

  } else if (dominantRole === 'support') {
    // 1. Income Allergies: Assist / GPM efficiency
    const totalAssistsSupport = matchMetrics.reduce((sum, m) => sum + m.assists, 0);
    const totalGoldSupport = matchMetrics.reduce((sum, m) => sum + m.goldEarned, 0);
    axis1 = ((totalAssistsSupport / (totalGoldSupport || 1)) * 8000);

    // 2. Visionmaxxing: VSPM relative to 1.8
    axis2 = (avgVspm / 1.8) * 80;

    // 3. Psycho Engage: Combat instigation
    const avgAssistsDeathsPerMin = matchMetrics.reduce((sum, m) => sum + m.assistsDeathsPerMin, 0) / count;
    axis3 = (avgAssistsDeathsPerMin / 0.45) * 80;

    // 4. ADC Babysitter: Winrate + low death share
    axis4 = (winrate * 50) + ((1 - avgDeathShare) * 50);

    // 5. Map Roamer: KP% + VSPM
    axis5 = (avgKillParticipation * 50) + (avgVspm / 1.5 * 50);
  }

  const clamp = (val: number) => Math.max(15, Math.min(100, Math.round(val)));

  return {
    carry: clamp(axis2),
    farming: clamp(axis5),
    fightPresence: clamp(axis3),
    survivability: clamp(axis4),
    consistency: clamp(axis1),
  };
}

export interface PlaystyleTrait {
  name: string;
  description: string;
  formula: string;
}

/**
 * Classifies a player's performance profile into a unique archetype.
 */
export function determineArchetype(stats: RadarStats, role: string = 'top'): ArchetypeProfile {
  const { carry, farming, fightPresence, survivability, consistency } = stats;
  const r = normalizeRole(role);

  // TOP LANE
  if (r === 'top') {
    if (consistency >= 62 && survivability >= 62 && farming < 65) {
      return {
        name: 'Weakside Monk',
        description: 'You sit under tower, absorb 3-man dives, and watch your bot lane throw the game. True inner peace.',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
        keyTraits: ['Absorbs Pressure', 'Low Gold Share', 'Tank Duty']
      };
    }
    if (farming >= 68 && fightPresence < 55) {
      return {
        name: 'CS Gooner',
        description: "You refuse to join teamfights, mute your team's pings, and hit side-lane towers until the game ends (win or lose).",
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        borderColor: 'border-blue-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
        keyTraits: ['Split Pusher', 'Muted Chat', 'Tower Destroyer']
      };
    }
    if (carry >= 68 && farming >= 60) {
      return {
        name: '1v9 Gigachad',
        description: 'You play high-damage bruisers, win the 1v2 lane gank, and drag your screaming team to victory.',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        borderColor: 'border-amber-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
        keyTraits: ['Lane Dominance', 'High DPM', 'Solo Carry']
      };
    }
    if (carry >= 62 && survivability < 52 && consistency < 52) {
      return {
        name: 'RAGEQUITTER / Elwind Wannabe',
        description: 'You build full damage, trade at level 2, die, and spam-ping your jungler. You think you are the next superstar.',
        badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        borderColor: 'border-rose-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
        keyTraits: ['Jungler Blamer', 'Coinflip Lane', 'No Tank Items']
      };
    }
    if (carry < 50 && farming < 52 && consistency >= 55) {
      return {
        name: 'Shiba Inu (Dog Lane)',
        description: 'You pick Malphite, press R in teamfights, and pray your team carries. You are the emotional support dog of FKC.',
        badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
        borderColor: 'border-teal-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(20,184,166,0.25)]',
        keyTraits: ['Emotional Support', 'Malphite Main', 'R Button Pressed']
      };
    }

    // Default Fallback for Top
    return {
      name: 'Coinflip Islander',
      description: 'You play your own 1v1 game on the island. Half the time you are the savior, half the time the game is over at 15 minutes.',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      borderColor: 'border-slate-500/50',
      glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
      keyTraits: ['Island Dweller', '1v1 Duelist', 'Schrödinger\'s Lane']
    };
  }

  // JUNGLE
  if (r === 'jungle') {
    if (survivability >= 68 && fightPresence >= 62) {
      return {
        name: 'Smite Gambler',
        description: 'You coinflip every Baron at 50/50, tilt your team, and live for the high-dopamine smite steals.',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        borderColor: 'border-amber-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
        keyTraits: ['Clutch Smite', 'Coinflip King', 'Objective Rush']
      };
    }
    if (fightPresence >= 68 && farming < 58) {
      return {
        name: 'Gank Enjoyer',
        description: 'You perma-gank lanes from level 2, ignore your camps, and either go 10/0 or feed the enemy mid double-buffs.',
        badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
        borderColor: 'border-cyan-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(6,182,212,0.25)]',
        keyTraits: ['High Early Pressure', 'Low CS', 'Coinflip Ganks']
      };
    }
    if (farming >= 68 && fightPresence < 60) {
      return {
        name: 'Resource Hoover / Farmcel',
        description: "You play full-clear carries, tax your mid lane's waves, and only show up to fights when you can clean up kills.",
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        borderColor: 'border-blue-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(59,130,246,0.25)]',
        keyTraits: ['Farm Heavy', 'Late Game scaling', 'Wave Taxer']
      };
    }
    if (carry < 50 && consistency >= 60 && survivability >= 60) {
      return {
        name: 'River Shen / Ward Bot',
        description: 'You refuse to farm your jungle camps, live in the river, and act as a second support. Your camps are crying.',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
        keyTraits: ['River Dweller', 'Support Jungle', 'Zero Gold Carry']
      };
    }
    if (carry < 48 && consistency < 48) {
      return {
        name: 'Jungle Terrorist',
        description: 'You path towards the wrong lane, miss smites on crab, and write "unwinnable" in chat at 5 minutes.',
        badgeColor: 'bg-red-500/10 text-red-400 border-red-500/30',
        borderColor: 'border-red-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
        keyTraits: ['Scuttle Loser', 'Missed Smites', 'Mental Boom']
      };
    }

    // Default Fallback for Jungle
    return {
      name: 'Scuttle Crab Fanatic',
      description: 'You balance farming and ganking, but your true love is the Scuttle Crab. You will fight to the death for that river vision.',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      borderColor: 'border-slate-500/50',
      glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
      keyTraits: ['Scuttle Control', 'Honest Pathing', 'Objective Stabilizer']
    };
  }

  // MID LANE
  if (r === 'mid') {
    if (survivability >= 68 && fightPresence < 58) {
      return {
        name: 'KDA Princess',
        description: 'You play 900-range mages, sit in the backline, and preserve your 5.0 KDA while your base collapses.',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
        keyTraits: ['Ultra-Safe', 'High KDA', 'Low Fight Involvement']
      };
    }
    if (farming >= 68 && carry >= 62) {
      return {
        name: 'CS Vacuum / Wave Hoarder',
        description: 'You lane-kingdom your opponent, flame your jungler for not giving blue buff, and hoard all team resources.',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        borderColor: 'border-amber-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
        keyTraits: ['Elite CS/Min', 'Resource Hoarding', 'High DPS Engine']
      };
    }
    if (consistency >= 62 && fightPresence >= 62) {
      return {
        name: 'Roamcel',
        description: 'You play assassins or global pick champions, lose 3 waves of CS to dive bot lane, and live for the chaos.',
        badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        borderColor: 'border-purple-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(168,85,247,0.25)]',
        keyTraits: ['Side-Lane Dive', 'Low Laner CS', 'Early Skirmishing']
      };
    }
    if (farming < 52 && fightPresence >= 62) {
      return {
        name: 'ARAM Enthusiast',
        description: 'After 10 minutes, you lock your eyes on the mid lane, refuse to side-lane, and share XP with your ADC for the rest of the game.',
        badgeColor: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
        borderColor: 'border-pink-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(236,72,153,0.25)]',
        keyTraits: ['Perma-Mid', 'XP Sharer', 'Objective Magnet']
      };
    }
    if (farming >= 65 && carry < 50) {
      return {
        name: 'Gold-to-Trash Converter',
        description: 'You farm everything on the map, take the raptors, take the side waves, and then deal support-level damage in teamfights.',
        badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        borderColor: 'border-rose-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
        keyTraits: ['High Farm', 'Negative DPM', 'Gold Squeezer']
      };
    }

    // Default Fallback for Mid
    return {
      name: 'Co-Pilot Mid',
      description: 'A steady presence. You don\'t feed, you don\'t carry hard, you just enable your team and hover around the map.',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      borderColor: 'border-slate-500/50',
      glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
      keyTraits: ['Steady Laner', 'Standard Roams', 'Enable Focus']
    };
  }

  // ADC
  if (r === 'adc') {
    if (farming >= 68 && carry >= 68 && survivability < 55) {
      return {
        name: 'Main Character Syndrome',
        description: 'You demand every farm wave, flash forward into 5 enemies, and flame your support when you get deleted.',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        borderColor: 'border-amber-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
        keyTraits: ['High Damage Share', 'Resource Vacuum', 'Flash Forward']
      };
    }
    if (survivability >= 68 && fightPresence < 62) {
      return {
        name: 'Safe Prince / KDA Player',
        description: 'You play safe, wait for your frontline to secure the fight, and pick up the last kills to maintain your flawless record.',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
        keyTraits: ['Pristine Spacing', 'Low Death Share', 'Clean Cleanup']
      };
    }
    if (carry < 50 && survivability < 50) {
      return {
        name: 'Zero-Damage Merchant',
        description: 'You get caught before every objective fight, farm side lanes while teamfights happen, and deal less damage than the Alistar support.',
        badgeColor: 'bg-red-500/10 text-red-400 border-red-500/30',
        borderColor: 'border-red-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
        keyTraits: ['Glass Cannon (Without Cannon)', 'Farms Side Lanes', 'Low DPS']
      };
    }
    if (farming >= 62 && carry < 52 && survivability >= 65) {
      return {
        name: 'Auto-Attack Allergy',
        description: 'You have a pristine KDA and great CS, but you play fights so far back that your auto-attack range indicator never touches an enemy.',
        badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
        borderColor: 'border-teal-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(20,184,166,0.25)]',
        keyTraits: ['Perma-Backline', 'Zero Fight Pressure', 'Cowardly Spacing']
      };
    }
    if (carry >= 65 && farming < 55 && survivability < 48) {
      return {
        name: 'Washing Machine / Perma-Spinner',
        description: 'You play Vayne/Samira, spin into the enemy team, get CC\'d instantly, but somehow occasionally get a triple kill.',
        badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        borderColor: 'border-indigo-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(99,102,241,0.25)]',
        keyTraits: ['Vayne Spotting', 'Samira Ult Coinflip', 'Psycho Position']
      };
    }

    // Default Fallback for ADC
    return {
      name: 'Right Click Merchant',
      description: 'A standard marksman. You farm your waves, run away when a bruiser looks at you, and auto-attack whatever is closest.',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      borderColor: 'border-slate-500/50',
      glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
      keyTraits: ['Kite focus', 'Wave Harvester', 'Front-To-Back Focus']
    };
  }

  // SUPPORT
  if (r === 'support') {
    if (carry >= 68 && consistency >= 62) {
      return {
        name: 'Visionmaxxer',
        description: 'You drop 80 wards a game, clear every brush, and die 4 times in deep enemy jungle trying to drop a control ward.',
        badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        borderColor: 'border-purple-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(168,85,247,0.25)]',
        keyTraits: ['Elite Vision Score', 'Deep Warding', 'Brush Clearing']
      };
    }
    if (fightPresence >= 68 && survivability < 55) {
      return {
        name: 'Psycho Engage',
        description: "You press go every time you see an enemy, hit hooks from screen-away, and die 12 times a game in the name of 'creating space'.",
        badgeColor: 'bg-red-500/10 text-red-400 border-red-500/30',
        borderColor: 'border-red-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
        keyTraits: ['Fight Starter', 'High Deaths', 'Relentless Aggression']
      };
    }
    if (survivability >= 68 && fightPresence < 60) {
      return {
        name: 'Femboy Enchanter / Shield Bot',
        description: 'You sit 2 screens behind your ADC, press shield on cooldown, and flame your team in chat.',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(16,185,129,0.25)]',
        keyTraits: ['Perma-Shielding', 'Safe Spacing', 'Chat Enthusiast']
      };
    }
    if (consistency < 55 && farming >= 65) {
      return {
        name: 'CS Thief / Lux Support',
        description: 'You play Lux or Brand, "accidentally" clear waves with your spells, take 4 kills, and claim you are the carry now.',
        badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
        borderColor: 'border-orange-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(249,115,22,0.25)]',
        keyTraits: ['Wave Stealer', 'Kill Securer', 'Tax Master']
      };
    }
    if (carry < 50 && consistency < 50) {
      return {
        name: 'Ward-Phobic Support',
        description: 'You forget to upgrade your support item, buy zero control wards, and use your trinket once every 10 minutes.',
        badgeColor: 'bg-stone-500/10 text-stone-400 border-stone-500/30',
        borderColor: 'border-stone-500/50',
        glowColor: 'shadow-[0_0_20px_rgba(120,113,108,0.25)]',
        keyTraits: ['Pitch Black Map', 'Locked Trinket', 'Zero Control Wards']
      };
    }

    // Default Fallback for Support
    return {
      name: 'Standard Caregiver',
      description: 'Follows the ADC, wards when pinged, and provides a balanced, honest day of work. Not psycho, not invisible, just support.',
      badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
      borderColor: 'border-slate-500/50',
      glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
      keyTraits: ['ADC Babysitting', 'Standard Warding', 'Helpful Utility']
    };
  }

  // Fallback: All-Rounder (Rarely reached now)
  return {
    name: 'Tactical All-Rounder',
    description: 'A versatile jack-of-all-trades. You adapt your playstyle to what the team needs, balancing safety, resource allocation, and team fighting without major statistical weak points.',
    badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    borderColor: 'border-slate-500/50',
    glowColor: 'shadow-[0_0_20px_rgba(148,163,184,0.25)]',
    keyTraits: ['Adaptable Playstyle', 'Balanced Stats', 'Role Versatility']
  };
}

/**
 * Returns dynamic playstyle traits based on actual raw statistics.
 */
export function getDynamicTraits(performances: StandardStats[], stats: RadarStats, role: string): PlaystyleTrait[] {
  const traits: PlaystyleTrait[] = [];
  const count = performances.length;
  if (count === 0) return [];

  const totalKills = performances.reduce((sum, p) => sum + p.kills, 0);
  const totalDeaths = performances.reduce((sum, p) => sum + p.deaths, 0);
  const totalAssists = performances.reduce((sum, p) => sum + p.assists, 0);

  const avgKills = totalKills / count;
  const avgDeaths = totalDeaths / count;
  const avgAssists = totalAssists / count;
  const kda = avgDeaths === 0 ? (avgKills + avgAssists) : (avgKills + avgAssists) / avgDeaths;

  // Average of each game's CSPM / VSPM / DPM to avoid total duration distortion
  const gameCspms = performances.map(p => p.cs / (p.durationMinutes || 20));
  const gameVspms = performances.map(p => (p.visionScore || 0) / (p.durationMinutes || 20));
  const gameDpms = performances.map(p => (p.damageDealt || 0) / (p.durationMinutes || 20));
  const gameDtpms = performances.map(p => (p.damageTaken || 0) / (p.durationMinutes || 20));

  const cspm = gameCspms.reduce((sum, v) => sum + v, 0) / count;
  const vspm = gameVspms.reduce((sum, v) => sum + v, 0) / count;
  const dpm = gameDpms.reduce((sum, v) => sum + v, 0) / count;
  const dtpm = gameDtpms.reduce((sum, v) => sum + v, 0) / count;

  const r = normalizeRole(role);
  const isSupport = r === 'support';

  // KDA
  if (kda >= 4.2) {
    traits.push({
      name: 'KDA Royalty',
      description: 'Superior combat positioning. Consistently maintains an elite ratio of kills/assists to deaths.',
      formula: `KDA: ${kda.toFixed(2)} (Target: >=4.2)`
    });
  } else if (kda >= 3.2) {
    traits.push({
      name: 'Solid KDA',
      description: 'Disciplined fighter. Keeps a steady and favorable kill-to-death ratio.',
      formula: `KDA: ${kda.toFixed(2)} (Target: >=3.2)`
    });
  }

  // Survival
  if (avgDeaths <= 2.2) {
    traits.push({
      name: 'Immortal',
      description: 'Pristine spacing and caution. Extremely difficult for opponents to pick off.',
      formula: `Avg Deaths: ${avgDeaths.toFixed(1)} (Target: <=2.2)`
    });
  } else if (avgDeaths >= 5.8) {
    traits.push({
      name: 'Skirmish Trade King',
      description: 'Lives in the heat of battle. Trades life for combat advantages and absolute chaos.',
      formula: `Avg Deaths: ${avgDeaths.toFixed(1)} (Target: >=5.8)`
    });
  }

  // Farming/Vision
  if (!isSupport) {
    if (cspm >= 8.2) {
      traits.push({
        name: 'CS Vacuum',
        description: 'Resource hoarder. Sucks up every minion wave and jungle camp across the map.',
        formula: `CS/Min: ${cspm.toFixed(1)} (Target: >=8.2)`
      });
    } else if (cspm >= 7.0) {
      traits.push({
        name: 'Farming Virtuoso',
        description: 'Highly efficient pathing. Keeps a consistent and healthy creep score.',
        formula: `CS/Min: ${cspm.toFixed(1)} (Target: >=7.0)`
      });
    }
  } else {
    if (vspm >= 1.7) {
      traits.push({
        name: 'Warding Machine',
        description: 'Map hacking via vision. Places and clears massive vision corridors.',
        formula: `VSPM: ${vspm.toFixed(2)} (Target: >=1.7)`
      });
    } else if (vspm >= 1.3) {
      traits.push({
        name: 'Map Lighter',
        description: 'Pristine map illumination. Consistently lights up dark objectives for the team.',
        formula: `VSPM: ${vspm.toFixed(2)} (Target: >=1.3)`
      });
    }
  }

  // Damage
  if (!isSupport && dpm >= 620) {
    traits.push({
      name: 'DPS Engine',
      description: 'Teamfight threat. Pours massive, continuous damage onto target champions.',
      formula: `DPM: ${Math.round(dpm)} (Target: >=620)`
    });
  }
  if (dtpm >= 780) {
    traits.push({
      name: 'Heavy Frontliner',
      description: 'Team shield. Soaks high volumes of damage and locks down the front gates.',
      formula: `Damage Taken/Min: ${Math.round(dtpm)} (Target: >=780)`
    });
  }

  // Utility
  if (avgAssists >= 10.5) {
    traits.push({
      name: 'Assists Engine',
      description: 'Ultimate facilitator. Focuses on setting up teammates for success.',
      formula: `Avg Assists: ${avgAssists.toFixed(1)} (Target: >=10.5)`
    });
  }

  if (traits.length < 2) {
    traits.push({
      name: 'Versatile',
      description: 'Steady all-rounder. Adapts performance metrics according to the game state.',
      formula: 'Fallback playstyle profile'
    });
    traits.push({
      name: 'Team Player',
      description: 'Coordinate focused. Sacrifices personal statistics to ensure team success.',
      formula: 'Fallback playstyle profile'
    });
  }

  return traits.slice(0, 3);
}

/**
 * Returns dynamic playstyle badges based on telemetry thresholds.
 */
export function calculateBadges(performances: StandardStats[], stats: RadarStats, role: string): PlaystyleBadge[] {
  const badges: PlaystyleBadge[] = [];
  const count = performances.length;
  if (count === 0) return [];

  const totalKills = performances.reduce((sum, p) => sum + p.kills, 0);
  const totalDeaths = performances.reduce((sum, p) => sum + p.deaths, 0);
  const totalAssists = performances.reduce((sum, p) => sum + p.assists, 0);

  const totalTeamDamage = performances.reduce((sum, p) => sum + (p.team_total_damage || (p.damageDealt ? p.damageDealt / 0.22 : 0)), 0);
  const totalTeamGold = performances.reduce((sum, p) => sum + (p.team_total_gold || (p.goldEarned ? p.goldEarned / 0.21 : 0)), 0);
  const totalTeamKills = performances.reduce((sum, p) => sum + (p.team_total_kills || Math.max(p.kills + p.assists, p.kills / 0.35)), 0);

  const totalDamageDealt = performances.reduce((sum, p) => sum + (p.damageDealt || 0), 0);
  const totalGoldEarned = performances.reduce((sum, p) => sum + (p.goldEarned || 0), 0);

  const avgDeaths = totalDeaths / count;

  // Average of each game's CSPM / VSPM / DPM to avoid total duration distortion
  const gameCspms = performances.map(p => p.cs / (p.durationMinutes || 20));
  const gameVspms = performances.map(p => (p.visionScore || 0) / (p.durationMinutes || 20));
  const gameDpms = performances.map(p => (p.damageDealt || 0) / (p.durationMinutes || 20));
  const gameParticipationsPerMin = performances.map(p => (p.kills + p.assists) / (p.durationMinutes || 20));

  const cspm = gameCspms.reduce((sum, v) => sum + v, 0) / count;
  const vspm = gameVspms.reduce((sum, v) => sum + v, 0) / count;
  const dpm = gameDpms.reduce((sum, v) => sum + v, 0) / count;
  const participationsPerMin = gameParticipationsPerMin.reduce((sum, v) => sum + v, 0) / count;

  const damageShare = totalTeamDamage > 0 ? (totalDamageDealt / totalTeamDamage) : 0.22;
  const goldShare = totalTeamGold > 0 ? (totalGoldEarned / totalTeamGold) : 0.21;
  const killParticipation = totalTeamKills > 0 ? ((totalKills + totalAssists) / totalTeamKills) : 0.50;

  const winrate = performances.filter(p => p.win).length / count;
  const normalizedRole = normalizeRole(role);
  const isSupport = normalizedRole === 'support';
  const isJungle = normalizedRole === 'jungle';

  // 1. Clutch Gene (Positive)
  const lateGames = performances.filter(p => p.durationMinutes >= 35);
  const lateWins = lateGames.filter(p => p.win).length;
  const lateWinrate = lateGames.length > 0 ? lateWins / lateGames.length : 0;
  if (lateGames.length >= 2 && lateWinrate >= 0.65) {
    badges.push({
      name: 'Clutch Gene',
      type: 'positive',
      description: 'Exceptional ice in the veins. Wins at least 65% of close late-games (>= 35 min).',
      formula: `Late Winrate: ${(lateWinrate * 100).toFixed(0)}% (Target: >=65%)`,
      icon: '🔥'
    });
  }

  // 2. Visionmaxxer (Positive)
  const visionTarget = isSupport ? 1.8 : 1.0;
  if (vspm >= visionTarget) {
    badges.push({
      name: 'Visionmaxxer',
      type: 'positive',
      description: `Absolute map clarity. Maintains exceptional vision score per minute (${vspm.toFixed(2)}).`,
      formula: `VSPM: ${vspm.toFixed(2)} (Target: >=${visionTarget})`,
      icon: '👁️'
    });
  }

  // 3. Lane Abuser (Positive)
  if (!isSupport && cspm >= 8.5) {
    badges.push({
      name: 'Lane Abuser',
      type: 'positive',
      description: 'Suffocating lane presence. Maintains a peak cs per minute rate.',
      formula: `CS/Min: ${cspm.toFixed(1)} (Target: >=8.5)`,
      icon: '🗡️'
    });
  }

  // 4. Smurf Aura (Positive)
  const avgScore = performances.reduce((sum, p) => sum + (p.score || 50), 0) / count;
  const isTeamStats = performances.every(p => p.score !== 50);
  const smurfAuraEligible = isTeamStats ? (avgScore >= 80) : (winrate >= 0.60 || avgScore >= 80);

  if (smurfAuraEligible) {
    badges.push({
      name: 'Smurf Aura',
      type: 'positive',
      description: 'Mechanical superiority. Averages an elite win rate or performance rating.',
      formula: isTeamStats ? `Avg Score: ${avgScore.toFixed(0)} (Target: >=80)` : `Winrate: ${(winrate * 100).toFixed(0)}% | Avg Score: ${avgScore.toFixed(0)}`,
      icon: '👑'
    });
  }

  // 5. Tempo Dictator (Positive)
  if (participationsPerMin >= 0.45) {
    badges.push({
      name: 'Tempo Dictator',
      type: 'positive',
      description: 'Dictates the game pace. Relentlessly active in combat across the map.',
      formula: `Kp/Min: ${participationsPerMin.toFixed(2)} (Target: >=0.45)`,
      icon: '⚡'
    });
  }

  // 6. Flash Terrorist (Negative)
  if (avgDeaths >= 6.5) {
    badges.push({
      name: 'Flash Terrorist',
      type: 'negative',
      description: 'Plays with zero self-preservation. Aggressively dies at least 6.5 times per game.',
      formula: `Avg Deaths: ${avgDeaths.toFixed(1)} (Target: >=6.5)`,
      icon: '💀'
    });
  }

  // 7. Visionphobic (Negative)
  const darkTarget = isSupport ? 0.9 : 0.3;
  if (vspm <= darkTarget) {
    badges.push({
      name: 'Visionphobic',
      type: 'negative',
      description: 'Refuses to look at the mini-map. Plays in complete, pitch-black darkness.',
      formula: `VSPM: ${vspm.toFixed(2)} (Target: <=${darkTarget})`,
      icon: '🙈'
    });
  }

  // 8. Farm Addict (Negative)
  if (!isSupport && cspm >= 8.2 && killParticipation <= 0.38) {
    badges.push({
      name: 'Farm Addict',
      type: 'negative',
      description: 'Prefers side camps over team battles. Farms like a machine but ignores teamfights.',
      formula: `CS/Min: ${cspm.toFixed(1)} | KP%: ${(killParticipation * 100).toFixed(0)}%`,
      icon: '🌾'
    });
  }

  // 9. Objective Allergic (Negative - Jungle only)
  if (isJungle && avgScore <= 45) {
    badges.push({
      name: 'Objective Allergic',
      type: 'negative',
      description: 'Failed to establish objective priority or secure neutral epic monsters.',
      formula: `Avg Jungle Rating: ${avgScore.toFixed(0)}`,
      icon: '🦕'
    });
  }

  // 10. Sidequest NPC (Negative)
  if (!isSupport && goldShare >= 0.24 && dpm <= 380) {
    badges.push({
      name: 'Sidequest NPC',
      type: 'negative',
      description: 'Collects huge resource allocations only to deal support-level damage.',
      formula: `Gold Share: ${(goldShare * 100).toFixed(1)}% | DPM: ${dpm.toFixed(0)}`,
      icon: '🤖'
    });
  }

  return badges;
}
