import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SMTP2GO_API_KEY = 'api-1B2157A2108B4EEA87CFA614F6388C90';
const SENDER_EMAIL = 'info@ellazo.com.ar';
const SENDER_NAME = 'Control de Asistencia';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const fmtDate = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-AR') : '—';
const toChar = (d: Date, fmt: string) => {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  if (fmt === 'month_year') return `${months[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString('es-AR');
};

Deno.serve(async (req) => {
  try {
    // Calcular mes anterior
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const reportMonth = prevMonth.toISOString().slice(0, 7);
    const monthLabel = toChar(prevMonth, 'month_year');
    const monthStart = reportMonth + '-01';
    const monthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)
      .toISOString().split('T')[0];

    // Email del admin principal
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('role', 'admin')
      .eq('active', true)
      .order('created_at')
      .limit(1)
      .single();

    if (!adminProfile) throw new Error('No hay admin configurado');

    // Cargar empleados
    const { data: employees } = await supabase
      .from('profiles')
      .select('id, name, hire_date, salary')
      .eq('role', 'employee')
      .eq('active', true)
      .order('name');

    // Cargar registros del mes
    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .gte('date', monthStart)
      .lte('date', monthEnd);

    // Cargar horarios
    const { data: schedules } = await supabase
      .from('schedules')
      .select('*')
      .eq('active', true);

    // Construir stats por empleado
    const empStats = (employees || []).map(emp => {
      const empSched: Record<number, any> = {};
      (schedules || []).filter(s => s.employee_id === emp.id)
        .forEach(s => { empSched[s.day_of_week] = s; });

      const days = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate();
      let scheduled = 0, present = 0, absent = 0, justified = 0, lateCount = 0, totalWorked = 0;

      for (let d = 1; d <= days; d++) {
        const date = `${reportMonth}-${String(d).padStart(2, '0')}`;
        const dow = new Date(date + 'T12:00:00').getDay();
        if (!empSched[dow]?.active) continue;
        scheduled++;
        const rec = (records || []).find(r => r.employee_id === emp.id && r.date === date);
        if (rec?.check_in) {
          present++;
          if ((rec.minutes_late || 0) > 0) lateCount++;
          totalWorked += rec.minutes_worked || 0;
        } else if (rec?.status === 'justified') {
          justified++;
        } else {
          absent++;
        }
      }
      const pct = scheduled > 0 ? Math.round(present / scheduled * 100) : 0;
      const workedH = Math.floor(totalWorked / 60);
      const workedM = totalWorked % 60;
      return { name: emp.name, scheduled, present, absent, justified, lateCount, pct, workedH, workedM };
    });

    // Totales generales
    const totalPresent = empStats.reduce((a, s) => a + s.present, 0);
    const totalAbsent = empStats.reduce((a, s) => a + s.absent, 0);
    const totalLate = empStats.reduce((a, s) => a + s.lateCount, 0);
    const avgPct = empStats.length ? Math.round(empStats.reduce((a, s) => a + s.pct, 0) / empStats.length) : 0;

    // HTML del email
    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:2rem;}
  .container{max-width:640px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#0ea5e9,#6366f1);padding:2rem;color:white;text-align:center;}
  .header h1{margin:0 0 .25rem;font-size:1.5rem;}
  .header p{margin:0;opacity:.85;font-size:.9rem;}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;padding:1.5rem;background:#f1f5f9;}
  .stat{background:white;border-radius:12px;padding:1rem;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06);}
  .stat-val{font-size:1.75rem;font-weight:900;line-height:1;}
  .stat-label{font-size:.7rem;color:#6b7280;margin-top:.25rem;text-transform:uppercase;letter-spacing:.05em;}
  .body{padding:1.5rem;}
  h2{font-size:1rem;color:#374151;margin:0 0 1rem;padding-bottom:.5rem;border-bottom:2px solid #f1f5f9;}
  table{width:100%;border-collapse:collapse;font-size:.82rem;}
  th{background:#f8fafc;padding:.6rem .75rem;text-align:left;font-weight:700;color:#374151;border-bottom:2px solid #e5e7eb;}
  td{padding:.6rem .75rem;border-bottom:1px solid #f1f5f9;color:#374151;}
  tr:last-child td{border-bottom:none;}
  .pct{font-weight:900;font-size:1rem;}
  .green{color:#059669;} .red{color:#dc2626;} .amber{color:#d97706;}
  .footer{padding:1rem 1.5rem;background:#f8fafc;font-size:.75rem;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;}
  @media(max-width:480px){.summary{grid-template-columns:repeat(2,1fr);}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>📊 Reporte de Asistencia</h1>
    <p>${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} · ${employees?.length || 0} empleados</p>
  </div>

  <div class="summary">
    <div class="stat">
      <div class="stat-val" style="color:#0ea5e9">${avgPct}%</div>
      <div class="stat-label">Asist. promedio</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#059669">${totalPresent}</div>
      <div class="stat-label">Presencias totales</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#dc2626">${totalAbsent}</div>
      <div class="stat-label">Ausencias</div>
    </div>
    <div class="stat">
      <div class="stat-val" style="color:#d97706">${totalLate}</div>
      <div class="stat-label">Tardanzas</div>
    </div>
  </div>

  <div class="body">
    <h2>Detalle por empleado</h2>
    <table>
      <tr>
        <th>Empleado</th>
        <th>Prog.</th>
        <th>Pres.</th>
        <th>Aus.</th>
        <th>Just.</th>
        <th>Tard.</th>
        <th>Horas</th>
        <th>%</th>
      </tr>
      ${empStats.map(s => `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.scheduled}</td>
        <td class="green">${s.present}</td>
        <td class="${s.absent > 0 ? 'red' : ''}">${s.absent}</td>
        <td class="${s.justified > 0 ? 'amber' : ''}">${s.justified}</td>
        <td class="${s.lateCount > 0 ? 'amber' : ''}">${s.lateCount}</td>
        <td>${s.workedH}h ${s.workedM}m</td>
        <td><span class="pct ${s.pct >= 90 ? 'green' : s.pct >= 75 ? 'amber' : 'red'}">${s.pct}%</span></td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="footer">
    Reporte generado automáticamente el ${new Date().toLocaleDateString('es-AR', {day:'2-digit',month:'long',year:'numeric'})} ·
    Sistema de Control de Asistencia — El Lazo
  </div>
</div>
</body>
</html>`;

    // Enviar via SMTP2GO API
    const smtp2goRes = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: SMTP2GO_API_KEY,
        to: [`${adminProfile.name} <${adminProfile.email}>`],
        sender: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        subject: `📊 Reporte de Asistencia — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`,
        htmlbody: html,
      }),
    });

    const smtp2goData = await smtp2goRes.json();

    if (!smtp2goRes.ok || smtp2goData.data?.error) {
      throw new Error(smtp2goData.data?.error || 'SMTP2GO error');
    }

    // Marcar como enviado en notificaciones
    await supabase.from('admin_notifications').insert({
      type: 'monthly_report',
      title: `📊 Reporte mensual enviado — ${monthLabel}`,
      body: `El reporte de ${monthLabel} fue enviado a ${adminProfile.email}`,
      data: { month: reportMonth, sent: true },
    });

    return new Response(JSON.stringify({ ok: true, month: reportMonth, to: adminProfile.email }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
