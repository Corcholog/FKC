# FKC Esports Management Dashboard

A comprehensive League of Legends team operations, scouting, and match tracking dashboard built with Next.js, TypeScript, and Supabase. Designed with a premium, esports-inspired "Hextech" aesthetic, this application serves as the central hub for team practice tracking and tournament scouting.

## 🌟 Core Features

### 🏆 Tournament Scouting & Clash Tracking
- **Clash-Style Mini-Brackets:** Full tracking system for 16 teams across a 3-week points-based tournament format.
- **Roster Management:** View enemy team rosters, rank distributions, and direct OP.GG integration for quick scouting.
- **Global Standings Dashboard:** Automated qualification tracking based on the tournament's 1000/700/400/200 scoring logic.

### 🤖 Smart Riot API Integration
- **Flex Queue Auto-Importer:** Automatically fetches recent matches from the Riot API. It uses smart roster detection to only import matches where at least 4 core team members (or recognized alternate accounts) played together, seamlessly mapping alt accounts to the correct main roster profile based on role.
- **SoloQ Tracking & LP Deltas:** Synchronizes player SoloQ and FlexQ ranks. Tracks rank changes over time, visualizing LP gains/losses since the last sync with dynamic status indicators.
- **Automated Match Parsing:** Pulls champion picks, bans, KDA, CS, and objective stats without manual data entry.

### 📊 Advanced Player Statistics
- **Custom Performance Scoring:** Utilizes an algorithmic scoring model (`calculateScoreV3`) to evaluate player performance based on lane opponents, vision score, damage share, and match duration.
- **Match History:** Detailed views of Scrims (BO1/BO3), Flex Queue, and official Tournament matches.
- **Filtered Insights:** Clean data by automatically excluding remake games (under 5 minutes) from overall statistics.

### 🎨 Hextech-Themed UI
- **Premium Aesthetics:** High-fidelity, custom-styled interface featuring glowing accents, glassmorphism, and custom scrollbars.
- **Dynamic Ranked Emblems:** Visually renders Riot's official ranked tiers directly on player cards.

## 🛠️ Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Database & Auth:** [Supabase](https://supabase.com/) (PostgreSQL & Row Level Security)
- **Icons:** Phosphor Icons

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account and project
- Riot Games Developer API Key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd fkc-team-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file with your credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
RIOT_API_KEY=your_riot_api_key
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 🔒 Security & Admin

- **Admin Dashboard:** Secure interface for triggering API syncs, initializing ranks, and managing tournament data.
- **Authentication:** Protected via Supabase Auth and Row Level Security (RLS) policies.

## 📝 License & Contributing

This is a private application designed specifically for the FKC team operations. Contact the repository maintainers for access or contribution guidelines.
