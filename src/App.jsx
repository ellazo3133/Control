import { useState, useEffect } from 'react';
import { supabase, getProfile, signOut } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import PWABanner from './components/PWABanner';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';

class ErrorBoundary extends (require('react').Component) {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{background:'#0f172a',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
          <div style={{background:'#1e293b',borderRadius:'1.5rem',padding:'2rem',maxWidth:'400px',width:'100%'}}>
            <p style={{color:'#f87171',fontWeight:'bold',marginBottom:'1rem'}}>❌ Error en la aplicación</p>
            <pre style={{color:'#94a3b8',fontSize:'0.75rem',whiteSpace:'pre-wrap',wordBreak:'break-word',marginBottom:'1rem'}}>
              {this.state.error?.message}
            </pre>
            <button onClick={()=>window.location.reload()}
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)',color:'white',border:'none',padding:'0.75rem 1.5rem',borderRadius:'1rem',fontWeight:'bold',cursor:'pointer',width:'100%'}}>
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    return <ErrorBoundary><AdminView profile={profile} onLogout={handleLogout} /><PWABanner/></ErrorBoundary>;
  }

  return <ErrorBoundary><EmployeeView profile={profile} onLogout={handleLogout} /><PWABanner/></ErrorBoundary>;
}
