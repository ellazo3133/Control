import { useState, useEffect, useCallback } from 'react';
import { supabase, getAllProfiles, getHolidays, addHoliday, deleteHoliday, getHQ, updateHQ,
  upsertSchedules, getAllSchedules, getFilteredRecords, getRecordsByMonth, runAlerts,
  adminEditRecord, adminAddManualRecord, localDateISO, getGeoPos } from '../lib/supabase';
import { getHolidaysForYear } from '../data/holidays';
import EmployeeProfileModal from './EmployeeProfileModal';
import ExportButton from './ExportButton';
import NotificationBell from './NotificationBell';
import MonthCalendar from './MonthCalendar';
import AuditHistory from './AuditHistory';
import { hasPermission, AdminPermissionsEditor, ALL_PERMISSIONS } from './AdminPermissions';
import HorasExtra, { calcMonto, calcRate } from './HorasExtra';
import logo from '../assets/logo-ellazo.png';
import logoWhite from '../assets/logo-ellazo-white.png';
import logoBase64 from '../assets/logoBase64.js';
import VacacionesAdmin from './VacacionesAdmin';
import TareasAdmin from './TareasAdmin';
import LicenciasAdmin from './LicenciasAdmin';
import AlertasAdmin from './AlertasAdmin';
import ExcepcionesAdmin from './ExcepcionesAdmin';

const DAYS=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_SHORT=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const fmtTime=iso=>iso?new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'—';
const fmtDate=s=>s?new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const fmtMoney=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0);

const Badge=({color,children})=>{
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',
    orange:'bg-orange-50 text-orange-700 border-orange-200',teal:'bg-teal-50 text-teal-700 border-teal-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};
const Avatar=({initials,size='md'})=>{
  const colors=['bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
  const h=(initials||'?').charCodeAt(0)%colors.length;
  const sz=size==='sm'?'w-8 h-8 text-xs':size==='lg'?'w-12 h-12 text-base':'w-10 h-10 text-sm';
  return <div className={`${sz} rounded-2xl flex items-center justify-center font-bold flex-shrink-0 ${colors[h]}`}>{initials||'?'}</div>;
};
const Modal=({open,onClose,title,children,width='max-w-lg'})=>{
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
const Toast=({toast})=>{
  if(!toast)return null;
  const col=toast.type==='error'?'bg-red-500':toast.type==='warning'?'bg-amber-500':'bg-emerald-500';
  return <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl text-sm font-semibold shadow-xl text-white max-w-sm text-center ${col}`}>{toast.msg}</div>;
};
const Input=({label,type='text',value,onChange,placeholder,min,step})=>(
  <div>
    {label&&<label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>}
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} step={step||'any'}
      className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
  </div>
);
const ScheduleEditor=({schedule,onChange})=>(
  <div className="space-y-2.5">
    {DAYS.map((day,i)=>{
      const s=schedule[i]||{active:false,start_time:'09:00',end_time:'17:00'};
      return(
        <div key={i} className="flex items-center gap-3">
          <input type="checkbox" checked={!!s.active} onChange={e=>onChange({...schedule,[i]:{...s,active:e.target.checked}})} className="w-4 h-4 text-sky-600 rounded-md flex-shrink-0"/>
          <span className="text-sm text-gray-700 w-20 font-medium flex-shrink-0">{day}</span>
          {s.active&&<>
            <input type="time" value={s.start_time?.slice(0,5)||'09:00'} onChange={e=>onChange({...schedule,[i]:{...s,start_time:e.target.value}})} className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-400"/>
            <span className="text-gray-300">–</span>
            <input type="time" value={s.end_time?.slice(0,5)||'17:00'} onChange={e=>onChange({...schedule,[i]:{...s,end_time:e.target.value}})} className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-400"/>
          </>}
        </div>
      );
    })}
  </div>
);

// ─── EDIT RECORD MODAL ────────────────────────────────────────────────────────
function EditRecModal({rec,onSave,onClose,adminId}){
  const [status,setStatus]=useState(rec.status||'present');
  const [just,setJust]=useState(rec.justification||'');
  const [ci,setCi]=useState(rec.check_in?new Date(rec.check_in).toTimeString().slice(0,5):'');
  const [co,setCo]=useState(rec.check_out?new Date(rec.check_out).toTimeString().slice(0,5):'');
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const doSave=async()=>{
    setSaving(true);
    const patch={status,justification:just||null,
      check_in:ci?new Date(rec.date+'T'+ci+':00').toISOString():null,
      check_out:co?new Date(rec.date+'T'+co+':00').toISOString():null};
    if(patch.check_in&&patch.check_out)
      patch.minutes_worked=Math.round((new Date(patch.check_out)-new Date(patch.check_in))/60000);
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
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Estado</label>
          <div className="grid grid-cols-2 gap-2">
            {[['present','✓ Presente','border-emerald-300 bg-emerald-50 text-emerald-700'],
              ['absent','✗ Ausente injust.','border-red-300 bg-red-50 text-red-600'],
              ['justified','~ Ausente justif.','border-amber-300 bg-amber-50 text-amber-700'],
              ['holiday','★ Feriado','border-violet-300 bg-violet-50 text-violet-700']].map(([v,l,cls])=>(
              <button key={v} onClick={()=>setStatus(v)} className={`py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${status===v?cls:'border-gray-200 text-gray-400 bg-white'}`}>{l}</button>
            ))}
          </div>
        </div>
        {(status==='absent'||status==='justified')&&(
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              {status==='justified'?'Motivo de justificación':'Motivo de la falta'}
            </label>
            <textarea value={just} onChange={e=>setJust(e.target.value)} rows={2}
              placeholder={status==='justified'?"Certificado médico, trámite...":"Falta sin aviso, etc."}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Hora entrada" type="time" value={ci} onChange={setCi}/>
          <Input label="Hora salida" type="time" value={co} onChange={setCo}/>
        </div>
        <Input label="Motivo del cambio (auditoría)" value={reason} onChange={setReason} placeholder="Ej: Corrección autorizada"/>
        <button onClick={doSave} disabled={saving} className="w-full py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {saving?'Guardando...':'Guardar cambios'}
        </button>
        <p className="text-xs text-gray-400 text-center">Este cambio quedará registrado en auditoría</p>
      </div>
    </Modal>
  );
}

// ─── ADD EMPLOYEE MODAL ───────────────────────────────────────────────────────
function AddEmployeeModal({onClose,onSave}){
  const [name,setName]=useState('');const [email,setEmail]=useState('');const [pw,setPw]=useState('');
  const [salary,setSalary]=useState('');const [hireDate,setHireDate]=useState('');const [sched,setSched]=useState({});
  const [loading,setLoading]=useState(false);const [err,setErr]=useState('');
  const doSave=async()=>{
    if(!name||!email||!pw)return setErr('Completá nombre, email y contraseña');
    setLoading(true);setErr('');
    try{await onSave(name,email,pw,parseFloat(salary)||0,hireDate||null,sched);onClose();}
    catch(e){setErr(e.message);}
    setLoading(false);
  };
  return(
    <Modal open={true} onClose={onClose} title="Agregar empleado">
      <div className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={setName}/>
        <Input label="Email" type="email" value={email} onChange={setEmail}/>
        <Input label="Contraseña inicial" type="password" value={pw} onChange={setPw}/>
        <Input label="Sueldo base mensual (ARS)" type="number" value={salary} onChange={setSalary} placeholder="Ej: 500000"/>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Fecha de alta</label>
          <input type="date" value={hireDate} onChange={e=>setHireDate(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
          <p className="text-xs text-gray-400 mt-1">Usada para calcular vacaciones según LCT</p>
        </div>
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

// ─── EXTRA HOURS MODAL ────────────────────────────────────────────────────────

// ─── NEW RECORD MODAL (carga manual admin) ────────────────────────────────────
function NewRecordModal({employees,defaultDate,onSave,onClose}){
  const today=localDateISO();
  const [empId,setEmpId]=useState(employees[0]?.id||'');
  const [date,setDate]=useState(defaultDate||today);
  const [ci,setCi]=useState('09:00');
  const [co,setCo]=useState('18:00');
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');

  const doSave=async()=>{
    if(!empId) return setErr('Elegí un empleado');
    if(!date)  return setErr('Ingresá la fecha');
    if(!ci)    return setErr('Ingresá la hora de entrada');
    if(co&&co<=ci) return setErr('La salida debe ser después de la entrada');
    setSaving(true);setErr('');
    try{
      const checkInISO=new Date(date+'T'+ci+':00').toISOString();
      const checkOutISO=co?new Date(date+'T'+co+':00').toISOString():null;
      const minutesWorked=co?Math.round((new Date(checkOutISO)-new Date(checkInISO))/60000):null;
      await onSave({
        empId, date,
        check_in: checkInISO,
        check_out: checkOutISO,
        minutes_worked: minutesWorked,
        status: 'present',
        reason: reason||'Carga manual por admin',
      });
      onClose();
    }catch(e){setErr(e.message);}
    setSaving(false);
  };

  return(
    <Modal open={true} onClose={onClose} title="Agregar registro manual">
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-2">
          <span className="text-base flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-700">Este registro queda marcado como <strong>carga manual del admin</strong> y aparece en el historial de auditoría.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Empleado</label>
          <select value={empId} onChange={e=>setEmpId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50">
            {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Fecha</label>
          <input type="date" value={date} max={today} onChange={e=>setDate(e.target.value)}
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Entrada</label>
            <input type="time" value={ci} onChange={e=>setCi(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Salida (opcional)</label>
            <input type="time" value={co} onChange={e=>setCo(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>
        </div>

        {ci&&co&&ci<co&&(
          <div className="bg-sky-50 rounded-2xl px-4 py-2.5 text-center">
            <p className="text-xs text-sky-600 font-bold">
              {(()=>{const mins=Math.round((new Date('2000-01-01T'+co)-new Date('2000-01-01T'+ci))/60000);return `${Math.floor(mins/60)}h ${mins%60}m trabajados`;})()}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Motivo de carga manual</label>
          <input value={reason} onChange={e=>setReason(e.target.value)}
            placeholder="Ej: No tenía celular, problema técnico..."
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
        </div>

        {err&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{err}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doSave} disabled={saving}
            className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Guardando...':'Guardar registro'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── PAYROLL MODAL ────────────────────────────────────────────────────────────// ─── EXTRA HOURS MODAL ────────────────────────────────────────────────────────

function PayrollModal({emp,month,stats,extraHours,empSchedMap,onClose,onSave}){
  const baseSalary=emp.salary||0;
  const deductPct=stats.scheduled>0?Math.round((stats.absent/stats.scheduled)*100):0;
  const deductAmt=Math.round(baseSalary*(deductPct/100));
  // Use actual scheduled days from schedMap if available
  const schedDays=(()=>{
    if(!empSchedMap||!emp?.id)return stats.scheduled||20;
    const s=empSchedMap[emp.id]||{};
    const active=Object.values(s).filter(x=>x?.active).length;
    return active||stats.scheduled||20;
  })();
  // Prioridad: extra_hour_rate fijo > salary/monthly_hours > salary/días/8
  const hourlyRate = emp.extra_hour_rate > 0
    ? emp.extra_hour_rate
    : emp.monthly_hours > 0
      ? baseSalary / emp.monthly_hours
      : baseSalary / (schedDays * 8);
  const hourlyRateLabel = emp.extra_hour_rate > 0
    ? 'configurado'
    : emp.monthly_hours > 0
      ? `${baseSalary.toLocaleString('es-AR')} ÷ ${emp.monthly_hours}h`
      : `${baseSalary.toLocaleString('es-AR')} ÷ ${schedDays}días ÷ 8h`;
  const extraHrsTotal=extraHours.reduce((acc,h)=>acc+calcMonto(h,emp,schedDays),0);
  const [bonus,setBonus]=useState('0');
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);
  // Toggle descuento por minutos debidos
  const netDebt=Math.max(0,(stats.totalMissingMins||0)-(stats.totalExtraMins||0));
  const salaryPerMin=baseSalary/((stats.scheduled||20)*8*60);
  const minsDeductAmt=Math.round(netDebt*salaryPerMin);
  const [deductMins,setDeductMins]=useState(false);
  const mH=m=>`${Math.floor(m/60)}h ${m%60}m`;
  const minsDeduct=deductMins?minsDeductAmt:0;
  const totalNet=baseSalary-deductAmt-minsDeduct+Math.round(extraHrsTotal)+parseFloat(bonus||0);

  const doSave=async()=>{
    setSaving(true);
    await onSave({
      employee_id:emp.id, month,
      base_salary:baseSalary, days_scheduled:stats.scheduled, days_worked:stats.present,
      days_absent:stats.absent, days_justified:stats.justified,
      deduction_pct:deductPct, deduction_amt:deductAmt,
      extra_hours_amt:Math.round(extraHrsTotal), bonus:parseFloat(bonus||0),
      total_net:Math.round(totalNet), notes, status:'approved',
      mins_debt:netDebt, mins_deduct_applied:deductMins, mins_deduct_amt:minsDeduct,
    });
    setSaving(false);onClose();
  };

  const printRecibo=()=>{
    const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const [y,m]=month.split('-').map(Number);
    const monthLabel=`${MONTHS[m-1]} ${y}`;
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Recibo — ${emp.name} — ${monthLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;color:#1f2937;padding:2.5rem;max-width:720px;margin:0 auto;font-size:13px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0ea5e9;padding-bottom:1.25rem;margin-bottom:1.5rem;}
.org{font-size:1.1rem;font-weight:900;color:#0ea5e9;}
.org-sub{font-size:.75rem;color:#6b7280;margin-top:.2rem;}
.title{text-align:right;}
.title h1{font-size:1rem;font-weight:900;color:#1f2937;text-transform:uppercase;letter-spacing:.05em;}
.title p{font-size:.75rem;color:#6b7280;margin-top:.2rem;}
.emp-box{background:#f8fafc;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.5rem;display:grid;grid-template-columns:1fr 1fr;gap:.5rem .75rem;}
.emp-box .label{font-size:.7rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;}
.emp-box .value{font-size:.85rem;font-weight:700;color:#1f2937;}
.section{margin-bottom:1.25rem;}
.section-title{font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:.6rem;padding-bottom:.4rem;border-bottom:1px solid #e5e7eb;}
.row{display:flex;justify-content:space-between;padding:.35rem 0;border-bottom:1px solid #f3f4f6;font-size:.82rem;}
.row:last-child{border-bottom:none;}
.row .lbl{color:#4b5563;}
.row .val{font-weight:700;}
.red{color:#dc2626;} .green{color:#059669;} .amber{color:#d97706;} .sky{color:#0ea5e9;}
.total-box{background:linear-gradient(135deg,#0ea5e9,#6366f1);border-radius:8px;padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;color:white;margin-top:1.5rem;}
.total-box .lbl{font-size:.75rem;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:.05em;}
.total-box .val{font-size:1.5rem;font-weight:900;}
.notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:.75rem 1rem;margin-top:1rem;font-size:.8rem;color:#92400e;}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:.7rem;color:#9ca3af;}
.sign-area{margin-top:3rem;display:grid;grid-template-columns:1fr 1fr;gap:2rem;}
.sign-line{border-top:1px solid #d1d5db;padding-top:.4rem;font-size:.7rem;color:#6b7280;text-align:center;}
@media print{body{padding:1rem;} .no-print{display:none;}}
</style></head><body>
<div class="header">
  <div><div class="org">El Lazo Juventud Judía</div><div class="org-sub">ellazo.com.ar · info@ellazo.com.ar</div></div>
  <div class="title"><h1>Recibo de Haberes</h1><p>${monthLabel} · Generado el ${new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'})}</p></div>
</div>

<div class="emp-box">
  <div><div class="label">Empleado</div><div class="value">${emp.name}</div></div>
  <div><div class="label">Período</div><div class="value">${monthLabel}</div></div>
  <div><div class="label">Días programados</div><div class="value">${stats.scheduled}</div></div>
  <div><div class="label">Días trabajados</div><div class="value">${stats.present}</div></div>
  <div><div class="label">Ausencias injustificadas</div><div class="value">${stats.absent}</div></div>
  <div><div class="label">Justificadas / Vacaciones</div><div class="value">${stats.justified}</div></div>
</div>

<div class="section">
  <div class="section-title">Haberes</div>
  <div class="row"><span class="lbl">Sueldo básico</span><span class="val sky">$${baseSalary.toLocaleString('es-AR')}</span></div>
  ${extraHours.length>0?extraHours.map(h=>`<div class="row"><span class="lbl">Hrs extra/remoto — ${h.date} (${h.hours}hs x${h.multiplier})</span><span class="val green">+$${calcMonto(h,emp,schedDays).toLocaleString('es-AR')}</span></div>`).join(''):''}
  ${parseFloat(bonus||0)>0?`<div class="row"><span class="lbl">Bonus / adicional</span><span class="val green">+$${parseFloat(bonus||0).toLocaleString('es-AR')}</span></div>`:''}
</div>

<div class="section">
  <div class="section-title">Descuentos</div>
  ${deductAmt>0?`<div class="row"><span class="lbl">Por ausencias (${deductPct}% — ${stats.absent} día${stats.absent!==1?'s':''})</span><span class="val red">-$${deductAmt.toLocaleString('es-AR')}</span></div>`:'<div class="row"><span class="lbl">Sin descuentos por faltas</span><span class="val green">✓</span></div>'}
  ${deductMins&&minsDeductAmt>0?`<div class="row"><span class="lbl">Por minutos debidos (${mH(netDebt)})</span><span class="val red">-$${minsDeductAmt.toLocaleString('es-AR')}</span></div>`:netDebt>0?`<div class="row"><span class="lbl">Minutos debidos (${mH(netDebt)}) — sin descuento aplicado</span><span class="val amber">⚠ ${mH(netDebt)} pendientes</span></div>`:''}
</div>

${netDebt>0?`<div class="section">
  <div class="section-title">Balance de horas</div>
  <div class="row"><span class="lbl">Minutos debidos (tardanzas sin recuperar)</span><span class="val amber">-${mH(netDebt)}</span></div>
  ${(stats.totalExtraMins||0)>0?`<div class="row"><span class="lbl">Minutos extra trabajados</span><span class="val green">+${mH(stats.totalExtraMins||0)}</span></div>`:''}
  <div class="row"><span class="lbl">Descuento aplicado</span><span class="val ${deductMins?'red':'green'}">${deductMins?`-$${minsDeductAmt.toLocaleString('es-AR')}`:'No aplicado por decisión del empleador'}</span></div>
</div>`:''}

<div class="total-box">
  <span class="lbl">Total neto a cobrar</span>
  <span class="val">$${Math.round(totalNet).toLocaleString('es-AR')}</span>
</div>

${notes?`<div class="notes-box">📝 ${notes}</div>`:''}

<div class="sign-area">
  <div class="sign-line">Firma empleado — ${emp.name}</div>
  <div class="sign-line">Firma empleador — El Lazo</div>
</div>

<div class="footer">
  <span>Recibo generado por Sistema de Control de Asistencia — El Lazo</span>
  <span>Aclaración: este documento es informativo</span>
</div>
</body></html>`;
    const w=window.open('','_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),500);
  };
  return(
    <Modal open={true} onClose={onClose} title={`Liquidación — ${emp.name}`}>
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Sueldo base</span><span className="font-bold">{fmtMoney(baseSalary)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Valor hora ({emp.extra_hour_rate>0?'fijo':emp.monthly_hours>0?`${emp.monthly_hours}h/mes`:'auto'})</span><span className="font-bold text-sky-600">{fmtMoney(Math.round(hourlyRate))}/h</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Días programados</span><span className="font-bold">{stats.scheduled}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Días trabajados</span><span className="font-bold text-emerald-600">{stats.present}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Ausentes injust.</span><span className="font-bold text-red-500">{stats.absent}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Ausentes justif.</span><span className="font-bold text-amber-600">{stats.justified}</span></div>
        </div>
        <div className="bg-red-50 rounded-2xl p-4 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-red-600">Descuento por faltas ({deductPct}%)</span><span className="font-bold text-red-600">-{fmtMoney(deductAmt)}</span></div>
        </div>

        {/* Horas extra */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-bold text-gray-700">Horas extra / remoto</p>
            <p className="text-xs text-gray-400">{fmtMoney(Math.round(hourlyRate))}/h</p>
          </div>
          {extraHours.length===0?(
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-gray-400">Sin horas extra este mes</p>
            </div>
          ):(
            <div className="divide-y divide-gray-50">
              {extraHours.map(h=>{
                const amt=calcMonto(h,emp,schedDays);
                return(
                  <div key={h.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-xs font-bold text-gray-800">
                        {h.hours}h {h.description?`— ${h.description}`:'extra'}
                        {h.multiplier!==1&&<span className="ml-1 text-amber-600 font-bold">×{h.multiplier}</span>}
                      </p>
                      <p className="text-xs text-gray-400">{h.date}</p>
                    </div>
                    <p className="text-sm font-black text-emerald-600">+{fmtMoney(amt)}</p>
                  </div>
                );
              })}
              <div className="flex justify-between items-center px-4 py-3 bg-emerald-50">
                <span className="text-xs font-bold text-emerald-700">Total horas extra</span>
                <span className="text-sm font-black text-emerald-700">+{fmtMoney(Math.round(extraHrsTotal))}</span>
              </div>
            </div>
          )}
        </div>

        {/* Balance de minutos + toggle descuento */}
        {(()=>{
          const isOk=netDebt<=0;
          return(
            <div className={`rounded-2xl p-4 space-y-2 text-sm border ${isOk?'bg-emerald-50 border-emerald-100':deductMins?'bg-red-50 border-red-100':'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center justify-between">
                <p className={`font-bold text-sm ${isOk?'text-emerald-700':deductMins?'text-red-700':'text-amber-700'}`}>⏱ Balance de horas</p>
                {isOk&&<span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-xl font-bold">✅ Al día</span>}
              </div>
              {(stats.totalMissingMins||0)>0&&<div className="flex justify-between text-xs"><span className="text-gray-500">Minutos debidos</span><span className="font-bold text-amber-700">-{mH(stats.totalMissingMins||0)}</span></div>}
              {(stats.totalExtraMins||0)>0&&<div className="flex justify-between text-xs"><span className="text-gray-500">Minutos extra</span><span className="font-bold text-emerald-600">+{mH(stats.totalExtraMins||0)}</span></div>}
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-gray-200">
                <span className="text-gray-600">Balance neto</span>
                <span className={isOk?'text-emerald-600':'text-amber-700'}>{isOk?(netDebt<0?`+${mH(Math.abs(netDebt))}`:'0 — recuperado'):`Debe ${mH(netDebt)}`}</span>
              </div>
              {!isOk&&(
                <div className="mt-2 pt-2 border-t border-amber-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-700">Descontar minutos debidos</p>
                      <p className="text-xs text-gray-400">{mH(netDebt)} → -{fmtMoney(minsDeductAmt)}</p>
                    </div>
                    <button onClick={()=>setDeductMins(d=>!d)}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${deductMins?'bg-red-500':'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${deductMins?'translate-x-5':'translate-x-0.5'}`}/>
                    </button>
                  </div>
                  {!deductMins&&<p className="text-xs text-amber-600 mt-1.5">Desactivado — no se descuenta de la liquidación. Quedará anotado en el recibo.</p>}
                  {deductMins&&<p className="text-xs text-red-600 mt-1.5">Activado — se descontarán {fmtMoney(minsDeductAmt)} del total neto.</p>}
                </div>
              )}
            </div>
          );
        })()}

        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Bonus / adicional (ARS)</label>
          <input type="number" value={bonus} onChange={e=>setBonus(e.target.value)} min="0"
            className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
        </div>
        <Input label="Notas" value={notes} onChange={setNotes} placeholder="Observaciones para la liquidación..."/>
        <div className="bg-sky-50 rounded-2xl p-4 flex justify-between items-center">
          <span className="font-bold text-sky-800 text-sm">TOTAL NETO</span>
          <span className="text-2xl font-black text-sky-700">{fmtMoney(Math.round(totalNet))}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={printRecibo}
            className="py-3 rounded-2xl text-sm font-bold border-2 border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            Imprimir recibo
          </button>
          <button onClick={doSave} disabled={saving} className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Aprobando...':'Aprobar liquidación'}
          </button>
        </div>
      </div>
    </Modal>
  );
}


// ─── NEW ADMIN MODAL ──────────────────────────────────────────────────────────
function NewAdminModal({onClose,onSave}){
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [pw,setPw]=useState('');
  const [perms,setPerms]=useState({});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const doSave=async()=>{
    if(!name||!email||!pw)return setErr('Completá nombre, email y contraseña');
    if(pw.length<6)return setErr('La contraseña debe tener al menos 6 caracteres');
    setSaving(true);setErr('');
    try{await onSave(name,email,pw,perms);}
    catch(e){setErr(e.message);}
    setSaving(false);
  };
  return(
    <Modal open={true} onClose={onClose} title="Nuevo administrador" width="max-w-lg">
      <div className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={setName} placeholder="Ej: Rivka Cohen"/>
        <Input label="Email" type="email" value={email} onChange={setEmail} placeholder="admin@ellazo.com.ar"/>
        <Input label="Contraseña inicial" type="password" value={pw} onChange={setPw} placeholder="Mínimo 6 caracteres"/>
        <div className="border-t border-gray-100 pt-4">
          <AdminPermissionsEditor value={perms} onChange={setPerms}/>
        </div>
        {err&&<p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doSave} disabled={saving} className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Creando...':'Crear admin'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── EDIT ADMIN PERMISSIONS MODAL ─────────────────────────────────────────────
function EditAdminPermsModal({admin,onClose,onSave}){
  const [perms,setPerms]=useState(admin.admin_permissions||{});
  const [isSuperAdmin,setIsSuperAdmin]=useState(!!admin.is_super_admin);
  const [saving,setSaving]=useState(false);
  const allPerms={};
  ALL_PERMISSIONS.forEach(p=>{allPerms[p.key]=true;});
  const doSave=async()=>{
    setSaving(true);
    await onSave(isSuperAdmin?allPerms:perms,isSuperAdmin);
    setSaving(false);
  };
  return(
    <Modal open={true} onClose={onClose} title={`Permisos — ${admin.name}`} width="max-w-lg">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">Super admin</p>
            <p className="text-xs text-gray-400">Acceso completo a todo, igual que vos</p>
          </div>
          <button onClick={()=>setIsSuperAdmin(v=>!v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isSuperAdmin?'bg-violet-500':'bg-gray-200'}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isSuperAdmin?'translate-x-5':'translate-x-0.5'}`}/>
          </button>
        </div>
        {!isSuperAdmin&&(
          <div className="opacity-100 transition-opacity">
            <AdminPermissionsEditor value={perms} onChange={setPerms}/>
          </div>
        )}
        {isSuperAdmin&&(
          <div className="bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
            <p className="text-xs text-violet-700">Este admin tendrá acceso completo a todas las secciones y funciones.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
          <button onClick={doSave} disabled={saving} className="py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
            {saving?'Guardando...':'Guardar permisos'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── MAIN ADMIN VIEW ──────────────────────────────────────────────────────────
export default function AdminView({profile,onLogout}){
  const [tab,setTab]=useState('dashboard');
  // kept for compatibility
  const [employees,setEmployees]=useState([]);
  const [todayRecs,setTodayRecs]=useState([]);
  const [filteredRecs,setFilteredRecs]=useState([]);
  const [monthRecs,setMonthRecs]=useState([]);
  const [prevMonthRecs,setPrevMonthRecs]=useState([]);
  const [approvedVacations,setApprovedVacations]=useState([]);
  const [monthExceptions,setMonthExceptions]=useState([]);
  const [approvedLeaves,setApprovedLeaves]=useState([]);
  const [holidays,setHolidays]=useState([]);
  const [hq,setHq]=useState(null);
  const [toast,setToast]=useState(null);
  const [empSchedMap,setEmpSchedMap]=useState({});

  const [filterDate,setFilterDate]=useState(localDateISO());
  const [analysisEmp,setAnalysisEmp]=useState('all');
  const [filterEmp,setFilterEmp]=useState('all');
  const [analysisMonth,setAnalysisMonth]=useState(new Date().toISOString().slice(0,7));
  const [hqForm,setHqForm]=useState({name:'',lat:'',lng:'',radius_meters:100});
  const [holForm,setHolForm]=useState({date:'',name:''});

  const [editRec,setEditRec]=useState(null);
  const [auditRecId,setAuditRecId]=useState(null);
  const [showNewRec,setShowNewRec]=useState(false);
  const [showNewAdmin,setShowNewAdmin]=useState(false);
  const [editAdminPerms,setEditAdminPerms]=useState(null);

  const [activeTab,setActiveTab]=useState('dashboard');
  const [showAddEmp,setShowAddEmp]=useState(false);
  const [showAddHol,setShowAddHol]=useState(false);
  const [editHol,setEditHol]=useState(null);

  const [editEmpId,setEditEmpId]=useState(null);
  const [editEmpSched,setEditEmpSched]=useState({});
  const [editSalaryEmp,setEditSalaryEmp]=useState(null);
  const [editSalaryVal,setEditSalaryVal]=useState('');
  const [editExtraRateVal,setEditExtraRateVal]=useState('');
  const [editMonthlyHours,setEditMonthlyHours]=useState('');
  const [editEmpData,setEditEmpData]=useState(null); // {emp, form}
  const [viewEmpId,setViewEmpId]=useState(null);
  const [viewEmpMonth,setViewEmpMonth]=useState(new Date().toISOString().slice(0,7));
  const [viewEmpRecs,setViewEmpRecs]=useState([]);
  const [viewEmpExtra,setViewEmpExtra]=useState([]);
  const [payrollEmp,setPayrollEmp]=useState(null);
  const [extraHoursList,setExtraHoursList]=useState([]);
  const [payrolls,setPayrolls]=useState([]);

  const showToast=(msg,type='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};
  const todayDow=new Date().getDay();
  const can=(key)=>hasPermission(profile,key);

  const loadAll=useCallback(async()=>{
    const [empsRes,schedsRes,todayRes,hqRes,holsRes]=await Promise.allSettled([
      getAllProfiles(),getAllSchedules(),getFilteredRecords({date:localDateISO()}),getHQ(),getHolidays()
    ]);
    const emps=empsRes.status==='fulfilled'?empsRes.value:[];
    const scheds=schedsRes.status==='fulfilled'?schedsRes.value:[];
    const today=todayRes.status==='fulfilled'?todayRes.value:[];
    const hols=holsRes.status==='fulfilled'?holsRes.value:[];
    const hqData=hqRes.status==='fulfilled'?hqRes.value:null;
    [empsRes,schedsRes,todayRes,hqRes,holsRes].forEach((r,i)=>{if(r.status==='rejected')console.error('loadAll['+i+']:',r.reason?.message);});
    setEmployees(emps||[]);setTodayRecs(today||[]);setHolidays(hols||[]);
    if(hqData){setHq(hqData);setHqForm({name:hqData.name,lat:hqData.lat,lng:hqData.lng,radius_meters:hqData.radius_meters});}
    const sm={};(scheds||[]).forEach(s=>{if(!sm[s.employee_id])sm[s.employee_id]={};sm[s.employee_id][s.day_of_week]=s;});
    setEmpSchedMap(sm);
  },[]);

  useEffect(()=>{
    loadAll();
    runAlerts().catch(()=>{}); // Run alerts silently on load
    const interval = setInterval(()=>{ loadAll(); runAlerts().catch(()=>{}); }, 60000);
    return ()=>clearInterval(interval);
  },[loadAll]);

  useEffect(()=>{
    getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp}).then(setFilteredRecs).catch(()=>{});
  },[filterDate,filterEmp]);

  useEffect(()=>{
    getRecordsByMonth(analysisMonth).then(setMonthRecs).catch(()=>{});
    // Load approved vacations that overlap this month
    const [y,m]=analysisMonth.split('-').map(Number);
    const monthStart=`${analysisMonth}-01`;
    const monthEnd=`${analysisMonth}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
    supabase.from('vacation_requests').select('employee_id,start_date,end_date')
      .eq('status','approved').lte('start_date',monthEnd).gte('end_date',monthStart)
      .then(({data})=>setApprovedVacations(data||[])).catch(()=>{});
    // Load schedule exceptions for the month
    supabase.from('schedule_exceptions').select('employee_id,date,type')
      .gte('date',monthStart).lte('date',monthEnd)
      .then(({data})=>setMonthExceptions(data||[])).catch(()=>{});
    // Load approved leave requests that overlap this month
    supabase.from('leave_requests').select('employee_id,start_date,end_date,type')
      .eq('status','approved').lte('start_date',monthEnd).gte('end_date',monthStart)
      .then(({data})=>setApprovedLeaves(data||[])).catch(()=>{});
    // Load previous month for trend comparison
    const prevDate=new Date(y,m-2,1);
    const prevMonth=prevDate.toISOString().slice(0,7);
    getRecordsByMonth(prevMonth).then(setPrevMonthRecs).catch(()=>{});

    // Load payrolls
    supabase.from('payroll').select('*').eq('month',analysisMonth)
      .then(({data})=>setPayrolls(data||[])).catch(()=>{});
    // Load extra hours for month (use explicit FK to avoid ambiguity)
    const [ey,em]=analysisMonth.split('-').map(Number);
    const eStart=`${analysisMonth}-01`;
    const eEnd=`${analysisMonth}-${String(new Date(ey,em,0).getDate()).padStart(2,'0')}`;
    supabase.from('extra_hours')
      .select('*, employee:profiles!extra_hours_employee_id_fkey(id,name,avatar,salary,extra_hour_rate)')
      .gte('date',eStart).lte('date',eEnd)
      .order('date',{ascending:false})
      .then(({data})=>setExtraHoursList(data||[])).catch(()=>{});
  },[analysisMonth]);

  const presentToday=todayRecs.filter(r=>r.check_in).length;
  const workingToday=employees.filter(e=>empSchedMap[e.id]?.[todayDow]?.active).length;

  // Add employee
  const handleAddEmployee=async(name,email,pw,salary,hireDate,sched)=>{
    const {data:rpcData,error:rpcError}=await supabase.rpc('admin_create_employee',{p_name:name,p_email:email,p_password:pw});
    let empId=null;
    if(rpcError){
      const avatar=name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const {data:p,error:pe}=await supabase.from('profiles').insert({name,email,role:'employee',avatar,bio_registered:false,active:true,salary}).select().single();
      if(pe)throw new Error('Error: '+pe.message);
      empId=p.id;
    } else {
      empId=rpcData;
      const profileUpdates = {};
    if(salary>0) profileUpdates.salary = salary;
    if(hireDate) profileUpdates.hire_date = hireDate;
    if(Object.keys(profileUpdates).length>0) await supabase.from('profiles').update(profileUpdates).eq('id',empId);
    }
    const schedRows=Object.entries(sched).filter(([,s])=>s.active).map(([dow,s])=>({employee_id:empId,day_of_week:parseInt(dow),start_time:s.start_time||'09:00',end_time:s.end_time||'17:00',tolerance_minutes:0,active:true}));
    if(schedRows.length>0)await supabase.from('schedules').insert(schedRows);
    await loadAll();showToast('Empleado creado');
  };

  // Edit schedules
  const openEditSched=emp=>{setEditEmpId(emp.id);setEditEmpSched(empSchedMap[emp.id]||{});};
  const saveEmpSched=async()=>{
    try{
      await upsertSchedules(editEmpId,editEmpSched);
      await loadAll();setEditEmpId(null);
      showToast('Horario actualizado — aplica desde hoy');
    }
    catch(e){showToast(e.message,'error');}
  };

  // Edit salary
  const saveSalary=async()=>{
    await supabase.from('profiles').update({salary:parseFloat(editSalaryVal)||0}).eq('id',editSalaryEmp.id);
    await loadAll();setEditSalaryEmp(null);showToast('Sueldo actualizado');
  };

  // Edit employee data
  const openEditEmp = emp => {
    setEditEmpData({ emp, form: { name:emp.name, email:emp.email, password:'', avatar:emp.avatar||'', hire_date:emp.hire_date||'' } });
  };
  const saveEditEmp = async () => {
    const {emp, form} = editEmpData;
    const updates = { name:form.name, email:form.email,
      avatar: form.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(),
      hire_date: form.hire_date || null };
    await supabase.from('profiles').update(updates).eq('id', emp.id);
    if (form.password) {
      // Update password via admin RPC
      await supabase.rpc('admin_update_password', { p_user_id: emp.id, p_password: form.password }).catch(()=>{});
    }
    await loadAll();
    setEditEmpData(null);
    showToast('Empleado actualizado');
  };
  const handleDeleteEmp = async (emp) => {
    if (!window.confirm(`¿Eliminar a ${emp.name}? Se borrarán todos sus registros.`)) return;
    await supabase.from('profiles').update({active:false}).eq('id', emp.id);
    await loadAll();
    showToast('Empleado eliminado');
  };

  // View employee profile
  const openViewEmp = async (emp) => {
    setViewEmpId(emp.id);
    const [y,m] = viewEmpMonth.split('-').map(Number);
    const start = viewEmpMonth + '-01';
    const end = new Date(y,m,0).toISOString().split('T')[0];
    const [{data:recs},{data:extras}] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('employee_id',emp.id).gte('date',start).lte('date',end).order('date'),
      supabase.from('extra_hours').select('*').eq('employee_id',emp.id).gte('date',start).lte('date',end)
    ]);
    setViewEmpRecs(recs||[]);
    setViewEmpExtra(extras||[]);
  };
  const reloadViewEmp = async (empId, month) => {
    const [y,m] = month.split('-').map(Number);
    const start = month + '-01';
    const end = new Date(y,m,0).toISOString().split('T')[0];
    const [{data:recs},{data:extras}] = await Promise.all([
      supabase.from('attendance_records').select('*').eq('employee_id',empId).gte('date',start).lte('date',end).order('date'),
      supabase.from('extra_hours').select('*').eq('employee_id',empId).gte('date',start).lte('date',end)
    ]);
    setViewEmpRecs(recs||[]);
    setViewEmpExtra(extras||[]);
  };

  // Records
  const handleSaveRec=async(recId,patch,reason)=>{
    try{await adminEditRecord(recId,patch,profile.id,reason);
      const updated=await getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp});
      setFilteredRecs(updated);setEditRec(null);showToast('Registro actualizado');}
    catch(e){showToast(e.message,'error');}
  };
  const handleNewRec=async({empId,date,check_in,check_out,minutes_worked,status,reason})=>{
    // Check if record already exists for this employee+date
    const existing=filteredRecs.find(r=>r.employee_id===empId&&r.date===date);
    if(existing){
      // Update existing record
      await adminEditRecord(existing.id,{check_in,check_out,minutes_worked,status},profile.id,reason);
    } else {
      // Insert new record
      const {error}=await supabase.from('attendance_records').insert({
        employee_id:empId, date, check_in, check_out,
        minutes_worked, status, edited_by:profile.id,
        edited_at:new Date().toISOString(), edit_reason:reason,
      });
      if(error) throw error;
      // Log in attendance_edits
      await supabase.from('attendance_edits').insert({
        record_id:null, edited_by:profile.id,
        field_changed:'manual_entry', old_value:null,
        new_value:`${date} ${check_in?.slice(11,16)||''}-${check_out?.slice(11,16)||''}`,
        reason,
      }).catch(()=>{});
    }
    const updated=await getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp});
    setFilteredRecs(updated);
    showToast('Registro guardado');
  };

  const handleManualRecord=async(empId,date,status,just)=>{
    try{await adminAddManualRecord({employeeId:empId,date,status,justification:just,adminId:profile.id});
      const updated=await getFilteredRecords({date:filterDate||undefined,employeeId:filterEmp});
      setFilteredRecs(updated);showToast('Registro agregado');}
    catch(e){showToast(e.message,'error');}
  };

  // Extra hours


  const handleSaveExtra=async({id,empId,date,hours,description,multiplier,hourly_rate})=>{
    try{
      await saveExtraHour({id,empId,date,hours,description,multiplier,hourly_rate,approved_by:profile.id});
      await loadExtraHours(analysisMonth);
      setEditExtraData(null);
      showToast(id?'Registro actualizado':'Horas extra guardadas');
    }catch(e){showToast(e.message,'error');}
  };



  // Payroll
  const handleSavePayroll=async(data)=>{
    await supabase.from('payroll').upsert({...data,approved_by:profile.id},{onConflict:'employee_id,month'});
    const {data:p}=await supabase.from('payroll').select('*').eq('month',analysisMonth);
    setPayrolls(p||[]);showToast('Liquidación aprobada');
  };

  // Holidays
  const handleAddHol=async()=>{if(!holForm.date||!holForm.name)return;
    try{const h=await addHoliday(holForm.date,holForm.name,profile.id);setHolidays(p=>[...p,h]);setShowAddHol(false);setHolForm({date:'',name:''});showToast('Feriado agregado');}
    catch(e){showToast(e.message,'error');}
  };
  const handleImportHolidays=async(year)=>{
    const toImport=getHolidaysForYear(year);let count=0;
    for(const h of toImport){
      const {error}=await supabase.from('holidays').insert({date:h.date,name:h.name,created_by:profile.id}).select();
      if(!error)count++;
    }
    const hols=await getHolidays();setHolidays(hols);
    showToast(`Importados ${count} feriados de ${year}`);
  };
  const handleEditHol=async()=>{
    if(!editHol?.name||!editHol?.date) return;
    try{
      const{error}=await supabase.from('holidays').update({name:editHol.name,date:editHol.date}).eq('id',editHol.id);
      if(error)throw error;
      setHolidays(p=>p.map(h=>h.id===editHol.id?{...h,name:editHol.name,date:editHol.date}:h));
      setEditHol(null);
      showToast('Feriado actualizado');
    }catch(e){showToast(e.message,'error');}
  };
  const handleDelHol=async(id)=>{try{await deleteHoliday(id);setHolidays(p=>p.filter(h=>h.id!==id));}catch(e){showToast(e.message,'error');}};

  // HQ
  const detectHQ=()=>{getGeoPos().then(p=>setHqForm(f=>({...f,lat:+(p.coords.latitude.toFixed(6)),lng:+(p.coords.longitude.toFixed(6))}))).catch(()=>showToast('GPS no disponible','error'));};
  const saveHQ=async()=>{
    try{const h=await updateHQ(hqForm.name,parseFloat(hqForm.lat),parseFloat(hqForm.lng),parseInt(hqForm.radius_meters),profile.id);setHq(h);showToast('Sede actualizada');}
    catch(e){showToast(e.message,'error');}
  };

  // Analysis stats
  const getStats=empId=>{
    const sched=empSchedMap[empId]||{};
    const [y,m]=analysisMonth.split('-').map(Number);const days=new Date(y,m,0).getDate();
    const today=new Date().toISOString().split('T')[0];
    let scheduled=0,present=0,absent=0,justified=0;
    let lateMins=0,lateCount=0;       // tardanzas
    let totalWorked=0;                 // minutos reales trabajados (check_out - check_in)
    let totalExpected=0;               // minutos esperados en días presentes
    let totalMissingMins=0;            // minutos faltantes acumulados (llegó tarde + salió antes)
    let totalExtraMins=0;              // minutos extra (salió tarde)

    for(let d=1;d<=days;d++){
      const date=`${analysisMonth}-${String(d).padStart(2,'0')}`;
      const dow=new Date(date+'T12:00:00').getDay();
      const daySched=sched[dow];
      if(!daySched?.active)continue;
      scheduled++;
      const expectedMinutes=(()=>{
        const [sh,sm]=(daySched.start_time||'09:00').split(':').map(Number);
        const [eh,em]=(daySched.end_time||'17:00').split(':').map(Number);
        return (eh*60+em)-(sh*60+sm);
      })();

      const rec=monthRecs.find(r=>r.employee_id===empId&&r.date===date);
      if(rec?.check_in){
        present++;
        const late=rec.minutes_late||0; // ya tiene la tolerancia descontada (solo cuenta si >15min)
        if(late>0){lateMins+=late;lateCount++;}
        if(rec.minutes_worked){
          totalWorked+=rec.minutes_worked;
          totalExpected+=expectedMinutes;
          // diff = tiempo real trabajado vs jornada esperada
          // Si llegó 5min tarde (dentro de tolerancia) y salió 5min tarde → diff ≈ 0 → correcto
          // Si llegó 20min tarde (tardanza real 5min) y salió a la hora → diff = -5min
          // Si salió 30min tarde → diff = +30min de extra
          const diff=rec.minutes_worked-expectedMinutes;
          if(diff>5) totalExtraMins+=diff;       // margen 5min para evitar ruido GPS
          else if(diff<-5) totalMissingMins+=Math.abs(diff);
        }
      } else if(rec?.status==='justified'){
        justified++;
      } else if(approvedVacations.some(v=>v.employee_id===empId&&date>=v.start_date&&date<=v.end_date)){
        // Vacaciones aprobadas → justificado
        justified++;
      } else if(holidays.some(h=>h.date===date)){
        // Feriado → no cuenta como falta ni como día programado
        scheduled--; // lo quitamos del total porque no era día laboral
      } else if(monthExceptions.some(e=>e.employee_id===empId&&e.date===date&&e.type==='free')){
        // Excepción "No trabaja" → no cuenta como falta
        scheduled--; // tampoco era día laboral ese día
      } else if(approvedLeaves.some(l=>l.employee_id===empId&&date>=l.start_date&&date<=l.end_date)){
        // Licencia aprobada (enfermedad, duelo, etc.) → justificado
        justified++;
      } else if(date<=today){
        absent++;
        totalExpected+=expectedMinutes;
        totalMissingMins+=expectedMinutes; // día entero faltante
      }
    }
    return{
      scheduled,present,absent,justified,
      lateMins,lateCount,
      totalWorked,totalExpected,
      totalExtraMins,totalMissingMins,
      pct:scheduled>0?Math.round(present/scheduled*100):0,
      punctPct:present>0?Math.round((present-lateCount)/present*100):100,
      lateHM: lateMins>0?`${Math.floor(lateMins/60)}h ${lateMins%60}m`:'0',
      totalWork: totalWorked,
    };
  };

  // Stats for previous month (for trend)
  const getPrevStats=empId=>{
    const sched=empSchedMap[empId]||{};
    const [y,m]=analysisMonth.split('-').map(Number);
    const prevDate=new Date(y,m-2,1);
    const prevMonth=prevDate.toISOString().slice(0,7);
    const days=new Date(prevDate.getFullYear(),prevDate.getMonth()+1,0).getDate();
    let scheduled=0,present=0;
    for(let d=1;d<=days;d++){
      const date=`${prevMonth}-${String(d).padStart(2,'0')}`;
      const dow=new Date(date+'T12:00:00').getDay();
      if(!sched[dow]?.active)continue;
      scheduled++;
      const rec=prevMonthRecs.find(r=>r.employee_id===empId&&r.date===date);
      if(rec?.check_in) present++;
    }
    return{scheduled,present,pct:scheduled>0?Math.round(present/scheduled*100):0};
  };

  const TABS=[
    ['dashboard','Panel','M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6','dashboard'],
    ['employees','Empleados','M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z','employees'],
    ['records','Registros','M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2','records'],
    ['payroll','Sueldos','M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z','salaries'],
    ['holidays','Feriados','M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z','holidays'],
    ['analysis','Análisis','M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z','analysis'],
    ['vacaciones','Vacaciones','M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 3v10.5',null],
    ['tareas','Tareas','M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',null],
    ['licencias','Licencias','M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',null],
    ['excepciones','Excepciones','M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z','exceptions'],
    ['alertas','Alertas','M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9','notifications'],
    ['extra_hours','Hs Extra','M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',null],
    ['settings','Config','M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',null],
  ].filter(([id,label,path,perm])=>!perm||can(perm));

  return(
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toast toast={toast}/>
      <div className="sticky top-0 z-10" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 100%)"}}>
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <img src={logoWhite} alt="El Lazo" className="h-7 w-auto" style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'}}/>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell/>
            <button onClick={onLogout} className="text-xs text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10">Salir</button>
          </div>
        </div>
      </div>
      <div className="bg-white border-b border-gray-100 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 flex">
          {TABS.map(([t,label,icon])=>(
            <button key={t} onClick={()=>setTab(t)} className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-3.5 text-xs font-bold border-b-2 transition-colors ${tab===t?'border-sky-500 text-sky-600':'border-transparent text-gray-400 hover:text-gray-600'}`}>
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
                  const mins=rec?.check_in&&rec?.check_out?Math.round((new Date(rec.check_out)-new Date(rec.check_in))/60000):null;
                  return(
                    <div key={emp.id} className="flex items-center gap-3 px-5 py-4">
                      <Avatar initials={emp.avatar} size="sm"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400">{sc?.start_time?.slice(0,5)} – {sc?.end_time?.slice(0,5)}</p>
                      </div>
                      <div className="text-right">
                        {rec?.check_in?<>
                          <Badge color={rec.check_out?'teal':'green'}>{rec.check_out?'Jornada completa':'Presente'}</Badge>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            {fmtTime(rec.check_in)}{rec.check_out?` → ${fmtTime(rec.check_out)}`:''}
                            {mins?` · ${Math.floor(mins/60)}h${mins%60}m`:''}
                          </p>
                          {(rec.minutes_late||0)>0&&<p className="text-xs text-amber-500">+{rec.minutes_late}min tarde</p>}
                        </>:<Badge color="red">Ausente</Badge>}
                      </div>
                    </div>
                  );
                })}
                {workingToday===0&&<p className="text-sm text-gray-400 text-center py-8">Nadie tiene turno hoy</p>}
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYEES */}
        {tab==='employees'&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Empleados</h2>
                <p className="text-sm text-gray-400">{employees.length} registrados</p></div>
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
                        {emp.salary>0&&<Badge color="teal">{fmtMoney(emp.salary)}/mes</Badge>}
                      </div>
                      <p className="text-xs text-gray-400">{emp.email}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {DAYS.map((d,i)=>empSchedMap[emp.id]?.[i]?.active&&(
                          <span key={i} className="px-2 py-0.5 bg-sky-50 text-sky-700 text-xs rounded-lg font-bold">{DAYS_SHORT[i]} {empSchedMap[emp.id][i].start_time?.slice(0,5)}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 flex-col">
                      <button onClick={()=>openViewEmp(emp)} className="p-2 text-gray-300 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-colors" title="Ver historial">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      </button>
                      <button onClick={()=>openEditEmp(emp)} className="p-2 text-gray-300 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-colors" title="Editar datos">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={()=>openEditSched(emp)} className="p-2 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors" title="Editar horario">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                      </button>
                      <button onClick={()=>handleDeleteEmp(emp)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                      <button onClick={()=>{setEditSalaryEmp(emp);setEditSalaryVal(emp.salary||'');}} className="p-2 text-gray-300 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors" title="Editar sueldo">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      </button>
                    </div>
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
            <div className="flex gap-2 flex-wrap items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                <input type="date" value={filterDate} onChange={e=>setFilterDate(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                <select value={filterEmp} onChange={e=>setFilterEmp(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-white">
                  <option value="all">Todos</option>{employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <button onClick={()=>{setFilterDate('');setFilterEmp('all');}} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Limpiar</button>
              </div>
              {can('records_edit')&&<button onClick={()=>setShowNewRec(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white flex-shrink-0"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                Agregar registro
              </button>}
            </div>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {filteredRecs.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin registros</p>}
              {filteredRecs.map(rec=>{
                const mins=rec.check_in&&rec.check_out?Math.round((new Date(rec.check_out)-new Date(rec.check_in))/60000):null;
                return(
                  <div key={rec.id} className={`px-5 py-4 ${rec.edit_reason==='Carga manual por admin'||rec.edited_by?'bg-sky-50/30':''}`}>
                    <div className="flex items-start gap-3">
                      {rec.profiles&&<Avatar initials={rec.profiles.avatar} size="sm"/>}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{rec.profiles?.name||'—'}</p>
                          <span className="text-xs text-gray-400">{fmtDate(rec.date)}</span>
                          {rec.edited_at&&<span className="text-xs text-amber-500">✏️</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-gray-500">
                          {rec.check_in&&<span>↓ <span className="font-mono font-bold">{fmtTime(rec.check_in)}</span>{(rec.minutes_late||0)>0&&<span className="text-amber-500 ml-1">+{rec.minutes_late}min</span>}</span>}
                          {rec.check_out&&<span>↑ <span className="font-mono font-bold">{fmtTime(rec.check_out)}</span></span>}
                          {mins&&<span className="text-gray-400">· {Math.floor(mins/60)}h{mins%60}m</span>}
                        </div>
                        {rec.justification&&<p className="text-xs text-amber-600 italic mt-0.5">"{rec.justification}"</p>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {rec.status==='present'&&<Badge color={rec.check_out?'teal':'green'}>{rec.check_out?'Completa':'Presente'}</Badge>}
                        {rec.status==='absent'&&<Badge color="red">Ausente</Badge>}
                        {rec.status==='justified'&&<Badge color="yellow">Justificada</Badge>}
                        {rec.status==='holiday'&&<Badge color="purple">Feriado</Badge>}
                        <button onClick={()=>setEditRec(rec)} className="p-2 text-gray-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl transition-colors" title="Editar">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        {can('records_edit')&&rec.edited_by&&(
                          <button onClick={()=>setAuditRecId(rec.id)} className="p-2 text-gray-300 hover:text-violet-500 hover:bg-violet-50 rounded-xl transition-colors" title="Ver historial de cambios">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <ManualForm employees={employees} onSave={handleManualRecord}/>
          </div>
        )}

        {/* PAYROLL */}
        {tab==='payroll'&&(
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div><h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Sueldos</h2>
                <p className="text-sm text-gray-400">Liquidación mensual</p></div>
              <div className="flex gap-2">
                <input type="month" value={analysisMonth} onChange={e=>setAnalysisMonth(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>

              </div>
            </div>

            {/* Per-employee payroll cards */}
            <div className="grid gap-4 md:grid-cols-2">
              {employees.map(emp=>{
                const stats=getStats(emp.id);
                const prl=payrolls.find(p=>p.employee_id===emp.id);
                const empExtras=extraHoursList.filter(h=>h.employee_id===emp.id);
                const deductPct=stats.scheduled>0?Math.round((stats.absent/stats.scheduled)*100):0;
                const deductAmt=Math.round((emp.salary||0)*(deductPct/100));
                const schedDaysEmp=Object.values(empSchedMap?.[emp.id]||{}).filter(s=>s?.active).length||stats.scheduled||20;
                const extraAmt=empExtras.reduce((acc,h)=>acc+calcMonto(h,h.employee||emp,schedDaysEmp),0);
                const estimated=(emp.salary||0)-deductAmt+extraAmt; // hourlyRateEmp already applied above
                return(
                  <div key={emp.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3"><Avatar initials={emp.avatar}/>
                        <div><p className="font-bold text-gray-900 text-sm">{emp.name}</p>
                          <p className="text-xs text-gray-400">Base: {fmtMoney(emp.salary||0)}/mes</p>
                          {emp.salary>0&&stats.scheduled>0&&(
                            <p className="text-xs text-gray-300">
                              Hs: {fmtMoney(emp.extra_hour_rate||Math.round((emp.salary||0)/(stats.scheduled*8)))}/h
                            </p>
                          )}
                        </div>
                      </div>
                      {prl?.status==='approved'?<Badge color="green">✓ Aprobado</Badge>:<Badge color="gray">Borrador</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                      <div className="bg-gray-50 rounded-xl p-2.5"><p className="text-gray-400">Trabajados</p><p className="font-bold text-gray-800">{stats.present}/{stats.scheduled} días</p></div>
                      <div className="bg-red-50 rounded-xl p-2.5"><p className="text-red-400">Descuento</p><p className="font-bold text-red-600">-{fmtMoney(deductAmt)} ({deductPct}%)</p></div>
                      <div className="bg-emerald-50 rounded-xl p-2.5"><p className="text-emerald-400">Hs extra</p><p className="font-bold text-emerald-600">+{fmtMoney(extraAmt)}</p></div>
                      <div className="bg-sky-50 rounded-xl p-2.5"><p className="text-sky-400">Estimado</p><p className="font-bold text-sky-700">{fmtMoney(prl?.total_net||estimated)}</p></div>
                    </div>
                    {prl?.notes&&<p className="text-xs text-gray-400 italic mb-3">"{prl.notes}"</p>}
                    <button onClick={()=>setPayrollEmp(emp)}
                      className="w-full py-2.5 rounded-2xl text-xs font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                      {prl?'Ver / editar liquidación':'Generar liquidación'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* HOLIDAYS */}
        {tab==='holidays'&&(
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Feriados</h2>
              <div className="flex gap-2 flex-wrap">
                {[2025,2026,2027].map(y=>(
                  <button key={y} onClick={()=>handleImportHolidays(y)} className="px-3 py-2 rounded-2xl text-xs font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors">
                    Importar {y}
                  </button>
                ))}
                <button onClick={()=>setShowAddHol(true)} className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>+ Manual</button>
              </div>
            </div>
            <p className="text-xs text-gray-400">Los botones "Importar" cargan automáticamente todos los feriados argentinos + Iom Tov judíos del año.</p>
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
              {holidays.length===0&&<p className="text-sm text-gray-400 text-center py-10">Sin feriados cargados — usá los botones de importar</p>}
              {holidays.sort((a,b)=>a.date.localeCompare(b.date)).map(h=>(
                <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{h.name}</p>
                    <p className="text-xs text-gray-400">{fmtDate(h.date)} — {DAYS[new Date(h.date+'T12:00:00').getDay()]}</p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={()=>setEditHol({...h})} className="p-2 text-gray-300 hover:text-sky-500 hover:bg-sky-50 rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                    <button onClick={()=>handleDelHol(h.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
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
              <div className="flex gap-2 items-center flex-wrap">
                <select value={analysisEmp} onChange={e=>setAnalysisEmp(e.target.value)}
                  className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-white">
                  <option value="all">Todos los empleados</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <input type="month" value={analysisMonth} onChange={e=>setAnalysisMonth(e.target.value)} className="px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                <ExportButton employees={employees} records={monthRecs} schedMap={empSchedMap} month={analysisMonth} extraHours={extraHoursList} payrolls={payrolls}/>
              </div>
            </div>

            {/* Calendar view for single employee */}
            {analysisEmp!=='all'&&(
              <MonthCalendar
                month={analysisMonth}
                records={monthRecs.filter(r=>r.employee_id===analysisEmp)}
                schedMap={empSchedMap[analysisEmp]||{}}
                holidays={holidays}
                onDayClick={cell=>{ const rec=monthRecs.find(r=>r.employee_id===analysisEmp&&r.date===cell.date); setEditRec(rec||{date:cell.date,employee_id:analysisEmp,profiles:{name:employees.find(e=>e.id===analysisEmp)?.name,avatar:employees.find(e=>e.id===analysisEmp)?.avatar}}); }}
              />
            )}

            {analysisEmp==='all'&&(()=>{
              const allCurrent=employees.map(e=>getStats(e.id));
              const allPrev=employees.map(e=>getPrevStats(e.id));
              const avgCurrent=allCurrent.length?Math.round(allCurrent.reduce((a,s)=>a+s.pct,0)/allCurrent.length):0;
              const avgPrev=allPrev.filter(p=>p.scheduled>0).length?Math.round(allPrev.filter(p=>p.scheduled>0).reduce((a,p)=>a+p.pct,0)/allPrev.filter(p=>p.scheduled>0).length):null;
              const totalPresent=allCurrent.reduce((a,s)=>a+s.present,0);
              const totalAbsent=allCurrent.reduce((a,s)=>a+s.absent,0);
              const totalLate=allCurrent.reduce((a,s)=>a+s.lateCount,0);
              const diff=avgPrev!==null?avgCurrent-avgPrev:null;
              return(
                <div className="bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 rounded-3xl p-5 mb-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-sky-600 uppercase tracking-wide">Resumen general del mes</p>
                    {diff!==null&&(
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${diff>0?'bg-emerald-100 text-emerald-700':diff<0?'bg-red-100 text-red-600':'bg-gray-100 text-gray-500'}`}>
                        {diff>0?'↑':diff<0?'↓':'='} {diff!==0?`${Math.abs(diff)}pp`:'igual'} vs mes anterior
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {(()=>{
                      const avgPunct=allCurrent.filter(s=>s.present>0).length?Math.round(allCurrent.filter(s=>s.present>0).reduce((a,s)=>a+(s.punctPct||100),0)/allCurrent.filter(s=>s.present>0).length):100;
                      return[
                        {l:'Asist. promedio',v:`${avgCurrent}%`,c:'text-sky-700 text-xl'},
                        {l:'Puntualidad',v:`${avgPunct}%`,c:'text-violet-600 text-xl'},
                        {l:'Ausentes',v:totalAbsent,c:'text-red-500 text-xl'},
                        {l:'Tardanzas',v:totalLate,c:'text-amber-600 text-xl'},
                      ];
                    })().map(({l,v,c})=>(
                      <div key={l} className="bg-white/70 rounded-2xl p-2.5">
                        <p className={`font-black ${c}`}>{v}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid gap-4 md:grid-cols-2">
              {employees.filter(e=>analysisEmp==='all'||e.id===analysisEmp).map(emp=>{const s=getStats(emp.id);
                const pC=s.pct>=90?'text-emerald-600':s.pct>=75?'text-amber-600':'text-red-500';
                const bC=s.pct>=90?'from-emerald-400 to-emerald-500':s.pct>=75?'from-amber-400 to-amber-500':'from-red-400 to-red-500';
                const th=s.totalWork?`${Math.floor(s.totalWork/60)}h ${s.totalWork%60}m`:'—';
                const extraHrsEmp=extraHoursList.filter(h=>h.employee_id===emp.id);
                const totalExtraHrs=extraHrsEmp.reduce((a,h)=>a+h.hours,0);
                return(
                  <div key={emp.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3"><Avatar initials={emp.avatar}/>
                        <div><p className="font-bold text-gray-900 text-sm">{emp.name}</p><p className="text-xs text-gray-400">{s.scheduled} días prog.</p></div>
                      </div>
                      <div className="text-right">
                        <p className={`text-3xl font-black ${pC}`}>{s.pct}%</p>
                        {(()=>{const prev=getPrevStats(emp.id);const diff=s.pct-prev.pct;const hasPrev=prev.scheduled>0;
                          if(!hasPrev)return<p className="text-xs text-gray-300">primer mes</p>;
                          if(diff===0)return<p className="text-xs text-gray-400">= igual que mes ant.</p>;
                          return<p className={`text-xs font-bold ${diff>0?'text-emerald-500':'text-red-400'}`}>{diff>0?'↑':'↓'}{Math.abs(diff)}pp vs mes ant.</p>;
                        })()}
                      </div>
                    </div>
                    <div className="mb-1">
                      <div className="flex justify-between mb-1"><span className="text-xs text-gray-400">Asistencia</span><span className={`text-xs font-bold ${pC}`}>{s.pct}%</span></div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${bC}`} style={{width:`${s.pct}%`}}/>
                      </div>
                    </div>
                    {(()=>{
                      const pp=s.punctPct;
                      const pPC=pp>=90?'text-violet-600':pp>=70?'text-amber-600':'text-red-500';
                      const pBC=pp>=90?'from-violet-400 to-violet-500':pp>=70?'from-amber-400 to-amber-500':'from-red-400 to-red-500';
                      return s.present>0?(
                        <div className="mb-4">
                          <div className="flex justify-between mb-1"><span className="text-xs text-gray-400">Puntualidad</span><span className={`text-xs font-bold ${pPC}`}>{pp}%</span></div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className={`h-full rounded-full bg-gradient-to-r ${pBC}`} style={{width:`${pp}%`}}/>
                          </div>
                        </div>
                      ):<div className="mb-4"/>;
                    })()}
                    <div className="grid grid-cols-4 gap-2 text-center mb-3">
                      {[{l:'Pres.',v:s.present,c:'text-emerald-600'},{l:'Aus.',v:s.absent,c:'text-red-500'},{l:'Just.',v:s.justified,c:'text-amber-600'},{l:'Tard.',v:s.lateCount,c:'text-violet-600'}].map(({l,v,c})=>(
                        <div key={l} className="bg-gray-50 rounded-2xl p-2.5"><p className={`text-xl font-black ${c}`}>{v}</p><p className="text-xs text-gray-400">{l}</p></div>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 bg-gray-50 rounded-2xl px-4 py-2.5">
                      <span>Horas: <span className="font-bold text-gray-700">{th}</span></span>
                      {totalExtraHrs>0&&<span>Extra/remoto: <span className="font-bold text-emerald-600">+{totalExtraHrs}hs</span></span>}
                      {s.lateCount>0&&<span>Tard: <span className="font-bold text-amber-600">{Math.round(s.lateMins/s.lateCount)}min</span></span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VACACIONES */}
        {tab==='vacaciones'&&(
          <VacacionesAdmin
            employees={employees}
            adminId={profile.id}
            showToast={showToast}
          />
        )}

        {/* TAREAS */}
        {tab==='tareas'&&(
          <TareasAdmin employees={employees} adminId={profile.id} showToast={showToast}/>
        )}

        {/* LICENCIAS */}
        {tab==='licencias'&&(
          <LicenciasAdmin employees={employees} adminId={profile.id} showToast={showToast}/>
        )}

        {/* EXCEPCIONES */}
        {tab==='excepciones'&&(
          <ExcepcionesAdmin employees={employees} adminId={profile.id} showToast={showToast}/>
        )}

        {/* ALERTAS */}
        {tab==='alertas'&&(
          <AlertasAdmin showToast={showToast}/>
        )}

        {/* SETTINGS */}
        {tab==='extra_hours'&&(
          <HorasExtra
            employees={employees}
            empSchedMap={empSchedMap}
            month={analysisMonth}
            embedded={false}
          />
        )}

        {tab==='settings'&&(
          <div className="space-y-5 max-w-md">
            <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Configuración</h2>

            {/* Admin management — only super admin */}
            {profile.is_super_admin&&(
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-sm">Administradores</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Creá y gestioná accesos de admin con permisos específicos</p>
                  </div>
                  <button onClick={()=>setShowNewAdmin(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white flex-shrink-0"
                    style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                    Nuevo admin
                  </button>
                </div>
                <div className="space-y-2">
                  {employees.filter(e=>e.role==='admin'||e.id===profile.id).concat(
                    // Also show admins not in employees list
                  ).filter((e,i,arr)=>arr.findIndex(x=>x.id===e.id)===i).map(adm=>(
                    <div key={adm.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                      <Avatar initials={adm.avatar}/>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-900 truncate">{adm.name}</p>
                          {adm.is_super_admin&&<span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-lg font-bold">Super admin</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">{adm.email}</p>
                        {!adm.is_super_admin&&adm.admin_permissions&&(
                          <p className="text-xs text-sky-600 mt-0.5">
                            {Object.values(adm.admin_permissions).filter(Boolean).length} permisos activos
                          </p>
                        )}
                      </div>
                      {adm.id!==profile.id&&(
                        <button onClick={()=>setEditAdminPerms(adm)}
                          className="p-2 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
              <h3 className="font-bold text-gray-800">Ubicación de la sede</h3>
              <Input label="Nombre" value={hqForm.name} onChange={v=>setHqForm(f=>({...f,name:v}))}/>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Latitud" type="number" value={hqForm.lat} onChange={v=>setHqForm(f=>({...f,lat:v}))}/>
                <Input label="Longitud" type="number" value={hqForm.lng} onChange={v=>setHqForm(f=>({...f,lng:v}))}/>
              </div>
              <Input label="Radio (metros)" type="number" value={hqForm.radius_meters} onChange={v=>setHqForm(f=>({...f,radius_meters:v}))}/>
              <button onClick={detectHQ} className="w-full py-2.5 rounded-2xl border-2 border-dashed border-sky-200 text-sm font-semibold text-sky-600 hover:bg-sky-50">
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
      {viewEmpId&&<EmployeeProfileModal
        emp={employees.find(e=>e.id===viewEmpId)}
        month={viewEmpMonth}
        onMonthChange={async(m)=>{setViewEmpMonth(m);await reloadViewEmp(viewEmpId,m);}}
        records={viewEmpRecs}
        extraHours={viewEmpExtra}
        schedMap={empSchedMap[viewEmpId]||{}}
        holidays={holidays}
        adminId={profile.id}
        onEditRecord={async(recId,patch,reason)=>{
          await adminEditRecord(recId,patch,profile.id,reason||'Edición admin');
          await reloadViewEmp(viewEmpId,viewEmpMonth);
          showToast('Registro actualizado');
        }}
        onAddRecord={async(empId,date,status,just)=>{
          await adminAddManualRecord({employeeId:empId,date,status,justification:just,adminId:profile.id});
          await reloadViewEmp(viewEmpId,viewEmpMonth);
          showToast('Registro agregado');
        }}
        onClose={()=>setViewEmpId(null)}
      />}
      {editEmpData&&(
        <Modal open={true} onClose={()=>setEditEmpData(null)} title="Editar empleado">
          <div className="space-y-4">
            <Input label="Nombre completo" value={editEmpData.form.name}
              onChange={v=>setEditEmpData(p=>({...p,form:{...p.form,name:v}}))}/>
            <Input label="Email" type="email" value={editEmpData.form.email}
              onChange={v=>setEditEmpData(p=>({...p,form:{...p.form,email:v}}))}/>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nueva contraseña (opcional)</label>
              <input type="password" value={editEmpData.form.password}
                onChange={e=>setEditEmpData(p=>({...p,form:{...p.form,password:e.target.value}}))}
                placeholder="Dejá vacío para no cambiar"
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
            </div>
            <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4">
              <label className="block text-xs font-bold text-sky-700 mb-1.5 uppercase tracking-wide">📅 Fecha de alta / ingreso</label>
              <input type="date" value={editEmpData.form.hire_date||''}
                onChange={e=>setEditEmpData(p=>({...p,form:{...p.form,hire_date:e.target.value}}))}
                className="w-full px-4 py-2.5 rounded-2xl border border-sky-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"/>
              <p className="text-xs text-sky-600 mt-1.5">Usada para calcular vacaciones y antigüedad según LCT</p>
              {editEmpData.form.hire_date&&(()=>{
                const hire=new Date(editEmpData.form.hire_date),now=new Date();
                const months=(now.getFullYear()-hire.getFullYear())*12+(now.getMonth()-hire.getMonth());
                const years=Math.floor(months/12);
                const days=months<6?Math.min(Math.floor((now-hire)/(1000*60*60*24*20)),14):years<5?14:years<10?21:years<20?28:35;
                const label=months<6?`${months} meses`:years===0?`${months} meses`:`${years} año${years!==1?'s':''}`;
                return <p className="text-xs font-bold text-sky-700 mt-1">→ {label} · {days} días de vacaciones</p>;
              })()}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={()=>setEditEmpData(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={saveEditEmp}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                Guardar cambios
              </button>
            </div>
          </div>
        </Modal>
      )}
      {showAddEmp&&<AddEmployeeModal onClose={()=>setShowAddEmp(false)} onSave={handleAddEmployee}/>}
      {editEmpId&&(
        <Modal open={true} onClose={()=>setEditEmpId(null)} title="Editar horario">
          <div className="space-y-4">
            <ScheduleEditor schedule={editEmpSched} onChange={setEditEmpSched}/>
            <button onClick={saveEmpSched} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>Guardar horario</button>
          </div>
        </Modal>
      )}
      {editSalaryEmp&&(
        <Modal open={true} onClose={()=>setEditSalaryEmp(null)} title={`Sueldo — ${editSalaryEmp.name}`}>
          <div className="space-y-4">
            <Input label="Sueldo base mensual (ARS)" type="number" value={editSalaryVal} onChange={setEditSalaryVal} placeholder="Ej: 500000"/>
            {(()=>{
              const s=getStats(editSalaryEmp.id);
              const autoRate=editSalaryEmp.salary>0&&s.scheduled>0?Math.round(editSalaryEmp.salary/(s.scheduled*8)):0;
              return(
                <div className="space-y-2">
                  <Input label="Valor hora extra (ARS) — opcional" type="number" value={editExtraRateVal} onChange={setEditExtraRateVal} placeholder={autoRate>0?`Auto: ${fmtMoney(autoRate)}/h`:'Ej: 3500'}/>
                  <p className="text-xs text-gray-400">
                    {editExtraRateVal?`Valor fijo: ${fmtMoney(parseFloat(editExtraRateVal)||0)}/h`
                      :autoRate>0?`Se calcula automáticamente: ${fmtMoney(autoRate)}/h (sueldo ÷ días ÷ 8hs)`
                      :'Ingresá el sueldo para ver el cálculo automático'}
                  </p>
                </div>
              );
            })()}
            <p className="text-xs text-gray-400">Este valor se usa para calcular descuentos por faltas y liquidación mensual.</p>
            <button onClick={saveSalary} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>Guardar sueldo</button>
          </div>
        </Modal>
      )}
      {editRec&&<EditRecModal rec={editRec} onSave={handleSaveRec} onClose={()=>setEditRec(null)} adminId={profile.id}/>}

      {/* New Admin Modal */}
      {showNewAdmin&&<NewAdminModal
        onClose={()=>setShowNewAdmin(false)}
        onSave={async(name,email,pw,perms)=>{
          try{
            const {data:{user},error:se}=await supabase.auth.admin.createUser({email,password:pw,email_confirm:true});
            if(se)throw se;
            const avatar=(name||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
            await supabase.from('profiles').insert({id:user.id,name,email,role:'admin',avatar,active:true,admin_permissions:perms,is_super_admin:false});
            const{data:emps}=await supabase.from('profiles').select('*').eq('active',true).order('name');
            setEmployees(emps||[]);
            setShowNewAdmin(false);showToast('Admin creado');
          }catch(e){showToast(e.message,'error');}
        }}
      />}

      {/* Edit Admin Permissions Modal */}
      {editAdminPerms&&<EditAdminPermsModal
        admin={editAdminPerms}
        onClose={()=>setEditAdminPerms(null)}
        onSave={async(perms,isSuperAdmin)=>{
          try{
            await supabase.from('profiles').update({admin_permissions:perms,is_super_admin:isSuperAdmin}).eq('id',editAdminPerms.id);
            const{data:emps}=await supabase.from('profiles').select('*').eq('active',true).order('name');
            setEmployees(emps||[]);
            setEditAdminPerms(null);showToast('Permisos actualizados');
          }catch(e){showToast(e.message,'error');}
        }}
      />}
      {showNewRec&&<NewRecordModal employees={employees} defaultDate={filterDate||localDateISO()} onSave={handleNewRec} onClose={()=>setShowNewRec(false)}/>}
      {auditRecId&&<AuditHistory recordId={auditRecId} onClose={()=>setAuditRecId(null)}/>}

      {payrollEmp&&(
        <PayrollModal emp={payrollEmp} month={analysisMonth} stats={getStats(payrollEmp.id)}
          extraHours={extraHoursList.filter(h=>h.employee_id===payrollEmp.id)}
          empSchedMap={empSchedMap}
          onClose={()=>setPayrollEmp(null)} onSave={handleSavePayroll}/>
      )}
      {editHol&&(
        <Modal open={true} onClose={()=>setEditHol(null)} title="Editar feriado">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nombre del feriado</label>
              <input value={editHol.name} onChange={e=>setEditHol(p=>({...p,name:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Fecha</label>
              <input type="date" value={editHol.date} onChange={e=>setEditHol(p=>({...p,date:e.target.value}))}
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={()=>setEditHol(null)} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
              <button onClick={handleEditHol} className="flex-1 py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}
      <Modal open={showAddHol} onClose={()=>setShowAddHol(false)} title="Agregar feriado manual">
        <div className="space-y-4">
          <Input label="Fecha" type="date" value={holForm.date} onChange={v=>setHolForm(p=>({...p,date:v}))}/>
          <Input label="Nombre" value={holForm.name} onChange={v=>setHolForm(p=>({...p,name:v}))} placeholder="Ej: Rosh Hashaná"/>
          <button onClick={handleAddHol} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>Guardar</button>
        </div>
      </Modal>
    </div>
  );
}

function ManualForm({employees,onSave}){
  const [empId,setEmpId]=useState('');const [date,setDate]=useState(localDateISO());
  const [status,setStatus]=useState('absent');const [just,setJust]=useState('');
  return(
    <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 space-y-3">
      <p className="text-sm font-bold text-amber-800">Registrar falta/presencia manual</p>
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
      {(status==='justified'||status==='absent')&&(
        <input value={just} onChange={e=>setJust(e.target.value)} placeholder="Motivo (opcional)" className="w-full px-3.5 py-2.5 rounded-2xl border border-amber-200 text-sm bg-white focus:outline-none"/>
      )}
      <button onClick={()=>{if(!empId)return;onSave(empId,date,status,just||null);setJust('');}} disabled={!empId}
        className="w-full py-2.5 rounded-2xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">Registrar</button>
    </div>
  );
}
