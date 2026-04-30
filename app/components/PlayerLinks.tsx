import Image from 'next/image';

const PLAYER_LINKS: Record<string, { opgg: string, dpm: string, log: string }> = {
  "we1rdcat#uwu": {
    opgg: "https://op.gg/es/lol/summoners/las/we1rdcat-uwu",
    dpm: "https://dpm.lol/we1rdcat-uwu",
    log: "https://www.leagueofgraphs.com/summoner/las/we1rdcat-uwu"
  },
  "volvé camila#missu": {
    opgg: "https://op.gg/lol/summoners/las/volv%C3%A9%20camila-MISSU",
    dpm: "https://dpm.lol/volv%C3%A9%20camila-MISSU",
    log: "https://www.leagueofgraphs.com/summoner/las/volv%C3%A9%20camila-MISSU"
  },
  "pør casi un G6#fkc": {
    opgg: "https://op.gg/lol/summoners/las/p%C3%B8r%20casi%20un%20G6-FKC",
    dpm: "https://dpm.lol/p%C3%B8r%20casi%20un%20G6-FKC",
    log: "https://www.leagueofgraphs.com/summoner/las/p%C3%B8r+casi+un+G6-FKC"
  },
  "LEIF CHAMPION#fkc": {
    opgg: "https://op.gg/lol/summoners/las/p%C3%B8r%20casi%20un%20G6-FKC",
    dpm: "https://dpm.lol/p%C3%B8r%20casi%20un%20G6-FKC",
    log: "https://www.leagueofgraphs.com/summoner/las/p%C3%B8r+casi+un+G6-FKC"
  },
  "l étrange cas#fkc": {
    opgg: "https://op.gg/lol/summoners/las/l%20%C3%A9trange%20cas-fkc",
    dpm: "https://dpm.lol/l%20%C3%A9trange%20cas-fkc",
    log: "https://www.leagueofgraphs.com/summoner/las/l+%C3%A9trange+cas-fkc"
  },
  "zair#zaza": {
    opgg: "https://op.gg/lol/summoners/las/Zair-Zaza",
    dpm: "https://dpm.lol/Zair-Zaza",
    log: "https://www.leagueofgraphs.com/summoner/las/Zair-Zaza"
  }
};

export const getPlayerLinks = (ign: string) => {
  if (!ign) return null;
  const normalizedIgn = ign.toLowerCase().trim();
  const entry = Object.entries(PLAYER_LINKS).find(([key]) => key.toLowerCase() === normalizedIgn);
  return entry ? entry[1] : null;
};

export default function PlayerLinks({ ign, className = "" }: { ign: string, className?: string }) {
  const links = getPlayerLinks(ign);
  if (!links) return null;
  return (
    <div className={`flex justify-center items-center gap-4 ${className}`}>
      <a href={links.opgg} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="OP.GG">
        <Image src="/icons/opgg.png" alt="OP.GG" width={24} height={24} className="w-6 h-6 rounded shadow-sm" />
      </a>
      <a href={links.dpm} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="DPM.LOL">
        <Image src="/icons/dpm.png" alt="DPM.LOL" width={24} height={24} className="w-6 h-6 rounded shadow-sm" />
      </a>
      <a href={links.log} target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition-transform" title="League of Graphs">
        <Image src="/icons/leagueofgraphs.webp" alt="League of Graphs" width={24} height={24} className="w-6 h-6 rounded shadow-sm" />
      </a>
    </div>
  );
}
