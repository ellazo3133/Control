# Control de Asistencia — El Lazo

Sistema de control de asistencia con GPS + Biometría (WebAuthn), construido con React + Supabase.

## Stack
- **Frontend**: React 18 + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + Auth + RLS)
- **Auth**: Supabase Auth (email/password)
- **Biometría**: WebAuthn / Passkeys (huella + Face ID)
- **GPS**: Web Geolocation API con radio configurable

## Seguridad
- ✅ Contraseñas hasheadas por Supabase Auth (bcrypt)
- ✅ Row Level Security en todas las tablas
- ✅ Empleados no pueden ver datos de otros
- ✅ Admin crea empleados (no auto-registro público)
- ✅ GPS verifica presencia física (100m radio)
- ✅ Biometría verifica identidad (huella/Face ID del dispositivo)
- ✅ Auditoría completa de cambios del admin
- ✅ Fechas en timezone Argentina

## Setup

### 1. Supabase — Aplicar migraciones
Desde el SQL Editor de Supabase, correr en orden:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_triggers_and_functions.sql`

### 2. Crear usuario admin
En Supabase → Authentication → Users → Invite user:
- Email: admin@tuempresa.com
- Luego en SQL Editor:
```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@tuempresa.com';
```

### 3. Configurar sede
El admin entra, va a Config → detecta su ubicación o ingresa coords manualmente.

### 4. Deploy (Vercel recomendado)
```bash
npm install
npm run build
# Deploy en Vercel / Netlify con las variables de entorno
```

Variables de entorno necesarias:
```
REACT_APP_SUPABASE_URL=https://qgmjbtkphgmahsvgefyc.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...
```

## ⚠️ Nota sobre WebAuthn
La biometría requiere HTTPS para funcionar. En localhost funciona con `http://localhost`.
Para producción, deployar con HTTPS (Vercel/Netlify lo hace automáticamente).

## Flujo del empleado
1. Login con email/password (asignado por admin)
2. Primera vez: registrar biometría (huella/Face ID)
3. Para entrar: GPS → Biometría → ✓ Entrada registrada
4. Para salir: GPS → Biometría → ✓ Salida registrada

## Flujo del admin
1. Login con cuenta admin
2. Crear empleados (con email, contraseña y horario)
3. Configurar sede (coords GPS + radio)
4. Ver panel diario de asistencia
5. Editar registros (con auditoría automática)
6. Agregar feriados
7. Ver análisis mensual por empleado
