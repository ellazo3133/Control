import { useState, useEffect } from 'react';
import {
  getAllVacationRequests, reviewVacationRequest, updateVacationRequest,
  calcVacationDays, calcSeniority, getVacationBalance, upsertVacationBalance,
  syncVacationBalance, supabase
} from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'}) : '—';
const fmtMoney = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0);

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200'};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

const statusBadge = s => ({
  pending:   <Badge color="yellow">⏳ Pendiente</Badge>,
  approved:  <Badge color="green">✓ Aprobada</Badge>,
  rejected:  <Badge color="red">✗ Rechazada</Badge>,
  cancelled: <Badge color="gray">Cancelada</Badge>,
}[s]);

// Edit request modal
function EditRequestModal({req, onSave, onClose}) {
  const [start, setStart] = useState(req.start_date||'');
  const [end,   setEnd]   = useState(req.end_date||'');
  const [reason,setReason]= useState(req.reason||'');
  const [saving,setSaving]= useState(false);
  const days = start&&end ? Math.round((new Date(end)-new Date(start))/(1000*60*60*24))+1 : 0;

  const doSave = async () => {
    if (!start||!end||end<start) return;
    setSaving(true);
    await onSave(req.id, { startDate:start, endDate:end, reason });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Editar solicitud</h2>
        <div className="bg-gray-50 rounded-2xl p-3 text-xs text-gray-500">
          <p className="font-semibold text-gray-700">{req.profiles?.name}</p>
          <p>Solicitud original: {fmtDate(req.start_date)} → {fmtDate(req.end_date)} ({req.days} días)</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Desde</label>
            <input type="date" value={start} onChange={e=>setStart(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Hasta</label>
            <input type="date" value={end} min={start} onChange={e=>setEnd(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>
        </div>
        {days>0 && <div className="bg-sky-50 rounded-2xl p-3 text-center"><p className="text-xl font-black text-sky-700">{days} días corridos</p></div>}
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo</label>
          <input value={reason} onChange={e=>setReason(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doSave} disabled={saving||days<1}
            className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Guardando...':'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Review modal
function ReviewModal({req, onReview, onClose}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const doReview = async (status) => {
    setSaving(true);
    await onReview(req.id, status, note);
    setSaving(false);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Revisar solicitud</h2>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="font-bold text-gray-900 text-sm">{req.profiles?.name}</p>
          <p className="text-sm text-gray-600 mt-1">🏖️ {req.days} días corridos</p>
          <p className="text-sm text-gray-600">{fmtDate(req.start_date)} → {fmtDate(req.end_date)}</p>
          {req.reason&&<p className="text-xs text-gray-400 italic mt-1">"{req.reason}"</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nota (opcional)</label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>doReview('rejected')} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold border-2 border-red-200 text-red-600 bg-red-50">✗ Rechazar</button>
          <button onClick={()=>doReview('approved')} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>✓ Aprobar</button>
        </div>
      </div>
    </div>
  );
}

// Balance + history modal per employee
function BalanceModal({emp, requests, onClose, onSave, onSyncBalance}) {
  const year = new Date().getFullYear();
  const [bal, setBal] = useState(null);
  const [form, setForm] = useState({ days_total:0, days_taken:0, days_pending:0, notes:'' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const vacDays = calcVacationDays(emp.hire_date);
  const seniority = calcSeniority(emp.hire_date);
  const empReqs = requests.filter(r=>r.employee_id===emp.id);

  useEffect(()=>{
    getVacationBalance(emp.id, year).then(b=>{
      if(b){ setBal(b); setForm({days_total:b.days_total,days_taken:b.days_taken,days_pending:b.days_pending,notes:b.notes||''}); }
      else  { setForm(p=>({...p,days_total:vacDays})); }
    });
  },[emp.id]);

  const doSync = async () => {
    setSyncing(true);
    const result = await syncVacationBalance(emp.id, year);
    setForm(p=>({...p, days_taken:result.days_taken, days_pending:result.days_pending}));
    setSyncing(false);
    onSyncBalance();
  };

  const doSave = async () => {
    setSaving(true);
    await onSave(emp.id, year, form);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{emp.name}</h2>
            <p className="text-xs text-gray-400">{seniority.label} · {vacDays} días según LCT {year}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Saldo */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Saldo {year}</p>
              <button onClick={doSync} disabled={syncing}
                className="text-xs text-sky-600 font-bold px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 disabled:opacity-50">
                {syncing?'Sincronizando...':'↻ Sincronizar automático'}
              </button>
            </div>
            <p className="text-xs text-gray-400">↻ Sincronizar calcula los días tomados y pendientes a partir de las solicitudes aprobadas.</p>
            {[
              ['Días totales del año','days_total'],
              ['Días tomados','days_taken'],
              ['Días aprobados pendientes','days_pending'],
            ].map(([label,field])=>(
              <div key={field} className="flex items-center gap-3">
                <label className="text-xs text-gray-500 flex-1">{label}</label>
                <input type="number" min="0" value={form[field]}
                  onChange={e=>setForm(p=>({...p,[field]:parseInt(e.target.value)||0}))}
                  className="w-20 px-3 py-2 rounded-xl border border-gray-200 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              </div>
            ))}
            <div className="bg-sky-50 rounded-2xl px-4 py-2.5 flex justify-between text-sm">
              <span className="text-sky-600 font-semibold">Disponibles</span>
              <span className="font-black text-sky-700">{Math.max(0, form.days_total - form.days_taken - form.days_pending)} días</span>
            </div>
            <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
              placeholder="Notas (acuerdos, proporcionales...)"
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            <button onClick={doSave} disabled={saving}
              className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {saving?'Guardando...':'Guardar saldo'}
            </button>
          </div>

          {/* Historial */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Historial de solicitudes</p>
            {empReqs.length===0&&<p className="text-sm text-gray-400 text-center py-4">Sin solicitudes</p>}
            <div className="space-y-2">
              {empReqs.map(r=>(
                <div key={r.id} className="bg-gray-50 rounded-2xl px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {statusBadge(r.status)}
                        <span className="text-xs font-bold text-gray-700">{r.days} días</span>
                        <span className="text-xs text-gray-400">{new Date(r.start_date+'T12:00:00').getFullYear()}</span>
                      </div>
                      <p className="text-xs text-gray-600">{fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}</p>
                      {r.reason&&<p className="text-xs text-gray-400 italic">"{r.reason}"</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VacacionesAdmin({ employees, adminId, showToast }) {
  const [requests, setRequests] = useState([]);
  const [filter,   setFilter]   = useState('pending');
  const [reviewReq,setReviewReq]= useState(null);
  const [editReq,  setEditReq]  = useState(null);
  const [balEmp,   setBalEmp]   = useState(null);
  const [tabV,     setTabV]     = useState('requests');
  const year = new Date().getFullYear();

  const load = async () => {
    const data = await getAllVacationRequests().catch(()=>[]);
    setRequests(data);
  };
  useEffect(()=>{ load(); },[]);

  const handleReview = async (id, status, note) => {
    await reviewVacationRequest(id, status, note, adminId);
    await load();
    showToast(status==='approved'?'✓ Aprobada — saldo actualizado automáticamente':'Rechazada');
  };

  const handleEdit = async (id, updates) => {
    await updateVacationRequest(id, updates);
    await load();
    showToast('Solicitud actualizada');
  };

  const handleSaveBalance = async (empId, year, form) => {
    await upsertVacationBalance(empId, year, form);
    showToast('Saldo actualizado');
  };

  const pendingCount = requests.filter(r=>r.status==='pending').length;
  const filtered = requests.filter(r=>filter==='all'||r.status===filter);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Vacaciones</h2>
          {pendingCount>0&&<p className="text-sm text-amber-600 font-semibold">{pendingCount} pendiente{pendingCount!==1?'s':''}</p>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
        {[['requests','Solicitudes'],['employees','Por empleado']].map(([t,l])=>(
          <button key={t} onClick={()=>setTabV(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${tabV===t?'bg-white shadow-sm text-gray-900':'text-gray-500'}`}>
            {l}{t==='requests'&&pendingCount>0&&<span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-white rounded-full text-xs">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {/* REQUESTS */}
      {tabV==='requests'&&(
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['all','Todas']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold ${filter===v?'bg-sky-100 text-sky-700':'bg-gray-100 text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {filtered.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin solicitudes</p>}
            {filtered.map(r=>(
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {r.profiles?.avatar||'?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-gray-900">{r.profiles?.name}</p>
                      {statusBadge(r.status)}
                    </div>
                    <p className="text-sm text-gray-600">🏖️ <span className="font-bold">{r.days} días</span> · {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}</p>
                    {r.reason&&<p className="text-xs text-gray-400 italic mt-0.5">"{r.reason}"</p>}
                    {r.admin_note&&<p className="text-xs text-sky-600 mt-1">Nota: "{r.admin_note}"</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={()=>setEditReq(r)} className="p-2 text-gray-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl" title="Editar fechas">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    {r.status==='pending'&&(
                      <button onClick={()=>setReviewReq(r)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100">
                        Revisar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPLOYEES */}
      {tabV==='employees'&&(
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Tocá un empleado para ver su historial y editar el saldo.</p>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {employees.map(emp=>{
              const vacDays = calcVacationDays(emp.hire_date);
              const seniority = calcSeniority(emp.hire_date);
              const empReqs = requests.filter(r=>r.employee_id===emp.id&&r.status==='approved');
              const taken = empReqs.filter(r=>r.end_date<=new Date().toISOString().split('T')[0]).reduce((a,r)=>a+r.days,0);
              const pending = empReqs.filter(r=>r.end_date>new Date().toISOString().split('T')[0]).reduce((a,r)=>a+r.days,0);
              return (
                <div key={emp.id} className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={()=>setBalEmp(emp)}>
                  <div className="w-9 h-9 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {emp.avatar||'?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.hire_date?seniority.label:'Sin fecha de alta'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-0.5">
                    {emp.hire_date?(
                      <>
                        <p className="text-sm font-black text-sky-600">{vacDays} días</p>
                        {taken>0&&<p className="text-xs text-gray-400">{taken} tomados · {pending>0?`${pending} pend.`:''}</p>}
                      </>
                    ):(
                      <span className="text-xs text-amber-500 font-semibold">Sin alta</span>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reviewReq && <ReviewModal req={reviewReq} onReview={handleReview} onClose={()=>setReviewReq(null)}/>}
      {editReq   && <EditRequestModal req={editReq} onSave={handleEdit} onClose={()=>setEditReq(null)}/>}
      {balEmp    && <BalanceModal emp={balEmp} requests={requests} onClose={()=>setBalEmp(null)} onSave={handleSaveBalance} onSyncBalance={load}/>}
    </div>
  );
}
