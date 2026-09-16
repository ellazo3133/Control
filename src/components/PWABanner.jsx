import { useState, useEffect } from 'react';
import { usePWA } from '../hooks/usePWA';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const isInStandaloneMode = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

export default function PWABanner({ onNotifGranted }) {
  const { canInstall, install, notifPermission, requestNotifications } = usePWA();
  const [dismissed, setDismissed]   = useState(() => localStorage.getItem('pwa_dismissed') === '1');
  const [installing, setInstalling] = useState(false);
  const [showNotif,  setShowNotif]  = useState(false);
  const [iosGuide,   setIosGuide]   = useState(false);

  const ios        = isIOS();
  const standalone = isInStandaloneMode();

  // Once installed show notif prompt
  useEffect(() => {
    if (standalone && notifPermission === 'default' && !dismissed) {
      setShowNotif(true);
    }
    if (notifPermission === 'granted' && onNotifGranted) onNotifGranted();
  }, [standalone, notifPermission]);

  const handleInstall = async () => {
    setInstalling(true);
    const ok = await install();
    setInstalling(false);
    if (ok) setShowNotif(true);
  };

  const handleNotif = async () => {
    const granted = await requestNotifications();
    if (granted && onNotifGranted) onNotifGranted();
    setShowNotif(false);
    localStorage.setItem('pwa_dismissed', '1');
    setDismissed(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa_dismissed', '1');
  };

  // Already installed or dismissed
  if (standalone || dismissed) return null;

  // iOS — can't use beforeinstallprompt, show manual instructions
  if (ios && !standalone) {
    return (
      <>
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
          <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl bg-gray-50">📱</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-sm">Instalá la app en tu iPhone</p>
                  <p className="text-xs text-gray-500 mt-0.5">Para acceso rápido desde la pantalla de inicio</p>
                </div>
                <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 mt-0.5">✕</button>
              </div>
              <button onClick={() => setIosGuide(true)}
                className="mt-4 w-full py-3 rounded-2xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                Ver cómo instalarlo
              </button>
            </div>
          </div>
        </div>

        {/* iOS guide modal */}
        {iosGuide && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIosGuide(false)}/>
            <div className="relative bg-white w-full max-w-lg rounded-t-3xl shadow-2xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Instalar en iPhone / iPad</h2>
              <div className="space-y-3">
                {[
                  ['1', '⬆️', 'Tocá el botón compartir', 'El ícono de cuadrado con flecha arriba, en la barra del navegador'],
                  ['2', '📋', 'Elegí "Agregar a pantalla de inicio"', 'Desplazá hacia abajo en el menú que aparece'],
                  ['3', '✓', 'Tocá "Agregar"', 'La app aparecerá en tu pantalla de inicio como una app nativa'],
                ].map(([num, icon, title, desc]) => (
                  <div key={num} className="flex items-start gap-3 bg-gray-50 rounded-2xl p-4">
                    <span className="text-2xl flex-shrink-0">{icon}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setIosGuide(false); handleDismiss(); }}
                className="w-full py-3 rounded-2xl text-sm font-bold text-white"
                style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Notification prompt (after install)
  if (showNotif) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
        <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl bg-amber-50">🔔</div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">Activar recordatorios</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Recibí una notificación 10 minutos antes de que termine tu turno.</p>
              <div className="flex gap-2">
                <button onClick={handleNotif}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white"
                  style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                  Activar
                </button>
                <button onClick={handleDismiss} className="px-4 py-2.5 rounded-2xl text-sm font-semibold text-gray-400 hover:bg-gray-50">
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Android / Chrome — native install prompt
  if (!canInstall) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4">
      <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">📲 Instalá la app</p>
              <p className="text-xs text-gray-500 mt-0.5">Agregala a tu pantalla de inicio para acceso con un toque y notificaciones.</p>
            </div>
            <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 mt-0.5 flex-shrink-0">✕</button>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleInstall} disabled={installing}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-60 active:scale-95 transition-all"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {installing ? 'Instalando...' : '📲 Instalar app'}
            </button>
            <button onClick={handleDismiss} className="px-4 py-3 rounded-2xl text-sm font-semibold text-gray-400 hover:bg-gray-50">
              No
            </button>
          </div>
        </div>
        <div className="bg-gray-50 px-5 py-2.5 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
          <p className="text-xs text-gray-400">Funciona sin internet · Notificaciones de turno</p>
        </div>
      </div>
    </div>
  );
}
