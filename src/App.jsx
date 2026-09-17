import { useState, useEffect, Component } from 'react';
import { supabase, getProfile, signOut } from './lib/supabase';
import LoginScreen from './components/LoginScreen';
import PWABanner from './components/PWABanner';
import EmployeeView from './components/EmployeeView';
import AdminView from './components/AdminView';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{background:'#0f172a',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
          <div style={{background:'#1e293b',borderRadius:'1.5rem',padding:'2rem',maxWidth:'420px',width:'100%'}}>
            <p style={{color:'#f87171',fontWeight:'bold',fontSize:'1rem',marginBottom:'1rem'}}>❌ Error en la aplicación</p>
            <pre style={{color:'#94a3b8',fontSize:'0.7rem',whiteSpace:'pre-wrap',wordBreak:'break-word',marginBottom:'1.5rem',maxHeight:'200px',overflow:'auto'}}>
              {this.state.error?.toString()}
            </pre>
            <button onClick={()=>window.location.reload()}
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)',color:'white',border:'none',padding:'0.875rem',borderRadius:'1rem',fontWeight:'bold',cursor:'pointer',width:'100%',fontSize:'0.9rem'}}>
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        try { const p = await getProfile(session.user.id); setProfile(p); }
        catch (e) { console.error('Error loading profile:', e); }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        try { const p = await getProfile(session.user.id); setProfile(p); }
        catch (e) { console.error('Error loading profile:', e); }
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
      <div style={{background:'linear-gradient(135deg,#0f172a,#1e293b)',minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{textAlign:'center'}}>
          <div style={{width:'3rem',height:'3rem',border:'2px solid #38bdf8',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 1rem'}}/>
          <p style={{color:'#94a3b8',fontSize:'0.875rem'}}>Cargando...</p>
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
