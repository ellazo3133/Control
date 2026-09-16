-- Agregar fecha de vigencia a schedules
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS effective_from DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS effective_to   DATE DEFAULT NULL; -- NULL = vigente

-- Quitar el UNIQUE simple (employee_id, day_of_week) porque ahora puede haber varios períodos
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_employee_id_day_of_week_key;

-- Nuevo índice: solo puede haber un horario activo (sin effective_to) por empleado/día
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedules_active 
  ON public.schedules(employee_id, day_of_week) 
  WHERE effective_to IS NULL AND active = true;

-- Función: obtener el horario vigente para una fecha específica
CREATE OR REPLACE FUNCTION public.get_schedule_for_date(
  p_employee_id UUID,
  p_date DATE
) RETURNS TABLE(
  day_of_week SMALLINT,
  start_time  TIME,
  end_time    TIME,
  tolerance_minutes SMALLINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.day_of_week, s.start_time, s.end_time, s.tolerance_minutes
  FROM public.schedules s
  WHERE s.employee_id = p_employee_id
    AND s.active = true
    AND s.effective_from <= p_date
    AND (s.effective_to IS NULL OR s.effective_to >= p_date)
  ORDER BY s.effective_from DESC;
END;
$$ LANGUAGE plpgsql;
