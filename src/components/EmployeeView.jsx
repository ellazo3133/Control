import { useState, useEffect, useCallback } from 'react';
import logoWhite from '../assets/logo-ellazo-white.png';
import { usePWA } from '../hooks/usePWA';
import MonthCalendar from './MonthCalendar';
import VacacionesView from './VacacionesView';
import LicenciasView from './LicenciasView';
import TareasView from './TareasView';
import { getEmployeePayroll, getEmployeeExtraHours, notifyAdminLate, notifyAdminAbsent, getWeekRecords, getMyTasks, updateTaskStatus, getScheduleExceptions } from '../lib/supabase';
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
// IMPORTANTE: Los timestamps de Supabase son UTC con 'Z'. 
// getHours/getMinutes en JS usa la zona horaria LOCAL del dispositivo → correcto para Argentina.
const calcJornada = (record, sched) => {
  if (!sched?.active || !record?.check_in) return null;

  const expectedStart = timeToMins(sched.start_time); // ej: 9*60 = 540
  const expectedEnd   = timeToMins(sched.end_time);   // ej: 17*60 = 1020
  const expectedHours = expectedEnd - expectedStart;   // minutos de jornada: 480

  // Forzar zona horaria Argentina (UTC-3) para evitar errores de TZ en otros dispositivos
  const toARG = iso => {
    const d = new Date(iso);
    // Argentina es UTC-3 (sin cambio de horario)
    const argOffset = -3 * 60; // minutos
    const utcMins = d.getUTCHours()*60 + d.getUTCMinutes();
    return ((utcMins + argOffset) + 1440) % 1440; // wrap a 0-1439
  };
  const actualStart = toARG(record.check_in);

  // Sanity check: si actualStart es absurdo (ej > 1440 o < 0) hay un bug de timezone
  if (actualStart < 0 || actualStart > 1440) return null;

  // Tolerancia: los primeros 15 min son gracia, pero si llegó 20 min tarde
  // la tardanza COMPLETA son 20 minutos (no 20-15=5). La tolerancia solo decide
  // si hay tardanza o no, no reduce los minutos a recuperar.
  // Entró 9:10 con turno 9:00 → rawLate=10 ≤15 → NO hay tardanza, sale a las 17:00 ✓
  // Entró 9:20 con turno 9:00 → rawLate=20 > 15 → tardanza=20min, sale a las 17:20 ✓
  // Entró 9:16 con turno 9:00 → rawLate=16 > 15 → tardanza=16min, sale a las 17:16 ✓
  const rawLate     = Math.max(0, actualStart - expectedStart);
  const isLate      = rawLate > TOLERANCE_MINUTES;
  const lateMinutes = isLate ? rawLate : 0; // si llegó tarde, recupera TODO lo tarde (no resta tolerancia)

  // Si llegó antes del horario, puede salir antes manteniendo las horas completas
  // Si llegó tarde (con tardanza real), debe salir más tarde para recuperar
  const mustLeaveAt = actualStart < expectedStart
    ? actualStart + expectedHours   // llegó temprano → sale cuando complete las horas
    : expectedEnd + lateMinutes;    // llegó tarde → sale más tarde

  let horasExtra = 0, horasFaltantes = 0, workedMinutes = 0;
  if (record.check_out) {
    const actualEnd = toARG(record.check_out);
    workedMinutes = actualEnd - actualStart;

    // Comparar contra jornada esperada REAL (expectedHours, no ajustada por tardanza)
    // Si llegó 5 min tarde y salió 5 min tarde → workedMinutes = 480 = expectedHours → 0 extras/faltantes
    const diff = workedMinutes - expectedHours;
    if (diff >  5) horasExtra    = diff;   // margen 5 min para evitar ruido
    else if (diff < -5) horasFaltantes = Math.abs(diff);
  }

  return {
    expectedStart, expectedEnd, expectedHours,
    actualStart, rawLate, lateMinutes, isLate,
    mustLeaveAt, horasExtra, horasFaltantes, workedMinutes
  };
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
            <p className="text-xs text-amber-500 mt-1">(llegaste {minsToTime(jornada?.lateMinutes||0)} tarde → salís {minsToTime(jornada?.lateMinutes||0)} más)</p>
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
function StepModal({open,onClose,mode,profile,hq,records,setRecords,schedule,todayException,onDone}) {
  const [step,setStep]=useState('geo');
  const [msg,setMsg]=useState('');const [err,setErr]=useState('');const [loading,setLoading]=useState(false);
  const [geoData,setGeoData]=useState(null);

  useEffect(()=>{if(open){setStep('geo');setMsg('');setErr('');setLoading(false);setGeoData(null);}},[open]);

  const isIn=mode==='checkin';
  const todayDow=new Date().getDay();
  const schedBase=schedule[todayDow];
  // Si hay excepción de horario custom/half, usarla para calcular tardanza
  const sched=(todayException&&(todayException.type==='custom'||todayException.type==='half')&&todayException.start_time)
    ? {...schedBase, start_time:todayException.start_time, end_time:todayException.end_time||schedBase?.end_time}
    : schedBase;

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

  const [bioFailed,setBioFailed]=useState(false);

  const doCheckinCheckout=async()=>{
    // Ejecutar check-in/out después de GPS (con o sin bio)
    const now=new Date().toISOString();
    const nowMins=new Date().getHours()*60+new Date().getMinutes();
    if(isIn){
      const effectiveSched=(todayException&&(todayException.type==='custom'||todayException.type==='half')&&todayException.start_time)
        ?{...sched,start_time:todayException.start_time,end_time:todayException.end_time||sched?.end_time}:sched;
      const expectedStart=effectiveSched?timeToMins(effectiveSched.start_time):0;
      const rawLate=Math.max(0,nowMins-expectedStart);
      const minutesLate=Math.max(0,rawLate-TOLERANCE_MINUTES);
      await checkIn({employeeId:profile.id,lat:geoData.lat,lng:geoData.lng,accuracy:geoData.accuracy,distanceFromHQ:geoData.distance,bioCredId:profile.bio_cred_id,minutesLate});
      const updated=await getTodayRecord(profile.id);
      const jornada=calcJornada(updated,effectiveSched);
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
  };

  const doBio=async()=>{
    // Si ya falló la bio antes o no tiene credencial, ir directo al registro
    if(bioFailed||!profile.bio_cred_id){
      setLoading(true);setErr('');
      try{ await doCheckinCheckout(); }catch(e){ setErr(e.message); }
      setLoading(false);
      return;
    }
    setLoading(true);setErr('');setMsg('Esperando huella o Face ID...');
    try{
      await verifyBiometric(profile.bio_cred_id);
      await doCheckinCheckout();
    }catch(e){
      // Bio falló → mostrar opción de continuar con GPS
      setBioFailed(true);
      setErr('No se pudo verificar la biometría.');
      setMsg('');
    }
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
      items.push({icon:'⏰',label:'Llegaste tarde',value:`+${minsToTime(jornada.lateMinutes)} (${jornada.rawLate}min)`,color:'text-amber-600',bg:'bg-amber-50 border-amber-100'});
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
      items.push({icon:'⏰',label:'Llegada tarde',value:`+${minsToTime(jornada.lateMinutes)} (${jornada.rawLate}min)`,color:'text-amber-600',bg:'bg-amber-50 border-amber-100'});
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
  const [_todayRecState,setTodayRec]=useState(null); // legacy - now derived from records
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
  const [pendingTasks,setPendingTasks]=useState([]);
  const [exceptions,setExceptions]=useState([]);
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
    getMyTasks(profile.id).then(setPendingTasks).catch(()=>{});
    getScheduleExceptions(profile.id, new Date().toISOString().slice(0,7)).then(setExceptions).catch(()=>{});
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
  const todayRec=records.find(r=>r.employee_id===profile.id&&r.date===localDateISO());
  const todayException=exceptions.find(e=>e.date===localDateISO());
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

      <div className="sticky top-0 z-10" style={{background:"linear-gradient(135deg,#0f172a 0%,#1e293b 100%)"}}>
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar initials={currentProfile.avatar}/>
            <div>
              <p className="text-sm font-bold text-white">{currentProfile.name}</p>
              <p className="text-xs text-white/50">{new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
            </div>
            <img src={logoWhite} alt="El Lazo" className="h-6 w-auto" style={{filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.15))'}}/>
            <button onClick={onLogout} className="text-xs text-white/60 px-3 py-1.5 rounded-xl hover:bg-white/10">Salir</button>
          </div>
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
                  <button onClick={()=>setStepMode('checkin')}
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

        {/* Exception banner */}
        {todayException&&(
          <div className={`rounded-3xl shadow-sm border px-5 py-4 flex items-start gap-3
            ${todayException.type==='free'?'bg-red-50 border-red-200':
              todayException.type==='half'?'bg-amber-50 border-amber-200':'bg-sky-50 border-sky-200'}`}>
            <span className="text-2xl flex-shrink-0">
              {todayException.type==='free'?'🚫':todayException.type==='half'?'🕐':'⏰'}
            </span>
            <div>
              <p className={`text-sm font-bold ${todayException.type==='free'?'text-red-700':todayException.type==='half'?'text-amber-700':'text-sky-700'}`}>
                {todayException.type==='free'?'Hoy no trabajás':
                 todayException.type==='half'?'Hoy es media jornada':'Hoy tenés horario especial'}
              </p>
              {todayException.start_time&&(
                <p className={`text-xs mt-0.5 ${todayException.type==='free'?'text-red-500':todayException.type==='half'?'text-amber-600':'text-sky-600'}`}>
                  {todayException.start_time.slice(0,5)} — {todayException.end_time?.slice(0,5)}
                </p>
              )}
              {todayException.note&&(
                <p className={`text-xs italic mt-0.5 ${todayException.type==='free'?'text-red-400':todayException.type==='half'?'text-amber-500':'text-sky-500'}`}>
                  "{todayException.note}"
                </p>
              )}
            </div>
          </div>
        )}

        {/* Task notification banner */}
        {pendingTasks.length > 0 && (
          <div
            onClick={()=>setTab('tareas')}
            className="bg-white rounded-3xl shadow-sm border-l-4 border-l-sky-500 border border-gray-100 px-5 py-4 flex items-center gap-3 cursor-pointer active:scale-[0.99] transition-all">
            <div className="w-10 h-10 rounded-2xl bg-sky-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">
                {pendingTasks.length === 1 ? 'Tenés 1 tarea pendiente' : `Tenés ${pendingTasks.length} tareas pendientes`}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{pendingTasks[0]?.title}{pendingTasks.length > 1 ? ` y ${pendingTasks.length-1} más` : ''}</p>
            </div>
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
            </svg>
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


        {/* Monthly debt tracker */}
        {(()=>{
          const now = new Date();
          const currentMonth = now.toISOString().slice(0,7);
          const monthRecs = records.filter(r => r.date.startsWith(currentMonth));
          if(monthRecs.length === 0) return null;

          // Calcular deuda y extra del mes actual
          let totalDebtMins = 0;   // minutos que debe (llegó tarde y no los recuperó ese día)
          let totalExtraMins = 0;  // minutos de más trabajados

          monthRecs.forEach(r => {
            if(!r.check_in) return;
            const dow = new Date(r.date+'T12:00:00').getDay();
            const s = schedule[dow];
            if(!s?.active) return;
            const expectedHours = timeToMins(s.end_time) - timeToMins(s.start_time);
            const worked = r.minutes_worked || 0;
            const diff = worked - expectedHours;
            if(diff > 5) totalExtraMins += diff;
            else if(diff < -5) totalDebtMins += Math.abs(diff);
          });

          // Deuda neta: si tiene más extra que deuda, está al día
          const netDebt = totalDebtMins - totalExtraMins;
          const isOk = netDebt <= 0;
          const isEven = netDebt === 0 && totalDebtMins === 0;

          const mH = m => `${Math.floor(Math.abs(m)/60)}h ${Math.abs(m)%60}m`;

          return (
            <div className={`rounded-3xl p-5 border ${isOk?'bg-emerald-50 border-emerald-100':'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 text-sm">Balance del mes</h3>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-xl ${isOk?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                  {isOk ? (isEven ? '✅ Al día' : '✅ Recuperado') : `⏳ Debés ${mH(netDebt)}`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/70 rounded-2xl p-3">
                  <p className={`text-lg font-black ${totalDebtMins>0?'text-amber-600':'text-gray-300'}`}>
                    {totalDebtMins>0?`-${mH(totalDebtMins)}`:'—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Horas debidas</p>
                </div>
                <div className="bg-white/70 rounded-2xl p-3">
                  <p className={`text-lg font-black ${totalExtraMins>0?'text-emerald-600':'text-gray-300'}`}>
                    {totalExtraMins>0?`+${mH(totalExtraMins)}`:'—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Horas extra</p>
                </div>
                <div className="bg-white/70 rounded-2xl p-3">
                  <p className={`text-lg font-black ${isOk?'text-emerald-600':'text-amber-700'}`}>
                    {isOk ? (netDebt<0?`+${mH(Math.abs(netDebt))}`:'0') : `-${mH(netDebt)}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Balance neto</p>
                </div>
              </div>

              {!isOk&&(
                <p className="text-xs text-amber-600 mt-3 text-center">
                  Si recuperás estas horas antes de fin de mes no se descuentan del sueldo
                </p>
              )}
              {isOk&&totalExtraMins>0&&(
                <p className="text-xs text-emerald-600 mt-3 text-center">
                  Tus horas extra compensan cualquier deuda del mes 🎉
                </p>
              )}
            </div>
          );
        })()}

        {/* Section grid */}
        <div className="grid grid-cols-4 gap-2.5">
          {[
            ['schedule', '📅', 'Horario'],
            ['calendar', '🗓', 'Calendario'],
            ['history',  '📋', 'Historial'],
            ['sueldo',   '💰', 'Sueldo'],
            ['vacaciones','🏖️','Vacaciones'],
            ['licencias','📄', 'Licencias'],
            ['tareas',   '✅', 'Tareas'],
            ['perfil',   '👤', 'Mi perfil'],
          ].map(([t, icon, label]) => (
            <button key={t} onClick={()=>setTab(tab===t?null:t)}
              className={`flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-2xl border-2 transition-all active:scale-95
                ${tab===t
                  ? 'border-sky-400 bg-sky-50 shadow-sm'
                  : 'border-gray-100 bg-white hover:border-gray-200'}`}>
              <span className="text-xl leading-none">{icon}</span>
              <span className={`text-xs font-bold leading-tight text-center ${tab===t?'text-sky-700':'text-gray-400'}`}
                style={{fontSize:'10px'}}>{label}</span>
            </button>
          ))}
        </div>

        {/* Section content */}
        {tab && (
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
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
                  exceptions={exceptions}
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
            {tab==='perfil'&&(
              <div className="space-y-4">
                <h3 className="font-bold text-gray-900">Mi perfil</h3>

                {/* Biometric registration */}
                <div className={`rounded-2xl border p-4 ${currentProfile.bio_registered?'bg-emerald-50 border-emerald-100':'bg-amber-50 border-amber-200'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{currentProfile.bio_registered?'🔐':'⚠️'}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {currentProfile.bio_registered?'Biometría registrada':'Sin biometría registrada'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {currentProfile.bio_registered
                          ?'Tu huella o Face ID está vinculado a este dispositivo.'
                          :'Registrá tu huella o Face ID para hacer check-in más seguro.'}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleRegBio} disabled={bioLoading}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 ${currentProfile.bio_registered?'bg-sky-500 hover:bg-sky-600':'bg-amber-600 hover:bg-amber-700'}`}>
                    {bioLoading?'Registrando...'
                      :currentProfile.bio_registered?'Volver a registrar biometría':'Registrar huella / Face ID'}
                  </button>
                  {currentProfile.bio_registered&&(
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Si cambiaste de celular o tuviste problemas, registrala de nuevo desde este dispositivo.
                    </p>
                  )}
                </div>

                {/* Profile info */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Nombre</span><span className="font-bold text-gray-900">{currentProfile.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Email</span><span className="font-bold text-gray-900 text-xs">{currentProfile.email}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Rol</span><span className="font-bold text-gray-900 capitalize">{currentProfile.role}</span></div>
                </div>
              </div>
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
                              {(r.minutes_late||0)>0&&<span className="text-amber-500 ml-1">+{minsToTime(r.minutes_late)} tarde</span>}
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
        )}
      </div>

      {hq&&<StepModal open={!!stepMode} onClose={()=>setStepMode(null)} mode={stepMode}
        profile={currentProfile} hq={hq} records={records} setRecords={setRecords}
        schedule={schedule} todayException={todayException} onDone={handleStepDone}/>}

      <CelebrationModal open={!!celebration} onClose={()=>setCelebration(null)}
        tipo={celebration?.tipo} jornada={celebration?.jornada} sched={todaySched}/>
    </div>
  );
}
