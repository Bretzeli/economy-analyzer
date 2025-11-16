# Economy Analyzer
**Portfolio Project for Web Intelligence WS 2025/26**

A comprehensive web application for analyzing and visualizing global economic data, specifically focusing on inflation and income metrics across countries and years.

🌐 **Live Application**: [www.webintelligence.florianwetzel.dev](https://www.webintelligence.florianwetzel.dev)

## Overview

Economy Analyzer is an interactive data visualization platform that enables users to explore, compare, and analyze economic indicators worldwide. The application provides multiple views and tools for understanding inflation trends and income data across different countries and time periods.

## Features

- **World Map Visualization**: Interactive world map displaying economic data with color-coded visualizations
- **Single Country Analysis**: Detailed views of economic metrics and trends for individual countries
- **Country Comparison**: Side-by-side comparison of economic indicators across multiple countries
- **Tabular View**: Comprehensive data table with filtering, sorting, and export capabilities

## Data Sources

### Income Data
- **Source**: World Bank
- **Indicators**: 
  - GNI per capita (PPP)
  - GNI per capita (current LCU)
  - GNI per capita growth (annual %)

### Inflation Data
The application uses two complementary data sources for inflation to maximize both coverage and data frequency:

- **OECD**: Provides higher data frequency (monthly data) for OECD member countries and partners. While covering fewer countries overall, OECD data offers more granular temporal resolution for available countries.

- **World Bank**: Provides broader country coverage with annual inflation data. The World Bank source includes more countries globally, making it ideal for comprehensive cross-country analysis.

This dual-source approach ensures users have access to:
- More countries (via World Bank)
- Higher data frequency per country where available (via OECD)

## Tech Stack (not exhaustive)

### Frontend
- **Next.js 16.0.1** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **React Simple Maps** - Interactive map components
- **Shadcn UI** - UI component library built on Radix UI

### Database
- **Drizzle ORM** - TypeScript ORM for database operations
- **Neon Database** - Serverless PostgreSQL database


## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, pnpm, or bun
- PostgreSQL database (Neon or local instance)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd economy-analyzer
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:
Create a `.env` file in the root directory and configure your database connection:
```env
DATABASE_URL=your_database_connection_string
ADMIN_PASSWORD=your_password_to_manage_data
```

4. Run database migrations:
```bash
npm run db:push
# or use drizzle-kit for migrations
```

5. Start the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
economy-analyzer/
├── src/
│   ├── app/                  # Next.js app router pages
│   │   ├── page.tsx          # Home page
│   │   ├── world-map/        # World map visualization
│   │   ├── single-country/   # Single country analysis
│   │   ├── country-comparison/ # Country comparison
│   │   ├── tabular-view/     # Tabular data view
│   │   └── data-management/  # Data management interface
│   ├── components/           # Reusable components
│   ├── db/                   # Database schema and configuration
│   ├── services/             # API calls and data processing
│   ├── lib/                  # Utility functions
│   └── types/                # TypeScript type definitions
├── components/               # Shadcn UI components
└── drizzle/                  # Database migrations
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

