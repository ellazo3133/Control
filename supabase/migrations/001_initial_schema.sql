-- ============================================================
-- CONTROL DE ASISTENCIA — Schema completo
-- ============================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── TABLA: profiles (empleados) ─────────────────────────────
-- Ligada a auth.users de Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  avatar      TEXT,
  bio_registered    BOOLEAN DEFAULT false,
  bio_cred_id       TEXT,           -- WebAuthn credential ID
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: schedules (horarios por empleado) ────────────────
CREATE TABLE IF NOT EXISTS public.schedules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Dom, 6=Sáb
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  tolerance_minutes SMALLINT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, day_of_week)
);

-- ─── TABLA: holidays (feriados) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.holidays (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date        DATE NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_by  UUID REFERENCES public.profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: attendance_records (registros de asistencia) ─────
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date            DATE NOT NULL,

  -- Check-in
  check_in_at         TIMESTAMPTZ,
  check_in_lat        DOUBLE PRECISION,
  check_in_lng        DOUBLE PRECISION,
  check_in_accuracy   DOUBLE PRECISION,   -- metros
  check_in_distance   DOUBLE PRECISION,   -- distancia a sede en metros
  check_in_bio_cred   TEXT,               -- credencial usada

  -- Check-out
  check_out_at        TIMESTAMPTZ,
  check_out_lat       DOUBLE PRECISION,
  check_out_lng       DOUBLE PRECISION,
  check_out_accuracy  DOUBLE PRECISION,
  check_out_distance  DOUBLE PRECISION,
  check_out_bio_cred  TEXT,

  -- Estado y auditoria
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('present','absent','justified','holiday','pending')),
  justification   TEXT,
  notes           TEXT,

  -- Auditoría de modificaciones admin
  edited_by       UUID REFERENCES public.profiles(id),
  edited_at       TIMESTAMPTZ,
  edit_reason     TEXT,

  -- Computed helpers (se pueden calcular pero se guardan para reportes)
  minutes_late    INTEGER DEFAULT 0,
  minutes_worked  INTEGER,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employee_id, date)
);

-- ─── TABLA: attendance_edits (historial de cambios admin) ────
CREATE TABLE IF NOT EXISTS public.attendance_edits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  record_id       UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
  edited_by       UUID NOT NULL REFERENCES public.profiles(id),
  field_changed   TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA: hq_location (sede) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.hq_location (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL DEFAULT 'Sede principal',
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  updated_by  UUID REFERENCES public.profiles(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Sede por defecto (Buenos Aires)
INSERT INTO public.hq_location (name, lat, lng, radius_meters)
VALUES ('Sede principal', -34.6037, -58.3816, 100)
ON CONFLICT DO NOTHING;

-- ─── ÍNDICES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON public.attendance_records(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_schedules_employee ON public.schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_edits_record ON public.attendance_edits(record_id);

-- ─── FUNCIONES ───────────────────────────────────────────────

-- Actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Función: calcular minutos tarde
CREATE OR REPLACE FUNCTION calc_minutes_late(
  check_in TIMESTAMPTZ,
  expected_start TIME,
  tolerance INT DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  actual_mins INT;
  expected_mins INT;
BEGIN
  IF check_in IS NULL OR expected_start IS NULL THEN RETURN 0; END IF;
  actual_mins := EXTRACT(HOUR FROM check_in AT TIME ZONE 'America/Argentina/Buenos_Aires') * 60
               + EXTRACT(MINUTE FROM check_in AT TIME ZONE 'America/Argentina/Buenos_Aires');
  expected_mins := EXTRACT(HOUR FROM expected_start) * 60 + EXTRACT(MINUTE FROM expected_start);
  RETURN GREATEST(0, actual_mins - expected_mins - tolerance);
END;
$$ LANGUAGE plpgsql;

-- ─── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_edits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_location          ENABLE ROW LEVEL SECURITY;

-- Helper: ¿es admin?
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- profiles: cada uno ve el suyo; admin ve todos
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL
  USING (is_admin());

-- schedules: empleado ve los suyos; admin todo
CREATE POLICY "schedules_select" ON public.schedules FOR SELECT
  USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "schedules_admin_all" ON public.schedules FOR ALL
  USING (is_admin());

-- attendance: empleado ve los suyos y puede insertar/actualizar el suyo; admin todo
CREATE POLICY "att_select" ON public.attendance_records FOR SELECT
  USING (employee_id = auth.uid() OR is_admin());
CREATE POLICY "att_insert" ON public.attendance_records FOR INSERT
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "att_update_own" ON public.attendance_records FOR UPDATE
  USING (employee_id = auth.uid())
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "att_admin_all" ON public.attendance_records FOR ALL
  USING (is_admin());

-- attendance_edits: solo admin
CREATE POLICY "edits_admin" ON public.attendance_edits FOR ALL
  USING (is_admin());

-- holidays: todos leen, solo admin modifica
CREATE POLICY "holidays_read" ON public.holidays FOR SELECT USING (true);
CREATE POLICY "holidays_admin" ON public.holidays FOR ALL USING (is_admin());

-- hq_location: todos leen, solo admin modifica
CREATE POLICY "hq_read" ON public.hq_location FOR SELECT USING (true);
CREATE POLICY "hq_admin" ON public.hq_location FOR ALL USING (is_admin());
