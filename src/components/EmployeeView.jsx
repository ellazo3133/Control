import { useState, useEffect, useCallback } from 'react';
import {
  getHQ, getSchedules, getTodayRecord, getRecordsByEmployee,
  getHolidays, checkIn, checkOut, updateProfile,
  registerBiometric, verifyBiometric,
  getGeoPos, haversine, localDateISO
} from '../lib/supabase';

const DAYS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDate = iso => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',red:'bg-red-50 text-red-600 border-red-200',
    yellow:'bg-amber-50 text-amber-700 border-amber-200',blue:'bg-sky-50 text-sky-700 border-sky-200',gray:'bg-gray-50 text-gray-500 border-gray-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

const Avatar = ({initials}) => {
  const colors=['bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-700'];
  const h=(initials||'?').charCodeAt(0)%colors.length;
  return <div className={`w-8 h-8 rounded-2xl flex items-center justify-center font-bold text-xs flex-shrink-0 ${colors[h]}`}>{initials||'?'}</div>;
};

const Modal = ({open,onClose,title,children}) => {
  if(!open)return null;
  return (
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

// ─── STEP MODAL ───────────────────────────────────────────────────────────────
function StepModal({ open, onClose, mode, profile, hq, onSuccess }) {
  const [step, setStep] = useState('geo');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoData, setGeoData] = useState(null);

  useEffect(() => {
    if (open) { setStep('geo'); setMsg(''); setErr(''); setLoading(false); setGeoData(null); }
  }, [open]);

  const isIn = mode === 'checkin';

  const doGeo = async () => {
    setLoading(true); setErr(''); setMsg('Obteniendo ubicación GPS...');
    try {
      const pos = await getGeoPos();
      const dist = haversine(pos.coords.latitude, pos.coords.longitude, hq.lat, hq.lng);
      if (dist > hq.radius_meters) {
        setErr(`Estás a ${Math.round(dist)}m de la sede (máximo ${hq.radius_meters}m). Acercate al lugar de trabajo.`);
        setMsg('');
      } else {
        setGeoData({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, distance: Math.round(dist) });
        setMsg(''); setStep('bio');
      }
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const doBio = async () => {
    setLoading(true); setErr(''); setMsg('Esperando autenticación biométrica...');
    try {
      await verifyBiometric(profile.bio_cred_id || null);
      // Calcular minutos tarde si es check-in
      let minutesLate = 0;
      // Se calcula en el servidor con la función SQL, pero podemos pasarlo para cache local
      if (isIn) {
        await checkIn({
          employeeId: profile.id,
          lat: geoData.lat, lng: geoData.lng,
          accuracy: geoData.accuracy, distanceFromHQ: geoData.distance,
          bioCredId: profile.bio_cred_id,
          minutesLate,
        });
      } else {
        await checkOut({
          employeeId: profile.id,
          lat: geoData.lat, lng: geoData.lng,
          accuracy: geoData.accuracy, distanceFromHQ: geoData.distance,
          bioCredId: profile.bio_cred_id,
        });
      }
      onSuccess();
      onClose();
    } catch (e) {
      setErr(e.message === 'NotAllowedError' || e.name === 'NotAllowedError'
        ? 'Verificación biométrica cancelada o fallida. Intentá de nuevo.'
        : e.message);
    }
    setLoading(false);
  };

  return (
    <Modal open={open} onClose={() => { if (!loading) onClose(); }} title={`Registrar ${isIn ? 'entrada' : 'salida'}`}>
      <div className="text-center space-y-5">
        <div className="flex items-center justify-center gap-3 mb-1">
          {['geo','bio'].map((st,i) => (
            <div key={st} className="flex items-center gap-3">
              {i > 0 && <div className={`w-10 h-0.5 ${step==='bio'?'bg-sky-400':'bg-gray-200'}`}/>}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${st===step?'border-sky-500 text-white':'bg-gray-50 border-gray-200 text-gray-400'}`}
                style={st===step?{background:'linear-gradient(135deg,#0ea5e9,#6366f1)',borderColor:'transparent'}:{}}>
                {step==='bio'&&st==='geo'?'✓':i+1}
              </div>
            </div>
          ))}
        </div>
        <div className="text-5xl">{step==='geo'?'📍':'👆'}</div>
        <div>
          <p className="font-bold text-gray-900 text-lg">{step==='geo'?'Verificar ubicación':'Biometría'}</p>
          <p className="text-sm text-gray-500 mt-1">
            {step==='geo'?`Confirma que estás en ${hq?.name}`:`Usá tu huella digital o Face ID`}
          </p>
        </div>
        {msg&&<p className="text-sm text-sky-600 bg-sky-50 px-4 py-3 rounded-2xl">{msg}</p>}
        {err&&<p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-2xl">{err}</p>}
        <button onClick={step==='geo'?doGeo:doBio} disabled={loading}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          {loading&&<svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
          {step==='geo'?'Verificar ubicación':`Confirmar ${isIn?'entrada':'salida'} con biometría`}
        </button>
        {err&&!loading&&<button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Cancelar</button>}
      </div>
    </Modal>
  );
}

// ─── EMPLOYEE VIEW ────────────────────────────────────────────────────────────
export default function EmployeeView({ profile, onLogout }) {
  const [hq, setHq] = useState(null);
  const [schedule, setSchedule] = useState({});
  const [todayRec, setTodayRec] = useState(null);
  const [history, setHistory] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [tab, setTab] = useState('today');
  const [stepMode, setStepMode] = useState(null);
  const [toast, setToast] = useState(null);
  const [bioLoading, setBioLoading] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(profile);

  const showToast = (msg, type='success') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const loadData = useCallback(async () => {
    try {
      const [hqData, schedData, recData, histData, holData] = await Promise.all([
        getHQ(), getSchedules(profile.id), getTodayRecord(profile.id),
        getRecordsByEmployee(profile.id, 30), getHolidays()
      ]);
      setHq(hqData); setSchedule(schedData); setTodayRec(recData);
      setHistory(histData); setHolidays(holData);
    } catch (e) { showToast('Error cargando datos', 'error'); }
  }, [profile.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRegBio = async () => {
    if (!window.PublicKeyCredential) return showToast('Tu navegador no soporta biometría. Usá Chrome en Android o Safari en iOS.', 'error');
    setBioLoading(true);
    try {
      const credId = await registerBiometric(currentProfile.id, currentProfile.name);
      const updated = await updateProfile(currentProfile.id, { bio_registered: true, bio_cred_id: credId });
      setCurrentProfile(updated);
      showToast('✓ Biometría registrada correctamente');
    } catch (e) { showToast(e.message || 'Error al registrar biometría', 'error'); }
    setBioLoading(false);
  };

  const todayDow = new Date().getDay();
  const todaySched = schedule[todayDow];
  const isHoliday = holidays.some(h => h.date === localDateISO());

  const workedMin = todayRec?.check_in_at && todayRec?.check_out_at
    ? Math.round((new Date(todayRec.check_out_at) - new Date(todayRec.check_in_at)) / 60000) : null;

  const last14 = Array.from({length:14}, (_,i) => {
    const d=new Date(); d.setDate(d.getDate()-13+i); return d.toISOString().split('T')[0];
  });

  const getStatus = date => {
    if (holidays.some(h => h.date === date)) return 'holiday';
    const rec = history.find(r => r.date === date);
    if (rec?.check_in_at) return 'present';
    if (rec?.status === 'justified') return 'justified';
    const dow = new Date(date+'T12:00:00').getDay();
    if (!schedule[dow]?.active) return 'off';
    if (date > localDateISO()) return 'future';
    return 'absent';
  };
  const dotC = s=>({present:'bg-emerald-500',absent:'bg-red-400',justified:'bg-amber-400',off:'bg-gray-200',future:'bg-gray-100',holiday:'bg-violet-300'}[s]||'bg-gray-200');

  return (
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
        {!currentProfile.bio_registered && (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-800">Registrá tu biometría primero</p>
              <p className="text-xs text-amber-600 mt-1 mb-3">Necesitás vincular tu huella o Face ID una sola vez para poder registrar asistencia.</p>
              <button onClick={handleRegBio} disabled={bioLoading}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors">
                {bioLoading ? 'Registrando...' : 'Registrar ahora'}
              </button>
            </div>
          </div>
        )}

        {/* Today card */}
        {hq && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">Hoy</h2>
                {isHoliday ? <Badge color="purple">Feriado</Badge>
                  : todaySched?.active ? <Badge color="blue">{todaySched.start_time?.slice(0,5)} – {todaySched.end_time?.slice(0,5)}</Badge>
                  : <Badge color="gray">Día libre</Badge>}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={`rounded-2xl p-4 text-center ${todayRec?.check_in_at?'bg-sky-50':'bg-gray-50'}`}>
                  <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide">Entrada</p>
                  <p className={`text-2xl font-black font-mono ${todayRec?.check_in_at?'text-sky-700':'text-gray-300'}`}>
                    {todayRec?.check_in_at?fmtTime(todayRec.check_in_at):'--:--'}
                  </p>
                  {(todayRec?.minutes_late||0)>0&&<p className="text-xs text-amber-500 mt-1">+{todayRec.minutes_late}min tarde</p>}
                </div>
                <div className={`rounded-2xl p-4 text-center ${todayRec?.check_out_at?'bg-emerald-50':'bg-gray-50'}`}>
                  <p className="text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide">Salida</p>
                  <p className={`text-2xl font-black font-mono ${todayRec?.check_out_at?'text-emerald-700':'text-gray-300'}`}>
                    {todayRec?.check_out_at?fmtTime(todayRec.check_out_at):'--:--'}
                  </p>
                  {workedMin&&<p className="text-xs text-emerald-600 mt-1">{Math.floor(workedMin/60)}h {workedMin%60}m</p>}
                </div>
              </div>

              <div className="space-y-2.5">
                {!todayRec?.check_in_at ? (
                  <button onClick={() => setStepMode('checkin')} disabled={!currentProfile.bio_registered}
                    className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40"
                    style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                    <span>📍</span> Registrar entrada
                  </button>
                ) : !todayRec?.check_out_at ? (
                  <button onClick={() => setStepMode('checkout')}
                    className="w-full py-4 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                    style={{background:'linear-gradient(135deg,#059669,#0d9488)'}}>
                    <span>📍</span> Registrar salida
                  </button>
                ) : (
                  <div className="w-full py-4 rounded-2xl bg-emerald-50 text-sm text-center text-emerald-700 font-bold">
                    ✓ Jornada completa registrada
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-50 px-5 py-3 flex items-center gap-6">
              <div className="flex items-center gap-1.5"><span className="text-sm">📍</span><p className="text-xs text-gray-400">GPS · {hq.name}</p></div>
              <div className="flex items-center gap-1.5"><span className="text-sm">👆</span><p className="text-xs text-gray-400">Biometría personal</p></div>
              <div className="ml-auto"><Badge color="green">Seguro</Badge></div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {[['schedule','Mi horario'],['history','Historial']].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)}
                className={`flex-1 py-3.5 text-xs font-bold uppercase tracking-wide ${tab===t?'text-sky-600 border-b-2 border-sky-500':'text-gray-400'}`}>{l}</button>
            ))}
          </div>
          <div className="p-5">
            {tab==='schedule'&&(
              <div className="space-y-2">
                {DAYS.map((day,i)=>{ const s=schedule[i]; const isT=i===todayDow;
                  return(
                    <div key={i} className={`flex items-center justify-between py-2.5 px-4 rounded-2xl ${isT?'bg-sky-50 border border-sky-100':''}`}>
                      <span className={`text-sm font-bold ${isT?'text-sky-700':'text-gray-700'}`}>{day}{isT&&<span className="text-xs text-sky-400 font-normal ml-1">(hoy)</span>}</span>
                      {s?.active?<Badge color={isT?'blue':'gray'}>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</Badge>:<span className="text-xs text-gray-300">Libre</span>}
                    </div>
                  );
                })}
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
                    const mins=r.check_in_at&&r.check_out_at?Math.round((new Date(r.check_out_at)-new Date(r.check_in_at))/60000):null;
                    return(
                      <div key={r.id} className="flex items-center justify-between py-3 px-4 rounded-2xl bg-gray-50">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{fmtDate(r.date)}</p>
                          <p className="text-xs text-gray-400 mt-0.5 font-mono">
                            {r.check_in_at?`${fmtTime(r.check_in_at)} → ${r.check_out_at?fmtTime(r.check_out_at):'sin salida'}`:'Sin registro'}
                            {mins?` · ${Math.floor(mins/60)}h${mins%60}m`:''}
                          </p>
                          {r.justification&&<p className="text-xs text-amber-600 italic mt-0.5">"{r.justification}"</p>}
                        </div>
                        {r.status==='present'&&<Badge color="green">Presente</Badge>}
                        {r.status==='absent'&&<Badge color="red">Ausente</Badge>}
                        {r.status==='justified'&&<Badge color="yellow">Justificada</Badge>}
                        {r.status==='holiday'&&<Badge color="purple">Feriado</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {hq && <StepModal open={!!stepMode} onClose={()=>setStepMode(null)} mode={stepMode}
        profile={currentProfile} hq={hq} onSuccess={()=>{ loadData(); showToast(stepMode==='checkin'?'✓ Entrada registrada':'✓ Salida registrada'); }} />}
    </div>
  );
}
