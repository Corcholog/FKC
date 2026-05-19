import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ROLE_ORDER = ['top', 'jungle', 'mid', 'adc', 'support'];

export async function GET(request: Request) {
  // 1. Verify Vercel Cron Secret (Security)
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createClient();

    // Fetch all players
    const { data: playerList } = await supabase.from('players').select('*');
    if (!playerList) throw new Error('Could not fetch players');

    // Fetch all team performances
    const { data: teamPerformances } = await supabase
      .from('ally_participants')
      .select(`
        id,
        player_id,
        match_id,
        champion,
        kills,
        deaths,
        assists,
        score,
        matches!inner (id, we_won)
      `);

    // Fetch all soloq matches
    const { data: soloqPerformances } = await supabase.from('soloq_matches').select('*');

    const modes = ['team', 'soloq', 'mixed'] as const;

    // Calculate stats for each mode
    for (const mode of modes) {
      const matchPerformances: Record<number, any[]> = {};
      (teamPerformances || []).forEach((row: any) => {
        const matchId = row.matches?.id;
        if (matchId) {
          if (!matchPerformances[matchId]) matchPerformances[matchId] = [];
          matchPerformances[matchId].push(row);
        }
      });

      const playerMvpIntCounts: Record<number, { mvpCount: number; intMvpCount: number }> = {};
      Object.values(matchPerformances).forEach(playersInMatch => {
        const scoredPlayers = playersInMatch.filter((p: any) => typeof p.score === 'number' && p.score > 0);
        if (scoredPlayers.length < 2) return;

        const sorted = [...scoredPlayers].sort((a, b) => b.score - a.score);
        const mvpPlayerId = sorted[0].player_id;
        const intPlayerId = sorted[sorted.length - 1].player_id;

        if (mvpPlayerId) {
          playerMvpIntCounts[mvpPlayerId] = playerMvpIntCounts[mvpPlayerId] || { mvpCount: 0, intMvpCount: 0 };
          playerMvpIntCounts[mvpPlayerId].mvpCount++;
        }
        if (intPlayerId && intPlayerId !== mvpPlayerId) {
          playerMvpIntCounts[intPlayerId] = playerMvpIntCounts[intPlayerId] || { mvpCount: 0, intMvpCount: 0 };
          playerMvpIntCounts[intPlayerId].intMvpCount++;
        }
      });

      const stats = playerList.map(player => {
        const tMatches = (teamPerformances || []).filter((p: any) => p.player_id === player.id);
        const sMatches = (soloqPerformances || []).filter((p: any) => p.player_id === player.id);

        let wins = 0;
        let kills = 0;
        let deaths = 0;
        let assists = 0;
        let totalScore = 0;
        const mvpCount = playerMvpIntCounts[player.id]?.mvpCount || 0;
        const intMvpCount = playerMvpIntCounts[player.id]?.intMvpCount || 0;
        const champStats: Record<string, { games: number, wins: number, kills: number, deaths: number, assists: number }> = {};

        let gamesWithScore = 0;
        let totalGames = 0;

        const processMatch = (champion: string, win: boolean, k: number, d: number, a: number, score?: number) => {
          totalGames++;
          if (win) wins++;
          kills += k || 0;
          deaths += d || 0;
          assists += a || 0;

          if (typeof score === 'number' && score > 0) {
            totalScore += score;
            gamesWithScore++;
          }

          if (!champStats[champion]) {
            champStats[champion] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
          }
          champStats[champion].games++;
          if (win) champStats[champion].wins++;
          champStats[champion].kills += k || 0;
          champStats[champion].deaths += d || 0;
          champStats[champion].assists += a || 0;
        };

        if (mode === 'team' || mode === 'mixed') {
          tMatches.forEach((row: any) => {
            processMatch(row.champion, row.matches?.we_won, row.kills, row.deaths, row.assists, row.score);
          });
        }

        if (mode === 'soloq' || mode === 'mixed') {
          sMatches.forEach((row: any) => {
            processMatch(row.champion, row.win, row.kills, row.deaths, row.assists);
          });
        }

        const winrate = totalGames > 0 ? (wins / totalGames) * 100 : 0;
        const overallKda = deaths === 0 ? (kills + assists) : (kills + assists) / deaths;
        const avgScore = gamesWithScore > 0 ? totalScore / gamesWithScore : 0;

        const topChampions = Object.entries(champStats)
          .map(([name, champData]) => {
            const champWinrate = (champData.wins / champData.games) * 100;
            const champKda = champData.deaths === 0
              ? (champData.kills + champData.assists)
              : (champData.kills + champData.assists) / champData.deaths;

            return {
              name,
              games: champData.games,
              winrate: champWinrate,
              kda: isNaN(champKda) ? 0 : Number(champKda.toFixed(2))
            };
          })
          .sort((a, b) => b.games - a.games)
          .slice(0, 5);

        return {
          ...player,
          totalGames,
          wins,
          losses: totalGames - wins,
          winrate: Number(winrate.toFixed(1)),
          overallKda: Number(overallKda.toFixed(2)),
          avgScore: Number(avgScore.toFixed(1)),
          mvpCount,
          intMvpCount,
          topChampions
        };
      });

      stats.sort((a, b) => ROLE_ORDER.indexOf(a.role.toLowerCase()) - ROLE_ORDER.indexOf(b.role.toLowerCase()));

      // Upsert into cache
      const { error: upsertError } = await supabase
        .from('roster_stats_cache')
        .upsert({
          mode,
          data: stats,
          updated_at: new Date().toISOString()
        }, { onConflict: 'mode' });

      if (upsertError) throw upsertError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
