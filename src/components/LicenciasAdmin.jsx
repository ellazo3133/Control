import { useState, useEffect } from 'react';
import { LEAVE_TYPES, getLctDays, calcSeniority, getAllLeaveRequests, createLeaveRequest, reviewLeaveRequest } from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',gray:'bg-gray-50 text-gray-500 border-gray-200'};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

const statusBadge = s => ({
  pending:   <Badge color="yellow">⏳ Pendiente</Badge>,
  approved:  <Badge color="green">✓ Aprobada</Badge>,
  rejected:  <Badge color="red">✗ Rechazada</Badge>,
  cancelled: <Badge color="gray">Cancelada</Badge>,
}[s]);

export default function LicenciasAdmin({ employees, adminId, showToast }) {
  const [requests, setRequests] = useState([]);
  const [filter,   setFilter]   = useState('pending');
  const [showNew,  setShowNew]  = useState(false);
  const [reviewReq,setReviewReq]= useState(null);
  const [reviewNote,setReviewNote]=useState('');
  const [form,     setForm]     = useState({ empId:'', type:'sick', subtype:'', start:'', end:'', reason:'' });
  const [saving,   setSaving]   = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const load = async () => { const d=await getAllLeaveRequests().catch(()=>[]); setRequests(d); };
  useEffect(()=>{ load(); },[]);

  const handleCreate = async () => {
    if (!form.empId||!form.start||!form.end) return showToast('Completá todos los campos','error');
    if (form.end<form.start) return showToast('Fecha fin inválida','error');
    setSaving(true);
    try {
      await createLeaveRequest({ employeeId:form.empId, type:form.type, subtype:form.subtype||null, startDate:form.start, endDate:form.end, reason:form.reason, createdBy:'admin' });
      setShowNew(false); setForm({empId:'',type:'sick',subtype:'',start:'',end:'',reason:''});
      await load(); showToast('✓ Licencia cargada');
    } catch(e){ showToast(e.message,'error'); }
    setSaving(false);
  };

  const handleReview = async (status) => {
    await reviewLeaveRequest(reviewReq.id, status, reviewNote, adminId);
    setReviewReq(null); setReviewNote('');
    await load(); showToast(status==='approved'?'✓ Aprobada':'Rechazada');
  };

  const pendingCount = requests.filter(r=>r.status==='pending').length;
  const filtered = requests.filter(r=>filter==='all'||r.status===filter);

  const reqDays = form.start&&form.end ? Math.round((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1 : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Licencias especiales</h2>
          {pendingCount>0&&<p className="text-sm text-amber-600 font-semibold">{pendingCount} pendiente{pendingCount!==1?'s':''}</p>}
        </div>
        <button onClick={()=>setShowNew(true)} className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          + Cargar licencia
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[['pending','Pendientes'],['approved','Aprobadas'],['rejected','Rechazadas'],['all','Todas']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold ${filter===v?'bg-sky-100 text-sky-700':'bg-gray-100 text-gray-500'}`}>{l}</button>
        ))}
      </div>

      {/* New leave form (admin) */}
      {showNew&&(
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Cargar licencia (admin)</h3>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Empleado</label>
            <select value={form.empId} onChange={e=>setForm(p=>({...p,empId:e.target.value}))} className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-gray-50">
              <option value="">Seleccioná...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Tipo</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(LEAVE_TYPES).map(([key,t])=>(
                <button key={key} onClick={()=>setForm(p=>({...p,type:key,subtype:''}))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-2xl border-2 text-xs font-bold text-left ${form.type===key?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500'}`}>
                  <span>{t.icon}</span><span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          {form.type==='bereavement'&&(
            <div className="flex gap-2">
              {[['spouse_child_parent','Cónyuge/hijo/padre (3d)'],['sibling','Hermano (1d)']].map(([v,l])=>(
                <button key={v} onClick={()=>setForm(p=>({...p,subtype:v}))} className={`flex-1 px-3 py-2 rounded-2xl border-2 text-xs font-bold ${form.subtype===v?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500'}`}>{l}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Desde</label>
              <input type="date" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))} className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/></div>
            <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Hasta</label>
              <input type="date" value={form.end} min={form.start} onChange={e=>setForm(p=>({...p,end:e.target.value}))} className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/></div>
          </div>
          {reqDays>0&&<div className="bg-sky-50 rounded-2xl p-3 text-center"><p className="text-xl font-black text-sky-700">{reqDays} días corridos</p></div>}
          <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo / nota</label>
            <input value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} placeholder="Certificado médico presentado..." className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/></div>
          <p className="text-xs text-sky-600 bg-sky-50 px-3 py-2 rounded-xl">ℹ️ Las licencias cargadas por el admin se aprueban automáticamente.</p>
          <div className="flex gap-2">
            <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
            <button onClick={handleCreate} disabled={saving} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>{saving?'Guardando...':'Cargar'}</button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {filtered.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin licencias</p>}
        {filtered.map(r=>{
          const t=LEAVE_TYPES[r.type]||LEAVE_TYPES.other;
          return(
            <div key={r.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-xl flex-shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-bold text-gray-900">{r.profiles?.name}</p>
                    {statusBadge(r.status)}
                    <span className="text-xs text-gray-400">{r.created_by==='admin'?'(Admin)':'(Empleado)'}</span>
                  </div>
                  <p className="text-sm text-gray-600">{t.label} · {r.days} días · {fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}</p>
                  {r.reason&&<p className="text-xs text-gray-400 italic mt-0.5">"{r.reason}"</p>}
                  {r.admin_note&&<p className="text-xs text-sky-600 mt-1">Nota: "{r.admin_note}"</p>}
                </div>
                {r.status==='pending'&&(
                  <button onClick={()=>{setReviewReq(r);setReviewNote('');}} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 flex-shrink-0">
                    Revisar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Review modal */}
      {reviewReq&&(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={()=>setReviewReq(null)}/>
          <div className="relative bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Revisar licencia</h2>
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="font-bold text-gray-900 text-sm">{reviewReq.profiles?.name} — {LEAVE_TYPES[reviewReq.type]?.label}</p>
              <p className="text-sm text-gray-600">{reviewReq.days} días · {fmtDate(reviewReq.start_date)} → {fmtDate(reviewReq.end_date)}</p>
              {reviewReq.reason&&<p className="text-xs text-gray-400 italic mt-1">"{reviewReq.reason}"</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nota (opcional)</label>
              <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={2}
                placeholder="Aprobado / Rechazado porque..."
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={()=>handleReview('rejected')} className="py-3 rounded-2xl text-sm font-bold border-2 border-red-200 text-red-600 bg-red-50">✗ Rechazar</button>
              <button onClick={()=>handleReview('approved')} className="py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>✓ Aprobar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
