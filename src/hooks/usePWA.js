import { useState, useEffect, useCallback } from 'react';

// VAPID public key - in production use your own
// For now we use local notifications only (no server push)
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBLpADpq1gPDmF1IUg';

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [swReg, setSwReg] = useState(null);

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
    }

    // Catch install prompt
    const handler = e => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);

    // Get SW registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => setSwReg(reg));
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') { setIsInstalled(true); setInstallPrompt(null); }
    return outcome === 'accepted';
  }, [installPrompt]);

  const requestNotifications = useCallback(async () => {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    return perm === 'granted';
  }, []);

  // Schedule local notification (no server needed)
  const scheduleLocalNotif = useCallback(async (title, body, delayMs = 0, tag = 'default') => {
    if (notifPermission !== 'granted') return;
    if (!swReg) {
      // Fallback: direct notification
      setTimeout(() => new Notification(title, { body, icon: '/icon-192.png', tag }), delayMs);
      return;
    }
    setTimeout(() => {
      swReg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag, vibrate: [200,100,200] });
    }, delayMs);
  }, [notifPermission, swReg]);

  // Schedule "don't forget checkout" reminder
  const scheduleCheckoutReminder = useCallback(async (checkoutTime) => {
    // checkoutTime = "HH:MM" expected exit time
    if (notifPermission !== 'granted') return;
    const [h, m] = checkoutTime.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(h, m - 10, 0, 0); // 10 min before
    const delay = target - now;
    if (delay > 0) {
      await scheduleLocalNotif(
        '⏰ Acordate de registrar tu salida',
        `Tu jornada termina a las ${checkoutTime}. Registrá tu salida antes de irte.`,
        delay, 'checkout-reminder'
      );
    }
  }, [notifPermission, scheduleLocalNotif]);

  return {
    canInstall: !!installPrompt && !isInstalled,
    isInstalled,
    install,
    notifPermission,
    requestNotifications,
    scheduleLocalNotif,
    scheduleCheckoutReminder,
  };
}
