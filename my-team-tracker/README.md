# FKC Team Tracker

A League of Legends team statistics and match tracking application built with Next.js, TypeScript, and Supabase.

## Features

- **Player Statistics**: Track individual player performance, win rates, KDA, and champion preferences
- **Match History**: View detailed match results with champion picks, bans, and team compositions
- **Team Overview**: Comprehensive team performance analytics across different game modes
- **Admin Panel**: Secure interface for adding new matches and managing team data
- **Authentication**: Supabase-powered user authentication for secure access

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd my-team-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env.local` file with:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy

The application is optimized for Vercel deployment with Next.js.

## Usage

- **Home**: View team roster, recent matches, and overall statistics
- **Stats**: Detailed player statistics and performance metrics
- **Matches**: Complete match history with pagination
- **Admin**: Add new matches (restricted access)

## Security

- Authentication required for all pages
- Admin functions protected by user roles
- Secure API routes with Supabase RLS policies

## Contributing

This is a private application for team use. Contact the maintainers for access.
