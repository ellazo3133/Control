-- ─── TRIGGER: crear profile automáticamente al registrarse ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  user_role TEXT;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');

  INSERT INTO public.profiles (id, name, email, role, avatar)
  VALUES (
    NEW.id,
    user_name,
    NEW.email,
    user_role,
    upper(substring(regexp_replace(user_name, '[^a-zA-ZáéíóúÁÉÍÓÚñÑ ]', '', 'g') FROM 1 FOR 1)) ||
    COALESCE(upper(substring(regexp_replace(split_part(user_name,' ',2), '[^a-zA-ZáéíóúÁÉÍÓÚñÑ]', '', 'g') FROM 1 FOR 1)), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── FUNCIÓN: admin crea empleado ────────────────────────────
-- El admin no puede usar signUp directamente para otros.
-- Esta función RPC corre con privilegios elevados (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_name TEXT,
  p_email TEXT,
  p_password TEXT
) RETURNS UUID AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Solo admins pueden llamar esto
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Crear usuario en auth.users
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, role, aud, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('name', p_name, 'role', 'employee'),
    'authenticated',
    'authenticated',
    NOW(), NOW(),
    '', '', '', ''
  )
  RETURNING id INTO new_user_id;

  RETURN new_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── FUNCIÓN: reportes de asistencia ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_monthly_stats(
  p_employee_id UUID,
  p_month TEXT  -- 'YYYY-MM'
) RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'scheduled',   COUNT(*) FILTER (WHERE s.day_of_week IS NOT NULL),
    'present',     COUNT(*) FILTER (WHERE ar.status = 'present'),
    'absent',      COUNT(*) FILTER (WHERE ar.status = 'absent' OR (s.day_of_week IS NOT NULL AND ar.id IS NULL)),
    'justified',   COUNT(*) FILTER (WHERE ar.status = 'justified'),
    'late_count',  COUNT(*) FILTER (WHERE ar.minutes_late > 0),
    'total_late_mins', COALESCE(SUM(ar.minutes_late) FILTER (WHERE ar.minutes_late > 0), 0),
    'total_worked_mins', COALESCE(SUM(ar.minutes_worked), 0),
    'pct', CASE WHEN COUNT(*) FILTER (WHERE s.day_of_week IS NOT NULL) > 0
           THEN ROUND(COUNT(*) FILTER (WHERE ar.status = 'present')::NUMERIC /
                COUNT(*) FILTER (WHERE s.day_of_week IS NOT NULL) * 100)
           ELSE 0 END
  )
  INTO result
  FROM generate_series(
    to_date(p_month || '-01', 'YYYY-MM-DD'),
    (to_date(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 day')::DATE,
    '1 day'::INTERVAL
  ) AS d(day)
  LEFT JOIN public.schedules s
    ON s.employee_id = p_employee_id
    AND s.day_of_week = EXTRACT(DOW FROM d.day)
    AND s.active = true
  LEFT JOIN public.attendance_records ar
    ON ar.employee_id = p_employee_id
    AND ar.date = d.day::DATE
  WHERE s.day_of_week IS NOT NULL;  -- solo días con turno

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
