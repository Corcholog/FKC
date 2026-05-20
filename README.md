# FKC Esports Management Dashboard

A comprehensive, production-grade League of Legends team operations platform built with Next.js 16, React 19, and Supabase. Designed with a premium, esports-inspired "Hextech" aesthetic, this application serves as the central hub for team practice tracking, tournament administration, and automated opponent scouting.

## 🌟 Core Features

### 🏆 Real-Time Tournament Scouting & Tracking
- **Clash-Style Mini-Brackets:** Full tracking system for 16 teams across a 3-week points-based tournament format.
- **Supabase Realtime Sync:** Tournament brackets and global standings instantly update across all connected spectator screens the moment an admin records a match result.
- **Roster Management:** View enemy team rosters, rank distributions, and direct OP.GG integrations for quick scouting.

### 🤖 Automated Riot API Integration
- **Vercel Cron Scouting:** Automatically fetches and updates SoloQ and FlexQ ranks for every player in the tournament every night. Tracks rank deltas over time, visualizing LP gains/losses with dynamic status indicators.
- **Flex Queue Auto-Importer:** Safely handles Riot rate limits with client-side chunking and browser rate-limit handling to avoid Vercel 504 Timeouts. 
- **Automated Match Parsing:** Pulls champion picks, bans, KDA, CS, and objective stats without manual data entry.

### 📊 Advanced Player Statistics & Caching
- **Materialized Cache Pipeline:** Eliminates thousands of dynamic row calculations by using a Vercel Cron job to pre-calculate MVP counts, Top Champions, and KDAs into a blazing-fast JSON cache table (`roster_stats_cache`).
- **Custom Performance Scoring:** Utilizes an algorithmic scoring model (`calculateScoreV3`) to evaluate player performance based on lane opponents, vision score, damage share, and match duration.
- **Role-Aware Performance Profiles:** Algorithmically grades player match history over 5 core dimensions (Consistency, Carry, Fight Presence, Survivability, and Resource Control). Underlying targets are dynamically calibrated based on the player's primary role (e.g., ignoring CS for supports in favor of vision score metrics).
- **Hextech SVG Radar Charts:** Pure, dependency-free, responsive SVG radar charts rendering player metrics with native vector gradients, concentric guideline rings, and clean bounding spacing to prevent text cropping.
- **Dynamic Playstyle Archetypes:** Uses live match telemetry to classify players into distinct archetypes (such as *Apex Carry*, *Unkillable Demon*, *Teamfight Catalyst*, or support-specific roles like *Vision Mastermind* and *Guardian Angel*), paired with dynamic playstyle traits (e.g., *KDA Royalty*, *Immortal*, *CS Vacuum*, *Warding Machine*).
- **Multi-Tenant Ready:** The underlying PostgreSQL schema utilizes `org_id` keys, preparing the platform to serve multiple esports organizations simultaneously without data bleeding.

### 🎨 Hextech-Themed UI
- **Premium Aesthetics:** High-fidelity, custom-styled interface featuring glowing accents, glassmorphism, and custom scrollbars built entirely with Tailwind CSS v4.
- **Dynamic Ranked Emblems:** Visually renders Riot's official ranked tiers directly on player cards.

## 🛠️ Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (React 19, App Router, Server Actions)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL, Realtime Subscriptions, RLS)
- **Automation:** Vercel Cron Jobs (`vercel.json`)
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

3. Set up environment variables in a `.env.local` file:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
RIOT_API_KEY=your_riot_api_key
CRON_SECRET=your_custom_cron_password
```

4. Apply the database migrations located in the `supabase/migrations/` folder using the Supabase SQL Editor to set up multi-team features and analytics caches. Use the Admin panel's **Recalculate Database Scores** button to backfill telemetry columns for any existing matches.

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## 🔒 Security & Architecture

- **Next.js Server Actions:** All database write operations (like inserting matches) are securely routed through server actions, entirely hiding database schemas from the client bundle.
- **Cron Authentication:** Automated endpoints require a valid `Authorization: Bearer <CRON_SECRET>` header to prevent unauthorized triggers.
- **Row Level Security (RLS):** Data access is protected at the database layer via Supabase Auth.

## 📝 License & Contributing

This is a private application designed specifically for the FKC team operations. Contact the repository maintainers for access or contribution guidelines.
