import { useState, useEffect, useCallback } from 'react';
import { usePWA } from '../hooks/usePWA';
import MonthCalendar from './MonthCalendar';
import VacacionesView from './VacacionesView';
import LicenciasView from './LicenciasView';
import TareasView from './TareasView';
import { getEmployeePayroll, getEmployeeExtraHours, notifyAdminLate, notifyAdminAbsent, getWeekRecords } from '../lib/supabase';
import {
  getHQ, getSchedules, getTodayRecord, getRecordsByEmployee,
  getHolidays, checkIn, checkOut, updateProfile,
  registerBiometric, verifyBiometric,
  getGeoPos, haversine, localDateISO
} from '../lib/supabase';

const TOLERANCE_MINUTES = 15;
const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDate = iso => iso ? new Date(iso+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

// Parsea "HH:MM" a minutos desde medianoche
const timeToMins = t => { if(!t)return 0; const [h,m]=(t.slice(0,5)||'00:00').split(':').map(Number); return h*60+m; };
const minsToTime = m => { const h=Math.floor(Math.abs(m)/60); const mm=Math.abs(m)%60; return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; };

// Calcula métricas de la jornada
const calcJornada = (record, sched) => {
  if (!sched?.active || !record?.check_in) return null;
  const expectedStart = timeToMins(sched.start_time);
  const expectedEnd   = timeToMins(sched.end_time);
  const expectedHours = expectedEnd - expectedStart; // minutos esperados

  const checkInDate = new Date(record.check_in);
  const actualStart = checkInDate.getHours()*60 + checkInDate.getMinutes();
  const lateMinutes = Math.max(0, actualStart - expectedStart - TOLERANCE_MINUTES);
  const isLate = lateMinutes > 0;

  // Hora que debe salir para compensar la tardanza
  const mustLeaveAt = expectedEnd + (isLate ? lateMinutes : 0);

  let horasExtra = 0, horasFaltantes = 0, workedMinutes = 0;
  if (record.check_out) {
    const checkOutDate = new Date(record.check_out);
    const actualEnd = checkOutDate.getHours()*60 + checkOutDate.getMinutes();
    workedMinutes = actualEnd - actualStart;
    const diff = workedMinutes - expectedHours;
    if (diff > 0) horasExtra = diff;
    else if (diff < 0) horasFaltantes = Math.abs(diff);
  }

  return { expectedStart, expectedEnd, expectedHours, actualStart, lateMinutes, isLate, mustLeaveAt, horasExtra, horasFaltantes, workedMinutes };
};

// Frases de bienvenida (en hora)
const FRASES_ENTRADA_OK = [
  "¡Que tengas un día hermoso y lleno de logros! 🌟",
  "¡Buenos días! Que este día esté lleno de éxitos ✨",
  "¡Llegaste! Que sea un día productivo y especial 💪",
  "¡Hoy es un gran día para hacer grandes cosas! 🚀",
  "¡Bienvenido! Que todo fluya perfecto hoy 🌈",
  "¡A brillar! Este día es tuyo 🌞",
  "¡Que tengas una jornada increíble! 🎯",
];
// Frases de bienvenida (tarde)
const FRASES_ENTRADA_TARDE = [
  "Llegaste un poco tarde, ¡pero todavía hay mucho por hacer! Concentrate y dale 💥",
  "¡Hoy arrancaste tarde! Ponete las pilas y que sea un día productivo ⚡",
  "Tarde de arranque, ¡pero con energía doble! Dale con todo 🔥",
  "¡A veces pasa! Ahora enfocate y hacé que valga la pena el día 💡",
];
// Frases de salida
const FRASES_SALIDA_OK = [
  "¡Gracias por otro día increíble! Descansá y volvé con energías 🙏",
  "¡Jornada completa! Gracias por tu dedicación ❤️",
  "¡Un día más construyendo algo grande! Gracias 🌟",
  "¡Bien hecho! Merecés descansar. Hasta mañana ✨",
  "¡Gracias por dar lo mejor de vos hoy! 💪",
  "¡Cerraste el día con todo! Hasta el próximo turno 🎯",
];
const FRASES_SALIDA_EXTRA = [
  "¡Te quedaste extra! Gracias por el esfuerzo adicional 🏆",
  "¡Esas horas extra cuentan! Gracias por comprometerte 💎",
];
const FRASES_SALIDA_TEMPRANO = [
  "Saliste antes de completar las horas. El admin puede registrar el motivo 📋",
];

const randomFrase = arr => arr[Math.floor(Math.random()*arr.length)];

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',
    gray:'bg-gray-50 text-gray-500 border-gray-200',purple:'bg-violet-50 text-violet-700 border-violet-200',
    orange:'bg-orange-50 text-orange-700 border-orange-200',teal:'bg-teal-50 text-teal-700 border-teal-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};
const Avatar = ({initials}) => {
  const colors=['bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-700'];
  const h=(initials||'?').charCodeAt(0)%colors.length;
  return <div className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${colors[h]}`}>{initials||'?'}</div>;
};
const Modal = ({open,onClose,title,children}) => {
  if(!open)return null;
  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
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

// ─── CELEBRACIÓN POST-REGISTRO ────────────────────────────────────────────────
function CelebrationModal({open,onClose,tipo,jornada,sched}) {
  if(!open)return null;
  let emoji, titulo, mensaje, color, bgColor;

  if(tipo==='checkin_ok'){
    emoji='🌟'; titulo='¡Entrada registrada!';
    mensaje=randomFrase(FRASES_ENTRADA_OK);
    color='text-sky-700'; bgColor='bg-sky-50';
  } else if(tipo==='checkin_tarde'){
    const debeSalirA=jornada?minsToTime(jornada.mustLeaveAt):'—';
    emoji='⏰'; titulo='Llegaste un poco tarde';
    mensaje=randomFrase(FRASES_ENTRADA_TARDE);
    color='text-amber-700'; bgColor='bg-amber-50';
    return(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
        <div className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">{emoji}</div>
          <h2 className="text-xl font-black text-amber-700 mb-2">{titulo}</h2>
          <p className="text-sm text-gray-600 mb-4">{mensaje}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
            <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide mb-1">Para compensar, tenés que quedarte hasta</p>
            <p className="text-4xl font-black text-amber-700">{debeSalirA}</p>
            <p className="text-xs text-amber-500 mt-1">({jornada?.lateMinutes} min tarde → salís {jornada?.lateMinutes} min más)</p>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-700">¡Entendido, voy con todo!</button>
        </div>
      </div>
    );
  } else if(tipo==='checkout_extra'){
    emoji='🏆'; titulo='¡Horas extra registradas!';
    const extraMins=jornada?.horasExtra||0;
    mensaje=randomFrase(FRASES_SALIDA_EXTRA);
    return(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
        <div className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">{emoji}</div>
          <h2 className="text-xl font-black text-emerald-700 mb-2">{titulo}</h2>
          <p className="text-sm text-gray-600 mb-4">{mensaje}</p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
            <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide mb-1">Horas extra de hoy</p>
            <p className="text-4xl font-black text-emerald-700">+{minsToTime(extraMins)}</p>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>¡Gracias!</button>
        </div>
      </div>
    );
  } else if(tipo==='checkout_temprano'){
    emoji='📋'; titulo='Salida antes de completar';
    mensaje=randomFrase(FRASES_SALIDA_TEMPRANO);
    const faltanMins=jornada?.horasFaltantes||0;
    return(
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
        <div className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">{emoji}</div>
          <h2 className="text-xl font-black text-gray-700 mb-2">{titulo}</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 mb-5">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Te faltaron</p>
            <p className="text-4xl font-black text-gray-700">{minsToTime(faltanMins)}</p>
            <p className="text-xs text-gray-400 mt-1">El admin puede registrar el motivo</p>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200">OK</button>
        </div>
      </div>
    );
  } else {
    // checkout_ok
    emoji='✅'; titulo='¡Jornada completa!';
    mensaje=randomFrase(FRASES_SALIDA_OK);
    color='text-emerald-700'; bgColor='bg-emerald-50';
  }

  return(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-8 text-center">
        <div className="text-6xl mb-4">{emoji}</div>
        <h2 className={`text-xl font-black ${color} mb-3`}>{titulo}</h2>
        <div className={`${bgColor} rounded-2xl p-4 mb-5`}>
          <p className="text-sm text-gray-700">{mensaje}</p>
        </div>
        <button onClick={onClose} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {tipo==='checkin_ok'?'¡Vamos!':'¡Hasta pronto!'}
        </button>
      </div>
    </div>
  );
}

// ─── STEP MODAL (GPS + BIO) ───────────────────────────────────────────────────
function StepModal({open,onClose,mode,profile,hq,records,setRecords,schedule,onDone}) {
  const [step,setStep]=useState('geo');
  const [msg,setMsg]=useState('');const [err,setErr]=useState('');const [loading,setLoading]=useState(false);
  const [geoData,setGeoData]=useState(null);

  useEffect(()=>{if(open){setStep('geo');setMsg('');setErr('');setLoading(false);setGeoData(null);}},[open]);

  const isIn=mode==='checkin';
  const todayRec=records.find(r=>r.employee_id===profile.id&&r.date===localDateISO());
  const todayDow=new Date().getDay();
  const sched=schedule[todayDow];

  const doGeo=async()=>{
    setLoading(true);setErr('');setMsg('Obteniendo ubicación GPS...');
    try{
      const pos=await getGeoPos();
      const dist=haversine(pos.coords.latitude,pos.coords.longitude,hq.lat,hq.lng);
      if(dist>hq.radius_meters){setErr(`Estás a ${Math.round(dist)}m de la sede (máx. ${hq.radius_meters}m).`);setMsg('');}
      else{setGeoData({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,distance:Math.round(dist)});setMsg('');setStep('bio');}
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const doBio=async()=>{
    setLoading(true);setErr('');setMsg('Esperando autenticación biométrica...');
    try{
      await verifyBiometric(profile.bio_cred_id||null);
      const now=new Date().toISOString();
      const nowMins=new Date().getHours()*60+new Date().getMinutes();

      if(isIn){
        // Calcular minutos tarde (con tolerancia)
        const expectedStart=sched?timeToMins(sched.start_time):0;
        const rawLate=Math.max(0,nowMins-expectedStart);
        const minutesLate=Math.max(0,rawLate-TOLERANCE_MINUTES);
        await checkIn({employeeId:profile.id,lat:geoData.lat,lng:geoData.lng,accuracy:geoData.accuracy,distanceFromHQ:geoData.distance,bioCredId:profile.bio_cred_id,minutesLate});
        const updated=await getTodayRecord(profile.id);
        const jornada=calcJornada(updated,sched);
        onDone(minutesLate>0?'checkin_tarde':'checkin_ok',jornada);
      } else {
        await checkOut({employeeId:profile.id,lat:geoData.lat,lng:geoData.lng,accuracy:geoData.accuracy,distanceFromHQ:geoData.distance,bioCredId:profile.bio_cred_id});
        const updated=await getTodayRecord(profile.id);
        const jornada=calcJornada(updated,sched);
        let tipo='checkout_ok';
        if(jornada?.horasExtra>5)tipo='checkout_extra';
        else if(jornada?.horasFaltantes>5)tipo='checkout_temprano';
        onDone(tipo,jornada);
      }
      onClose();
    }catch(e){setErr(e.name==='NotAllowedError'||e.message?.includes('cancel')?'Biometría cancelada. Intentá de nuevo.':e.message);}
    setLoading(false);
  };

  return(
    <Modal open={open} onClose={()=>{if(!loading)onClose();}} title={`Registrar ${isIn?'entrada':'salida'}`}>
      <div className="text-center space-y-5">
        <div className="flex items-center justify-center gap-3">
          {['geo','bio'].map((st,i)=>(
            <div key={st} className="flex items-center gap-3">
              {i>0&&<div className={`w-10 h-0.5 ${step==='bio'?'bg-sky-400':'bg-gray-200'}`}/>}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${st===step?'text-white border-transparent':'bg-gray-50 border-gray-200 text-gray-400'}`}
                style={st===step?{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}:{}}>
                {step==='bio'&&st==='geo'?'✓':i+1}
              </div>
            </div>
          ))}
        </div>
        <div className="text-5xl">{step==='geo'?'📍':'👆'}</div>
        <div>
          <p className="font-bold text-gray-900 text-lg">{step==='geo'?'Verificar ubicación':'Biometría'}</p>
          <p className="text-sm text-gray-500 mt-1">{step==='geo'?`Confirmá que estás en ${hq?.name}`:'Usá tu huella o Face ID'}</p>
        </div>
        {msg&&<p className="text-sm text-sky-600 bg-sky-50 px-4 py-3 rounded-2xl">{msg}</p>}
        {err&&<p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl">{err}</p>}
        <button onClick={step==='geo'?doGeo:doBio} disabled={loading}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {loading&&<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          {step==='geo'?'Verificar ubicación':`Confirmar ${isIn?'entrada':'salida'}`}
        </button>
        {err&&!loading&&<button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>}
      </div>
    </Modal>
  );
}

// ─── JORNADA STATUS BAR ───────────────────────────────────────────────────────
function JornadaStatus({jornada,sched,todayRec}) {
  if(!jornada||!sched)return null;
  const items=[];

  if(!todayRec?.check_out){
    // Todavía en turno
    if(jornada.isLate){
      items.push({icon:'⏰',label:'Llegaste tarde',value:`+${jornada.lateMinutes}min`,color:'text-amber-600',bg:'bg-amber-50 border-amber-100'});
      items.push({icon:'🏁',label:'Salí a las',value:minsToTime(jornada.mustLeaveAt),color:'text-amber-700',bg:'bg-amber-50 border-amber-100'});
    } else {
      items.push({icon:'✅',label:'Entrada a tiempo',value:`Salí a las ${minsToTime(jornada.expectedEnd)}`,color:'text-emerald-600',bg:'bg-emerald-50 border-emerald-100'});
    }
  } else {
    // Jornada cerrada
    if(jornada.horasExtra>0){
      items.push({icon:'🏆',label:'Horas extra',value:`+${minsToTime(jornada.horasExtra)}`,color:'text-emerald-600',bg:'bg-emerald-50 border-emerald-100'});
    } else if(jornada.horasFaltantes>0){
      items.push({icon:'⚠️',label:'Horas faltantes',value:`-${minsToTime(jornada.horasFaltantes)}`,color:'text-red-500',bg:'bg-red-50 border-red-100'});
    } else {
      items.push({icon:'✅',label:'Jornada completa',value:`${minsToTime(jornada.workedMinutes)} trabajados`,color:'text-emerald-600',bg:'bg-emerald-50 border-emerald-100'});
    }
    if(jornada.isLate){
      items.push({icon:'⏰',label:'Llegada tarde',value:`+${jornada.lateMinutes}min`,color:'text-amber-600',bg:'bg-amber-50 border-amber-100'});
    }
  }

  return(
    <div className="flex flex-col gap-2">
      {items.map((item,i)=>(
        <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border ${item.bg}`}>
          <div className="flex items-center gap-2">
            <span className="text-base">{item.icon}</span>
            <span className="text-xs font-semibold text-gray-600">{item.label}</span>
          </div>
          <span className={`text-sm font-black ${item.color}`}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── EMPLOYEE VIEW ────────────────────────────────────────────────────────────
export default function EmployeeView({profile,onLogout}) {
  const [hq,setHq]=useState(null);
  const [schedule,setSchedule]=useState({});
  const [todayRec,setTodayRec]=useState(null);
  const [history,setHistory]=useState([]);
  const [holidays,setHolidays]=useState([]);
  const [tab,setTab]=useState('today');
  const [stepMode,setStepMode]=useState(null);
  const [toast,setToast]=useState(null);
  const [bioLoading,setBioLoading]=useState(false);
  const [currentProfile,setCurrentProfile]=useState(profile);
  const [records,setRecords]=useState([]);
  const [celebration,setCelebration]=useState(null);
  const [calMonth,setCalMonth]=useState(new Date().toISOString().slice(0,7));
  const [payroll,setPayroll]=useState(null);
  const [empExtras,setEmpExtras]=useState([]);
  const [weekRecs,setWeekRecs]=useState([]);
  const { scheduleCheckoutReminder, notifPermission } = usePWA(); // {tipo, jornada}

  const showToast=(msg,type='success')=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const loadData=useCallback(async()=>{
    try{
      const [hqData,schedData,recData,histData,holData]=await Promise.all([
        getHQ(),getSchedules(profile.id),getTodayRecord(profile.id),getRecordsByEmployee(profile.id,60),getHolidays()
      ]);
      setHq(hqData);setSchedule(schedData);setTodayRec(recData);
      setHistory(histData);setHolidays(holData);
      setRecords(histData);
    }catch(e){showToast('Error cargando datos','error');}
  },[profile.id]);

  useEffect(()=>{loadData();},[loadData]);

  useEffect(()=>{
    getEmployeePayroll(profile.id, calMonth).then(setPayroll).catch(()=>{});
    getEmployeeExtraHours(profile.id, calMonth).then(setEmpExtras).catch(()=>{});
  },[calMonth, profile.id]);

  useEffect(()=>{
    getWeekRecords(profile.id).then(setWeekRecs).catch(()=>{});
  },[profile.id]);

  const handleRegBio=async()=>{
    if(!window.PublicKeyCredential)return showToast('Tu navegador no soporta biometría.','error');
    setBioLoading(true);
    try{
      const credId=await registerBiometric(currentProfile.id,currentProfile.name);
      const updated=await updateProfile(currentProfile.id,{bio_registered:true,bio_cred_id:credId});
      setCurrentProfile(updated);showToast('✓ Biometría registrada');
    }catch(e){showToast(e.message||'Error','error');}
    setBioLoading(false);
  };

  const handleStepDone=(tipo,jornada)=>{
    loadData();
    setCelebration({tipo,jornada});
    // Notify admin if late
    if(tipo==='checkin_tarde'&&jornada){
      const dow=new Date().getDay();
      const sched=schedule[dow];
      if(sched){
        notifyAdminLate(currentProfile.name, jornada.lateMinutes, sched.start_time?.slice(0,5)).catch(()=>{});
      }
    }
    // Schedule checkout reminder if checked in
    if(tipo==='checkin_ok'||tipo==='checkin_tarde'){
      const mustLeave=jornada?.mustLeaveAt;
      if(mustLeave){
        const h=Math.floor(mustLeave/60),m=mustLeave%60;
        scheduleCheckoutReminder(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      }
    }
  };

  const todayDow=new Date().getDay();
  const todaySched=schedule[todayDow];
  const isHoliday=holidays.some(h=>h.date===localDateISO());
  const jornada=calcJornada(todayRec,todaySched);
  const workedMin=todayRec?.check_in&&todayRec?.check_out?Math.round((new Date(todayRec.check_out)-new Date(todayRec.check_in))/60000):null;

  const last14=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-13+i);return d.toISOString().split('T')[0];});
  const getStatus=date=>{
    if(holidays.some(h=>h.date===date))return'holiday';
    const rec=history.find(r=>r.date===date);
    if(rec?.check_in)return'present';if(rec?.status==='justified')return'justified';
    const dow=new Date(date+'T12:00:00').getDay();
    if(!schedule[dow]?.active)return'off';if(date>localDateISO())return'future';return'absent';
  };
  const dotC=s=>({present:'bg-emerald-500',absent:'bg-red-400',justified:'bg-amber-400',off:'bg-gray-200',future:'bg-gray-100',holiday:'bg-violet-300'}[s]||'bg-gray-200');

  // Computar stats del historial
  const histStats=()=>{
    const myRecs=history.filter(r=>r.date<=localDateISO());
    const withSched=myRecs.filter(r=>{const dow=new Date(r.date+'T12:00:00').getDay();return schedule[dow]?.active;});
    const lates=withSched.filter(r=>(r.minutes_late||0)>0);
    const extras=withSched.filter(r=>(r.minutes_worked||0)>(timeToMins(schedule[new Date(r.date+'T12:00:00').getDay()]?.end_time||'17:00')-timeToMins(schedule[new Date(r.date+'T12:00:00').getDay()]?.start_time||'09:00')));
    return{lates:lates.length,extraCount:extras.length};
  };
  const stats=histStats();

  return(
    <div className="min-h-screen bg-gray-50">
      <Toast toast={toast}/>

      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar initials={currentProfile.avatar}/>
            <div>
              <p className="text-sm font-bold text-gray-900">{currentProfile.name}</p>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</p>
            </div>
          </div>
          <button onClick={onLogout} className="text-xs text-gray-400 px-3 py-1.5 rounded-xl hover:bg-gray-100">Salir</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 py-6 space-y-4">
        {/* Bio warning */}
        {!currentProfile.bio_registered&&(
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Registrá tu biometría primero</p>
              <p className="text-xs text-amber-600 mt-1 mb-3">Vinculá tu huella o Face ID una sola vez.</p>
              <button onClick={handleRegBio} disabled={bioLoading} className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50">
                {bioLoading?'Registrando...':'Registrar ahora'}
              </button>
            </div>
          </div>
        )}

        {/* Today card */}
        {hq&&(
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">Hoy</h2>
                {isHoliday?<Badge color="purple">Feriado</Badge>
                  :todaySched?.active?<Badge color="blue">{todaySched.start_time?.slice(0,5)} – {todaySched.end_time?.slice(0,5)}</Badge>
                  :<Badge color="gray">Día libre</Badge>}
              </div>

              {/* Horario esperado vs real */}
              {todaySched?.active&&(
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className={`rounded-2xl p-4 text-center ${todayRec?.check_in?jornada?.isLate?'bg-amber-50':'bg-sky-50':'bg-gray-50'}`}>
                    <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide">Entrada</p>
                    <p className={`text-2xl font-black font-mono ${todayRec?.check_in?jornada?.isLate?'text-amber-600':'text-sky-700':'text-gray-300'}`}>
                      {todayRec?.check_in?fmtTime(todayRec.check_in):'--:--'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Esperado: {todaySched.start_time?.slice(0,5)}</p>
                  </div>
                  <div className={`rounded-2xl p-4 text-center ${todayRec?.check_out?jornada?.horasExtra>0?'bg-emerald-50':jornada?.horasFaltantes>0?'bg-red-50':'bg-emerald-50':'bg-gray-50'}`}>
                    <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide">Salida</p>
                    <p className={`text-2xl font-black font-mono ${todayRec?.check_out?jornada?.horasExtra>0?'text-emerald-600':jornada?.horasFaltantes>0?'text-red-500':'text-emerald-700':'text-gray-300'}`}>
                      {todayRec?.check_out?fmtTime(todayRec.check_out):'--:--'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Esperado: {todaySched.end_time?.slice(0,5)}</p>
                  </div>
                </div>
              )}

              {/* Status de jornada */}
              {todayRec?.check_in&&todaySched&&(
                <div className="mb-4">
                  <JornadaStatus jornada={jornada} sched={todaySched} todayRec={todayRec}/>
                </div>
              )}

              {/* Horas trabajadas */}
              {workedMin&&(
                <p className="text-xs text-center text-gray-400 mb-4">
                  Tiempo trabajado: <span className="font-black text-gray-700">{Math.floor(workedMin/60)}h {workedMin%60}m</span>
                  {' '}/ esperado: <span className="font-semibold">{todaySched?minsToTime(timeToMins(todaySched.end_time)-timeToMins(todaySched.start_time)):'—'}</span>
                </p>
              )}

              {/* Botones */}
              <div className="space-y-2.5">
                {!todayRec?.check_in?(
                  <button onClick={()=>setStepMode('checkin')} disabled={!currentProfile.bio_registered}
                    className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                    style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                    <span>📍</span> Registrar entrada
                  </button>
                ):!todayRec?.check_out?(
                  <button onClick={()=>setStepMode('checkout')}
                    className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-95"
                    style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>
                    <span>📍</span> Registrar salida
                  </button>
                ):(
                  <div className="w-full py-4 rounded-2xl bg-emerald-50 text-sm text-center text-emerald-700 font-bold">
                    ✓ Jornada completa registrada
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-gray-50 px-5 py-3 flex items-center gap-4">
              <div className="flex items-center gap-1.5"><span className="text-sm">📍</span><p className="text-xs text-gray-400">GPS · {hq.name}</p></div>
              <div className="flex items-center gap-1.5"><span className="text-sm">👆</span><p className="text-xs text-gray-400">Biometría</p></div>
              <div className="ml-auto"><Badge color="green">Seguro</Badge></div>
            </div>
          </div>
        )}

        {/* Weekly summary */}
        {weekRecs.length > 0 && (() => {
          const totalWorked = weekRecs.reduce((a,r) => a+(r.minutes_worked||0), 0);
          const totalExpected = weekRecs.filter(r=>r.check_in).reduce((a,r) => {
            const dow = new Date(r.date+'T12:00:00').getDay();
            const s = schedule[dow];
            if(!s?.active) return a;
            return a + (timeToMins(s.end_time) - timeToMins(s.start_time));
          }, 0);
          const days = weekRecs.filter(r=>r.check_in).length;
          const lates = weekRecs.filter(r=>(r.minutes_late||0)>0).length;
          const totalLate = weekRecs.reduce((a,r)=>a+(r.minutes_late||0),0);
          const diff = totalWorked - totalExpected;
          return (
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 text-sm mb-3">Esta semana</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-sky-50 rounded-2xl p-3.5 text-center">
                  <p className="text-xs font-bold text-sky-400 uppercase tracking-wide mb-1">Horas trabajadas</p>
                  <p className="text-2xl font-black text-sky-700">{Math.floor(totalWorked/60)}h {totalWorked%60}m</p>
                </div>
                <div className={`${diff>=0?'bg-emerald-50':'bg-amber-50'} rounded-2xl p-3.5 text-center`}>
                  <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${diff>=0?'text-emerald-400':'text-amber-400'}`}>
                    {diff>=0?'Horas extra':'Horas faltantes'}
                  </p>
                  <p className={`text-2xl font-black ${diff>=0?'text-emerald-700':'text-amber-700'}`}>
                    {diff>=0?'+':'-'}{Math.floor(Math.abs(diff)/60)}h {Math.abs(diff)%60}m
                  </p>
                </div>
              </div>
              <div className="flex gap-3 text-xs">
                <div className="flex-1 bg-gray-50 rounded-xl p-2.5 text-center">
                  <p className="text-gray-400">Días presentes</p>
                  <p className="font-black text-gray-700 text-lg">{days}</p>
                </div>
                {lates>0&&(
                  <div className="flex-1 bg-amber-50 rounded-xl p-2.5 text-center">
                    <p className="text-amber-500">Tardanzas</p>
                    <p className="font-black text-amber-700 text-lg">{lates} <span className="text-xs font-normal">({totalLate}min)</span></p>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Tabs */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {[['schedule','Horario'],['calendar','Calendario'],['history','Historial'],['sueldo','Sueldo'],['vacaciones','Vacaciones'],['licencias','Licencias'],['tareas','Tareas']].map(([t,l])=>(


              <button key={t} onClick={()=>setTab(t)} className={`flex-shrink-0 flex-1 py-3.5 text-xs font-bold uppercase tracking-wide ${tab===t?'text-sky-600 border-b-2 border-sky-500':'text-gray-400'}`}>{l}</button>
            ))}
          </div>
          <div className="p-5">
            {tab==='schedule'&&(
              <div className="space-y-2">
                {stats.lates>0&&(
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-3 flex justify-between">
                    <span className="text-xs text-amber-700 font-semibold">⏰ Tardanzas este mes</span>
                    <span className="text-xs font-black text-amber-700">{stats.lates} día{stats.lates!==1?'s':''}</span>
                  </div>
                )}
                {stats.extraCount>0&&(
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-3 flex justify-between">
                    <span className="text-xs text-emerald-700 font-semibold">🏆 Días con horas extra</span>
                    <span className="text-xs font-black text-emerald-700">{stats.extraCount}</span>
                  </div>
                )}
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Tolerancia: {TOLERANCE_MINUTES} minutos</p>
                {DAYS.map((day,i)=>{const s=schedule[i];const isT=i===todayDow;
                  return(
                    <div key={i} className={`flex items-center justify-between py-2.5 px-4 rounded-2xl ${isT?'bg-sky-50 border border-sky-100':''}`}>
                      <span className={`text-sm font-bold ${isT?'text-sky-700':'text-gray-700'}`}>{day}{isT&&<span className="text-xs text-sky-400 font-normal ml-1">(hoy)</span>}</span>
                      {s?.active?<Badge color={isT?'blue':'gray'}>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</Badge>:<span className="text-xs text-gray-300">Libre</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {tab==='calendar'&&(
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Mes a ver</p>
                  <input type="month" value={calMonth} onChange={e=>setCalMonth(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                </div>
                <MonthCalendar
                  month={calMonth}
                  records={history}
                  schedMap={schedule}
                  holidays={holidays}
                  today={localDateISO()}
                />
              </div>
            )}
            {tab==='sueldo'&&(
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Mes</p>
                  <input type="month" value={calMonth} onChange={e=>setCalMonth(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400"/>
                </div>
                {payroll ? (
                  <div className="space-y-3">
                    <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 text-center">
                      <p className="text-xs text-sky-500 font-bold uppercase tracking-wide mb-1">Total liquidado</p>
                      <p className="text-4xl font-black text-sky-700">{new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(payroll.total_net||0)}</p>
                      <p className="text-xs text-sky-400 mt-1 capitalize">{payroll.status==='approved'?'✓ Aprobado':payroll.status==='paid'?'✓ Pagado':'Borrador'}</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2.5 text-sm">
                      {[
                        ['Sueldo base',new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(payroll.base_salary||0),'text-gray-700'],
                        ['Días programados',payroll.days_scheduled,'text-gray-700'],
                        ['Días trabajados',payroll.days_worked,'text-emerald-600'],
                        ['Ausencias injust.',payroll.days_absent,'text-red-500'],
                        ['Descuento faltas',`-${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(payroll.deduction_amt||0)}`,'text-red-500'],
                        ['Horas extra',`+${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(payroll.extra_hours_amt||0)}`,'text-emerald-600'],
                        ['Bonus',`+${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(payroll.bonus||0)}`,'text-emerald-600'],
                      ].map(([l,v,c])=>(
                        <div key={l} className="flex justify-between">
                          <span className="text-gray-500 text-xs">{l}</span>
                          <span className={`font-bold text-xs ${c}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                    {payroll.notes&&<p className="text-xs text-gray-400 italic px-1">Nota: {payroll.notes}</p>}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <span className="text-4xl">💰</span>
                    <p className="text-sm font-bold text-gray-700">Sin liquidación este mes</p>
                    <p className="text-xs text-gray-400">El admin genera la liquidación a fin de mes</p>
                  </div>
                )}
                {empExtras.length>0&&(
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-emerald-700 mb-2">Horas extra / remoto registradas</p>
                    <div className="space-y-1.5">
                      {empExtras.map(h=>(
                        <div key={h.id} className="flex justify-between text-xs">
                          <span className="text-gray-600">{h.date} — {h.hours}hs{h.description?` (${h.description})`:''}</span>
                          <span className="font-bold text-emerald-600">x{h.multiplier}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {tab==='licencias'&&(
              <LicenciasView profile={currentProfile} hireDate={currentProfile.hire_date}/>
            )}
            {tab==='tareas'&&(
              <TareasView profile={currentProfile}/>
            )}
            {tab==='vacaciones'&&(
              <VacacionesView
                profile={currentProfile}
                hireDate={currentProfile.hire_date}
              />
            )}
            {tab==='history'&&(
              <div>
                <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                  {last14.map(d=>{const s=getStatus(d);const isT=d===localDateISO();
                    return(
                      <div key={d} className="flex flex-col items-center flex-shrink-0 w-9">
                        <span className="text-xs text-gray-300 mb-1">{DAYS_SHORT[new Date(d+'T12:00:00').getDay()][0]}</span>
                        <div className={`w-7 h-7 rounded-full ${dotC(s)} ${isT?'ring-2 ring-sky-500 ring-offset-1':''}`}/>
                        <span className="text-xs text-gray-300 mt-1">{new Date(d+'T12:00:00').getDate()}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-3 text-xs text-gray-400 mb-4 flex-wrap">
                  {[['bg-emerald-500','Presente'],['bg-red-400','Ausente'],['bg-amber-400','Justificada'],['bg-violet-300','Feriado'],['bg-gray-200','Libre']].map(([c,l])=>(
                    <div key={l} className="flex items-center gap-1"><div className={`w-2.5 h-2.5 rounded-full ${c}`}/>{l}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  {history.length===0&&<p className="text-sm text-gray-400 text-center py-6">Sin registros aún</p>}
                  {history.map(r=>{
                    const rDow=new Date(r.date+'T12:00:00').getDay();
                    const rSched=schedule[rDow];
                    const rJornada=calcJornada(r,rSched);
                    const mins=r.check_in&&r.check_out?Math.round((new Date(r.check_out)-new Date(r.check_in))/60000):null;
                    return(
                      <div key={r.id} className="py-3 px-4 rounded-2xl bg-gray-50 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-800">{fmtDate(r.date)}</p>
                          <div className="flex gap-1.5">
                            {r.status==='present'&&<Badge color={r.check_out?'teal':'green'}>{r.check_out?'Completa':'Presente'}</Badge>}
                            {r.status==='absent'&&<Badge color="red">Ausente</Badge>}
                            {r.status==='justified'&&<Badge color="yellow">Justificada</Badge>}
                            {r.status==='holiday'&&<Badge color="purple">Feriado</Badge>}
                          </div>
                        </div>
                        {r.check_in&&(
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>↓ <span className="font-mono font-bold text-gray-700">{fmtTime(r.check_in)}</span>
                              <span className="text-gray-400"> (esp: {rSched?.start_time?.slice(0,5)||'—'})</span>
                              {(r.minutes_late||0)>0&&<span className="text-amber-500 ml-1">+{r.minutes_late}min tarde</span>}
                            </span>
                            {r.check_out&&(
                              <span>↑ <span className="font-mono font-bold text-gray-700">{fmtTime(r.check_out)}</span>
                                <span className="text-gray-400"> (esp: {rSched?.end_time?.slice(0,5)||'—'})</span>
                              </span>
                            )}
                          </div>
                        )}
                        {mins&&(
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-400">{Math.floor(mins/60)}h {mins%60}m trabajados</span>
                            {rJornada?.horasExtra>0&&<span className="text-emerald-600 font-bold">+{minsToTime(rJornada.horasExtra)} extra 🏆</span>}
                            {rJornada?.horasFaltantes>5&&<span className="text-red-500 font-bold">-{minsToTime(rJornada.horasFaltantes)} faltantes</span>}
                          </div>
                        )}
                        {r.justification&&<p className="text-xs text-amber-600 italic">"{r.justification}"</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hq&&<StepModal open={!!stepMode} onClose={()=>setStepMode(null)} mode={stepMode}
        profile={currentProfile} hq={hq} records={records} setRecords={setRecords}
        schedule={schedule} onDone={handleStepDone}/>}

      <CelebrationModal open={!!celebration} onClose={()=>setCelebration(null)}
        tipo={celebration?.tipo} jornada={celebration?.jornada} sched={todaySched}/>
    </div>
  );
}
