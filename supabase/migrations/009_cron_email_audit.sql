-- ═══════════════════════════════════════════════════════
-- MIGRACIÓN 009: pg_cron automático + email + historial
-- ═══════════════════════════════════════════════════════

-- 1. Tabla historial de ediciones (si no existe)
CREATE TABLE IF NOT EXISTS public.attendance_edits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id     UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  edited_by     UUID REFERENCES public.profiles(id),
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.attendance_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edits_admin" ON public.attendance_edits FOR ALL USING (is_admin());
CREATE POLICY "edits_own" ON public.attendance_edits FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.attendance_records ar WHERE ar.id = record_id AND ar.employee_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_edits_record ON public.attendance_edits(record_id);

-- 2. Función corregida: chequeo de ausencias Y tardanzas con notificación deduplicada
CREATE OR REPLACE FUNCTION public.check_daily_attendance()
RETURNS void AS $$
DECLARE
  emp           RECORD;
  sched         RECORD;
  rec           RECORD;
  today_date    DATE    := CURRENT_DATE;
  today_dow     SMALLINT := EXTRACT(DOW FROM CURRENT_DATE)::SMALLINT;
  ba_time       TIME;
  late_mins     INTEGER;
BEGIN
  -- Hora actual en Buenos Aires
  ba_time := (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::TIME;

  FOR emp IN
    SELECT p.id, p.name
    FROM public.profiles p
    WHERE p.active = true AND p.role = 'employee'
  LOOP
    -- Horario del empleado hoy (último activo del día)
    SELECT s.*
    INTO sched
    FROM public.schedules s
    WHERE s.employee_id = emp.id
      AND s.day_of_week = today_dow
      AND s.active = true
    ORDER BY s.effective_from DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- Solo actuar si ya pasaron 30 min del inicio
    IF ba_time < (sched.start_time + INTERVAL '30 minutes') THEN CONTINUE; END IF;

    -- Registro de hoy
    SELECT *
    INTO rec
    FROM public.attendance_records ar
    WHERE ar.employee_id = emp.id AND ar.date = today_date;

    IF rec IS NULL OR rec.check_in IS NULL THEN
      -- AUSENTE — notificar una sola vez por día
      IF NOT EXISTS (
        SELECT 1 FROM public.admin_notifications
        WHERE type = 'absent'
          AND (data->>'employeeId') = emp.id::TEXT
          AND created_at::DATE = today_date
      ) THEN
        INSERT INTO public.admin_notifications (type, title, body, data)
        VALUES (
          'absent',
          '✗ ' || emp.name || ' no registró entrada',
          'Debía entrar a las ' || to_char(sched.start_time, 'HH24:MI') || ' y aún no registró asistencia',
          jsonb_build_object('employeeId', emp.id, 'employeeName', emp.name, 'expectedTime', to_char(sched.start_time, 'HH24:MI'))
        );
      END IF;

    ELSE
      -- TARDANZA — si check_in existe y minutes_late > 0
      late_mins := COALESCE(rec.minutes_late, 0);
      IF late_mins > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_notifications
          WHERE type = 'late_arrival'
            AND (data->>'employeeId') = emp.id::TEXT
            AND created_at::DATE = today_date
        ) THEN
          INSERT INTO public.admin_notifications (type, title, body, data)
          VALUES (
            'late_arrival',
            '⏰ ' || emp.name || ' llegó tarde',
            'Llegó ' || late_mins || ' min después de las ' || to_char(sched.start_time, 'HH24:MI'),
            jsonb_build_object('employeeId', emp.id, 'employeeName', emp.name, 'minutesLate', late_mins, 'expectedTime', to_char(sched.start_time, 'HH24:MI'))
          );
        END IF;
      END IF;

      -- SIN SALIDA — si pasó 30 min del fin de jornada y no hay checkout
      IF rec.check_out IS NULL AND ba_time > (sched.end_time + INTERVAL '30 minutes') THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_notifications
          WHERE type = 'checkout_missing'
            AND (data->>'employeeId') = emp.id::TEXT
            AND created_at::DATE = today_date
        ) THEN
          INSERT INTO public.admin_notifications (type, title, body, data)
          VALUES (
            'checkout_missing',
            '🚪 ' || emp.name || ' no registró salida',
            'Su jornada terminó a las ' || to_char(sched.end_time, 'HH24:MI') || ' y no registró salida',
            jsonb_build_object('employeeId', emp.id, 'employeeName', emp.name, 'expectedTime', to_char(sched.end_time, 'HH24:MI'))
          );
        END IF;
      END IF;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función reporte mensual por email (usa pg_net + Supabase SMTP)
CREATE OR REPLACE FUNCTION public.send_monthly_report()
RETURNS void AS $$
DECLARE
  admin_email  TEXT;
  report_month TEXT := to_char(NOW() - INTERVAL '1 month', 'YYYY-MM');
  month_label  TEXT := to_char(NOW() - INTERVAL '1 month', 'TMMonth YYYY');
  emp          RECORD;
  html_body    TEXT;
  emp_section  TEXT;
  stats_row    TEXT;
BEGIN
  -- Email del admin principal
  SELECT p.email INTO admin_email
  FROM public.profiles p
  WHERE p.role = 'admin' AND p.active = true
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF admin_email IS NULL THEN RETURN; END IF;

  -- Construir HTML del reporte
  html_body := '<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  body{font-family:Arial,sans-serif;color:#1f2937;padding:2rem;max-width:700px;margin:0 auto;}
  h1{color:#0ea5e9;margin-bottom:.25rem;}
  h2{color:#374151;font-size:1rem;margin:2rem 0 .75rem;border-bottom:2px solid #f1f5f9;padding-bottom:.5rem;}
  .meta{color:#6b7280;font-size:.85rem;margin-bottom:2rem;}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.5rem;}
  th{background:#f1f5f9;padding:.5rem .75rem;text-align:left;font-weight:600;border-bottom:2px solid #e2e8f0;}
  td{padding:.5rem .75rem;border-bottom:1px solid #f1f5f9;}
  .pct{font-weight:900;font-size:1.1rem;}
  .green{color:#059669;} .red{color:#dc2626;} .yellow{color:#d97706;}
  .footer{margin-top:2rem;font-size:.75rem;color:#9ca3af;border-top:1px solid #f1f5f9;padding-top:1rem;}
</style></head><body>
<h1>📊 Reporte de Asistencia</h1>
<p class="meta">Mes: <strong>' || initcap(month_label) || '</strong> · Generado automáticamente el ' || to_char(NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') || '</p>

<table>
<tr><th>Empleado</th><th>Programados</th><th>Presentes</th><th>Ausentes</th><th>Justif.</th><th>Tardanzas</th><th>% Asistencia</th></tr>';

  FOR emp IN
    SELECT p.id, p.name
    FROM public.profiles p
    WHERE p.role = 'employee' AND p.active = true
    ORDER BY p.name
  LOOP
    DECLARE
      scheduled_days INTEGER := 0;
      present_days   INTEGER := 0;
      absent_days    INTEGER := 0;
      justified_days INTEGER := 0;
      late_count     INTEGER := 0;
      pct            INTEGER := 0;
      d              DATE;
      dow            INTEGER;
      sched_row      RECORD;
      rec_row        RECORD;
    BEGIN
      d := (report_month || '-01')::DATE;
      WHILE d < (report_month || '-01')::DATE + INTERVAL '1 month' LOOP
        dow := EXTRACT(DOW FROM d)::INTEGER;

        SELECT * INTO sched_row
        FROM public.schedules s
        WHERE s.employee_id = emp.id AND s.day_of_week = dow AND s.active = true
        ORDER BY s.effective_from DESC NULLS LAST LIMIT 1;

        IF FOUND THEN
          scheduled_days := scheduled_days + 1;

          SELECT * INTO rec_row
          FROM public.attendance_records ar
          WHERE ar.employee_id = emp.id AND ar.date = d;

          IF rec_row.check_in IS NOT NULL THEN
            present_days := present_days + 1;
            IF COALESCE(rec_row.minutes_late, 0) > 0 THEN late_count := late_count + 1; END IF;
          ELSIF rec_row.status = 'justified' THEN
            justified_days := justified_days + 1;
          ELSIF d <= CURRENT_DATE THEN
            absent_days := absent_days + 1;
          END IF;
        END IF;

        d := d + INTERVAL '1 day';
      END LOOP;

      IF scheduled_days > 0 THEN
        pct := ROUND(present_days::NUMERIC / scheduled_days * 100);
      END IF;

      html_body := html_body || '<tr>' ||
        '<td><strong>' || emp.name || '</strong></td>' ||
        '<td>' || scheduled_days || '</td>' ||
        '<td class="green">' || present_days || '</td>' ||
        '<td class="' || CASE WHEN absent_days > 0 THEN 'red' ELSE '' END || '">' || absent_days || '</td>' ||
        '<td class="yellow">' || justified_days || '</td>' ||
        '<td>' || late_count || '</td>' ||
        '<td><span class="pct ' || CASE WHEN pct >= 90 THEN 'green' WHEN pct >= 75 THEN 'yellow' ELSE 'red' END || '">' || pct || '%</span></td>' ||
        '</tr>';
    END;
  END LOOP;

  html_body := html_body || '</table>
<p class="footer">Este reporte fue generado automáticamente por el sistema de control de asistencia de El Lazo. No respondas a este email.</p>
</body></html>';

  -- Enviar usando Supabase Auth email (pg_net)
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_key')
    ),
    body := jsonb_build_object(
      'to', admin_email,
      'subject', '📊 Reporte de Asistencia — ' || initcap(month_label),
      'html', html_body
    )::TEXT
  );

EXCEPTION WHEN OTHERS THEN
  -- Si falla pg_net, guardamos como notificación en la app
  INSERT INTO public.admin_notifications (type, title, body, data)
  VALUES (
    'monthly_report',
    '📊 Reporte mensual listo — ' || initcap(month_label),
    'El reporte de ' || initcap(month_label) || ' está disponible en el panel de Análisis.',
    jsonb_build_object('month', report_month)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. pg_cron jobs
-- Chequeo de asistencia: cada 30 min en horario laboral (lun-vie 8-20hs ARG = 11-23 UTC)
SELECT cron.schedule(
  'check-attendance-30min',
  '*/30 11-23 * * 1-6',
  $$SELECT public.check_daily_attendance();$$
);

-- Reporte mensual: 1ro de cada mes a las 8am ARG (11:00 UTC)
SELECT cron.schedule(
  'monthly-attendance-report',
  '0 11 1 * *',
  $$SELECT public.send_monthly_report();$$
);
