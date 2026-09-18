-- Permisos granulares para admins secundarios
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_permissions JSONB DEFAULT NULL;
-- NULL = sin restricciones (retrocompatible con admins existentes)
-- Para el primer admin, marcar como super
UPDATE public.profiles SET is_super_admin = true
WHERE role = 'admin'
ORDER BY created_at ASC
LIMIT 1;
