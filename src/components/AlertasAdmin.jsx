import { useState, useEffect } from 'react';
import { getAlertConfig, updateAlertConfig, runAlerts } from '../lib/supabase';

const ALERT_META = {
  consecutive_lates: { label:'Tardanzas consecutivas',     icon:'⏰', desc:'Notifica cuando un empleado llega tarde N veces seguidas', unit:'tardanzas' },
  monthly_absences:  { label:'Ausencias mensuales',        icon:'✗',  desc:'Notifica cuando un empleado acumula N ausencias en el mes', unit:'ausencias' },
  vacation_expiry:   { label:'Vacaciones sin tomar',        icon:'🏖️', desc:'Notifica cuando hay días de vacaciones disponibles (temporada oct-abr)', unit:'días' },
  missing_checkout:  { label:'Sin registro de salida',     icon:'🚪', desc:'Notifica cuando un empleado registró entrada pero no salida al día siguiente', unit:'días' },
  birthday:          { label:'Cumpleaños',                  icon:'🎂', desc:'Recordatorio cuando es el cumpleaños de un empleado', unit:'' },
};

export default function AlertasAdmin({ showToast }) {
  const [configs, setConfigs] = useState([]);
  const [running, setRunning] = useState(false);

  const load = async () => { const d=await getAlertConfig().catch(()=>[]); setConfigs(d); };
  useEffect(()=>{ load(); },[]);

  const handleToggle = async (type, enabled) => {
    await updateAlertConfig(type, { enabled });
    setConfigs(p=>p.map(c=>c.type===type?{...c,enabled}:c));
    showToast(enabled?'Alerta activada':'Alerta desactivada');
  };

  const handleThreshold = async (type, threshold) => {
    await updateAlertConfig(type, { threshold: parseInt(threshold)||1 });
    setConfigs(p=>p.map(c=>c.type===type?{...c,threshold:parseInt(threshold)||1}:c));
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const count = await runAlerts();
      showToast(count>0?`${count} alerta${count!==1?'s':''} generada${count!==1?'s':''}`:'Sin alertas nuevas');
    } catch(e){ showToast('Error al ejecutar alertas','error'); }
    setRunning(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Alertas automáticas</h2>
          <p className="text-sm text-gray-400">Notificaciones en la app + email al detectar situaciones</p>
        </div>
        <button onClick={handleRunNow} disabled={running}
          className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
          style={{background:'linear-gradient(135deg,#7c3aed,#a855f7)'}}>
          {running?'Ejecutando...':'▶ Ejecutar ahora'}
        </button>
      </div>

      <div className="bg-sky-50 border border-sky-200 rounded-3xl px-5 py-4 flex items-start gap-3">
        <span className="text-xl flex-shrink-0">ℹ️</span>
        <div>
          <p className="text-xs font-bold text-sky-800">¿Cómo funcionan las alertas?</p>
          <p className="text-xs text-sky-600 mt-0.5">Se generan automáticamente cada vez que cargás el panel y cuando un empleado registra asistencia. También podés ejecutarlas manualmente con el botón de arriba. Aparecen en la campana 🔔 del admin y se pueden configurar para enviar emails.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 divide-y divide-gray-50">
        {configs.map(cfg=>{
          const meta = ALERT_META[cfg.type];
          if (!meta) return null;
          return (
            <div key={cfg.type} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-bold text-gray-900">{meta.label}</p>
                    {/* Toggle */}
                    <button onClick={()=>handleToggle(cfg.type,!cfg.enabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${cfg.enabled?'bg-sky-500':'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.enabled?'translate-x-5':'translate-x-0.5'}`}/>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">{meta.desc}</p>

                  {/* Threshold input (not for birthday) */}
                  {cfg.type!=='birthday'&&cfg.type!=='vacation_expiry'&&(
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Umbral:</span>
                      <input type="number" min="1" max="30" value={cfg.threshold}
                        onChange={e=>handleThreshold(cfg.type,e.target.value)}
                        disabled={!cfg.enabled}
                        className="w-16 px-2.5 py-1.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 text-center font-bold"/>
                      <span className="text-xs text-gray-500">{meta.unit}</span>
                    </div>
                  )}

                  {/* Notification channels */}
                  <div className="flex gap-3 mt-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={cfg.notify_app} disabled={!cfg.enabled}
                        onChange={e=>updateAlertConfig(cfg.type,{notify_app:e.target.checked}).then(load)}
                        className="w-3.5 h-3.5 rounded text-sky-500 disabled:opacity-40"/>
                      <span className={`text-xs ${cfg.enabled?'text-gray-600':'text-gray-300'}`}>🔔 App</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={cfg.notify_email} disabled={!cfg.enabled}
                        onChange={e=>updateAlertConfig(cfg.type,{notify_email:e.target.checked}).then(load)}
                        className="w-3.5 h-3.5 rounded text-sky-500 disabled:opacity-40"/>
                      <span className={`text-xs ${cfg.enabled?'text-gray-600':'text-gray-300'}`}>📧 Email</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
