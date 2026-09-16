import { useState, useEffect, useCallback } from 'react';
import { getAdminNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/supabase';
import { supabase } from '../lib/supabase';

const timeAgo = iso => {
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff/60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}min`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs/24)}d`;
};

export default function NotificationBell() {
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);
  const unread = notifs.filter(n => !n.read).length;

  const load = useCallback(async () => {
    const data = await getAdminNotifications();
    setNotifs(data);
  }, []);

  useEffect(() => {
    load();
    // Realtime subscription
    const channel = supabase
      .channel('admin_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' },
        payload => {
          setNotifs(prev => [payload.new, ...prev]);
          // Browser notification if permission granted
          if (Notification.permission === 'granted') {
            new Notification(payload.new.title, {
              body: payload.new.body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: payload.new.type,
            });
          }
        })
      .subscribe();

    // Poll every 2 minutes as fallback
    const interval = setInterval(load, 120000);

    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, [load]);

  const handleMarkRead = async (id) => {
    await markNotificationRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? {...n, read: true} : n));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifs(prev => prev.map(n => ({...n, read: true})));
  };

  const iconByType = type => ({
    late_arrival: '⏰',
    absent: '✗',
    checkout_missing: '🚪',
  }[type] || '🔔');

  const colorByType = type => ({
    late_arrival: 'border-l-amber-400 bg-amber-50',
    absent: 'border-l-red-400 bg-red-50',
    checkout_missing: 'border-l-sky-400 bg-sky-50',
  }[type] || 'border-l-gray-200 bg-gray-50');

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs font-black rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)}/>
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-20 overflow-hidden max-h-96 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="text-sm font-bold text-gray-900">Notificaciones</p>
              {unread > 0 && (
                <button onClick={handleMarkAllRead}
                  className="text-xs text-sky-500 hover:text-sky-700 font-semibold">
                  Marcar todo como leído
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">🔔</p>
                  <p className="text-sm text-gray-400">Sin notificaciones</p>
                </div>
              )}
              {notifs.map(n => (
                <div key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  className={`px-4 py-3 border-b border-gray-50 border-l-4 cursor-pointer transition-all
                    ${colorByType(n.type)} ${!n.read ? 'opacity-100' : 'opacity-60'}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{iconByType(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold text-gray-900 ${!n.read ? '' : 'opacity-70'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                      <p className="text-xs text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-sky-500 flex-shrink-0 mt-1"/>}
                  </div>
                </div>
              ))}
            </div>

            {notifs.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-50 flex-shrink-0">
                <p className="text-xs text-gray-400 text-center">{notifs.length} notificaciones</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
