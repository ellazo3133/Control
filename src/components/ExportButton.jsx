import { useState } from 'react';
import logoBase64 from '../assets/logoBase64.js';

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR') : '—';
const timeToMins = t => { if(!t)return 0; const [h,m]=(t.slice(0,5)||'00:00').split(':').map(Number); return h*60+m; };
const minsToHM = m => `${Math.floor(Math.abs(m)/60)}h ${Math.abs(m)%60}m`;
import { calcMonto } from './HorasExtra';
const fmtMoney = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n||0);

export default function ExportButton({ employees, records, schedMap, month, extraHours, payrolls }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const getStats = (empId) => {
    const sched = schedMap[empId] || {};
    const [y,m] = month.split('-').map(Number);
    const days = new Date(y,m,0).getDate();
    let scheduled=0,present=0,absent=0,justified=0,lateMins=0,lateCount=0,totalWork=0;
    for(let d=1;d<=days;d++){
      const date=`${month}-${String(d).padStart(2,'0')}`;
      const dow=new Date(date+'T12:00:00').getDay();
      if(!sched[dow]?.active)continue; scheduled++;
      const rec=records.find(r=>r.employee_id===empId&&r.date===date);
      if(rec?.check_in){present++;if((rec.minutes_late||0)>0){lateMins+=rec.minutes_late;lateCount++;}if(rec.minutes_worked)totalWork+=rec.minutes_worked;}
      else if(rec?.status==='justified')justified++;
      else if(new Date(date)<=new Date())absent++;
    }
    return{scheduled,present,absent,justified,lateMins,lateCount,totalWork,pct:scheduled>0?Math.round(present/scheduled*100):0};
  };

  const exportCSV = () => {
    setExporting(true);
    const rows = [['Fecha','Empleado','Entrada','Salida','Minutos trabajados','Estado','Tardanza (min)','Justificación']];
    const monthRecords = records.filter(r=>r.date?.startsWith(month));
    monthRecords.sort((a,b)=>a.date.localeCompare(b.date)).forEach(r=>{
      const emp = employees.find(e=>e.id===r.employee_id);
      rows.push([
        fmtDate(r.date), emp?.name||'—',
        fmtTime(r.check_in), fmtTime(r.check_out),
        r.minutes_worked||0,
        r.status==='present'?'Presente':r.status==='absent'?'Ausente':r.status==='justified'?'Justificada':'—',
        r.minutes_late||0, r.justification||''
      ]);
    });
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`asistencia-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false); setOpen(false);
  };

  const exportLiquidaciones = () => {
    setExporting(true);
    const rows = [['Empleado','Sueldo Base','Días Prog.','Presentes','Ausentes','Justificadas','% Asistencia','Descuento','Horas Extra','Total Neto']];
    employees.forEach(emp => {
      const s = getStats(emp.id);
      const prl = payrolls?.find(p=>p.employee_id===emp.id);
      const deductAmt = Math.round((emp.salary||0)*(s.absent/Math.max(s.scheduled,1)));
      const extraAmt = (extraHours||[]).filter(h=>h.employee_id===emp.id).reduce((a,h)=>a+calcMonto(h,emp,s.scheduled),0);
      rows.push([
        emp.name, emp.salary||0, s.scheduled, s.present, s.absent, s.justified,
        `${s.pct}%`, deductAmt, extraAmt,
        prl?.total_net || Math.round((emp.salary||0)-deductAmt+extraAmt)
      ]);
    });
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`liquidacion-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
    setExporting(false); setOpen(false);
  };

  const exportHTML = () => {
    setExporting(true);
    const [y,m] = month.split('-').map(Number);
    const monthName = new Date(y,m-1,1).toLocaleDateString('es-AR',{month:'long',year:'numeric'});
    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Reporte ${monthName}</title>
<style>
  body{font-family:Arial,sans-serif;padding:2rem;color:#1f2937;}
  h1{color:#0ea5e9;margin-bottom:.25rem;}
  h2{color:#374151;font-size:1rem;margin:2rem 0 .75rem;}
  .meta{color:#6b7280;font-size:.85rem;margin-bottom:2rem;}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:1.5rem;}
  th{background:#f1f5f9;padding:.5rem .75rem;text-align:left;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;}
  td{padding:.5rem .75rem;border-bottom:1px solid #f1f5f9;}
  tr:hover td{background:#f8fafc;}
  .badge{display:inline-block;padding:.125rem .5rem;border-radius:.375rem;font-size:.75rem;font-weight:600;}
  .green{background:#d1fae5;color:#065f46;} .red{background:#fee2e2;color:#991b1b;}
  .yellow{background:#fef3c7;color:#92400e;} .gray{background:#f3f4f6;color:#374151;}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem;}
  .stat{background:#f8fafc;border-radius:.75rem;padding:1rem;text-align:center;}
  .stat-val{font-size:1.75rem;font-weight:900;color:#0ea5e9;}
  .stat-label{font-size:.75rem;color:#6b7280;margin-top:.25rem;}
  @media print{button{display:none;}}
</style></head><body>
<button onclick="window.print()" style="background:#0ea5e9;color:white;border:none;padding:.75rem 1.5rem;border-radius:.75rem;font-weight:700;cursor:pointer;margin-bottom:1.5rem;">🖨️ Imprimir</button>
<h1>Reporte de Asistencia</h1>
<p class="meta">${monthName.charAt(0).toUpperCase()+monthName.slice(1)} · Generado el ${new Date().toLocaleDateString('es-AR')}</p>`;

    employees.forEach(emp => {
      const s = getStats(emp.id);
      const empRecs = records.filter(r=>r.employee_id===emp.id&&r.date?.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
      const sched = schedMap[emp.id]||{};
      const prl = payrolls?.find(p=>p.employee_id===emp.id);
      const deductAmt = Math.round((emp.salary||0)*(s.absent/Math.max(s.scheduled,1)));
      const extraAmt = (extraHours||[]).filter(h=>h.employee_id===emp.id).reduce((a,h)=>a+calcMonto(h,emp,Math.max(s.scheduled,1)),0);
      const totalNet = prl?.total_net || Math.round((emp.salary||0)-deductAmt+extraAmt);

      html += `<h2>${emp.name}</h2>`;
      if(emp.salary>0) html += `<p style="font-size:.85rem;color:#6b7280;">Sueldo base: ${fmtMoney(emp.salary)} · Total neto: <strong style="color:#0ea5e9">${fmtMoney(totalNet)}</strong></p>`;
      html += `<div class="stats">
        <div class="stat"><div class="stat-val" style="color:${s.pct>=90?'#059669':s.pct>=75?'#d97706':'#dc2626'}">${s.pct}%</div><div class="stat-label">Asistencia</div></div>
        <div class="stat"><div class="stat-val" style="color:#059669">${s.present}</div><div class="stat-label">Presentes</div></div>
        <div class="stat"><div class="stat-val" style="color:#dc2626">${s.absent}</div><div class="stat-label">Ausentes</div></div>
        <div class="stat"><div class="stat-val" style="color:#d97706">${s.justified}</div><div class="stat-label">Justificadas</div></div>
      </div>`;
      html += `<table><tr><th>Fecha</th><th>Día</th><th>Entrada</th><th>Salida</th><th>Trabajado</th><th>Estado</th><th>Observación</th></tr>`;
      const [y2,m2] = month.split('-').map(Number);
      for(let d=1;d<=new Date(y2,m2,0).getDate();d++){
        const date=`${month}-${String(d).padStart(2,'0')}`;
        const dow=new Date(date+'T12:00:00').getDay();
        if(!sched[dow]?.active)continue;
        const rec=empRecs.find(r=>r.date===date);
        const dName=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][dow];
        const worked=rec?.minutes_worked?minsToHM(rec.minutes_worked):'—';
        let estadoBadge,obs='';
        if(rec?.check_in){estadoBadge='<span class="badge green">Presente</span>';if((rec.minutes_late||0)>0)obs=`+${rec.minutes_late}min tarde`;}
        else if(rec?.status==='justified'){estadoBadge='<span class="badge yellow">Justificada</span>';obs=rec.justification||'';}
        else{estadoBadge='<span class="badge red">Ausente</span>';}
        html+=`<tr><td>${fmtDate(date)}</td><td>${dName}</td><td>${fmtTime(rec?.check_in)}</td><td>${fmtTime(rec?.check_out)}</td><td>${worked}</td><td>${estadoBadge}</td><td style="color:#6b7280;font-style:italic">${obs}</td></tr>`;
      }
      html += `</table>`;
    });

    html += `</body></html>`;
    const blob = new Blob([html], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(()=>URL.revokeObjectURL(url), 10000);
    setExporting(false); setOpen(false);
  };

  const exportLiquidacionesPDF = () => {
    setExporting(true);
    const [y,m] = month.split('-').map(Number);
    const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthLabel=`${MONTHS[m-1]} ${y}`;
    const today=new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'long',year:'numeric'});

    let empRows='';
    let totalBruto=0, totalDescuentos=0, totalNeto=0;

    employees.forEach(emp=>{
      const s=getStats(emp.id);
      const empExtras=(extraHours||[]).filter(h=>h.employee_id===emp.id);
      const baseSalary=emp.salary||0;
      const deductPct=s.scheduled>0?Math.round((s.absent/s.scheduled)*100):0;
      const deductAmt=Math.round(baseSalary*(deductPct/100));
      const extraAmt=empExtras.reduce((a,h)=>a+calcMonto(h,emp,s.scheduled||20),0);
      const prl=payrolls?.find(p=>p.employee_id===emp.id);
      const net=prl?.total_net||Math.round(baseSalary-deductAmt+extraAmt);
      const netDebt=Math.max(0,(s.totalMissingMins||0)-(s.totalExtraMins||0));
      const mH=m=>`${Math.floor(m/60)}h ${m%60}m`;
      totalBruto+=baseSalary;totalDescuentos+=deductAmt;totalNeto+=net;
      empRows+=`<tr>
        <td><strong>${emp.name}</strong></td>
        <td style="text-align:center">${s.scheduled}</td>
        <td style="text-align:center;color:#059669">${s.present}</td>
        <td style="text-align:center;color:#dc2626">${s.absent}</td>
        <td style="text-align:right">$${baseSalary.toLocaleString('es-AR')}</td>
        <td style="text-align:right;color:#dc2626">${deductAmt>0?`-$${deductAmt.toLocaleString('es-AR')}`:'—'}</td>
        <td style="text-align:right;color:#059669">${extraAmt>0?`+$${extraAmt.toLocaleString('es-AR')}`:'—'}</td>
        <td style="text-align:right;font-weight:900;color:#0ea5e9">$${net.toLocaleString('es-AR')}</td>
        <td style="text-align:center;color:${netDebt>0?'#d97706':'#059669'};font-size:.75rem">${netDebt>0?mH(netDebt):'✓'}</td>
      </tr>`;
    });

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
<title>Liquidación General — ${monthLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Arial,sans-serif;color:#1f2937;padding:2rem;font-size:12px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0ea5e9;padding-bottom:1rem;margin-bottom:1.5rem;}
.org{font-size:1.1rem;font-weight:900;color:#0ea5e9;}
.org-sub{font-size:.7rem;color:#6b7280;margin-top:.2rem;}
.title h1{font-size:1rem;font-weight:900;text-transform:uppercase;letter-spacing:.05em;text-align:right;}
.title p{font-size:.7rem;color:#6b7280;text-align:right;margin-top:.2rem;}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;}
.stat{background:#f8fafc;border-radius:8px;padding:.75rem;text-align:center;}
.stat-val{font-size:1.25rem;font-weight:900;}
.stat-label{font-size:.65rem;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-top:.15rem;}
table{width:100%;border-collapse:collapse;}
th{background:#f1f5f9;padding:.5rem .6rem;text-align:left;font-weight:700;color:#374151;border-bottom:2px solid #e2e8f0;font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;}
td{padding:.5rem .6rem;border-bottom:1px solid #f1f5f9;vertical-align:middle;}
.tfoot td{background:#f1f5f9;font-weight:900;border-top:2px solid #e2e8f0;}
.total-box{background:linear-gradient(135deg,#0ea5e9,#6366f1);color:white;border-radius:8px;padding:1rem 1.25rem;display:flex;justify-content:space-between;align-items:center;margin-top:1.5rem;}
.total-box .lbl{font-size:.75rem;font-weight:700;opacity:.85;text-transform:uppercase;letter-spacing:.05em;}
.total-box .val{font-size:1.4rem;font-weight:900;}
.footer{margin-top:1.5rem;padding-top:.75rem;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:.65rem;color:#9ca3af;}
.sign-area{display:grid;grid-template-columns:1fr 1fr;gap:3rem;margin-top:3rem;}
.sign-line{border-top:1px solid #d1d5db;padding-top:.4rem;font-size:.7rem;color:#6b7280;text-align:center;}
.print-btn{background:#0ea5e9;color:white;border:none;padding:.6rem 1.25rem;border-radius:.6rem;font-weight:700;cursor:pointer;margin-bottom:1.25rem;font-size:.85rem;}
@media print{.print-btn{display:none;}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Imprimir</button>
<div class="header">
  <div style="display:flex;align-items:center;gap:.75rem"><img src="${logoBase64}" alt="El Lazo" style="height:52px;width:auto"/><div><div class="org">El Lazo Juventud Judía</div><div class="org-sub">ellazo.com.ar · info@ellazo.com.ar</div></div></div>
  <div class="title"><h1>Resumen de Liquidación General</h1><p>${monthLabel} · Generado el ${today}</p></div>
</div>

<div class="summary">
  <div class="stat"><div class="stat-val" style="color:#6366f1">${employees.length}</div><div class="stat-label">Empleados</div></div>
  <div class="stat"><div class="stat-val" style="color:#1f2937">$${totalBruto.toLocaleString('es-AR')}</div><div class="stat-label">Total bruto</div></div>
  <div class="stat"><div class="stat-val" style="color:#dc2626">-$${totalDescuentos.toLocaleString('es-AR')}</div><div class="stat-label">Descuentos</div></div>
  <div class="stat"><div class="stat-val" style="color:#0ea5e9">$${totalNeto.toLocaleString('es-AR')}</div><div class="stat-label">Total neto</div></div>
</div>

<table>
  <thead><tr>
    <th>Empleado</th><th style="text-align:center">Días prog.</th><th style="text-align:center">Presentes</th>
    <th style="text-align:center">Ausentes</th><th style="text-align:right">Sueldo base</th>
    <th style="text-align:right">Descuento</th><th style="text-align:right">Extras</th>
    <th style="text-align:right">Total neto</th><th style="text-align:center">Hs debidas</th>
  </tr></thead>
  <tbody>${empRows}</tbody>
  <tfoot><tr>
    <td><strong>TOTALES</strong></td><td></td><td></td><td></td>
    <td style="text-align:right">$${totalBruto.toLocaleString('es-AR')}</td>
    <td style="text-align:right;color:#dc2626">-$${totalDescuentos.toLocaleString('es-AR')}</td>
    <td></td>
    <td style="text-align:right;color:#0ea5e9">$${totalNeto.toLocaleString('es-AR')}</td>
    <td></td>
  </tr></tfoot>
</table>

<div class="total-box">
  <span class="lbl">Total a pagar ${monthLabel}</span>
  <span class="val">$${totalNeto.toLocaleString('es-AR')}</span>
</div>

<div class="sign-area">
  <div class="sign-line">Firma Director — El Lazo</div>
  <div class="sign-line">Sello y firma contador</div>
</div>

<div class="footer">
  <span>Liquidación General — ${monthLabel} · Sistema de Control de Asistencia El Lazo</span>
  <span>Documento informativo interno</span>
</div>
</body></html>`;

    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    window.open(url,'_blank');
    setTimeout(()=>URL.revokeObjectURL(url),10000);
    setExporting(false);setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)} disabled={exporting}
        className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-60"
        style={{background:'linear-gradient(135deg,#7c3aed,#a855f7)'}}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
        </svg>
        Exportar
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={()=>setOpen(false)}/>
          <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden min-w-48">
            {[
              ['📊 CSV Asistencia', exportCSV, 'Para Excel/Sheets'],
              ['💰 CSV Liquidación', exportLiquidaciones, 'Resumen de sueldos'],
              ['📄 Reporte asistencia PDF', exportHTML, 'Detalle día a día por empleado'],
              ['💼 Liquidación general PDF', exportLiquidacionesPDF, 'Resumen de sueldos imprimible'],
            ].map(([label, fn, sub])=>(
              <button key={label} onClick={fn}
                className="w-full px-4 py-3.5 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                <p className="text-sm font-bold text-gray-800">{label}</p>
                <p className="text-xs text-gray-400">{sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
