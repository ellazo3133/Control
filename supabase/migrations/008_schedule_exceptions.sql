-- Excepciones de horario por día y empleado
CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('free','custom','half')),
  -- free = no trabaja, custom = horario especial, half = media jornada
  start_time  TIME,           -- solo para custom/half
  end_time    TIME,           -- solo para custom/half
  note        TEXT,           -- "Víspera de Sucot", "Media jornada"
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, date)   -- una excepción por empleado por día
);

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exc_select" ON public.schedule_exceptions FOR SELECT
  USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "exc_admin" ON public.schedule_exceptions FOR ALL
  USING (is_admin());
