import { useState, useEffect } from 'react';
import {
  calcVacationDays, calcSeniority, getVacationBalance, getVacationRequests,
  createVacationRequest, cancelVacationRequest, updateVacationRequest, localDateISO
} from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : '—';

const statusStyle = s => ({
  pending:   { label:'Pendiente', bg:'bg-amber-50',  text:'text-amber-700',  dot:'bg-amber-400' },
  approved:  { label:'Aprobada',  bg:'bg-emerald-50',text:'text-emerald-700',dot:'bg-emerald-400'},
  rejected:  { label:'Rechazada', bg:'bg-red-50',    text:'text-red-600',    dot:'bg-red-400'   },
  cancelled: { label:'Cancelada', bg:'bg-gray-100',  text:'text-gray-400',   dot:'bg-gray-300'  },
}[s] || { label:s, bg:'bg-gray-100', text:'text-gray-500', dot:'bg-gray-300' });

export default function VacacionesView({ profile, hireDate }) {
  const [requests, setRequests]   = useState([]);
  const [balance,  setBalance]    = useState(null);
  const [showNew,  setShowNew]    = useState(false);
  const [editReq,  setEditReq]    = useState(null);
  const [editForm, setEditForm]   = useState({ start:'', end:'', reason:'' });
  const [form,     setForm]       = useState({ start:'', end:'', reason:'' });
  const [formErr,  setFormErr]    = useState('');
  const [saving,   setSaving]     = useState(false);
  const [toast,    setToast]      = useState(null);

  const year      = new Date().getFullYear();
  const vacDays   = calcVacationDays(hireDate);
  const seniority = calcSeniority(hireDate);
  const taken     = balance?.days_taken   || 0;
  const pending   = balance?.days_pending || 0;
  const available = Math.max(0, vacDays - taken - pending);

  const showToast = (msg, type='success') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 3000);
  };

  const load = async () => {
    const [reqs, bal] = await Promise.allSettled([
      getVacationRequests(profile.id),
      getVacationBalance(profile.id, year)
    ]);
    if (reqs.status==='fulfilled') setRequests(reqs.value);
    if (bal.status==='fulfilled')  setBalance(bal.value);
  };
  useEffect(()=>{ load(); }, [profile.id]);

  const reqDays  = form.start && form.end ? Math.round((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1 : 0;
  const editDays = editForm.start && editForm.end ? Math.round((new Date(editForm.end)-new Date(editForm.start))/(1000*60*60*24))+1 : 0;

  const handleSubmit = async () => {
    setFormErr('');
    if (!form.start || !form.end)   return setFormErr('Elegí fecha de inicio y fin');
    if (form.end < form.start)      return setFormErr('La fecha de fin no puede ser antes del inicio');
    if (reqDays > available)        return setFormErr(`Solo tenés ${available} días disponibles`);
    if (!hireDate)                  return setFormErr('Tu fecha de alta no está registrada. Consultá al admin.');
    setSaving(true);
    try {
      await createVacationRequest({ employeeId:profile.id, startDate:form.start, endDate:form.end, reason:form.reason });
      setShowNew(false); setForm({start:'',end:'',reason:''});
      await load(); showToast('✓ Solicitud enviada al admin');
    } catch(e) { setFormErr(e.message); }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editForm.start || !editForm.end) return;
    setSaving(true);
    try {
      await updateVacationRequest(editReq.id, { startDate:editForm.start, endDate:editForm.end, reason:editForm.reason });
      setEditReq(null);
      await load(); showToast('✓ Solicitud actualizada');
    } catch(e) { setFormErr(e.message); }
    setSaving(false);
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Cancelar esta solicitud?')) return;
    await cancelVacationRequest(id);
    await load(); showToast('Solicitud cancelada');
  };

  const tramo = () => {
    if (!hireDate) return null;
    if (seniority.years < 5)  return 'Menos de 5 años → 14 días';
    if (seniority.years < 10) return '5 a 9 años → 21 días';
    if (seniority.years < 20) return '10 a 19 años → 28 días';
    return '20 años o más → 35 días';
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl text-white transition-all ${toast.type==='error'?'bg-red-500':'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Sin fecha de alta */}
      {!hireDate && (
        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 flex items-start gap-3">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-bold text-amber-800 text-sm">Sin fecha de alta registrada</p>
            <p className="text-xs text-amber-600 mt-0.5">Pedile al admin que cargue tu fecha de ingreso para ver tus vacaciones.</p>
          </div>
        </div>
      )}

      {/* Saldo visual */}
      {hireDate && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header saldo */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900">Vacaciones {year}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{seniority.label} · {tramo()}</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-sky-600">{available}</p>
                <p className="text-xs text-gray-400">días disponibles</p>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>Total: {vacDays} días corridos</span>
                <span>Usados: {taken + pending} días</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{width:`${Math.min(100,(taken/vacDays)*100)}%`}}/>
                <div className="bg-sky-300 h-full rounded-full transition-all" style={{width:`${Math.min(100,(pending/vacDays)*100)}%`}}/>
              </div>
              <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"/><span className="text-xs text-gray-400">Tomados ({taken}d)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-sky-300"/><span className="text-xs text-gray-400">Aprobados ({pending}d)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-gray-200"/><span className="text-xs text-gray-400">Disponibles ({available}d)</span></div>
              </div>
            </div>
          </div>

          {/* Fecha de alta */}
          <div className="border-t border-gray-50 px-5 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">Alta: <span className="font-semibold text-gray-600">{fmtDate(hireDate)}</span></p>
          </div>
        </div>
      )}

      {/* Botón solicitar */}
      {hireDate && available > 0 && !showNew && (
        <button onClick={()=>setShowNew(true)}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          🏖️ Solicitar días de vacaciones
        </button>
      )}

      {/* Formulario nueva solicitud */}
      {showNew && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">Nueva solicitud</h3>
            <button onClick={()=>{setShowNew(false);setFormErr('');setForm({start:'',end:'',reason:''});}} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Desde</label>
                <input type="date" value={form.start} min={localDateISO()}
                  onChange={e=>setForm(p=>({...p,start:e.target.value}))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Hasta</label>
                <input type="date" value={form.end} min={form.start||localDateISO()}
                  onChange={e=>setForm(p=>({...p,end:e.target.value}))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
            </div>

            {reqDays > 0 && (
              <div className={`rounded-2xl p-3.5 text-center border ${reqDays > available ? 'bg-red-50 border-red-200' : 'bg-sky-50 border-sky-100'}`}>
                <p className={`text-2xl font-black ${reqDays > available ? 'text-red-600' : 'text-sky-700'}`}>{reqDays} días</p>
                <p className={`text-xs mt-0.5 ${reqDays > available ? 'text-red-500' : 'text-sky-500'}`}>
                  {reqDays > available ? `Superás los ${available} días disponibles` : `Te quedarían ${available - reqDays} días`}
                </p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo (opcional)</label>
              <input value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}
                placeholder="Vacaciones familiares, viaje..."
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>

            {formErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}

            <div className="flex gap-2">
              <button onClick={()=>{setShowNew(false);setFormErr('');setForm({start:'',end:'',reason:''}); }}
                className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving||reqDays<1||reqDays>available}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                {saving?'Enviando...':'Solicitar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial */}
      {requests.length > 0 && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="font-bold text-gray-800 text-sm">Mis solicitudes</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {requests.map(r => {
              const st = statusStyle(r.status);
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${st.dot}`}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${st.bg} ${st.text}`}>{st.label}</span>
                          <span className="text-xs font-bold text-gray-700">🏖️ {r.days} días</span>
                        </div>
                        {r.status==='pending' && (
                          <div className="flex gap-1">
                            <button onClick={()=>{setEditReq(r);setEditForm({start:r.start_date,end:r.end_date,reason:r.reason||''});setFormErr('');}}
                              className="text-xs text-sky-500 px-2.5 py-1 rounded-xl bg-sky-50 hover:bg-sky-100 font-semibold">
                              Editar
                            </button>
                            <button onClick={()=>handleCancel(r.id)}
                              className="text-xs text-red-400 px-2.5 py-1 rounded-xl hover:bg-red-50 font-semibold">
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800">
                        {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}
                      </p>
                      {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">"{r.reason}"</p>}
                      {r.admin_note && (
                        <div className="mt-2 bg-sky-50 rounded-xl px-3 py-2">
                          <p className="text-xs text-sky-700">💬 Admin: "{r.admin_note}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editReq && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setEditReq(null)}/>
          <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Editar solicitud</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Desde</label>
                <input type="date" value={editForm.start} min={localDateISO()}
                  onChange={e=>setEditForm(p=>({...p,start:e.target.value}))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Hasta</label>
                <input type="date" value={editForm.end} min={editForm.start}
                  onChange={e=>setEditForm(p=>({...p,end:e.target.value}))}
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
            </div>
            {editDays > 0 && (
              <div className="bg-sky-50 rounded-2xl p-3 text-center">
                <p className="text-xl font-black text-sky-700">{editDays} días corridos</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo</label>
              <input value={editForm.reason} onChange={e=>setEditForm(p=>({...p,reason:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            {formErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}
            <div className="flex gap-2">
              <button onClick={()=>setEditReq(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
              <button onClick={handleEdit} disabled={saving||editDays<1}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                {saving?'Guardando...':'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
