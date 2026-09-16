-- ─── LICENCIAS ESPECIALES ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN (
    'sick',           -- Enfermedad (LCT art.208: 3 meses < 5 años, 6 meses >= 5 años)
    'maternity',      -- Maternidad (LCT art.177: 90 días)
    'paternity',      -- Paternidad (LCT art.158: 2 días)
    'bereavement',    -- Duelo familiar (LCT art.158: 3 días cónyuge/hijo/padre, 1 día hermano)
    'marriage',       -- Casamiento (LCT art.158: 10 días)
    'exam',           -- Examen (LCT art.158: 2 días corridos por examen, máx 10/año)
    'other'           -- Otro
  )),
  subtype       TEXT,   -- Para duelo: 'spouse_child_parent' | 'sibling'
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          INTEGER NOT NULL,
  reason        TEXT,
  document_url  TEXT,   -- URL de certificado médico, etc.
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_note    TEXT,
  created_by    TEXT NOT NULL DEFAULT 'employee' CHECK (created_by IN ('employee','admin')),
  reviewed_by   UUID REFERENCES public.profiles(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leave_select" ON public.leave_requests FOR SELECT USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "leave_insert" ON public.leave_requests FOR INSERT WITH CHECK (employee_id = auth.uid() OR is_admin());
CREATE POLICY "leave_update_own" ON public.leave_requests FOR UPDATE USING (employee_id = auth.uid() AND status = 'pending');
CREATE POLICY "leave_admin" ON public.leave_requests FOR ALL USING (is_admin());

-- ─── TAREAS ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  assigned_to   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by    UUID NOT NULL REFERENCES public.profiles(id),
  due_date      DATE,           -- NULL = sin vencimiento
  priority      TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  completed_at  TIMESTAMPTZ,
  notes         TEXT,           -- nota del empleado al completar
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (assigned_to = auth.uid() OR created_by = auth.uid() OR is_admin());
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (is_admin() OR created_by = auth.uid());
CREATE POLICY "tasks_update_own" ON public.tasks FOR UPDATE USING (assigned_to = auth.uid() OR is_admin());
CREATE POLICY "tasks_admin" ON public.tasks FOR ALL USING (is_admin());

-- ─── ALERTAS ─────────────────────────────────────────────────────────────────

-- Configuración de alertas (qué alertas están activas)
CREATE TABLE IF NOT EXISTS public.alert_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL UNIQUE,
  enabled       BOOLEAN DEFAULT true,
  threshold     INTEGER DEFAULT 3,  -- ej: 3 tardanzas, 5 ausencias
  notify_email  BOOLEAN DEFAULT true,
  notify_app    BOOLEAN DEFAULT true
);

-- Insertar configuraciones por defecto
INSERT INTO public.alert_config (type, threshold) VALUES
  ('consecutive_lates', 3),    -- X tardanzas seguidas
  ('monthly_absences', 5),     -- X ausencias en el mes
  ('vacation_expiry', 30),     -- vacaciones vencen en X días
  ('missing_checkout', 1),     -- no registró salida
  ('birthday', 0)              -- cumpleaños del empleado
ON CONFLICT (type) DO NOTHING;

ALTER TABLE public.alert_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_config_admin" ON public.alert_config FOR ALL USING (is_admin());
CREATE POLICY "alert_config_read"  ON public.alert_config FOR SELECT USING (true);

-- Función que detecta alertas y las inserta en admin_notifications
CREATE OR REPLACE FUNCTION public.run_alerts()
RETURNS INTEGER AS $$
DECLARE
  emp         RECORD;
  cfg         RECORD;
  alert_count INTEGER := 0;
  today       DATE := CURRENT_DATE;
  month_start DATE := DATE_TRUNC('month', today)::DATE;
  abs_count   INTEGER;
  late_streak INTEGER;
  vac_bal     RECORD;
  days_left   INTEGER;
BEGIN
  -- 1. TARDANZAS CONSECUTIVAS
  SELECT threshold INTO cfg FROM public.alert_config WHERE type='consecutive_lates' AND enabled=true;
  IF FOUND THEN
    FOR emp IN SELECT id, name FROM public.profiles WHERE active=true AND role='employee' LOOP
      SELECT COUNT(*) INTO late_streak
      FROM (
        SELECT date FROM public.attendance_records
        WHERE employee_id=emp.id AND minutes_late > 0
          AND date >= today - (cfg.threshold * 2)
        ORDER BY date DESC LIMIT cfg.threshold
      ) sub;
      IF late_streak >= cfg.threshold THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_notifications
          WHERE type='alert_consecutive_lates'
            AND (data->>'employeeId')=emp.id::TEXT
            AND created_at::date = today
        ) THEN
          INSERT INTO public.admin_notifications(type,title,body,data) VALUES
            ('alert_consecutive_lates',
             '⚠️ ' || emp.name || ' — ' || cfg.threshold || ' tardanzas seguidas',
             'Revisá su situación de puntualidad',
             jsonb_build_object('employeeId',emp.id,'employeeName',emp.name,'count',cfg.threshold));
          alert_count := alert_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2. AUSENCIAS MENSUALES
  SELECT threshold INTO cfg FROM public.alert_config WHERE type='monthly_absences' AND enabled=true;
  IF FOUND THEN
    FOR emp IN SELECT id, name FROM public.profiles WHERE active=true AND role='employee' LOOP
      SELECT COUNT(*) INTO abs_count
      FROM public.attendance_records
      WHERE employee_id=emp.id AND status='absent' AND date >= month_start AND date <= today;
      IF abs_count >= cfg.threshold THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.admin_notifications
          WHERE type='alert_monthly_absences'
            AND (data->>'employeeId')=emp.id::TEXT
            AND created_at >= DATE_TRUNC('month', NOW())
        ) THEN
          INSERT INTO public.admin_notifications(type,title,body,data) VALUES
            ('alert_monthly_absences',
             '⚠️ ' || emp.name || ' — ' || abs_count || ' ausencias este mes',
             'Superó el umbral de ' || cfg.threshold || ' ausencias mensuales',
             jsonb_build_object('employeeId',emp.id,'employeeName',emp.name,'count',abs_count));
          alert_count := alert_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. VACACIONES POR VENCER (días disponibles pero año corriendo)
  SELECT threshold INTO cfg FROM public.alert_config WHERE type='vacation_expiry' AND enabled=true;
  IF FOUND THEN
    IF EXTRACT(MONTH FROM today) >= 10 OR EXTRACT(MONTH FROM today) <= 4 THEN -- temporada de vacaciones
      FOR emp IN SELECT p.id, p.name FROM public.profiles p WHERE p.active=true AND p.role='employee' LOOP
        SELECT * INTO vac_bal FROM public.vacation_balance
        WHERE employee_id=emp.id AND year=EXTRACT(YEAR FROM today);
        IF FOUND THEN
          days_left := vac_bal.days_total - vac_bal.days_taken - vac_bal.days_pending;
          IF days_left > 0 THEN
            IF NOT EXISTS (
              SELECT 1 FROM public.admin_notifications
              WHERE type='alert_vacation_expiry'
                AND (data->>'employeeId')=emp.id::TEXT
                AND created_at >= DATE_TRUNC('month', NOW())
            ) THEN
              INSERT INTO public.admin_notifications(type,title,body,data) VALUES
                ('alert_vacation_expiry',
                 '🏖️ ' || emp.name || ' tiene ' || days_left || ' días de vacaciones sin usar',
                 'Temporada de vacaciones activa (oct-abr). Coordiná con el empleado.',
                 jsonb_build_object('employeeId',emp.id,'employeeName',emp.name,'daysLeft',days_left));
              alert_count := alert_count + 1;
            END IF;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN alert_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
