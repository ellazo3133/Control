import { useState, useEffect } from 'react';
import { LEAVE_TYPES, getLctDays, calcSeniority, getLeaveRequests, createLeaveRequest, localDateISO } from '../lib/supabase';

const fmtDateShort = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : '—';

const statusStyle = s => ({
  pending:   { label:'Pendiente', bg:'bg-amber-50',  text:'text-amber-700',  dot:'bg-amber-400' },
  approved:  { label:'Aprobada',  bg:'bg-emerald-50',text:'text-emerald-700',dot:'bg-emerald-400'},
  rejected:  { label:'Rechazada', bg:'bg-red-50',    text:'text-red-600',    dot:'bg-red-400'   },
  cancelled: { label:'Cancelada', bg:'bg-gray-100',  text:'text-gray-400',   dot:'bg-gray-300'  },
}[s] || { label:s, bg:'bg-gray-100', text:'text-gray-500', dot:'bg-gray-300' });

export default function LicenciasView({ profile, hireDate }) {
  const [requests, setRequests] = useState([]);
  const [showNew,  setShowNew]  = useState(false);
  const [form,     setForm]     = useState({ type:'sick', subtype:'', start:'', end:'', reason:'' });
  const [formErr,  setFormErr]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState(null);

  const seniority    = calcSeniority(hireDate);
  const lctDays      = getLctDays(form.type, form.subtype, seniority.years);
  const selectedType = LEAVE_TYPES[form.type];
  const reqDays      = form.start && form.end ? Math.round((new Date(form.end)-new Date(form.start))/(1000*60*60*24))+1 : 0;

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };
  const load = async () => { const d = await getLeaveRequests(profile.id).catch(()=>[]); setRequests(d); };
  useEffect(()=>{ load(); }, [profile.id]);

  const handleSubmit = async () => {
    setFormErr('');
    if (!form.type)              return setFormErr('Elegí el tipo de licencia');
    if (!form.start || !form.end)return setFormErr('Elegí fechas de inicio y fin');
    if (form.end < form.start)   return setFormErr('La fecha de fin debe ser después del inicio');
    if (lctDays && reqDays > lctDays) return setFormErr(`La ley permite máximo ${lctDays} días para este tipo`);
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
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-bold shadow-xl text-white ${toast.type==='error'?'bg-red-500':'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Botón solicitar */}
      {!showNew && (
        <button onClick={()=>setShowNew(true)}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          📋 Solicitar licencia especial
        </button>
      )}

      {/* Formulario */}
      {showNew && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 text-sm">Nueva licencia</h3>
            <button onClick={()=>{setShowNew(false);setFormErr('');}} className="text-gray-400 w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
          </div>
          <div className="p-5 space-y-4">
            {/* Tipo */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Tipo de licencia</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(LEAVE_TYPES).map(([key,t])=>(
                  <button key={key} onClick={()=>setForm(p=>({...p,type:key,subtype:''}))}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-2xl border-2 text-xs font-bold text-left transition-all
                      ${form.type===key?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}>
                    <span className="text-lg">{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Subtipo duelo */}
            {form.type==='bereavement' && (
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Parentesco</label>
                <div className="flex gap-2">
                  {[['spouse_child_parent','Cónyuge / hijo / padre (3 días)'],['sibling','Hermano (1 día)']].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(p=>({...p,subtype:v}))}
                      className={`flex-1 px-3 py-2.5 rounded-2xl border-2 text-xs font-bold text-left transition-all ${form.subtype===v?'border-sky-400 bg-sky-50 text-sky-700':'border-gray-200 text-gray-500'}`}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Info LCT */}
            {selectedType && (
              <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 flex items-start gap-2.5">
                <span className="text-lg flex-shrink-0">{selectedType.icon}</span>
                <div>
                  <p className="text-xs font-semibold text-sky-700">{selectedType.hint}</p>
                  {lctDays && <p className="text-xs text-sky-500 mt-0.5">Máximo: <strong>{lctDays} días corridos</strong></p>}
                </div>
              </div>
            )}

            {/* Fechas */}
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

            {reqDays > 0 && (
              <div className={`rounded-2xl p-3 text-center border ${lctDays&&reqDays>lctDays?'bg-red-50 border-red-200':'bg-emerald-50 border-emerald-100'}`}>
                <p className={`text-xl font-black ${lctDays&&reqDays>lctDays?'text-red-600':'text-emerald-700'}`}>{reqDays} días corridos</p>
                {lctDays && <p className={`text-xs mt-0.5 ${lctDays&&reqDays>lctDays?'text-red-500':'text-emerald-500'}`}>de {lctDays} permitidos</p>}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Observación (opcional)</label>
              <input value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))}
                placeholder="Certificado médico, motivo..."
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>

            {formErr && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{formErr}</p>}

            <div className="flex gap-2">
              <button onClick={()=>{setShowNew(false);setFormErr('');}} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
              <button onClick={handleSubmit} disabled={saving||reqDays<1}
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
            <h3 className="font-bold text-gray-800 text-sm">Mis licencias</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {requests.map(r => {
              const t  = LEAVE_TYPES[r.type] || LEAVE_TYPES.other;
              const st = statusStyle(r.status);
              return (
                <div key={r.id} className="px-5 py-4 flex items-start gap-3">
                  <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${st.dot}`}/>
                  <span className="text-xl flex-shrink-0 mt-0.5">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${st.bg} ${st.text}`}>{st.label}</span>
                      <span className="text-xs font-bold text-gray-700">{t.label}</span>
                      <span className="text-xs text-gray-400">{r.days} días</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{fmtDateShort(r.start_date)} → {fmtDateShort(r.end_date)}</p>
                    {r.reason && <p className="text-xs text-gray-400 mt-0.5 italic">"{r.reason}"</p>}
                    {r.admin_note && (
                      <div className="mt-2 bg-sky-50 rounded-xl px-3 py-2">
                        <p className="text-xs text-sky-700">💬 Admin: "{r.admin_note}"</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {requests.length === 0 && !showNew && (
        <div className="bg-white rounded-3xl border border-gray-100 p-8 text-center">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm font-bold text-gray-600">Sin licencias solicitadas</p>
          <p className="text-xs text-gray-400 mt-1">Usá el botón de arriba para solicitar una</p>
        </div>
      )}
    </div>
  );
}
