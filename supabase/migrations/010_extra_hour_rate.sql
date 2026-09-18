-- Agregar valor de hora extra configurable por empleado
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS extra_hour_rate NUMERIC(12,2) DEFAULT NULL;
-- NULL significa que usa el cálculo automático (salary / scheduled_days / 8)
