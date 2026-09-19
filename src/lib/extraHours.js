// Sistema de horas extra — fuente única de verdad
import { supabase } from './supabase';

// Cargar horas extra de un mes específico (para admin)
export const fetchExtraHoursByMonth = async (month) => {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('extra_hours')
    .select('*, profiles(id, name, avatar, salary, extra_hour_rate)')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
};

// Cargar todo el historial (para tab Hs Extra)
export const fetchAllExtraHours = async (limit = 500) => {
  const { data, error } = await supabase
    .from('extra_hours')
    .select('*, profiles(id, name, avatar, salary, extra_hour_rate)')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
};

// Guardar (insert o update)
export const saveExtraHour = async ({ id, empId, date, hours, description, multiplier, hourly_rate, approved_by }) => {
  if (id) {
    const { error } = await supabase
      .from('extra_hours')
      .update({ date, hours, description, multiplier, hourly_rate })
      .eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('extra_hours')
      .insert({ employee_id: empId, date, hours, description, multiplier, hourly_rate, approved_by });
    if (error) throw error;
  }
};

// Eliminar
export const deleteExtraHour = async (id) => {
  const { error } = await supabase.from('extra_hours').delete().eq('id', id);
  if (error) throw error;
};

// Calcular valor hora de un registro (usa hourly_rate propio, luego perfil, luego automático)
export const getEffectiveRate = (h, emp, scheduledDays) => {
  if (h?.hourly_rate && h.hourly_rate > 0) return h.hourly_rate;
  const e = emp || h?.profiles;
  if (e?.extra_hour_rate && e.extra_hour_rate > 0) return e.extra_hour_rate;
  const salary = e?.salary || 0;
  const days = scheduledDays || 20;
  return salary > 0 ? salary / (days * 8) : 0;
};

// Calcular monto de un registro
export const calcExtraAmount = (h, emp, scheduledDays) => {
  const rate = getEffectiveRate(h, emp, scheduledDays);
  return Math.round((h.hours || 0) * rate * (h.multiplier || 1));
};
