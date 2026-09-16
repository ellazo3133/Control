-- Tabla de notificaciones para el admin
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL, -- 'late_arrival' | 'absent' | 'checkout_missing'
  title       TEXT NOT NULL,
  body        TEXT,
  read        BOOLEAN DEFAULT false,
  data        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver y gestionar notificaciones
CREATE POLICY "notif_admin" ON public.admin_notifications FOR ALL USING (is_admin());

-- Índice para unread count
CREATE INDEX IF NOT EXISTS idx_notif_unread ON public.admin_notifications(read) WHERE read = false;

-- Función para verificar tardanzas y ausencias (se puede llamar desde un cron o desde el app)
CREATE OR REPLACE FUNCTION public.check_daily_attendance()
RETURNS void AS $$
DECLARE
  emp RECORD;
  sched RECORD;
  today_date DATE := CURRENT_DATE;
  today_dow SMALLINT := EXTRACT(DOW FROM CURRENT_DATE)::SMALLINT;
  cutoff_time TIME := CURRENT_TIME AT TIME ZONE 'America/Argentina/Buenos_Aires';
  rec RECORD;
BEGIN
  -- For each employee with a schedule today
  FOR emp IN SELECT p.id, p.name FROM public.profiles p WHERE p.active = true AND p.role = 'employee' LOOP
    -- Get today's schedule
    SELECT * INTO sched FROM public.schedules s 
    WHERE s.employee_id = emp.id AND s.day_of_week = today_dow AND s.active = true;
    
    IF sched IS NULL THEN CONTINUE; END IF; -- No shift today
    
    -- Only check if we're past the start time + 30 min grace
    IF cutoff_time < (sched.start_time + INTERVAL '30 minutes') THEN CONTINUE; END IF;
    
    -- Get today's record
    SELECT * INTO rec FROM public.attendance_records ar 
    WHERE ar.employee_id = emp.id AND ar.date = today_date;
    
    IF rec IS NULL OR rec.check_in IS NULL THEN
      -- Absent - check if we already notified
      IF NOT EXISTS (
        SELECT 1 FROM public.admin_notifications 
        WHERE type = 'absent' AND (data->>'employeeName') = emp.name
        AND created_at::date = today_date
      ) THEN
        INSERT INTO public.admin_notifications (type, title, body, data)
        VALUES ('absent', '✗ ' || emp.name || ' no registró entrada',
          'Debía entrar a las ' || sched.start_time::TEXT && ' y aún no registró asistencia',
          jsonb_build_object('employeeName', emp.name, 'expectedTime', sched.start_time::TEXT));
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
