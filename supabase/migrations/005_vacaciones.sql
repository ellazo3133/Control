-- Fecha de alta en profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hire_date DATE;

-- Solicitudes de vacaciones
CREATE TABLE IF NOT EXISTS public.vacation_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          INTEGER NOT NULL,  -- días corridos
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_note    TEXT,
  reviewed_by   UUID REFERENCES public.profiles(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Saldo de vacaciones por año
CREATE TABLE IF NOT EXISTS public.vacation_balance (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  days_total    INTEGER NOT NULL DEFAULT 0,   -- días que le corresponden
  days_taken    INTEGER NOT NULL DEFAULT 0,   -- días tomados
  days_pending  INTEGER NOT NULL DEFAULT 0,   -- días aprobados pero no tomados aún
  notes         TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, year)
);

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_balance   ENABLE ROW LEVEL SECURITY;

-- Empleado ve las suyas; admin ve todas
CREATE POLICY "vac_req_select" ON public.vacation_requests FOR SELECT
  USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "vac_req_insert" ON public.vacation_requests FOR INSERT
  WITH CHECK (employee_id = auth.uid() OR is_admin());
CREATE POLICY "vac_req_update_own" ON public.vacation_requests FOR UPDATE
  USING (employee_id = auth.uid() AND status = 'pending');
CREATE POLICY "vac_req_admin" ON public.vacation_requests FOR ALL
  USING (is_admin());

CREATE POLICY "vac_bal_select" ON public.vacation_balance FOR SELECT
  USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "vac_bal_admin" ON public.vacation_balance FOR ALL
  USING (is_admin());

-- Función: calcular días de vacaciones según LCT con días corridos
-- Antigüedad < 5 años  → 14 días
-- 5-9 años             → 21 días  
-- 10-19 años           → 28 días
-- 20+ años             → 35 días
-- < 6 meses trabajados → 1 día cada 20 días trabajados
CREATE OR REPLACE FUNCTION public.calc_vacation_days(
  p_hire_date DATE,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER AS $$
DECLARE
  months_worked INTEGER;
  years_worked  INTEGER;
BEGIN
  IF p_hire_date IS NULL THEN RETURN 0; END IF;
  months_worked := EXTRACT(YEAR FROM AGE(p_reference_date, p_hire_date)) * 12
                 + EXTRACT(MONTH FROM AGE(p_reference_date, p_hire_date));
  years_worked  := FLOOR(months_worked / 12);

  -- Menos de 6 meses: proporcional (1 día cada 20 días trabajados, máx según antigüedad)
  IF months_worked < 6 THEN
    RETURN LEAST(
      FLOOR((p_reference_date - p_hire_date) / 20),
      14 -- máximo del primer tramo
    );
  END IF;

  -- Días corridos según antigüedad
  IF    years_worked < 5  THEN RETURN 14;
  ELSIF years_worked < 10 THEN RETURN 21;
  ELSIF years_worked < 20 THEN RETURN 28;
  ELSE                         RETURN 35;
  END IF;
END;
$$ LANGUAGE plpgsql;
