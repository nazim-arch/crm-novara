# IntentRadar — AI-Powered Buyer Intent Engine

## Module Structure

```
Your Next.js Project/
├── app/
│   ├── intentradar/                  ← Pages
│   │   ├── page.tsx                  ← Dashboard
│   │   ├── settings/page.tsx         ← API key configuration
│   │   ├── generate/page.tsx         ← Input form + Generate button
│   │   └── leads/page.tsx            ← Results with AI insights
│   └── api/intentradar/              ← API Routes
│       ├── settings/route.ts
│       ├── generate/route.ts
│       ├── leads/route.ts
│       └── ai-insights/route.ts
├── lib/intentradar/                  ← Core Logic
│   ├── db.ts                         ← Database utilities
│   ├── scoring.ts                    ← 10-dimension scoring engine
│   ├── ai-insights.ts                ← Dual AI (Claude + GPT) insights
│   └── scrapers.ts                   ← YouTube, Reddit, Google Maps scrapers
└── prisma/
    └── intentradar-schema.prisma     ← Database schema (add to your schema.prisma)
```

## Setup Instructions

### Step 1: Copy Files
Copy all files from this module into your existing Next.js project, maintaining the directory structure above.

### Step 2: Add Database Tables
Open your existing `prisma/schema.prisma` and append the contents of `prisma/intentradar-schema.prisma` at the end.

Then run:
```bash
npx prisma db push
```

This creates the IntentRadar tables (all prefixed with `ir_`) in your Neon database without affecting existing tables.

### Step 3: Verify Dependencies
IntentRadar uses only standard Next.js APIs. No additional npm packages required beyond what you already have:
- `@prisma/client` (you already have this)
- `next` (you already have this)
- `react` (you already have this)

### Step 4: Update Prisma Client Import
In `lib/intentradar/db.ts`, update the prisma import to match your project:

```typescript
// If you have a global prisma instance at lib/prisma.ts:
import { prisma } from '@/lib/prisma';
export { prisma };

// Or if you use a different path, adjust accordingly
```

### Step 5: Configure API Keys
1. Navigate to `/intentradar/settings`
2. Enter your API keys:
   - **YouTube Data API v3** (required) — from Google Cloud Console
   - **Reddit Client ID + Secret** (required) — from reddit.com/prefs/apps
   - **Claude API Key** (required) — from console.anthropic.com
   - **OpenAI API Key** (required) — from platform.openai.com
   - Google Places, Telegram, Twitter, Meta — optional but recommended

### Step 6: Generate Leads
1. Navigate to `/intentradar/generate`
2. Fill in your criteria (city, micro-markets, budget, property type)
3. Select signal sources to scan
4. Click "Generate Leads"
5. Wait 1-2 minutes for scanning + AI analysis
6. View results at `/intentradar/leads`

## Pages

| URL | Purpose |
|-----|---------|
| `/intentradar` | Dashboard with quick stats and navigation |
| `/intentradar/settings` | API key management |
| `/intentradar/generate` | Input criteria + Generate Leads button |
| `/intentradar/leads` | Scored leads with AI insights from both Claude and GPT |

## API Endpoints

| Method | URL | Purpose |
|--------|-----|---------|
| GET | `/api/intentradar/settings` | Fetch all settings |
| POST | `/api/intentradar/settings` | Save settings |
| POST | `/api/intentradar/generate` | Run full pipeline (scrape → score → AI) |
| GET | `/api/intentradar/leads` | Fetch leads (with filters) |
| PATCH | `/api/intentradar/leads` | Update lead status |
| POST | `/api/intentradar/ai-insights` | Regenerate AI insights for a lead |

## How the Scoring Works

10 dimensions, weighted to 100:
- Query Specificity (15%)
- Engagement Velocity (14%) — NEW
- Budget Clarity (12%)
- Urgency Signals (12%)
- Multi-Developer Following (10%) — NEW
- Content Creator Stack (10%) — NEW
- Cross-Platform Presence (10%)
- Financial Readiness (10%)
- Location Lock (8%)
- Buyer Profile Match (5%)

Plus behavioral pattern bonuses:
- Life event detection (+4)
- Vastu/cultural signals (+5)
- Comparison queries (+4)
- NRI detection (+5)
- Complaint/trigger signals (+3)
- Deep engagement (+3)

## Lead Tiers
- 🔥 HOT (80-100): Immediate outreach within 2 hours
- 🟡 WARM (50-79): Engage within 24 hours
- 🟢 COOL (25-49): Nurture sequence
- ⚪ WATCHING (0-24): Passive monitoring
