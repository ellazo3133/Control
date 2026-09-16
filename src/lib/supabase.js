import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  }
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const signUp = async (email, password, name) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'employee' }
    }
  });
  if (error) throw error;

  // El trigger de Supabase crea el profile automáticamente
  // (ver migration 002_triggers.sql)
  return data;
};

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ─── PROFILES ─────────────────────────────────────────────────────────────────
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

export const getAllProfiles = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data;
};

export const updateProfile = async (userId, updates) => {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Crear empleado desde admin (via auth admin API no disponible en cliente)
// Se usa la función RPC definida en Supabase
export const createEmployee = async (name, email, password) => {
  const { data, error } = await supabase.rpc('admin_create_employee', {
    p_name: name,
    p_email: email,
    p_password: password,
  });
  if (error) throw error;
  return data;
};

export const deactivateEmployee = async (userId) => {
  const { error } = await supabase
    .from('profiles')
    .update({ active: false })
    .eq('id', userId);
  if (error) throw error;
};

// ─── SCHEDULES ────────────────────────────────────────────────────────────────
export const getSchedules = async (employeeId) => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('active', true)
    .order('day_of_week');
  if (error) throw error;
  // Returns array indexed by day_of_week
  const map = {};
  (data || []).forEach(s => { map[s.day_of_week] = s; });
  return map;
};

export const getAllSchedules = async () => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return data || [];
};

export const upsertSchedules = async (employeeId, scheduleMap) => {
  // scheduleMap: { 0: {active,start_time,end_time}, 1: {...}, ... }
  const rows = Object.entries(scheduleMap).map(([dow, s]) => ({
    employee_id: employeeId,
    day_of_week: parseInt(dow),
    start_time: s.start_time,
    end_time: s.end_time,
    tolerance_minutes: s.tolerance_minutes || 0,
    active: s.active,
  }));

  const { error } = await supabase
    .from('schedules')
    .upsert(rows, { onConflict: 'employee_id,day_of_week' });
  if (error) throw error;
};

// ─── HOLIDAYS ─────────────────────────────────────────────────────────────────
export const getHolidays = async () => {
  const { data, error } = await supabase
    .from('holidays')
    .select('*')
    .order('date');
  if (error) throw error;
  return data || [];
};

export const addHoliday = async (date, name, createdBy) => {
  const { data, error } = await supabase
    .from('holidays')
    .insert({ date, name, created_by: createdBy })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteHoliday = async (id) => {
  const { error } = await supabase.from('holidays').delete().eq('id', id);
  if (error) throw error;
};

// ─── HQ LOCATION ──────────────────────────────────────────────────────────────
export const getHQ = async () => {
  const { data, error } = await supabase
    .from('hq_location')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
};

export const updateHQ = async (name, lat, lng, radius, updatedBy) => {
  // Delete existing and insert new (single row config)
  await supabase.from('hq_location').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { data, error } = await supabase
    .from('hq_location')
    .insert({ name, lat, lng, radius_meters: radius, updated_by: updatedBy })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
export const getTodayRecord = async (employeeId) => {
  const today = localDateISO();
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const getRecordsByEmployee = async (employeeId, limit = 30) => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('employee_id', employeeId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

export const getRecordsByDate = async (date) => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, profiles(name, avatar, email)')
    .eq('date', date)
    .order('check_in_at');
  if (error) throw error;
  return data || [];
};

export const getRecordsByMonth = async (month) => {
  // month = 'YYYY-MM'
  const start = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, 0).toISOString().split('T')[0]; // last day
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*, profiles(name, avatar)')
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) throw error;
  return data || [];
};

export const getFilteredRecords = async ({ date, employeeId }) => {
  let q = supabase
    .from('attendance_records')
    .select('*, profiles(name, avatar, email)')
    .order('date', { ascending: false })
    .order('check_in_at', { ascending: false });
  if (date) q = q.eq('date', date);
  if (employeeId && employeeId !== 'all') q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

export const checkIn = async ({ employeeId, lat, lng, accuracy, distanceFromHQ, bioCredId, minutesLate }) => {
  const today = localDateISO();
  const now = new Date().toISOString();

  // Verificar que no hay entrada hoy
  const existing = await getTodayRecord(employeeId);
  if (existing?.check_in_at) throw new Error('Ya registraste tu entrada hoy');

  if (existing) {
    // Actualizar registro existente (ej: creado por admin como ausente)
    const { data, error } = await supabase
      .from('attendance_records')
      .update({
        check_in_at: now,
        check_in_lat: lat,
        check_in_lng: lng,
        check_in_accuracy: accuracy,
        check_in_distance: distanceFromHQ,
        check_in_bio_cred: bioCredId,
        status: 'present',
        minutes_late: minutesLate || 0,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // Insertar nuevo
  const { data, error } = await supabase
    .from('attendance_records')
    .insert({
      employee_id: employeeId,
      date: today,
      check_in_at: now,
      check_in_lat: lat,
      check_in_lng: lng,
      check_in_accuracy: accuracy,
      check_in_distance: distanceFromHQ,
      check_in_bio_cred: bioCredId,
      status: 'present',
      minutes_late: minutesLate || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const checkOut = async ({ employeeId, lat, lng, accuracy, distanceFromHQ, bioCredId }) => {
  const existing = await getTodayRecord(employeeId);
  if (!existing?.check_in_at) throw new Error('No tenés entrada registrada hoy');
  if (existing?.check_out_at) throw new Error('Ya registraste tu salida hoy');

  const now = new Date().toISOString();
  const minutesWorked = Math.round((new Date(now) - new Date(existing.check_in_at)) / 60000);

  const { data, error } = await supabase
    .from('attendance_records')
    .update({
      check_out_at: now,
      check_out_lat: lat,
      check_out_lng: lng,
      check_out_accuracy: accuracy,
      check_out_distance: distanceFromHQ,
      check_out_bio_cred: bioCredId,
      minutes_worked: minutesWorked,
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Admin: editar registro con auditoría
export const adminEditRecord = async (recordId, patch, adminId, reason) => {
  // Guardar historial de cambios
  const { data: old } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('id', recordId)
    .single();

  const edits = [];
  for (const [field, newVal] of Object.entries(patch)) {
    if (old[field] !== newVal) {
      edits.push({
        record_id: recordId,
        edited_by: adminId,
        field_changed: field,
        old_value: String(old[field] ?? ''),
        new_value: String(newVal ?? ''),
        reason,
      });
    }
  }

  if (edits.length > 0) {
    await supabase.from('attendance_edits').insert(edits);
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .update({ ...patch, edited_by: adminId, edited_at: new Date().toISOString(), edit_reason: reason })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const adminAddManualRecord = async ({ employeeId, date, status, justification, adminId }) => {
  const { data: existing } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle();

  if (existing) {
    return adminEditRecord(existing.id, { status, justification }, adminId, 'Carga manual admin');
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .insert({ employee_id: employeeId, date, status, justification, edited_by: adminId, edited_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
export const localDateISO = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

export const haversine = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

export const getGeoPos = () => new Promise((res, rej) => {
  if (!navigator.geolocation) return rej(new Error('GPS no disponible'));
  navigator.geolocation.getCurrentPosition(res, err => {
    const m = { 1:'Permiso de ubicación denegado.', 2:'No se pudo obtener la ubicación.', 3:'Tiempo agotado.' };
    rej(new Error(m[err.code] || 'Error GPS'));
  }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
});

// ─── WEBAUTHN ─────────────────────────────────────────────────────────────────
// NOTA: En producción real, el challenge debe generarse y verificarse en servidor.
// Esta implementación usa el verificador del navegador (platform authenticator),
// lo que garantiza biometría local real (huella/Face ID) sin posibilidad de
// compartir — el riesgo residual es el challenge sin server-side verification.

export const registerBiometric = async (userId, userName) => {
  if (!window.PublicKeyCredential) throw new Error('Tu navegador no soporta biometría');
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Control Asistencia', id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: userName, displayName: userName },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000,
    }
  });
  return btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
};

export const verifyBiometric = async (credId) => {
  if (!window.PublicKeyCredential) throw new Error('Tu navegador no soporta biometría');
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  const allowCreds = credId
    ? [{ id: Uint8Array.from(atob(credId), c => c.charCodeAt(0)), type: 'public-key', transports: ['internal'] }]
    : [];
  await navigator.credentials.get({
    publicKey: { challenge, allowCredentials: allowCreds, userVerification: 'required', timeout: 60000 }
  });
  return true;
};
