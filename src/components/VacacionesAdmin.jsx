import { useState, useEffect } from 'react';
import {
  getAllVacationRequests, reviewVacationRequest,
  calcVacationDays, calcSeniority, getVacationBalance, upsertVacationBalance
} from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',
    teal:'bg-teal-50 text-teal-700 border-teal-200'};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

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
        <h2 className="text-lg font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>
          Revisar solicitud
        </h2>
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="font-bold text-gray-900 text-sm">{req.profiles?.name}</p>
          <p className="text-sm text-gray-600 mt-1">
            🏖️ {req.days} días corridos
          </p>
          <p className="text-sm text-gray-600">
            {fmtDate(req.start_date)} → {fmtDate(req.end_date)}
          </p>
          {req.reason&&<p className="text-xs text-gray-400 italic mt-1">"{req.reason}"</p>}
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
            Nota para el empleado (opcional)
          </label>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
            placeholder="Aprobado, coordinalo con el equipo... / Rechazado porque..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={()=>doReview('rejected')} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold border-2 border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50">
            ✗ Rechazar
          </button>
          <button onClick={()=>doReview('approved')} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>
            ✓ Aprobar
          </button>
        </div>
        <button onClick={onClose} className="w-full text-xs text-gray-400 hover:text-gray-600">Cancelar</button>
      </div>
    </div>
  );
}

function BalanceModal({emp, onClose, onSave}) {
  const year = new Date().getFullYear();
  const [bal, setBal] = useState(null);
  const [form, setForm] = useState({ days_total:0, days_taken:0, days_pending:0, notes:'' });
  const [saving, setSaving] = useState(false);
  const vacDays = calcVacationDays(emp.hire_date);
  const seniority = calcSeniority(emp.hire_date);

  useEffect(()=>{
    getVacationBalance(emp.id, year).then(b=>{
      if(b){ setBal(b); setForm({days_total:b.days_total,days_taken:b.days_taken,days_pending:b.days_pending,notes:b.notes||''}); }
      else  { setForm(p=>({...p,days_total:vacDays})); }
    });
  },[emp.id]);

  const doSave = async () => {
    setSaving(true);
    await onSave(emp.id, year, form);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>
          Saldo de vacaciones — {emp.name}
        </h2>
        <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-gray-400">Alta</span><span className="font-bold">{fmtDate(emp.hire_date)||'Sin fecha'}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Antigüedad</span><span className="font-bold">{seniority.label}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Días según LCT</span><span className="font-bold text-sky-600">{vacDays} días corridos</span></div>
        </div>
        {[
          ['Días totales del año','days_total','Total que le corresponde (precompletado según LCT)'],
          ['Días tomados','days_taken','Ya disfrutados efectivamente'],
          ['Días aprobados pendientes','days_pending','Aprobados pero aún no tomados'],
        ].map(([label,field,hint])=>(
          <div key={field}>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">{label}</label>
            <input type="number" min="0" value={form[field]}
              onChange={e=>setForm(p=>({...p,[field]:parseInt(e.target.value)||0}))}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
          </div>
        ))}
        <div className="bg-sky-50 rounded-2xl px-4 py-2.5 flex justify-between text-sm">
          <span className="text-sky-600 font-semibold">Disponibles</span>
          <span className="font-black text-sky-700">{form.days_total - form.days_taken - form.days_pending} días</span>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Notas</label>
          <input value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))}
            placeholder="Vacaciones proporcionales, acuerdo especial..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
        </div>
        <button onClick={doSave} disabled={saving}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {saving?'Guardando...':'Guardar saldo'}
        </button>
      </div>
    </div>
  );
}

export default function VacacionesAdmin({ employees, adminId, showToast }) {
  const [requests, setRequests] = useState([]);
  const [filter,   setFilter]   = useState('pending');
  const [reviewReq,setReviewReq]= useState(null);
  const [balEmp,   setBalEmp]   = useState(null);
  const [tabV,     setTabV]     = useState('requests'); // 'requests' | 'employees'
  const year = new Date().getFullYear();

  const load = async () => {
    const data = await getAllVacationRequests().catch(()=>[]);
    setRequests(data);
  };

  useEffect(()=>{ load(); },[]);

  const handleReview = async (id, status, note) => {
    await reviewVacationRequest(id, status, note, adminId);
    await load();
    showToast(status==='approved'?'✓ Solicitud aprobada':'Solicitud rechazada', status==='approved'?'success':'warning');
  };

  const handleSaveBalance = async (empId, year, form) => {
    await upsertVacationBalance(empId, year, form);
    showToast('Saldo actualizado');
  };

  const filtered = requests.filter(r => filter==='all' || r.status===filter);
  const pendingCount = requests.filter(r=>r.status==='pending').length;

  const statusBadge = status => ({
    pending:   <Badge color="yellow">⏳ Pendiente</Badge>,
    approved:  <Badge color="green">✓ Aprobada</Badge>,
    rejected:  <Badge color="red">✗ Rechazada</Badge>,
    cancelled: <Badge color="gray">Cancelada</Badge>,
  }[status]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Vacaciones</h2>
          {pendingCount>0&&<p className="text-sm text-amber-600 font-semibold">{pendingCount} solicitud{pendingCount!==1?'es':''} pendiente{pendingCount!==1?'s':''}</p>}
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

      {/* REQUESTS TAB */}
      {tabV==='requests'&&(
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {[['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['all','Todas']].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${filter===v?'bg-sky-100 text-sky-700':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {l}
              </button>
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
                    <p className="text-sm text-gray-600">
                      🏖️ <span className="font-bold">{r.days} días</span> · {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}
                    </p>
                    {r.reason&&<p className="text-xs text-gray-400 italic mt-0.5">"{r.reason}"</p>}
                    {r.admin_note&&<p className="text-xs text-sky-600 mt-1">Nota: "{r.admin_note}"</p>}
                    <p className="text-xs text-gray-300 mt-1">
                      {new Date(r.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'})}
                    </p>
                  </div>
                  {r.status==='pending'&&(
                    <button onClick={()=>setReviewReq(r)}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 flex-shrink-0">
                      Revisar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EMPLOYEES TAB */}
      {tabV==='employees'&&(
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Hacé clic en un empleado para ver y editar su saldo de vacaciones.</p>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {employees.map(emp=>{
              const vacDays  = calcVacationDays(emp.hire_date);
              const seniority= calcSeniority(emp.hire_date);
              return (
                <div key={emp.id} className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={()=>setBalEmp(emp)}>
                  <div className="w-9 h-9 rounded-2xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {emp.avatar||'?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">
                      {emp.hire_date ? `Alta: ${fmtDate(emp.hire_date)} · ${seniority.label}` : 'Sin fecha de alta'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {emp.hire_date ? (
                      <>
                        <p className="text-sm font-black text-sky-600">{vacDays} días</p>
                        <p className="text-xs text-gray-400">este año</p>
                      </>
                    ) : (
                      <Badge color="orange">Sin alta</Badge>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {reviewReq && <ReviewModal req={reviewReq} onReview={handleReview} onClose={()=>setReviewReq(null)}/>}
      {balEmp && <BalanceModal emp={balEmp} onClose={()=>setBalEmp(null)} onSave={handleSaveBalance}/>}
    </div>
  );
}
