-- Valor hora específico por registro de hora extra
ALTER TABLE public.extra_hours ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12,2) DEFAULT NULL;
-- NULL = usa el automático del perfil (salary / días / 8)
