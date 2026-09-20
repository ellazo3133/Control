import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ─── Utilidades ───────────────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';

// Calcula el monto de un registro: usa hourly_rate propio, luego extra_hour_rate del perfil, luego automático
export function calcRate(h, emp, scheduledDays) {
  if (h?.hourly_rate > 0) return h.hourly_rate;
  if (emp?.extra_hour_rate > 0) return emp.extra_hour_rate;
  const sal = emp?.salary || 0;
  const days = scheduledDays || 20;
  return sal > 0 ? sal / (days * 8) : 0;
}
export function calcMonto(h, emp, scheduledDays) {
  return Math.round((h?.hours || 0) * calcRate(h, emp, scheduledDays) * (h?.multiplier || 1));
}

// ─── Modal agregar / editar ────────────────────────────────────────────────────
function ModalHoraExtra({ employees, empSchedMap, month, editData, onClose, onDone }) {
  const defaultDate = month ? `${month}-01` : new Date().toISOString().split('T')[0];
  const [empId, setEmpId] = useState(editData?.employee_id || '');
  const [date, setDate] = useState(editData?.date || defaultDate);
  const [hours, setHours] = useState(editData?.hours?.toString() || '');
  const [desc, setDesc] = useState(editData?.description || '');
  const [mult, setMult] = useState((editData?.multiplier || 1).toString());
  const [customRate, setCustomRate] = useState(editData?.hourly_rate > 0 ? editData.hourly_rate.toString() : '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const emp = employees.find(e => e.id === empId);
  const schedDays = empSchedMap && empId ? (Object.values(empSchedMap[empId] || {}).filter(s => s?.active).length || 20) : 20;
  const autoRate = emp ? calcRate({}, emp, schedDays) : 0;
  const effectiveRate = customRate && parseFloat(customRate) > 0 ? parseFloat(customRate) : autoRate;
  const preview = effectiveRate > 0 && hours ? Math.round(parseFloat(hours) * effectiveRate * parseFloat(mult)) : 0;

  const save = async () => {
    if (!empId) return setErr('Elegí un empleado');
    if (!hours || parseFloat(hours) <= 0) return setErr('Ingresá las horas');
    if (!date) return setErr('Ingresá la fecha');
    setSaving(true); setErr('');
    try {
      const payload = {
        date,
        hours: parseFloat(hours),
        description: desc,
        multiplier: parseFloat(mult),
        hourly_rate: customRate && parseFloat(customRate) > 0 ? parseFloat(customRate) : null,
      };
      if (editData?.id) {
        const { error } = await supabase.from('extra_hours').update(payload).eq('id', editData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('extra_hours').insert({ ...payload, employee_id: empId, approved_by: null });
        if (error) throw error;
      }
      onDone();
      onClose();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{editData ? 'Editar hora extra' : 'Agregar horas extra'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        {/* Empleado */}
        {!editData ? (
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Empleado</label>
            <select value={empId} onChange={e => setEmpId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50">
              <option value="">Seleccioná...</option>
              {employees.filter(e => e.role === 'employee').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="bg-sky-50 rounded-2xl px-4 py-2.5">
            <p className="text-sm font-bold text-sky-700">{employees.find(e => e.id === empId)?.name}</p>
          </div>
        )}

        {/* Fecha y horas */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Horas</label>
            <input type="number" value={hours} onChange={e => setHours(e.target.value)}
              placeholder="Ej: 2" min="0.5" step="0.5"
              className="w-full px-3 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
        </div>

        {/* Tipo */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Tipo</label>
          <div className="grid grid-cols-3 gap-2">
            {[['1', 'Normal', 'bg-gray-100 text-gray-700'], ['1.5', '×1.5', 'bg-amber-100 text-amber-700'], ['2', 'Doble ×2', 'bg-emerald-100 text-emerald-700']].map(([v, l, cls]) => (
              <button key={v} onClick={() => setMult(v)}
                className={`py-2 rounded-xl text-xs font-bold transition-all ${mult === v ? cls + ' ring-2 ring-sky-400' : 'bg-gray-50 text-gray-400'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Valor hora */}
        {empId && (
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Valor hora (opcional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" value={customRate} onChange={e => setCustomRate(e.target.value)}
                placeholder={autoRate > 0 ? Math.round(autoRate).toLocaleString('es-AR') : 'Auto'}
                className="w-full pl-8 pr-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {customRate && parseFloat(customRate) > 0
                ? `Valor personalizado`
                : autoRate > 0 ? `Auto: ${fmt(Math.round(autoRate))}/h (sueldo ÷ días ÷ 8)` : 'Sin sueldo configurado'}
            </p>
          </div>
        )}

        {/* Descripción */}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Descripción</label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Remoto, guardia, evento..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50" />
        </div>

        {/* Preview */}
        {preview > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 flex justify-between items-center">
            <div className="text-xs text-emerald-600">
              <p className="font-bold">Total</p>
              <p>{hours}h × {fmt(Math.round(effectiveRate))}/h{parseFloat(mult) !== 1 ? ` × ${mult}` : ''}</p>
            </div>
            <p className="text-xl font-black text-emerald-700">{fmt(preview)}</p>
          </div>
        )}

        {err && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{err}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
            {saving ? 'Guardando...' : editData ? 'Guardar' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function HorasExtra({ employees, empSchedMap, month, embedded }) {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editData, setEditData] = useState(null);
  const [filterEmp, setFilterEmp] = useState('all');
  const [filterPeriod, setFilterPeriod] = useState(embedded ? 'month' : 'month');

  const [debugMsg, setDebugMsg] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    setDebugMsg('Cargando...');
    try {
      // Test auth first
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || 'NO USER';

      // Test direct query without RLS filters
      const { data: all, error: e1 } = await supabase
        .from('extra_hours')
        .select('id, employee_id, date, hours')
        .limit(5);

      setDebugMsg(`uid:${userId.slice(0,8)} | filas:${all?.length ?? 'err'} | error:${e1?.message || 'ninguno'}`);

      let q = supabase.from('extra_hours')
        .select('*, profiles(id, name, avatar, salary, extra_hour_rate)')
        .order('date', { ascending: false });

      if (embedded) {
        const [y, m] = month.split('-').map(Number);
        const start = `${month}-01`;
        const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
        q = q.gte('date', start).lte('date', end);
      } else {
        const desde = new Date();
        desde.setFullYear(desde.getFullYear() - 1);
        q = q.gte('date', desde.toISOString().split('T')[0]);
      }

      const { data, error } = await q;
      if (error) throw error;
      setRegistros(data || []);
      setDebugMsg(`uid:${userId.slice(0,8)} | filas:${data?.length ?? 0} | ok`);
    } catch (e) {
      setDebugMsg(`ERROR: ${e.message}`);
      console.error('HorasExtra.cargar:', e);
    }
    setLoading(false);
  }, [month, embedded]);

  useEffect(() => { cargar(); }, [cargar]);

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;
    await supabase.from('extra_hours').delete().eq('id', id);
    cargar();
  };

  // Filtros
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const weekISO = weekStart.toISOString().split('T')[0];

  let filtrados = registros;
  if (filterEmp !== 'all') filtrados = filtrados.filter(h => h.employee_id === filterEmp);
  if (!embedded) {
    if (filterPeriod === 'week') filtrados = filtrados.filter(h => h.date >= weekISO);
    else if (filterPeriod === 'month') filtrados = filtrados.filter(h => h.date.startsWith(thisMonth));
    else if (filterPeriod === 'lastmonth') filtrados = filtrados.filter(h => h.date.startsWith(lastMonth));
  }

  // Totales
  const totalHoras = filtrados.reduce((a, h) => a + (h.hours || 0), 0);
  const totalMonto = filtrados.reduce((a, h) => {
    const emp = employees.find(e => e.id === h.employee_id) || h.profiles;
    const days = empSchedMap ? (Object.values(empSchedMap[h.employee_id] || {}).filter(s => s?.active).length || 20) : 20;
    return a + calcMonto(h, emp, days);
  }, 0);

  // Agrupado por empleado
  const porEmpleado = {};
  filtrados.forEach(h => {
    if (!porEmpleado[h.employee_id]) porEmpleado[h.employee_id] = [];
    porEmpleado[h.employee_id].push(h);
  });

  return (
    <div className={embedded ? '' : 'space-y-4'}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display',serif" }}>Horas extra</h2>
            <p className="text-sm text-gray-400">Historial de horas extra y remoto</p>
          </div>
          <button onClick={() => { setEditData(null); setShowModal(true); }}
            className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
            + Agregar
          </button>
        </div>
      )}

      {/* Filtros — solo en tab independiente */}
      {!embedded && (
        <div className="flex gap-2 flex-wrap">
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
            className="flex-1 px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-white">
            <option value="all">Todos los empleados</option>
            {employees.filter(e => e.role === 'employee').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <div className="flex rounded-2xl border border-gray-200 overflow-hidden bg-white">
            {[['week', 'Esta semana'], ['month', 'Este mes'], ['lastmonth', 'Mes ant.'], ['all', 'Todo']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterPeriod(v)}
                className={`px-3 py-2.5 text-xs font-bold transition-all ${filterPeriod === v ? 'bg-sky-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Debug banner - remove after fix */}
      {debugMsg && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-2">
          <p className="text-xs font-mono text-orange-700 break-all">{debugMsg}</p>
        </div>
      )}

      {/* Resumen */}
      {filtrados.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
            <p className="text-xl font-black text-sky-600">{filtrados.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Registros</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
            <p className="text-xl font-black text-violet-600">{totalHoras.toFixed(1)}h</p>
            <p className="text-xs text-gray-400 mt-0.5">Horas</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-3.5 text-center">
            <p className="text-base font-black text-emerald-600">{fmt(totalMonto)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total</p>
          </div>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-3xl border border-gray-100 p-10 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm font-bold text-gray-700">Sin horas extra</p>
          <p className="text-xs text-gray-400 mt-1">
            {embedded ? 'No hay registros para este mes' : 'No hay registros para este filtro'}
          </p>
          {embedded && (
            <button onClick={() => { setEditData(null); setShowModal(true); }}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#059669,#0d9488)' }}>
              + Agregar hora extra
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden">
          {Object.entries(porEmpleado).map(([empId, hrs]) => {
            const emp = employees.find(e => e.id === empId) || hrs[0]?.profiles;
            const days = empSchedMap ? (Object.values(empSchedMap[empId] || {}).filter(s => s?.active).length || 20) : 20;
            const subtotal = hrs.reduce((a, h) => a + calcMonto(h, emp, days), 0);
            const totalH = hrs.reduce((a, h) => a + (h.hours || 0), 0);
            const initials = emp?.avatar || (emp?.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

            return (
              <div key={empId} className="border-b border-gray-50 last:border-0">
                {/* Header del empleado */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-black flex-shrink-0">
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{emp?.name || 'Empleado'}</p>
                      <p className="text-xs text-gray-400">{totalH.toFixed(1)}h total</p>
                    </div>
                  </div>
                  <p className="text-sm font-black text-emerald-600">{fmt(subtotal)}</p>
                </div>

                {/* Registros */}
                {hrs.map(h => {
                  const monto = calcMonto(h, emp, days);
                  const rate = calcRate(h, emp, days);
                  return (
                    <div key={h.id} className="flex items-center gap-3 px-5 py-3.5 border-t border-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-gray-800">{h.hours}h</span>
                          {h.multiplier !== 1 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-lg font-bold">×{h.multiplier}</span>}
                          {h.hourly_rate > 0 && <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-lg font-bold">$ personalizada</span>}
                          {h.description && <span className="text-xs text-gray-500">— {h.description}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(h.date)} · {fmt(Math.round(rate))}/h</p>
                      </div>
                      <p className="text-sm font-black text-emerald-600 flex-shrink-0">{fmt(monto)}</p>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setEditData(h); setShowModal(true); }}
                          className="p-1.5 text-gray-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => eliminar(h.id)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ModalHoraExtra
          employees={employees}
          empSchedMap={empSchedMap}
          month={month}
          editData={editData}
          onClose={() => { setShowModal(false); setEditData(null); }}
          onDone={cargar}
        />
      )}
    </div>
  );
}
