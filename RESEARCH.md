# BayParlays — Research Pipeline

A brute-force enumerator that scans every valid 2/3/4-leg parlay from each
day's edge-positive leg pool. Built so JP and (future) subscribers can study
where the AI actually finds edge — not just trust the top-5 the website
surfaces.

## What it does

1. Hits `/api/parlays?format=legs&tier=admin` to fetch the day's scored
   leg pool (typically 30-60 legs after the engine filters to edge-positive).
2. Enumerates every valid combination — usually around 370k candidates per
   slate after impossible-combo pruning.
3. Scores each parlay (combined decimal, joint probability, EV percent).
4. Persists the top 500 by EV into `research_parlays`, plus one summary
   row in `research_scans` (pool size, candidates scanned, top/median EV).
5. Auto-deletes rows older than 60 days to keep storage bounded.

## Where it runs

- **Local (manual):** `npx tsx scripts/research-scan.ts` — useful for
  ad-hoc inspection. Requires `.env.local` with Supabase keys.
- **Cloud (automated):** GitHub Actions workflow `research-scan.yml` runs
  it 2x/day at 12:00 UTC (5am PT) and 00:00 UTC (5pm PT).

## Storage budget

| Component | Per-row size | Per-day | 60-day max |
|---|---|---|---|
| research_scans | ~150 bytes | 2 rows | ~18 KB |
| research_parlays | ~800 bytes | ~1,000 rows | ~50 MB |

Total stays comfortably under Supabase's 500 MB free-tier cap.

## Database tables

### research_scans
One row per scan — the meta-statistics.

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| scanned_at | timestamptz | when the scan ran |
| sports | text[] | which sports were in scope |
| legs_in_pool | int | size of edge-positive leg pool |
| candidates_scanned | int | number of 2/3/4-leg combos enumerated |
| positive_ev_count | int | combos with EV > 0 |
| sharp_ev_count | int | combos with EV ≥ 5% |
| top_ev_percent | numeric | highest EV in the scan |
| median_ev_percent | numeric | median EV |
| duration_ms | int | scan runtime |

### research_parlays
Top 500 parlays per scan, by EV.

| Column | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| scan_id | uuid | FK to research_scans |
| scanned_at | timestamptz | inherited from scan |
| legs | jsonb | compact array of {gameId, sport, market, pick, odds, ourProb, sharpEdge, commenceTime} |
| leg_count | int | 2, 3, or 4 |
| combined_decimal | numeric | total parlay payout multiplier |
| combined_prob | numeric | product of leg ourProbs |
| ev_percent | numeric | the headline metric |
| sharp_legs_count | int | how many legs were sharp-flagged |
| sports | text[] | unique sports involved |
| status | text | pending / won / lost / push |
| resolved_at | timestamptz | when it settled |
| legs_won | int | hit count after resolution |
| legs_lost | int | miss count after resolution |

## Useful queries

Top 50 parlays today by EV:
```sql
select legs, combined_decimal, ev_percent, sharp_legs_count
from research_parlays
where scanned_at >= current_date
order by ev_percent desc
limit 50;
```

Most frequent legs in today's high-EV parlays:
```sql
select
  jsonb_extract_path_text(leg, 'pick') as pick,
  jsonb_extract_path_text(leg, 'sport') as sport,
  count(*) as appearances,
  avg(ev_percent) as avg_parlay_ev
from research_parlays, jsonb_array_elements(legs) as leg
where scanned_at >= current_date and ev_percent >= 5
group by 1, 2
order by appearances desc
limit 20;
```

EV distribution by leg count:
```sql
select
  leg_count,
  count(*) as n,
  round(avg(ev_percent)::numeric, 2) as avg_ev,
  round(percentile_cont(0.5) within group (order by ev_percent)::numeric, 2) as median_ev,
  round(max(ev_percent)::numeric, 2) as max_ev
from research_parlays
where scanned_at >= current_date - interval '7 days'
group by leg_count
order by leg_count;
```

Resolved parlay accuracy (after pre-tip cron has resolved enough):
```sql
select
  status,
  count(*) as n,
  round(avg(ev_percent)::numeric, 2) as avg_predicted_ev,
  round(avg(combined_prob)::numeric, 4) as avg_predicted_prob
from research_parlays
where status in ('won', 'lost')
group by status;
```

## Deploy steps

1. **Apply migration in Supabase SQL editor:**
   ```sql
   -- Copy contents of supabase/migrations/014_research_parlays.sql
   ```

2. **Add secrets to GitHub repo** (Settings → Secrets and variables → Actions):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (optional — service role bypasses RLS but
     anon also works since policies allow inserts)

3. **First run:** trigger the workflow manually from the Actions tab to
   verify everything wires up before relying on the cron.

## Future upgrades

- **Public /research page** — show daily distribution charts, leg
  frequency heatmaps, "what the AI sees" transparency content
- **Per-sport / per-market breakouts** — calibrate sigma values once
  enough resolved data accumulates
- **Score the model** — compare predicted EV vs actual win rate over time
  to validate (or invalidate) the leg-independence assumption used here
- **Pinnacle anchor** — once paid Pinnacle proxy is in, replace the
  median-across-books fair prob with Pinnacle for sharper EV estimates
