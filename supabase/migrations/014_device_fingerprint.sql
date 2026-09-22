-- Fingerprint del dispositivo registrado por empleado
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS device_fingerprint TEXT DEFAULT NULL;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS device_mismatch BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS device_fingerprint TEXT DEFAULT NULL;
