-- Horas mensuales configurables por empleado
-- Usado para calcular valor hora: salary / monthly_hours
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS monthly_hours NUMERIC(6,2) DEFAULT NULL;
-- NULL = usa el cálculo automático anterior (salary / scheduled_days / 8)
