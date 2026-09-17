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
  const today = new Date().toISOString().split('T')[0];

  // 1. Close all currently active schedules (set effective_to = yesterday)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString().split('T')[0];

  await supabase
    .from('schedules')
    .update({ effective_to: yesterdayISO })
    .eq('employee_id', employeeId)
    .is('effective_to', null); // only currently active ones

  // 2. Insert new schedule rows effective from today
  const rows = Object.entries(scheduleMap).map(([dow, s]) => ({
    employee_id:       employeeId,
    day_of_week:       parseInt(dow),
    start_time:        s.start_time || s.start || '09:00',
    end_time:          s.end_time   || s.end   || '17:00',
    tolerance_minutes: s.tolerance_minutes || 0,
    active:            s.active !== false,
    effective_from:    today,
    effective_to:      null, // currently active
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('schedules').insert(rows);
    if (error) throw error;
  }
};

// Get schedule valid for a specific date (for historical analysis)
export const getScheduleForDate = async (employeeId, date) => {
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('active', true)
    .lte('effective_from', date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order('effective_from', { ascending: false });
  if (error) return {};
  const map = {};
  (data || []).forEach(s => {
    if (!map[s.day_of_week]) map[s.day_of_week] = s; // take most recent
  });
  return map;
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
    .maybeSingle();
  if (error) throw error;
  return data || { name: 'Sede principal', lat: -34.6037, lng: -58.3816, radius_meters: 100 };
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
    .select('*, profiles!attendance_records_employee_id_fkey(name, avatar, email)')
    .eq('date', date)
    .order('check_in');
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
    .select('*, profiles!attendance_records_employee_id_fkey(name, avatar)')
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) throw error;
  return data || [];
};

export const getFilteredRecords = async ({ date, employeeId }) => {
  let q = supabase
    .from('attendance_records')
    .select('*, profiles!attendance_records_employee_id_fkey(name, avatar, email)')
    .order('date', { ascending: false })
    .order('check_in', { ascending: false });
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
  if (existing?.check_in) throw new Error('Ya registraste tu entrada hoy');

  if (existing) {
    // Actualizar registro existente (ej: creado por admin como ausente)
    const { data, error } = await supabase
      .from('attendance_records')
      .update({
        check_in: now,
        check_in_latitude: lat,
        check_in_longitude: lng,
        check_in_accuracy: accuracy,
        check_in_distance_meters: distanceFromHQ,
        check_in_method: 'biometric',
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
      check_in: now,
      check_in_latitude: lat,
      check_in_longitude: lng,
      check_in_accuracy: accuracy,
      check_in_distance_meters: distanceFromHQ,
      check_in_method: 'biometric',
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
  if (!existing?.check_in) throw new Error('No tenés entrada registrada hoy');
  if (existing?.check_out) throw new Error('Ya registraste tu salida hoy');

  const now = new Date().toISOString();
  const minutesWorked = Math.round((new Date(now) - new Date(existing.check_in)) / 60000);

  const { data, error } = await supabase
    .from('attendance_records')
    .update({
      check_out: now,
      check_out_latitude: lat,
      check_out_longitude: lng,
      check_out_accuracy: accuracy,
      check_out_distance_meters: distanceFromHQ,
      check_out_method: 'biometric',
      minutes_worked: minutesWorked,
    })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ─── TAREAS ───────────────────────────────────────────────────────────────────
export const TASK_PRIORITIES = {
  low:    { label:'Baja',    color:'gray',   icon:'▽' },
  normal: { label:'Normal',  color:'blue',   icon:'○' },
  high:   { label:'Alta',    color:'orange', icon:'△' },
  urgent: { label:'Urgente', color:'red',    icon:'⚡' },
};

export const getMyTasks = async (employeeId) => {
  const { data, error } = await supabase.from('tasks')
    .select('*, profiles!tasks_created_by_fkey(name,avatar)')
    .eq('assigned_to', employeeId).neq('status', 'done')
    .order('priority', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const getAllTasks = async () => {
  const { data, error } = await supabase.from('tasks')
    .select('*, profiles!tasks_assigned_to_fkey(name,avatar), creator:profiles!tasks_created_by_fkey(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createTask = async ({ title, description, assignedTo, dueDate, priority, createdBy }) => {
  const { data, error } = await supabase.from('tasks')
    .insert({ title, description, assigned_to:assignedTo, due_date:dueDate||null, priority:priority||'normal', created_by:createdBy, status:'pending' })
    .select().single();
  if (error) throw error;
  return data;
};

export const updateTaskStatus = async (id, status, notes='') => {
  const patch = { status, updated_at: new Date().toISOString() };
  if (status === 'done') { patch.completed_at = new Date().toISOString(); patch.notes = notes||''; }
  const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteTask = async (id) => {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
};

// ─── ALERTAS ─────────────────────────────────────────────────────────────────
export const runAlerts = async () => {
  const { data } = await supabase.rpc('run_alerts');
  return data;
};

export const getAlertConfig = async () => {
  const { data } = await supabase.from('alert_config').select('*').order('type');
  return data || [];
};

export const updateAlertConfig = async (type, updates) => {
  const { error } = await supabase.from('alert_config').update(updates).eq('type', type);
  if (error) throw error;
};

// ─── VACACIONES ──────────────────────────────────────────────────────────────

// Calcula días de vacaciones según LCT (días corridos)
export const calcVacationDays = (hireDate, referenceDate = new Date()) => {
  if (!hireDate) return 0;
  const hire = new Date(hireDate);
  const ref  = new Date(referenceDate);
  const totalDays = Math.floor((ref - hire) / (1000*60*60*24));
  const totalMonths = (ref.getFullYear() - hire.getFullYear())*12 + (ref.getMonth() - hire.getMonth());
  const years = Math.floor(totalMonths / 12);

  if (totalMonths < 6) return Math.min(Math.floor(totalDays / 20), 14);
  if (years < 5)  return 14;
  if (years < 10) return 21;
  if (years < 20) return 28;
  return 35;
};

// ─── LICENCIAS ESPECIALES ────────────────────────────────────────────────────
export const LEAVE_TYPES = {
  sick:        { label:'Enfermedad',           icon:'🤒', color:'red',    lctDays: null, hint:'3 meses si < 5 años de antigüedad, 6 meses si ≥ 5 años (LCT art.208)' },
  maternity:   { label:'Maternidad',           icon:'🤱', color:'pink',   lctDays: 90,   hint:'90 días corridos (LCT art.177)' },
  paternity:   { label:'Paternidad',           icon:'👶', color:'blue',   lctDays: 2,    hint:'2 días corridos (LCT art.158)' },
  bereavement: { label:'Duelo familiar',       icon:'🕯️', color:'gray',   lctDays: null, hint:'3 días (cónyuge/hijo/padre) o 1 día (hermano) (LCT art.158)' },
  marriage:    { label:'Casamiento',           icon:'💍', color:'purple', lctDays: 10,   hint:'10 días corridos (LCT art.158)' },
  exam:        { label:'Examen universitario', icon:'📚', color:'green',  lctDays: 2,    hint:'2 días corridos por examen, máximo 10 días por año (LCT art.158)' },
  other:       { label:'Otro',                 icon:'📋', color:'gray',   lctDays: null, hint:'Licencia especial acordada con la empresa' },
};

export const getLeaveRequests = async (employeeId) => {
  let q = supabase.from('leave_requests')
    .select('*, profiles!leave_requests_employee_id_fkey(name,avatar)')
    .order('created_at', { ascending:false });
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

export const getAllLeaveRequests = async () => {
  const { data, error } = await supabase.from('leave_requests')
    .select('*, profiles!leave_requests_employee_id_fkey(name,avatar,hire_date)')
    .order('created_at', { ascending:false });
  if (error) throw error;
  return data || [];
};

export const createLeaveRequest = async ({ employeeId, type, subtype, startDate, endDate, reason, createdBy='employee' }) => {
  const days = Math.round((new Date(endDate)-new Date(startDate))/(1000*60*60*24))+1;
  const { data, error } = await supabase.from('leave_requests')
    .insert({ employee_id:employeeId, type, subtype:subtype||null, start_date:startDate, end_date:endDate, days, reason, created_by:createdBy, status: createdBy==='admin'?'approved':'pending' })
    .select().single();
  if (error) throw error;
  if (createdBy === 'employee') {
    try { await supabase.from('admin_notifications').insert({
      type:'leave_request',
      title:`${LEAVE_TYPES[type]?.icon||'📋'} ${data.days} días — ${LEAVE_TYPES[type]?.label}`,
      body:`Solicitud de licencia del ${new Date(startDate+'T12:00:00').toLocaleDateString('es-AR')} al ${new Date(endDate+'T12:00:00').toLocaleDateString('es-AR')}`,
      data:{ employeeId, type, days },
    }); } catch(e) {}
  }
  return data;
};

export const updateLeaveRequest = async (id, { startDate, endDate, reason }) => {
  const days = Math.round((new Date(endDate)-new Date(startDate))/(1000*60*60*24))+1;
  const { data, error } = await supabase.from('leave_requests')
    .update({ start_date:startDate, end_date:endDate, days, reason })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const reviewLeaveRequest = async (id, status, adminNote, adminId) => {
  const { data, error } = await supabase.from('leave_requests')
    .update({ status, admin_note:adminNote||null, reviewed_by:adminId, reviewed_at:new Date().toISOString() })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const cancelLeaveRequest = async (id) => {
  const { error } = await supabase.from('leave_requests').update({ status:'cancelled' }).eq('id', id);
  if (error) throw error;
};

export const getLctDays = (type, subtype, seniority_years = 0) => {
  if (type === 'sick') return seniority_years >= 5 ? 180 : 90;
  if (type === 'bereavement') return subtype === 'sibling' ? 1 : 3;
  return LEAVE_TYPES[type]?.lctDays || null;
};

export const calcSeniority = (hireDate) => {
  if (!hireDate) return { years:0, months:0, label:'Sin fecha de alta' };
  const hire = new Date(hireDate);
  const now  = new Date();
  const months = (now.getFullYear()-hire.getFullYear())*12+(now.getMonth()-hire.getMonth());
  const years  = Math.floor(months/12);
  const rem    = months%12;
  if (months < 6) return { years:0, months, label:`${months} meses` };
  if (years === 0) return { years:0, months, label:`${months} meses` };
  return { years, months:rem, label:`${years} año${years!==1?'s':''} ${rem>0?`y ${rem} mes${rem!==1?'es':''}`:''}` };
};

export const getVacationBalance = async (employeeId, year) => {
  const y = year || new Date().getFullYear();
  const { data } = await supabase.from('vacation_balance')
    .select('*').eq('employee_id', employeeId).eq('year', y).maybeSingle();
  return data;
};

export const upsertVacationBalance = async (employeeId, year, updates) => {
  const { data, error } = await supabase.from('vacation_balance')
    .upsert({ employee_id:employeeId, year, ...updates }, { onConflict:'employee_id,year' })
    .select().single();
  if (error) throw error;
  return data;
};

export const getVacationRequests = async (employeeId) => {
  let q = supabase.from('vacation_requests')
    .select('*, profiles!vacation_requests_employee_id_fkey(name,avatar)')
    .order('created_at', { ascending:false });
  if (employeeId) q = q.eq('employee_id', employeeId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

export const getAllVacationRequests = async () => {
  const { data, error } = await supabase.from('vacation_requests')
    .select('*, profiles!vacation_requests_employee_id_fkey(name,avatar,hire_date)')
    .order('created_at', { ascending:false });
  if (error) throw error;
  return data || [];
};

export const createVacationRequest = async ({ employeeId, startDate, endDate, reason }) => {
  const days = Math.round((new Date(endDate) - new Date(startDate)) / (1000*60*60*24)) + 1;
  const { data, error } = await supabase.from('vacation_requests')
    .insert({ employee_id:employeeId, start_date:startDate, end_date:endDate, days, reason, status:'pending' })
    .select().single();
  if (error) throw error;
  // Add admin notification
  try { await supabase.from('admin_notifications').insert({
    type:'vacation_request',
    title:`🏖️ Solicitud de vacaciones`,
    body:`${days} días corridos del ${new Date(startDate+'T12:00:00').toLocaleDateString('es-AR')} al ${new Date(endDate+'T12:00:00').toLocaleDateString('es-AR')}`,
    data:{ employeeId, startDate, endDate, days },
  }); } catch(e) {}
  return data;
};

// Auto-sync vacation balance from approved requests
export const syncVacationBalance = async (employeeId, year) => {
  const y = year || new Date().getFullYear();
  // Get all approved requests for this employee in this year
  const { data: approved } = await supabase.from('vacation_requests')
    .select('days, start_date, end_date, status')
    .eq('employee_id', employeeId)
    .in('status', ['approved'])
    .gte('start_date', `${y}-01-01`)
    .lte('start_date', `${y}-12-31`);

  const today = new Date().toISOString().split('T')[0];
  let taken = 0, pending = 0;
  (approved||[]).forEach(r => {
    if (r.end_date <= today) taken += r.days;
    else pending += r.days;
  });

  // Get total days from balance or calc from profile
  const { data: bal } = await supabase.from('vacation_balance')
    .select('days_total, employee_id').eq('employee_id', employeeId).eq('year', y).maybeSingle();

  const days_total = bal?.days_total || 0;
  await supabase.from('vacation_balance')
    .upsert({ employee_id:employeeId, year:y, days_total, days_taken:taken, days_pending:pending },
      { onConflict:'employee_id,year' });
  return { days_total, days_taken:taken, days_pending:pending };
};

export const updateVacationRequest = async (id, { startDate, endDate, reason }) => {
  const days = Math.round((new Date(endDate)-new Date(startDate))/(1000*60*60*24))+1;
  const { data, error } = await supabase.from('vacation_requests')
    .update({ start_date:startDate, end_date:endDate, days, reason })
    .eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const reviewVacationRequest = async (requestId, status, adminNote, adminId) => {
  const { data, error } = await supabase.from('vacation_requests')
    .update({ status, admin_note:adminNote||null, reviewed_by:adminId, reviewed_at:new Date().toISOString() })
    .eq('id', requestId).select().single();
  if (error) throw error;
  // Auto-sync balance
  if (data?.employee_id) {
    const year = new Date(data.start_date).getFullYear();
    await syncVacationBalance(data.employee_id, year).catch(()=>{});
  }
  return data;
};

export const cancelVacationRequest = async (requestId) => {
  const { error } = await supabase.from('vacation_requests')
    .update({ status:'cancelled' }).eq('id', requestId);
  if (error) throw error;
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
// Send email notification via Supabase (uses Edge Function or direct email)
// We use a simple approach: insert into a notifications table that triggers an email
export const notifyAdminLate = async (employeeName, minutesLate, expectedTime, adminEmail) => {
  // Store notification in DB so admin sees it in the app
  const { error } = await supabase.from('admin_notifications').insert({
    type: 'late_arrival',
    title: `⏰ ${employeeName} llegó tarde`,
    body: `Llegó ${minutesLate} minutos después de las ${expectedTime}`,
    read: false,
    data: { employeeName, minutesLate, expectedTime },
  });
  if (error) console.error('Notification error:', error);
};

export const notifyAdminAbsent = async (employeeName, expectedTime) => {
  const { error } = await supabase.from('admin_notifications').insert({
    type: 'absent',
    title: `✗ ${employeeName} no registró entrada`,
    body: `Debía entrar a las ${expectedTime} y aún no registró asistencia`,
    read: false,
    data: { employeeName, expectedTime },
  });
  if (error) console.error('Notification error:', error);
};

export const getAdminNotifications = async () => {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return data || [];
};

export const markNotificationRead = async (id) => {
  await supabase.from('admin_notifications').update({ read: true }).eq('id', id);
};

export const markAllNotificationsRead = async () => {
  await supabase.from('admin_notifications').update({ read: true }).eq('read', false);
};

// ─── WEEKLY HOURS ─────────────────────────────────────────────────────────────
export const getWeekRecords = async (employeeId) => {
  // Get Mon-Sun of current week
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMon);
  monday.setHours(0,0,0,0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const start = monday.toISOString().split('T')[0];
  const end = sunday.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) return [];
  return data || [];
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
// ─── PASSWORD RESET ───────────────────────────────────────────────────────────
export const sendPasswordReset = async (email) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/?reset=1',
  });
  if (error) throw error;
};

export const updatePassword = async (newPassword) => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

// Admin reset employee password via RPC
export const adminResetPassword = async (empId, newPassword) => {
  const { error } = await supabase.rpc('admin_update_employee_password', {
    p_user_id: empId,
    p_new_password: newPassword,
  });
  if (error) {
    // Fallback: update profile with a flag so employee must change on next login
    await supabase.from('profiles').update({ must_change_password: true }).eq('id', empId);
    throw new Error('No se pudo cambiar la contraseña automáticamente. El empleado debe usar "Olvidé mi contraseña".');
  }
};

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
export const getEmployeePayroll = async (employeeId, month) => {
  const { data, error } = await supabase
    .from('payroll')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const getEmployeeExtraHours = async (employeeId, month) => {
  const start = month + '-01';
  const [y, m] = month.split('-').map(Number);
  const end = new Date(y, m, 0).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('extra_hours')
    .select('*')
    .eq('employee_id', employeeId)
    .gte('date', start)
    .lte('date', end)
    .order('date');
  if (error) throw error;
  return data || [];
};

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
