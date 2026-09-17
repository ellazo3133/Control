import { useState, useEffect } from 'react';
import {
  calcVacationDays, calcSeniority, getVacationBalance, getVacationRequests,
  createVacationRequest, cancelVacationRequest, updateVacationRequest, localDateISO
} from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200'};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

export default function VacacionesView({ profile, hireDate }) {
  const [requests, setRequests]   = useState([]);
  const [balance,  setBalance]    = useState(null);
  const [showNew,  setShowNew]    = useState(false);
  const [form,     setForm]       = useState({ start:'', end:'', reason:'' });
  const [formErr,  setFormErr]    = useState('');
  const [saving,   setSaving]     = useState(false);
  const [toast,    setToast]      = useState(null);

  const year       = new Date().getFullYear();
  const vacDays    = calcVacationDays(hireDate);
  const seniority  = calcSeniority(hireDate);
  const taken      = balance?.days_taken  || 0;
  const pending    = balance?.days_pending || 0;
  const remaining  = vacDays - taken - pending;

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  const load = async () => {
    const [reqs, bal] = await Promise.allSettled([
      getVacationRequests(profile.id),
      getVacationBalance(profile.id, year)
    ]);
    if (reqs.status==='fulfilled') setRequests(reqs.value);
    if (bal.status==='fulfilled')  setBalance(bal.value);
  };

  useEffect(() => { load(); }, [profile.id]);

  // Days between two dates (inclusive)
  const daysBetween = (a, b) => {
    if (!a||!b) return 0;
    return Math.round((new Date(b)-new Date(a))/(1000*60*60*24))+1;
  };

  const reqDays = daysBetween(form.start, form.end);

  const handleSubmit = async () => {
    setFormErr('');
    if (!form.start || !form.end) return setFormErr('Elegí fecha de inicio y fin');
    if (form.end < form.start)    return setFormErr('La fecha de fin no puede ser antes del inicio');
    if (reqDays > remaining)      return setFormErr(`Solo tenés ${remaining} días disponibles`);
    if (reqDays < 1)              return setFormErr('Seleccioná al menos 1 día');
    if (!hireDate)                return setFormErr('Tu fecha de alta no está registrada. Consultá al admin.');
    setSaving(true);
    try {
      await createVacationRequest({ employeeId:profile.id, startDate:form.start, endDate:form.end, reason:form.reason });
      setShowNew(false); setForm({start:'',end:'',reason:''});
      await load();
      showToast('✓ Solicitud enviada al admin');
    } catch(e) { setFormErr(e.message); }
    setSaving(false);
  };

  const handleEdit = async () => {
    if (!editForm.start||!editForm.end) return;
    setSaving(true);
    try {
      await updateVacationRequest(editReq.id, { startDate:editForm.start, endDate:editForm.end, reason:editForm.reason });
      setEditReq(null);
      await load();
      showToast('✓ Solicitud actualizada');
    } catch(e){ setFormErr(e.message); }
    setSaving(false);
  };

  const handleCancel = async (id) => {
    if (!window.confirm('¿Cancelar esta solicitud?')) return;
    await cancelVacationRequest(id);
    await load();
    showToast('Solicitud cancelada');
  };

  const statusBadge = status => ({
    pending:   <Badge color="yellow">⏳ Pendiente</Badge>,
    approved:  <Badge color="green">✓ Aprobada</Badge>,
    rejected:  <Badge color="red">✗ Rechazada</Badge>,
    cancelled: <Badge color="gray">Cancelada</Badge>,
  }[status] || <Badge color="gray">{status}</Badge>);

  const tramo = () => {
    if (!hireDate) return '—';
    if (seniority.years < 5)  return 'Menos de 5 años → 14 días';
    if (seniority.years < 10) return '5 a 9 años → 21 días';
    if (seniority.years < 20) return '10 a 19 años → 28 días';
    return '20 años o más → 35 días';
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl text-white ${toast.type==='error'?'bg-red-500':'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Saldo */}
      {!hireDate ? (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 text-center">
          <p className="text-2xl mb-2">📋</p>
          <p className="font-bold text-amber-800 text-sm">Sin fecha de alta registrada</p>
          <p className="text-xs text-amber-600 mt-1">Pedile al admin que cargue tu fecha de inicio para ver tus vacaciones.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">Vacaciones {year}</h3>
              <Badge color="blue">🏖️ {vacDays} días corridos</Badge>
            </div>

            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                <span>Usados: {taken + pending} días</span>
                <span>Disponibles: {remaining} días</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden flex">
                <div className="bg-emerald-500 h-full transition-all" style={{width:`${(taken/vacDays)*100}%`}}/>
                <div className="bg-amber-400 h-full transition-all" style={{width:`${(pending/vacDays)*100}%`}}/>
              </div>
              <div className="flex gap-3 mt-2">
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"/><span className="text-xs text-gray-400">Tomados ({taken})</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-amber-400"/><span className="text-xs text-gray-400">Aprobados ({pending})</span></div>
                <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full bg-gray-200"/><span className="text-xs text-gray-400">Disponibles ({remaining})</span></div>
              </div>
            </div>
          </div>

          {/* Antigüedad info */}
          <div className="border-t border-gray-50 px-5 py-3 bg-gray-50 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Antigüedad</span>
              <span className="font-semibold text-gray-700">{seniority.label}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Alta</span>
              <span className="font-semibold text-gray-700">{fmtDate(hireDate)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Tramo LCT</span>
              <span className="font-semibold text-gray-700">{tramo()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Nueva solicitud */}
      {hireDate && remaining > 0 && !showNew && (
        <button onClick={()=>setShowNew(true)}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          🏖️ Solicitar días de vacaciones
        </button>
      )}

      {showNew && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Nueva solicitud</h3>

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
            <div className={`rounded-2xl p-3.5 text-center border ${reqDays > remaining ? 'bg-red-50 border-red-200' : 'bg-sky-50 border-sky-200'}`}>
              <p className={`text-2xl font-black ${reqDays > remaining ? 'text-red-600' : 'text-sky-700'}`}>{reqDays} días</p>
              <p className={`text-xs ${reqDays > remaining ? 'text-red-500' : 'text-sky-500'}`}>
                {reqDays > remaining ? `Superás los ${remaining} días disponibles` : `Te quedarían ${remaining - reqDays} días disponibles`}
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo (opcional)</label>
            <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}
              rows={2} placeholder="Vacaciones familiares, viaje..."
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
          </div>

          {formErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}

          <div className="flex gap-2">
            <button onClick={()=>{setShowNew(false);setFormErr('');setForm({start:'',end:'',reason:''});}}
              className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleSubmit} disabled={saving||reqDays<1||reqDays>remaining}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {saving ? 'Enviando...' : 'Solicitar'}
            </button>
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Mis solicitudes</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {requests.length===0&&<p className="text-sm text-gray-400 text-center py-8">Sin solicitudes</p>}
          {requests.map(r=>(
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {statusBadge(r.status)}
                    <span className="text-xs text-gray-400">{r.days} días corridos</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {fmtDate(r.start_date)} → {fmtDate(r.end_date)}
                  </p>
                  {r.reason&&<p className="text-xs text-gray-400 mt-0.5 italic">"{r.reason}"</p>}
                  {r.admin_note&&(
                    <p className="text-xs text-sky-600 mt-1 bg-sky-50 px-2.5 py-1.5 rounded-xl">
                      Admin: "{r.admin_note}"
                    </p>
                  )}
                </div>
                {r.status==='pending'&&(
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={()=>{setEditReq(r);setEditForm({start:r.start_date,end:r.end_date,reason:r.reason||''}); setFormErr('');}}
                      className="text-xs text-sky-500 hover:text-sky-700 px-2.5 py-1.5 rounded-xl hover:bg-sky-50">
                      Editar
                    </button>
                    <button onClick={()=>handleCancel(r.id)}
                      className="text-xs text-red-400 hover:text-red-600 px-2.5 py-1.5 rounded-xl hover:bg-red-50">
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Edit modal */}
      {editReq&&(
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
            {editForm.start&&editForm.end&&(
              <div className="bg-sky-50 rounded-2xl p-3 text-center">
                <p className="text-xl font-black text-sky-700">{Math.round((new Date(editForm.end)-new Date(editForm.start))/(1000*60*60*24))+1} días corridos</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo</label>
              <input value={editForm.reason} onChange={e=>setEditForm(p=>({...p,reason:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            {formErr&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}
            <div className="flex gap-2">
              <button onClick={()=>setEditReq(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
              <button onClick={handleEdit} disabled={saving}
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
