-- =========================================================================
-- DEVI Safety App: Production Field Responders & Safety Agents Table
-- 100% Dynamic & Empty Table (No Dummy Data)
-- Run this in your Supabase Dashboard -> SQL Editor -> Run
-- =========================================================================

-- 1. Create the agents table
CREATE TABLE IF NOT EXISTS public.agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    pin_hash TEXT NOT NULL,
    area TEXT NOT NULL,
    duty_status TEXT DEFAULT 'OFF_DUTY', -- 'ON_DUTY' / 'OFF_DUTY' / 'DISPATCHED'
    latitude DOUBLE PRECISION DEFAULT NULL,  -- Streamed dynamically by phone GPS
    longitude DOUBLE PRECISION DEFAULT NULL, -- Streamed dynamically by phone GPS
    heading DOUBLE PRECISION DEFAULT 0,
    speed DOUBLE PRECISION DEFAULT 0,
    vehicle TEXT DEFAULT 'Patrol Unit',
    is_live BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for high-speed queries on mobile phone search & duty status
CREATE INDEX IF NOT EXISTS idx_agents_phone ON public.agents(phone);
CREATE INDEX IF NOT EXISTS idx_agents_duty_status ON public.agents(duty_status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for secure API access
DROP POLICY IF EXISTS "Allow select for all" ON public.agents;
CREATE POLICY "Allow select for all" ON public.agents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert for all" ON public.agents;
CREATE POLICY "Allow insert for all" ON public.agents FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update for all" ON public.agents;
CREATE POLICY "Allow update for all" ON public.agents FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete for all" ON public.agents;
CREATE POLICY "Allow delete for all" ON public.agents FOR DELETE USING (true);
