import { Team } from '@/lib/tournamentData'

interface Props {
  label: string
  value: string | null
  teams: Team[]
  disabled?: boolean
  compact?: boolean
  onChange: (value: string | null) => void
  excludeTeamIds?: string[]
}

export default function TeamSelect({
  label,
  value,
  teams,
  disabled,
  compact = false,
  onChange,
  excludeTeamIds = []
}: Props) {
  return (
    <label className="block text-xs">
      <span className="mb-1.5 block font-bold uppercase tracking-widest text-[#a09b8c]">
        {label}
      </span>
      <select
        disabled={disabled}
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
        className={`w-full rounded-sharp border border-[#2a3544] bg-[#11161d] px-2.5 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'} text-[#f0e6d2] outline-none transition focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c]/30 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <option value="">TBD / Open Slot</option>

        {teams.map(team => {
          const alreadySelected = excludeTeamIds.includes(team.id)
          return (
            <option key={team.id} value={team.id} disabled={alreadySelected}>
              {team.name} {alreadySelected ? '(used)' : ''}
            </option>
          )
        })}
      </select>
    </label>
  )
}
