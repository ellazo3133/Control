import { useState, useEffect } from 'react';
import { LEAVE_TYPES, getLctDays, calcSeniority, getLeaveRequests, createLeaveRequest, localDateISO } from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',
    pink:'bg-pink-50 text-pink-700 border-pink-200',orange:'bg-orange-50 text-orange-700 border-orange-200'};
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

const statusBadge = s => ({
  pending:   <Badge color="yellow">⏳ Pendiente</Badge>,
  approved:  <Badge color="green">✓ Aprobada</Badge>,
  rejected:  <Badge color="red">✗ Rechazada</Badge>,
  cancelled: <Badge color="gray">Cancelada</Badge>,
}[s] || <Badge color="gray">{s}</Badge>);

export default function LicenciasView({ profile, hireDate }) {
  const [requests, setRequests] = useState([]);
  const [showNew,  setShowNew]  = useState(false);
  const [form,     setForm]     = useState({ type:'sick', subtype:'', start:'', end:'', reason:'' });
  const [formErr,  setFormErr]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  const seniority = calcSeniority(hireDate);
  const lctDays   = getLctDays(form.type, form.subtype, seniority.years);
  const reqDays   = form.start && form.end ? Math.round((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1 : 0;
  const selectedType = LEAVE_TYPES[form.type];

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const load = async () => { const d = await getLeaveRequests(profile.id).catch(()=>[]); setRequests(d); };
  useEffect(()=>{ load(); },[profile.id]);

  const handleSubmit = async () => {
    setFormErr('');
    if (!form.type) return setFormErr('Elegí el tipo de licencia');
    if (!form.start || !form.end) return setFormErr('Elegí fechas de inicio y fin');
    if (form.end < form.start) return setFormErr('La fecha de fin no puede ser antes del inicio');
    if (lctDays && reqDays > lctDays) return setFormErr(`La ley otorga máximo ${lctDays} días para este tipo de licencia`);
    setSaving(true);
    try {
      await createLeaveRequest({ employeeId:profile.id, type:form.type, subtype:form.subtype||null, startDate:form.start, endDate:form.end, reason:form.reason, createdBy:'employee' });
      setShowNew(false); setForm({type:'sick',subtype:'',start:'',end:'',reason:''});
      await load(); showToast('✓ Solicitud enviada');
    } catch(e) { setFormErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {toast&&<div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl text-white ${toast.type==='error'?'bg-red-500':'bg-emerald-500'}`}>{toast.msg}</div>}

      {/* LCT reference */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 text-sm mb-3">Licencias según la ley 🇦🇷</h3>
        <div className="space-y-2">
          {Object.entries(LEAVE_TYPES).filter(([k])=>k!=='other').map(([key,t])=>(
            <div key={key} className="flex items-start gap-2.5 py-2 border-b border-gray-50 last:border-0">
              <span className="text-lg flex-shrink-0">{t.icon}</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-800">{t.label}</p>
                <p className="text-xs text-gray-400">{t.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New request button */}
      {!showNew && (
        <button onClick={()=>setShowNew(true)}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          📋 Solicitar licencia
        </button>
      )}

      {/* New request form */}
      {showNew&&(
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Nueva solicitud de licencia</h3>

          {/* Type selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Tipo de licencia</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(LEAVE_TYPES).map(([key,t])=>(
                <button key={key} onClick={()=>setForm(p=>({...p,type:key,subtype:''}))}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl border-2 text-xs font-bold text-left transition-all
                    ${form.type===key?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                  <span className="text-base">{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Subtype for bereavement */}
          {form.type==='bereavement'&&(
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Parentesco</label>
              <div className="grid grid-cols-2 gap-2">
                {[['spouse_child_parent','Cónyuge, hijo o padre (3 días)'],['sibling','Hermano (1 día)']].map(([v,l])=>(
                  <button key={v} onClick={()=>setForm(p=>({...p,subtype:v}))}
                    className={`px-3 py-2.5 rounded-2xl border-2 text-xs font-bold text-left transition-all ${form.subtype===v?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LCT info */}
          {selectedType&&(
            <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-sky-700 font-semibold">{selectedType.icon} {selectedType.hint}</p>
              {lctDays&&<p className="text-xs text-sky-500 mt-0.5">Máximo: <strong>{lctDays} días corridos</strong></p>}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Desde</label>
              <input type="date" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Hasta</label>
              <input type="date" value={form.end} min={form.start} onChange={e=>setForm(p=>({...p,end:e.target.value}))}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
          </div>

          {reqDays>0&&(
            <div className={`rounded-2xl p-3 text-center border ${lctDays&&reqDays>lctDays?'bg-red-50 border-red-200':'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-xl font-black ${lctDays&&reqDays>lctDays?'text-red-600':'text-emerald-700'}`}>{reqDays} días corridos</p>
              {lctDays&&<p className={`text-xs ${lctDays&&reqDays>lctDays?'text-red-500':'text-emerald-500'}`}>de {lctDays} días permitidos por ley</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Observación (opcional)</label>
            <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={2}
              placeholder="Certificado médico disponible, motivo..."
              className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
          </div>

          {formErr&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}

          <div className="flex gap-2">
            <button onClick={()=>{setShowNew(false);setFormErr('');}} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving||reqDays<1}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {saving?'Enviando...':'Solicitar'}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50"><h3 className="font-bold text-gray-800 text-sm">Mis licencias</h3></div>
        <div className="divide-y divide-gray-50">
          {requests.length===0&&<p className="text-sm text-gray-400 text-center py-8">Sin solicitudes</p>}
          {requests.map(r=>{
            const t=LEAVE_TYPES[r.type]||LEAVE_TYPES.other;
            return(
              <div key={r.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl flex-shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-gray-900">{t.label}</p>
                      {statusBadge(r.status)}
                    </div>
                    <p className="text-xs text-gray-600">{r.days} días · {fmtDate(r.start_date)} → {fmtDate(r.end_date)}</p>
                    {r.reason&&<p className="text-xs text-gray-400 italic mt-0.5">"{r.reason}"</p>}
                    {r.admin_note&&<p className="text-xs text-sky-600 mt-1 bg-sky-50 px-2.5 py-1.5 rounded-xl">Admin: "{r.admin_note}"</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
