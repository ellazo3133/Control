-- Agregar sueldo a profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS salary NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS salary_currency TEXT DEFAULT 'ARS';

-- Tabla de horas/días extra manuales
CREATE TABLE IF NOT EXISTS public.extra_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  hours         NUMERIC(5,2) NOT NULL DEFAULT 0,
  description   TEXT,           -- "Remoto", "Guardia", etc
  multiplier    NUMERIC(4,2) DEFAULT 1.0,  -- 1.0=normal, 1.5=50%extra, 2.0=doble
  approved_by   UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de liquidaciones mensuales
CREATE TABLE IF NOT EXISTS public.payroll (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month           TEXT NOT NULL,  -- 'YYYY-MM'
  base_salary     NUMERIC(10,2) DEFAULT 0,
  days_scheduled  INTEGER DEFAULT 0,
  days_worked     INTEGER DEFAULT 0,
  days_absent     INTEGER DEFAULT 0,
  days_justified  INTEGER DEFAULT 0,
  deduction_pct   NUMERIC(5,2) DEFAULT 0,  -- % de descuento por faltas
  deduction_amt   NUMERIC(10,2) DEFAULT 0,
  extra_hours_amt NUMERIC(10,2) DEFAULT 0,
  bonus           NUMERIC(10,2) DEFAULT 0,
  total_net       NUMERIC(10,2) DEFAULT 0,
  notes           TEXT,
  status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  approved_by     UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, month)
);

-- RLS
ALTER TABLE public.extra_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extra_select" ON public.extra_hours FOR SELECT USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "extra_admin" ON public.extra_hours FOR ALL USING (is_admin());
CREATE POLICY "payroll_select" ON public.payroll FOR SELECT USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "payroll_admin" ON public.payroll FOR ALL USING (is_admin());
