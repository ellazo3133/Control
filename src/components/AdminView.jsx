import { useState, useEffect, useCallback } from 'react';
import {
  getAllProfiles, getHolidays, addHoliday, deleteHoliday,
  getHQ, updateHQ, upsertSchedules, getAllSchedules,
  getFilteredRecords, getRecordsByMonth, adminEditRecord, adminAddManualRecord,
  deactivateEmployee, localDateISO, getGeoPos
} from '../lib/supabase';
import { supabase } from '../lib/supabase';

const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',orange:'bg-orange-50 text-orange-700 border-orange-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

const Avatar = ({initials,size='md'}) => {
  const colors=['bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
  const h=(initials||'?').charCodeAt(0)%colors.length;
  const sz=size==='sm'?'w-8 h-8 text-xs':size==='lg'?'w-12 h-12 text-base':'w-10 h-10 text-sm';
  return <div className={`${sz} rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${colors[h]}`}>{initials||'?'}</div>;
};

const Modal = ({open,onClose,title,children,width='max-w-lg'}) => {
  if(!open)return null;
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className={`relative bg-white w-full ${width} rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

const Toast = ({toast}) => {
  if(!toast)return null;
  const col=toast.type==='error'?'bg-red-500':toast.type==='warning'?'bg-amber-500':'bg-emerald-500';
  return <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl text-white max-w-xs text-center ${col}`}>{toast.msg}</div>;
};

const Input = ({label,type='text',value,onChange,placeholder}) => (
  <div>
    {label&&<label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} step={type==='number'?'any':undefined}
      className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
  </div>
);

const ScheduleEditor = ({schedule,onChange}) => (
  <div className="space-y-2.5">
    {DAYS.map((day,i)=>{
      const s=schedule[i]||{active:false,start_time:'09:00',end_time:'17:00',tolerance_minutes:0};
      return(
        <div key={i} className="flex items-center gap-3">
          <input type="checkbox" checked={!!s.active} onChange={e=>onChange({...schedule,[i]:{...s,active:e.target.checked}})} className="w-4 h-4 text-sky-600 rounded-md flex-shrink-0"/>
          <span className="text-sm text-gray-700 w-20 font-medium flex-shrink-0">{day}</span>
          {s.active&&<>
            <input type="time" value={s.start_time?.slice(0,5)||'09:00'} onChange={e=>onChange({...schedule,[i]:{...s,start_time:e.target.value}})}
              className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-400"/>
            <span className="text-gray-300">–</span>
            <input type="time" value={s.end_time?.slice(0,5)||'17:00'} onChange={e=>onChange({...schedule,[i]:{...s,end_time:e.target.value}})}
              className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-400"/>
          </>}
        </div>
      );
    })}
  </div>
);

// ─── EDIT RECORD MODAL ────────────────────────────────────────────────────────
function EditRecModal({rec,onSave,onClose,adminId}) {
  const [status,setStatus]=useState(rec.status||'present');
  const [just,setJust]=useState(rec.justification||'');
  const [ci,setCi]=useState(rec.check_in_at?new Date(rec.check_in_at).toTimeString().slice(0,5):'');
  const [co,setCo]=useState(rec.check_out_at?new Date(rec.check_out_at).toTimeString().slice(0,5):'');
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);

  const doSave=async()=>{
    setSaving(true);
    const patch={
      status,justification:just||null,
      check_in_at:ci?new Date(rec.date+'T'+ci+':00').toISOString():null,
      check_out_at:co?new Date(rec.date+'T'+co+':00').toISOString():null,
    };
    if(patch.check_in_at&&patch.check_out_at){
      patch.minutes_worked=Math.round((new Date(patch.check_out_at)-new Date(patch.check_in_at))/60000);
    }
    await onSave(rec.id,patch,reason||'Edición admin');
    setSaving(false);
  };

  return(
    <Modal open={true} onClose={onClose} title="Editar registro">
      <div className="space-y-5">
        <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
          {rec.profiles&&<Avatar initials={rec.profiles.avatar} size="sm"/>}
          <div><p className="font-bold text-gray-900 text-sm">{rec.profiles?.name||'Empleado'}</p><p className="text-xs text-gray-400">{fmtDate(rec.date)}</p></div>
        </div>
        <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Estado</label>
          <div className="grid grid-cols-2 gap-2">
            {[['present','✓ Presente','border-emerald-300 bg-emerald-50 text-emerald-700'],['absent','✗ Ausente','border-red-300 bg-red-50 text-red-600'],
              ['justified','~ Justificada','border-amber-300 bg-amber-50 text-amber-700'],['holiday','★ Feriado','border-violet-300 bg-violet-50 text-violet-700']].map(([v,l,cls])=>(
              <button key={v} onClick={()=>setStatus(v)} className={`py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${status===v?cls:'border-gray-200 text-gray-400 bg-white'}`}>{l}</button>
            ))}
          </div>
        </div>
        {(status==='absent'||status==='justified')&&(
          <div><label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{status==='justified'?'Motivo':'Observación'}</label>
            <textarea value={just} onChange={e=>setJust(e.target.value)} rows={2} placeholder="Certificado médico, trámite..." className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Hora entrada" type="time" value={ci} onChange={setCi}/>
          <Input label="Hora salida" type="time" value={co} onChange={setCo}/>
        </div>
        <Input label="Motivo del cambio (auditoría)" value={reason} onChange={setReason} placeholder="Ej: Corrección autorizada por gerencia"/>
        <button onClick={doSave} disabled={saving}
          className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {saving?'Guardando...':'Guardar cambios'}
        </button>
        <p className="text-xs text-gray-400 text-center">Este cambio quedará registrado en el historial de auditoría</p>
      </div>
    </Modal>
  );
}

// ─── ADD EMPLOYEE MODAL ───────────────────────────────────────────────────────
function AddEmployeeModal({onClose,onSave}) {
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [pw,setPw]=useState('');
  const [sched,setSched]=useState({});
  const [loading,setLoading]=useState(false); const [err,setErr]=useState('');

  const doSave=async()=>{
    if(!name||!email||!pw)return setErr('Completá nombre, email y contraseña');
    setLoading(true);setErr('');
    try{ await onSave(name,email,pw,sched); onClose(); }
    catch(e){ setErr(e.message); }
    setLoading(false);
  };

  return(
    <Modal open={true} onClose={onClose} title="Agregar empleado">
      <div className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={setName}/>
        <Input label="Email" type="email" value={email} onChange={setEmail}/>
        <Input label="Contraseña inicial" type="password" value={pw} onChange={setPw}/>
        <div><label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Horario semanal</label>
          <ScheduleEditor schedule={sched} onChange={setSched}/></div>
        {err&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{err}</p>}
        <button onClick={doSave} disabled={loading} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {loading?'Creando...':'Agregar empleado'}
        </button>
      </div>
    </Modal>
  );
}

// ─── ADMIN VIEW ───────────────────────────────────────────────────────────────
export default function AdminView({ profile, onLogout }) {
  const [tab,setTab]=useState('dashboard');
  const [employees,setEmployees]=useState([]);
  const [allSchedules,setAllSchedules]=useState([]);
  const [todayRecs,setTodayRecs]=useState([]);
  const [filteredRecs,setFilteredRecs]=useState([]);
  const [monthRecs,setMonthRecs]=useState([]);
  const [holidays,setHolidays]=useState([]);
  const [hq,setHq]=useState(null);
  const [toast,setToast]=useState(null);

  const [filterDate,setFilterDate]=useState(localDateISO());
  const [filterEmp,setFilterEmp]=useState('all');
  const [analysisMonth,setAnalysisMonth]=useState(new Date().toISOString().slice(0,7));
  const [hqForm,setHqForm]=useState({name:'',lat:'',lng:'',radius_meters:100});
  const [holForm,setHolForm]=useState({date:'',name:''});

  const [editRec,setEditRec]=useState(null);
  const [showAddEmp,setShowAddEmp]=useState(false);
  const [showAddHol,setShowAddHol]=useState(false);
  const [editEmpId,setEditEmpId]=useState(null);
  const [editEmpSched,setEditEmpSched]=useState({});
  const [empSchedMap,setEmpSchedMap]=useState({});

  const showToast=(msg,type='success')=>{ setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const loadAll = useCallback(async () => {
    const [empsRes, schedsRes, todayRes, hqRes, holsRes] = await Promise.allSettled([
      getAllProfiles(), getAllSchedules(), getFilteredRecords({date:localDateISO()}),
      getHQ(), getHolidays()
    ]);
    const emps   = empsRes.status==='fulfilled'   ? empsRes.value   : [];
    const scheds = schedsRes.status==='fulfilled' ? schedsRes.value : [];
    const today  = todayRes.status==='fulfilled'  ? todayRes.value  : [];
    const hols   = holsRes.status==='fulfilled'   ? holsRes.value   : [];
    const hqData = hqRes.status==='fulfilled'     ? hqRes.value     : null;
    [empsRes,schedsRes,todayRes,hqRes,holsRes].forEach((r,i)=>{ if(r.status==='rejected') console.error('loadAll['+i+']:',r.reason?.message||r.reason); });
    setEmployees(emps||[]); setTodayRecs(today||[]); setHolidays(hols||[]);
    if(hqData){ setHq(hqData); setHqForm({name:hqData.name,lat:hqData.lat,lng:hqData.lng,radius_meters:hqData.radius_meters}); }
    const sm={};
    (scheds||[]).forEach(s=>{ if(!sm[s.employee_id])sm[s.employee_id]={}; sm[s.employee_id][s.day_of_week]=s; });
    setEmpSchedMap(sm); setAllSchedules(scheds||[]);
  }, []);

  useEffect(()=>{ loadAll(); },[loadAll]);

  useEffect(()=>{
    getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp})
      .then(setFilteredRecs).catch(()=>{});
  },[filterDate,filterEmp]);

  useEffect(()=>{
    getRecordsByMonth(analysisMonth).then(setMonthRecs).catch(()=>{});
  },[analysisMonth]);

  const todayDow=new Date().getDay();
  const presentToday=todayRecs.filter(r=>r.check_in_at).length;
  const workingToday=employees.filter(e=>empSchedMap[e.id]?.[todayDow]?.active).length;

  // Add employee
  const handleAddEmployee = async (name, email, pw, sched) => {
    // Intentar via RPC primero, si falla usar signup directo
    let empId = null;
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_create_employee', {
      p_name: name, p_email: email, p_password: pw
    });
    if (rpcError) {
      // Fallback: crear via signUp normal (el usuario queda sin confirmar hasta que el admin lo confirme)
      const { data: signUpData, error: signUpError } = await supabase.auth.admin?.createUser
        ? await supabase.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } })
        : { data: null, error: new Error('Sin permisos admin') };
      if (signUpError || !signUpData?.user) {
        // Último fallback: insertar directamente en profiles (el empleado se registra solo con ese email)
        const avatar = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const { data: p, error: pe } = await supabase.from('profiles').insert({ name, email, role:'employee', avatar, bio_registered:false, active:true }).select().single();
        if (pe) throw new Error('Error creando empleado: ' + pe.message);
        empId = p.id;
      } else {
        empId = signUpData.user.id;
      }
    } else {
      empId = rpcData;
    }
    if (!empId) throw new Error('No se pudo obtener ID del empleado');
    const schedRows = Object.entries(sched)
      .filter(([,s])=>s.active)
      .map(([dow,s])=>({ employee_id:empId, day_of_week:parseInt(dow), start_time:s.start_time||'09:00', end_time:s.end_time||'17:00', tolerance_minutes:0, active:true }));
    if(schedRows.length>0){
      const { error: se } = await supabase.from('schedules').insert(schedRows);
      if (se) console.error('Error guardando horarios:', se.message);
    }
    await loadAll();
    showToast('Empleado creado');
  };

  // Edit schedules
  const openEditSched = (emp) => {
    setEditEmpId(emp.id);
    setEditEmpSched(empSchedMap[emp.id]||{});
  };
  const saveEmpSched = async () => {
    try {
      await upsertSchedules(editEmpId, editEmpSched);
      await loadAll();
      setEditEmpId(null);
      showToast('Horario actualizado');
    } catch(e){ showToast(e.message,'error'); }
  };

  // Records
  const handleSaveRec = async (recId, patch, reason) => {
    try {
      await adminEditRecord(recId, patch, profile.id, reason);
      const updated = await getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp});
      setFilteredRecs(updated);
      setEditRec(null);
      showToast('Registro actualizado');
    } catch(e){ showToast(e.message,'error'); }
  };

  const handleManualRecord = async (empId, date, status, just) => {
    try {
      await adminAddManualRecord({employeeId:empId,date,status,justification:just,adminId:profile.id});
      const updated = await getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp});
      setFilteredRecs(updated);
      showToast('Registro agregado');
    } catch(e){ showToast(e.message,'error'); }
  };

  // HQ
  const detectHQ=()=>{ getGeoPos().then(p=>setHqForm(f=>({...f,lat:p.coords.latitude.toFixed(6)*1,lng:p.coords.longitude.toFixed(6)*1}))).catch(()=>showToast('GPS no disponible','error')); };
  const saveHQ=async()=>{
    try{ const h=await updateHQ(hqForm.name,parseFloat(hqForm.lat),parseFloat(hqForm.lng),parseInt(hqForm.radius_meters),profile.id); setHq(h); showToast('Sede actualizada'); }
    catch(e){ showToast(e.message,'error'); }
  };

  // Holidays
  const handleAddHol=async()=>{ if(!holForm.date||!holForm.name)return;
    try{ const h=await addHoliday(holForm.date,holForm.name,profile.id); setHolidays(p=>[...p,h]); setShowAddHol(false); setHolForm({date:'',name:''}); showToast('Feriado agregado'); }
    catch(e){ showToast(e.message,'error'); }
  };
  const handleDelHol=async(id)=>{ try{ await deleteHoliday(id); setHolidays(p=>p.filter(h=>h.id!==id)); } catch(e){showToast(e.message,'error');} };

  // Analysis stats
  const getStats = (empId) => {
    const sched = empSchedMap[empId]||{};
    const [y,m]=analysisMonth.split('-').map(Number);
    const days=new Date(y,m,0).getDate();
    let scheduled=0,present=0,absent=0,justified=0,lateMins=0,lateCount=0,totalWork=0;
    for(let d=1;d<=days;d++){
      const date=`${analysisMonth}-${String(d).padStart(2,'0')}`;
      const dow=new Date(date+'T12:00:00').getDay();
      if(!sched[dow]?.active)continue;
      scheduled++;
      const rec=monthRecs.find(r=>r.employee_id===empId&&r.date===date);
      if(rec?.check_in_at){present++;if(rec.minutes_late>0){lateMins+=rec.minutes_late;lateCount++;}if(rec.minutes_worked)totalWork+=rec.minutes_worked;}
      else if(rec?.status==='justified')justified++;
      else absent++;
    }
    return{scheduled,present,absent,justified,lateMins,lateCount,totalWork,pct:scheduled>0?Math.round(present/scheduled*100):0};
  };

  const TABS=[
    ['dashboard','Panel','M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'],
    ['employees','Empleados','M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z'],
    ['records','Registros','M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2'],
    ['holidays','Feriados','M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'],
    ['analysis','Análisis','M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'],
    ['settings','Config','M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  ];

  return(
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toast toast={toast}/>
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <span className="font-bold text-gray-900 text-sm" style={{fontFamily:"'Playfair Display',serif"}}>Asistencia — Admin</span>
          </div>
          <button onClick={onLogout} className="text-xs text-gray-400 px-3 py-1.5 rounded-xl hover:bg-gray-100">Salir</button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-100 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 flex">
          {TABS.map(([t,label,icon])=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-3.5 text-xs font-bold border-b-2 transition-colors ${tab===t?'border-sky-500 text-sky-600':'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon}/></svg>{label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-5xl mx-auto w-full px-5 py-6">

        {/* DASHBOARD */}
        {tab==='dashboard'&&(
          <div className="space-y-5">
            <div><h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Panel de hoy</h2>
              <p className="text-sm text-gray-400">{new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[{l:'Presentes',v:presentToday,c:'text-emerald-600',bg:'bg-emerald-50 border-emerald-100'},
                {l:'Ausentes',v:Math.max(0,workingToday-presentToday),c:'text-red-500',bg:'bg-red-50 border-red-100'},
                {l:'Con turno',v:workingToday,c:'text-sky-600',bg:'bg-sky-50 border-sky-100'}].map(({l,v,c,bg})=>(
                <div key={l} className={`${bg} border rounded-3xl p-4 text-center`}>
                  <p className={`text-3xl font-black ${c}`}>{v}</p>
                  <p className="text-xs text-gray-500 mt-0.5 font-semibold">{l}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100">
              <div className="px-5 py-4 border-b border-gray-50"><h3 className="font-bold text-gray-800 text-sm">Empleados hoy</h3></div>
              <div className="divide-y divide-gray-50">
                {employees.filter(e=>empSchedMap[e.id]?.[todayDow]?.active).map(emp=>{
                  const rec=todayRecs.find(r=>r.employee_id===emp.id);
                  const sc=empSchedMap[emp.id]?.[todayDow];
                  return(
                    <div key={emp.id} className="flex items-center gap-3 px-5 py-4">
                      <Avatar initials={emp.avatar} size="sm"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400">{sc?.start_time?.slice(0,5)} – {sc?.end_time?.slice(0,5)}</p>
                      </div>
                      <div className="text-right">
                        {rec?.check_in_at?<>
                          <Badge color="green">Presente</Badge>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">{fmtTime(rec.check_in_at)}{rec.check_out_at?` → ${fmtTime(rec.check_out_at)}`:''}</p>
                          {rec.minutes_late>0&&<p className="text-xs text-amber-500">+{rec.minutes_late}min</p>}
                        </>:<Badge color="red">Ausente</Badge>}
                      </div>
                    </div>
                  );
                })}
                {workingToday===0&&<p className="text-sm text-gray-400 text-center py-8">Nadie tiene turno hoy</p>}
              </div>
            </div>
            {hq&&(
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3"><span className="text-2xl">📍</span>
                  <div><p className="font-bold text-gray-900 text-sm">{hq.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{hq.lat}, {hq.lng} · Radio: {hq.radius_meters}m</p>
                  </div>
                </div>
                <button onClick={()=>setTab('settings')} className="px-3 py-1.5 text-xs font-bold text-sky-600 bg-sky-50 rounded-xl hover:bg-sky-100">Editar</button>
              </div>
            )}
          </div>
        )}

        {/* EMPLOYEES */}
        {tab==='employees'&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Empleados</h2>
                <p className="text-sm text-gray-400">{employees.length} registrados</p>
              </div>
              <button onClick={()=>setShowAddEmp(true)} className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>+ Agregar</button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {employees.map(emp=>(
                <div key={emp.id} className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar initials={emp.avatar}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900 text-sm">{emp.name}</p>
                        {emp.bio_registered?<Badge color="green">Bio ✓</Badge>:<Badge color="orange">Sin bio</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {DAYS.map((d,i)=>empSchedMap[emp.id]?.[i]?.active&&(
                          <span key={i} className="px-2 py-0.5 bg-sky-50 text-sky-700 text-xs rounded-lg font-bold">{DAYS_SHORT[i]} {empSchedMap[emp.id][i].start_time?.slice(0,5)}</span>
                        ))}
                      </div>
                    </div>
                    <button onClick={()=>openEditSched(emp)} className="p-2 text-gray-300 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECORDS */}
        {tab==='records'&&(
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Registros</h2>
            <div className="flex gap-2 flex-wrap">
              <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
              <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-white">
                <option value="all">Todos</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button onClick={()=>{setFilterDate('');setFilterEmp('all');}} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Limpiar</button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {filteredRecs.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin registros para este filtro</p>}
              {filteredRecs.map(rec=>{
                const mins=rec.check_in_at&&rec.check_out_at?Math.round((new Date(rec.check_out_at)-new Date(rec.check_in_at))/60000):null;
                return(
                  <div key={rec.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      {rec.profiles&&<Avatar initials={rec.profiles.avatar} size="sm"/>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{rec.profiles?.name||'—'}</p>
                          <span className="text-xs text-gray-400">{fmtDate(rec.date)}</span>
                          {rec.edited_at&&<span className="text-xs text-amber-500">✏️ editado</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                          {rec.check_in_at&&<span>Entrada: <span className="font-mono font-bold">{fmtTime(rec.check_in_at)}</span>{rec.minutes_late>0&&<span className="text-amber-500 ml-1">+{rec.minutes_late}min</span>}</span>}
                          {rec.check_out_at&&<span>Salida: <span className="font-mono font-bold">{fmtTime(rec.check_out_at)}</span></span>}
                          {mins&&<span className="text-gray-400">· {Math.floor(mins/60)}h{mins%60}m</span>}
                          {rec.check_in_distance!=null&&<span className="text-gray-300">· {Math.round(rec.check_in_distance)}m de sede</span>}
                        </div>
                        {rec.justification&&<p className="text-xs text-amber-600 italic mt-0.5">"{rec.justification}"</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {rec.status==='present'&&<Badge color="green">Presente</Badge>}
                        {rec.status==='absent'&&<Badge color="red">Ausente</Badge>}
                        {rec.status==='justified'&&<Badge color="yellow">Justificada</Badge>}
                        {rec.status==='holiday'&&<Badge color="purple">Feriado</Badge>}
                        <button onClick={()=>setEditRec(rec)} className="p-2 text-gray-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Manual record */}
            <ManualForm employees={employees} onSave={handleManualRecord}/>
          </div>
        )}

        {/* HOLIDAYS */}
        {tab==='holidays'&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Feriados</h2>
              <button onClick={()=>setShowAddHol(true)} className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>+ Agregar</button>
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {holidays.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin feriados cargados</p>}
              {holidays.sort((a,b)=>a.date.localeCompare(b.date)).map(h=>(
                <div key={h.id} className="flex items-center justify-between px-5 py-4">
                  <div><p className="font-bold text-gray-900 text-sm">{h.name}</p><p className="text-xs text-gray-400">{fmtDate(h.date)} — {DAYS[new Date(h.date+'T12:00:00').getDay()]}</p></div>
                  <button onClick={()=>handleDelHol(h.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ANALYSIS */}
        {tab==='analysis'&&(
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Análisis</h2>
              <input type="month" value={analysisMonth} onChange={e=>setAnalysisMonth(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {employees.map(emp=>{const s=getStats(emp.id);
                const pC=s.pct>=90?'text-emerald-600':s.pct>=75?'text-amber-600':'text-red-500';
                const bC=s.pct>=90?'from-emerald-400 to-emerald-500':s.pct>=75?'from-amber-400 to-amber-500':'from-red-400 to-red-500';
                const th=s.totalWork?`${Math.floor(s.totalWork/60)}h ${s.totalWork%60}m`:'—';
                return(
                  <div key={emp.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3"><Avatar initials={emp.avatar}/>
                        <div><p className="font-bold text-gray-900 text-sm">{emp.name}</p><p className="text-xs text-gray-400">{s.scheduled} días prog.</p></div>
                      </div>
                      <div className="text-right"><p className={`text-3xl font-black ${pC}`}>{s.pct}%</p><p className="text-xs text-gray-400">asistencia</p></div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 mb-4 overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${bC}`} style={{width:`${s.pct}%`}}/>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center mb-3">
                      {[{l:'Pres.',v:s.present,c:'text-emerald-600'},{l:'Aus.',v:s.absent,c:'text-red-500'},{l:'Just.',v:s.justified,c:'text-amber-600'},{l:'Tard.',v:s.lateCount,c:'text-violet-600'}].map(({l,v,c})=>(
                        <div key={l} className="bg-gray-50 rounded-2xl p-2.5"><p className={`text-xl font-black ${c}`}>{v}</p><p className="text-xs text-gray-400">{l}</p></div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 bg-gray-50 rounded-2xl px-4 py-2.5">
                      <span>Horas: <span className="font-bold text-gray-700">{th}</span></span>
                      {s.lateCount>0&&<span>Tard.prom: <span className="font-bold text-amber-600">{Math.round(s.lateMins/s.lateCount)}min</span></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {tab==='settings'&&(
          <div className="space-y-5 max-w-md">
            <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Configuración</h2>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h3 className="font-bold text-gray-800">Ubicación de la sede</h3>
              <p className="text-xs text-gray-500">Los empleados deben estar a <strong>{hqForm.radius_meters}m</strong> de estas coordenadas para registrar asistencia.</p>
              <Input label="Nombre de la sede" value={hqForm.name} onChange={v=>setHqForm(f=>({...f,name:v}))}/>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Latitud" type="number" value={hqForm.lat} onChange={v=>setHqForm(f=>({...f,lat:v}))}/>
                <Input label="Longitud" type="number" value={hqForm.lng} onChange={v=>setHqForm(f=>({...f,lng:v}))}/>
              </div>
              <Input label="Radio (metros)" type="number" value={hqForm.radius_meters} onChange={v=>setHqForm(f=>({...f,radius_meters:v}))}/>
              <button onClick={detectHQ} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-sky-200 text-sm font-semibold text-sky-600 hover:bg-sky-50 transition-colors">
                📍 Detectar mi ubicación actual
              </button>
              <button onClick={saveHQ} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                Guardar sede
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      {showAddEmp&&<AddEmployeeModal onClose={()=>setShowAddEmp(false)} onSave={handleAddEmployee}/>}
      {editEmpId&&(
        <Modal open={true} onClose={()=>setEditEmpId(null)} title="Editar horario">
          <div className="space-y-4">
            <ScheduleEditor schedule={editEmpSched} onChange={setEditEmpSched}/>
            <button onClick={saveEmpSched} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              Guardar horario
            </button>
          </div>
        </Modal>
      )}
      {editRec&&<EditRecModal rec={editRec} onSave={handleSaveRec} onClose={()=>setEditRec(null)} adminId={profile.id}/>}
      <Modal open={showAddHol} onClose={()=>setShowAddHol(false)} title="Agregar feriado">
        <div className="space-y-4">
          <Input label="Fecha" type="date" value={holForm.date} onChange={v=>setHolForm(p=>({...p,date:v}))}/>
          <Input label="Nombre" value={holForm.name} onChange={v=>setHolForm(p=>({...p,name:v}))} placeholder="Ej: 25 de Mayo"/>
          <button onClick={handleAddHol} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            Guardar feriado
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── MANUAL FORM ──────────────────────────────────────────────────────────────
function ManualForm({employees,onSave}) {
  const [empId,setEmpId]=useState(''); const [date,setDate]=useState(localDateISO());
  const [status,setStatus]=useState('absent'); const [just,setJust]=useState('');
  return(
    <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 space-y-3">
      <p className="text-sm font-bold text-amber-800">Registrar falta manual</p>
      <div className="grid grid-cols-2 gap-2">
        <select value={empId} onChange={e=>setEmpId(e.target.value)} className="px-3 py-2.5 rounded-2xl border border-amber-200 text-sm bg-white focus:outline-none">
          <option value="">Empleado...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="px-3 py-2.5 rounded-2xl border border-amber-200 text-sm bg-white focus:outline-none"/>
      </div>
      <div className="flex gap-1.5">
        {[['absent','Injustificada'],['justified','Justificada'],['holiday','Feriado']].map(([v,l])=>(
          <button key={v} onClick={()=>setStatus(v)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${status===v?'bg-amber-600 text-white':'bg-amber-100 text-amber-700'}`}>{l}</button>
        ))}
      </div>
      {(status==='justified'||status==='absent')&&<input value={just} onChange={e=>setJust(e.target.value)} placeholder="Motivo (opcional)" className="w-full px-3.5 py-2.5 rounded-2xl border border-amber-200 text-sm bg-white focus:outline-none"/>}
      <button onClick={()=>{if(!empId)return;onSave(empId,date,status,just||null);setJust('');}} disabled={!empId}
        className="w-full py-2.5 rounded-2xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">Registrar</button>
    </div>
  );
}
