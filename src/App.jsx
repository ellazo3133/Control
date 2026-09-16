import { useState, useEffect } from 'react';
import { supabase, getProfile, signOut } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import PWABanner from './components/PWABanner';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        try {
          const p = await getProfile(session.user.id);
          setProfile(p);
        } catch (e) {
          console.error('Error loading profile:', e);
        }
      }
      setLoading(false);
    });

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        try {
          const p = await getProfile(session.user.id);
          setProfile(p);
        } catch (e) {
          console.error('Error loading profile:', e);
        }
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut();
    setSession(null);
    setProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)' }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return <LoginScreen onLogin={(p) => setProfile(p)} />;
  }

  if (profile.role === 'admin') {
    return <><AdminView profile={profile} onLogout={handleLogout} /><PWABanner/></>;
  }

  return <><EmployeeView profile={profile} onLogout={handleLogout} /><PWABanner/></>;
}
