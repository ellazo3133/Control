import { useState, useEffect } from 'react';
import { signIn, getProfile, sendPasswordReset, updatePassword, supabase } from '../lib/supabase';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [newPw, setNewPw] = useState('');
  const [newPwConfirm, setNewPwConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);

  // Detect password reset link
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (search.includes('reset=1') || hash.includes('type=recovery')) {
      setView('reset');
    }
    // Supabase sends #access_token= on password reset
    if (hash.includes('access_token') && hash.includes('type=recovery')) {
      setView('reset');
    }
  }, []);

  const doLogin = async () => {
    setLoading(true); setErr('');
    try {
      const { user } = await signIn(email, pw);
      const profile = await getProfile(user.id);
      onLogin(profile);
    } catch (e) {
      setErr(e.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : e.message);
    }
    setLoading(false);
  };

  const doForgot = async () => {
    if (!forgotEmail) return setErr('Ingresá tu email');
    setLoading(true); setErr('');
    try {
      await sendPasswordReset(forgotEmail);
      setForgotSent(true);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const doReset = async () => {
    if (!newPw || newPw.length < 6) return setErr('La contraseña debe tener al menos 6 caracteres');
    if (newPw !== newPwConfirm) return setErr('Las contraseñas no coinciden');
    setLoading(true); setErr('');
    try {
      await updatePassword(newPw);
      setResetDone(true);
      setTimeout(() => { setView('login'); window.history.replaceState({}, '', '/'); }, 3000);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)' }}>
      <div className="absolute top-20 left-10 w-64 h-64 rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(circle,#38bdf8,transparent)' }} />
      <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full opacity-5 pointer-events-none"
        style={{ background: 'radial-gradient(circle,#818cf8,transparent)' }} />

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl mx-auto mb-4 flex items-center justify-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display',serif" }}>Asistencia</h1>
          <p className="text-slate-400 text-sm mt-1">Control de personal</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* LOGIN */}
          {view === 'login' && (
            <>
              <div className="px-6 pt-6 pb-2 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-800">Iniciar sesión</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doLogin()}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Contraseña</label>
                  <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doLogin()}
                    className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
                </div>
                {err && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{err}</p>}
                <button onClick={doLogin} disabled={loading}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                  {loading ? 'Ingresando...' : 'Entrar'}
                </button>
                <button onClick={() => { setView('forgot'); setErr(''); }}
                  className="w-full text-xs text-sky-500 hover:text-sky-700 transition-colors py-1">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            </>
          )}

          {/* FORGOT PASSWORD */}
          {view === 'forgot' && (
            <>
              <div className="px-6 pt-6 pb-2 border-b border-gray-100">
                <button onClick={() => { setView('login'); setErr(''); setForgotSent(false); }}
                  className="text-xs text-gray-400 hover:text-gray-600 mb-2 flex items-center gap-1">
                  ← Volver
                </button>
                <h2 className="text-base font-bold text-gray-800">Recuperar contraseña</h2>
              </div>
              <div className="p-6 space-y-4">
                {!forgotSent ? <>
                  <p className="text-xs text-gray-500">Te enviamos un link a tu email para crear una contraseña nueva.</p>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Tu email</label>
                    <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doForgot()}
                      placeholder="tu@email.com"
                      className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
                  </div>
                  {err && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{err}</p>}
                  <button onClick={doForgot} disabled={loading}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                    {loading ? 'Enviando...' : 'Enviar link de recuperación'}
                  </button>
                </> : (
                  <div className="text-center py-4 space-y-3">
                    <div className="text-5xl">📧</div>
                    <p className="font-bold text-gray-900">¡Email enviado!</p>
                    <p className="text-sm text-gray-500">Revisá tu casilla <span className="font-semibold text-gray-700">{forgotEmail}</span> y hacé clic en el link para crear tu nueva contraseña.</p>
                    <button onClick={() => { setView('login'); setForgotSent(false); setForgotEmail(''); }}
                      className="text-xs text-sky-500 hover:text-sky-700 mt-2">Volver al inicio</button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* RESET PASSWORD (from email link) */}
          {view === 'reset' && (
            <>
              <div className="px-6 pt-6 pb-2 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-800">Nueva contraseña</h2>
              </div>
              <div className="p-6 space-y-4">
                {!resetDone ? <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Nueva contraseña</label>
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Confirmar contraseña</label>
                    <input type="password" value={newPwConfirm} onChange={e => setNewPwConfirm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && doReset()}
                      placeholder="Repetí la contraseña"
                      className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50"/>
                  </div>
                  {err && <p className="text-red-500 text-xs bg-red-50 px-3 py-2.5 rounded-xl">{err}</p>}
                  <button onClick={doReset} disabled={loading}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#0ea5e9,#6366f1)' }}>
                    {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                  </button>
                </> : (
                  <div className="text-center py-4 space-y-3">
                    <div className="text-5xl">✅</div>
                    <p className="font-bold text-gray-900">¡Contraseña actualizada!</p>
                    <p className="text-sm text-gray-500">Redirigiendo al inicio...</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
