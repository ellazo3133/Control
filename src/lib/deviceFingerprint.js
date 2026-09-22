// Genera una huella digital del dispositivo combinando múltiples características
// No es 100% infalible pero es muy difícil de falsificar

export async function getDeviceFingerprint() {
  const components = [];

  // 1. User agent
  components.push(navigator.userAgent);

  // 2. Idioma y zona horaria
  components.push(navigator.language || '');
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '');

  // 3. Pantalla
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);
  components.push(String(window.devicePixelRatio || 1));

  // 4. Hardware
  components.push(String(navigator.hardwareConcurrency || 0));
  components.push(String(navigator.deviceMemory || 0));

  // 5. Touch (celular vs PC)
  components.push(String(navigator.maxTouchPoints || 0));

  // 6. Canvas fingerprint — cómo el GPU renderiza
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('ElLazo🔐', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('ElLazo🔐', 4, 17);
    components.push(canvas.toDataURL());
  } catch (e) {
    components.push('canvas_error');
  }

  // 7. WebGL fingerprint
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
      }
    }
  } catch (e) {
    components.push('webgl_error');
  }

  // 8. AudioContext fingerprint
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      oscillator.connect(analyser);
      analyser.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(0);
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      oscillator.stop();
      ctx.close();
      components.push(data.slice(0, 10).join(','));
    }
  } catch (e) {
    components.push('audio_error');
  }

  // Hash de todos los componentes
  const str = components.join('|||');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
