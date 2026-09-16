import { useState, useEffect } from 'react';
import { usePWA } from '../hooks/usePWA';

export default function PWABanner({ onNotifGranted }) {
  const { canInstall, isInstalled, install, notifPermission, requestNotifications } = usePWA();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('pwa_banner_dismissed') === '1');
  const [step, setStep] = useState('install'); // 'install' | 'notif' | null
  const [installing, setInstalling] = useState(false);

  // Once installed, move to notif step
  useEffect(() => {
    if (isInstalled && notifPermission === 'default') setStep('notif');
    else if (isInstalled && notifPermission === 'granted') setStep(null);
  }, [isInstalled, notifPermission]);

  // Already have notif permission
  useEffect(() => {
    if (notifPermission === 'granted' && onNotifGranted) onNotifGranted();
  }, [notifPermission, onNotifGranted]);

  const handleInstall = async () => {
    setInstalling(true);
    const ok = await install();
    setInstalling(false);
    if (ok) setStep('notif');
  };

  const handleNotif = async () => {
    const granted = await requestNotifications();
    if (granted && onNotifGranted) onNotifGranted();
    setStep(null);
    localStorage.setItem('pwa_banner_dismissed', '1');
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa_banner_dismissed', '1');
  };

  // Show notif step even without install (iOS Safari)
  const showNotifOnly = !canInstall && notifPermission === 'default' && !dismissed;
  const showInstall = canInstall && !dismissed && step === 'install';
  const showNotif = (step === 'notif' || showNotifOnly) && !dismissed;

  if (!showInstall && !showNotif) return null;

  if (showNotif) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 sm:p-6">
        <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 text-2xl bg-amber-50">🔔</div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">Activar recordatorios</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">Recibí una notificación cuando sea hora de registrar tu salida.</p>
              <div className="flex gap-2">
                <button onClick={handleNotif}
                  className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white"
                  style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
                  Activar
                </button>
                <button onClick={handleDismiss}
                  className="px-4 py-2.5 rounded-2xl text-sm font-semibold text-gray-400 hover:bg-gray-50">
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 p-4 sm:p-6">
      <div className="max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-bold text-gray-900 text-sm">Instalá la app</p>
              <p className="text-xs text-gray-500 mt-0.5">Agregala a tu pantalla de inicio para acceso rápido y notificaciones.</p>
            </div>
            <button onClick={handleDismiss} className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleInstall} disabled={installing}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {installing ? 'Instalando...' : '📲 Instalar app'}
            </button>
            <button onClick={handleDismiss}
              className="px-4 py-3 rounded-2xl text-sm font-semibold text-gray-400 hover:bg-gray-50">
              No gracias
            </button>
          </div>
        </div>
        <div className="bg-gray-50 px-5 py-2.5 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
          <p className="text-xs text-gray-400">Funciona sin internet para ver tu historial</p>
        </div>
      </div>
    </div>
  );
}
