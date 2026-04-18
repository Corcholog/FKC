import Image from 'next/image'

interface MatchCardProps {
  match: any;
  allChampions: string[];
}

export default function MatchCard({ match, allChampions }: MatchCardProps) {
  const getPicksByRole = (participants: any[] = []) => {
    return participants.reduce((acc: any, p: any) => {
      if (p.role) acc[p.role.toLowerCase()] = p
      return acc
    }, {})
  }

  const formatDuration = (minutes: number = 0, seconds: number = 0): string => {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const getChampionIcon = (name: string): string | null => {
    if (!name?.trim()) return null
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    const matchChamp = allChampions.find(c => normalize(c) === normalize(name))
    if (!matchChamp) return null
    const overrides: Record<string, string> = { "Bel'Veth": "Belveth", "Cho'Gath": "Chogath", "Kai'Sa": "Kaisa", "Kha'Zix": "Khazix", "K'Sante": "KSante", "Rek'Sai": "RekSai", "Vel'Koz": "Velkoz", "Wukong": "MonkeyKing" }
    const key = overrides[matchChamp] ?? matchChamp.replace(/[^a-zA-Z0-9]/g, '')
    return `https://ddragon.leagueoflegends.com/cdn/16.7.1/img/champion/${key}.png`
  }

  let mvpId: number | null = null;
  let intId: number | null = null;

  const scoredAllies = (match.ally_participants || []).filter((p: any) => typeof p.score === 'number' && p.score !== null && p.score !== 0);

  if (scoredAllies.length > 0) {
    const mvpPlayer = [...scoredAllies].reduce((prev, current) => (prev.score > current.score) ? prev : current);
    const intPlayer = [...scoredAllies].reduce((prev, current) => (prev.score < current.score) ? prev : current);
    mvpId = mvpPlayer.id;
    intId = intPlayer.id;
  }

  const allyPicks = getPicksByRole(match.ally_participants)
  const enemyPicks = getPicksByRole(match.enemy_participants)

  const bans = match.match_bans?.[0] || {}
  const ourBans: string[] = Array.isArray(bans.our_bans) ? bans.our_bans : []
  const enemyBans: string[] = Array.isArray(bans.enemy_bans) ? bans.enemy_bans : []

  const isOurBlue = match.our_side === 'Blue'

  const bluePicks = isOurBlue ? allyPicks : enemyPicks;
  const redPicks = isOurBlue ? enemyPicks : allyPicks;
  const blueBans = isOurBlue ? ourBans : enemyBans;
  const redBans = isOurBlue ? enemyBans : ourBans;

  const hasLink = match.match_type === 'flex' && match.match_id;
  const linkProps = hasLink ? {
    href: `https://www.leagueofgraphs.com/match/las/${match.match_id}`,
    target: "_blank",
    rel: "noopener noreferrer"
  } : {};

  return (
    <a
      {...linkProps}
      className={`block relative rounded-2xl border-2 overflow-hidden shadow-lg ${match.we_won
        ? `bg-gradient-to-r from-emerald-50 to-white border-emerald-200/80 ${hasLink ? 'hover:border-emerald-400 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(16,185,129,0.15)]' : ''}`
        : `bg-gradient-to-r from-rose-50 to-white border-rose-200/80 ${hasLink ? 'hover:border-rose-400 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(244,63,94,0.15)]' : ''}`
        } transition-all duration-300 ${hasLink ? 'cursor-pointer shadow-xl' : 'cursor-default'}`}
    >
      <div className="p-6">
        <div className="grid grid-cols-2 gap-8">

          {/* LEFT COLUMN: ALWAYS BLUE */}
          <div>
            <div className="text-sm font-bold text-[#0984e3] mb-3 tracking-wider drop-shadow-sm">
              BLUE {isOurBlue && '(US)'}
            </div>

            {/* Blue Picks */}
            <div className="flex justify-center gap-3 mb-6">
              {['top', 'jungle', 'mid', 'adc', 'support'].map(role => {
                const pick = bluePicks[role]
                const champ = pick?.champion
                const icon = getChampionIcon(champ)

                const isMVP = isOurBlue && pick?.id === mvpId && pick?.id != null;
                const isINT = isOurBlue && pick?.id === intId && pick?.id != null;

                return (
                  <div key={role} className="relative flex flex-col items-center">
                    {icon ? (
                      <Image src={icon} alt={champ} width={56} height={56} className="w-14 h-14 rounded-xl border border-blue-300/50 shadow-md object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-blue-100 bg-blue-50 flex items-center justify-center text-xs text-blue-300">?</div>
                    )}
                    {(isMVP || isINT) && (
                      <div className={`absolute -bottom-3 text-[14px] rounded-full w-6 h-6 flex items-center justify-center shadow-md z-10 border bg-white ${isMVP ? 'border-[#f1c40f]' : 'border-[#0984e3]'}`} title={isMVP ? `MVP (Score: ${pick?.score})` : `INT MVP (Score: ${pick?.score})`}>
                        {isMVP ? '🏆' : '😈'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Blue Bans */}
            {blueBans.length > 0 && (
              <div className="flex justify-center gap-2">
                {blueBans.slice(0, 5).map((ban: string, i: number) => {
                  const icon = getChampionIcon(ban)
                  return icon ? (
                    <Image key={i} src={icon} alt={ban} width={32} height={32} className="w-8 h-8 rounded-lg border border-blue-200/50 object-cover grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition shadow-sm" />
                  ) : (
                    <div key={i} className="w-8 h-8 rounded-lg border border-blue-100 bg-blue-50 flex items-center justify-center text-[10px] text-blue-300">
                      {ban?.substring(0, 2) || '?'}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: ALWAYS RED */}
          <div>
            <div className="text-sm font-bold text-rose-500 mb-3 tracking-wider drop-shadow-sm">
              RED {!isOurBlue && '(US)'}
            </div>

            {/* Red Picks */}
            <div className="flex justify-center gap-3 mb-6">
              {['top', 'jungle', 'mid', 'adc', 'support'].map(role => {
                const pick = redPicks[role]
                const champ = pick?.champion
                const icon = getChampionIcon(champ)

                const isMVP = !isOurBlue && pick?.id === mvpId && pick?.id != null;
                const isINT = !isOurBlue && pick?.id === intId && pick?.id != null;

                return (
                  <div key={role} className="relative flex flex-col items-center">
                    {icon ? (
                      <Image src={icon} alt={champ} width={56} height={56} className="w-14 h-14 rounded-xl border border-rose-300/50 shadow-md object-cover" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl border border-blue-100 bg-blue-50 flex items-center justify-center text-xs text-blue-300">?</div>
                    )}
                    {(isMVP || isINT) && (
                      <div className={`absolute -bottom-3 text-[14px] rounded-full w-6 h-6 flex items-center justify-center shadow-md z-10 border bg-white ${isMVP ? 'border-[#f1c40f]' : 'border-[#0984e3]'}`} title={isMVP ? `MVP (Score: ${pick?.score})` : `INT MVP (Score: ${pick?.score})`}>
                        {isMVP ? '🏆' : '😈'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Red Bans */}
            {redBans.length > 0 && (
              <div className="flex justify-center gap-2">
                {redBans.slice(0, 5).map((ban: string, i: number) => {
                  const icon = getChampionIcon(ban)
                  return icon ? (
                    <Image key={i} src={icon} alt={ban} width={32} height={32} className="w-8 h-8 rounded-lg border border-rose-200/50 object-cover grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition shadow-sm" />
                  ) : (
                    <div key={i} className="w-8 h-8 rounded-lg border border-blue-100 bg-blue-50 flex items-center justify-center text-[10px] text-blue-300">
                      {ban?.substring(0, 2) || '?'}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-blue-50/50 border-t border-blue-100 px-6 py-4 flex justify-between items-center text-sm">
        <div className="flex-1 text-left text-slate-500 font-medium truncate">
          {new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          <span className="mx-2 text-slate-300">|</span>
          <span className="text-slate-700">{match.match_type?.replace('_', ' ').toUpperCase()}</span>
          {match.enemy_team_name && (
            <>
              <span className="mx-2 text-slate-300">|</span>
              <span className="text-[#0f172a] font-bold">vs {match.enemy_team_name}</span>
            </>
          )}
        </div>
        <div className="flex-1 flex justify-end">
          <div className="font-mono text-slate-600 font-bold bg-white px-3 py-1 rounded-md shadow-sm border border-blue-100">
            {formatDuration(match.duration_minutes, match.duration_seconds || 0)}
          </div>
        </div>
      </div>
    </a>
  )
}
