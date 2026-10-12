-- Startup Funding Pulse schema (Neon Postgres).
-- Paste this whole file into the Neon SQL Editor and run it. Safe to re-run.
-- RLS is enabled on every table with no public policies: only the server
-- (which connects with the owner connection string) can read or write.

create table if not exists config (
  id int primary key default 1 check (id = 1),          -- single-row table
  sectors text[] not null default '{}',
  stages text[] not null default '{}',
  watchlist text[] not null default '{}',
  portfolio jsonb not null default '[]',                -- [{name, description}]
  recipient_email text,
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id serial primary key,
  name text not null,
  url text not null unique,
  active boolean not null default true,
  last_fetched_at timestamptz,
  last_item_count int,
  last_error text
);

create table if not exists articles (
  id serial primary key,
  source text not null,
  url text not null unique,
  title text not null,
  body_text text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  is_funding_candidate boolean not null default false,
  processed boolean not null default false
);
create index if not exists articles_published_idx on articles (published_at);

create table if not exists deals (
  id serial primary key,
  company_name text not null,
  company_key text not null,                            -- normalized name
  round_stage text not null check (round_stage in
    ('Pre-seed','Seed','Pre-Series A','Series A','Series B','Series C+','Debt','Undisclosed')),
  amount_text text,                                     -- exact span from the article
  amount_value numeric,
  amount_unit text,
  currency text,
  amount_usd_m numeric,                                 -- computed in code
  amount_inr_cr numeric,                                -- computed in code
  lead_investor text,
  other_investors text[] not null default '{}',
  sector text,
  city text,
  one_line_summary text,
  source_urls text[] not null default '{}',
  first_seen_at timestamptz not null default now(),
  announced_week date not null,                         -- Monday of that week
  relevance text not null default 'other' check (relevance in ('focus','other')),
  watchlist_hit boolean not null default false,
  adjacent_to text,
  adjacency_reason text,
  verified_amount boolean not null default false,
  unique (company_key, round_stage, announced_week)
);
create index if not exists deals_week_idx on deals (announced_week);

create table if not exists briefs (
  id serial primary key,
  week_start date not null,
  html text not null,
  stats jsonb,
  sent_at timestamptz,
  email_status text
);

create table if not exists runs (
  id serial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  articles_fetched int not null default 0,
  candidates int not null default 0,
  deals_extracted int not null default 0,
  deals_after_dedupe int not null default 0,
  gemini_calls int not null default 0,
  errors jsonb not null default '[]'
);

alter table config   enable row level security;
alter table sources  enable row level security;
alter table articles enable row level security;
alter table deals    enable row level security;
alter table briefs   enable row level security;
alter table runs     enable row level security;

-- ---- Seed data (SAMPLE: edit later on the /config page) ----
insert into config (id, sectors, stages, watchlist, portfolio, recipient_email)
values (
  1,
  array['Fintech','Climate tech','B2B SaaS','D2C','Healthtech'],
  array['Seed','Pre-Series A','Series A'],
  array['REPLACE_ME_1','REPLACE_ME_2','REPLACE_ME_3','REPLACE_ME_4'],
  '[{"name":"StockSathi (sample)","description":"A B2B SaaS that manages inventory for kirana stores"},
    {"name":"GigCredit (sample)","description":"A UPI-based credit line for gig workers"},
    {"name":"SunBridge (sample)","description":"A rooftop solar financing platform for SMEs"}]'::jsonb,
  null   -- the app falls back to the RECIPIENT_EMAIL env var when this is null
)
on conflict (id) do nothing;
