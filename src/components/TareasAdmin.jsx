import { useState, useEffect } from 'react';
import { getAllTasks, createTask, deleteTask, updateTaskStatus, TASK_PRIORITIES } from '../lib/supabase';

const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const priorityColor = p => ({low:'border-l-gray-300',normal:'border-l-sky-400',high:'border-l-amber-400',urgent:'border-l-red-500'}[p]||'border-l-gray-300');

const Badge = ({color,children}) => {
  const c={green:'bg-emerald-50 text-emerald-700 border-emerald-200',gray:'bg-gray-50 text-gray-500 border-gray-200',
    blue:'bg-sky-50 text-sky-700 border-sky-200',red:'bg-red-50 text-red-600 border-red-200'};
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
};

export default function TareasAdmin({ employees, adminId, showToast }) {
  const [tasks,   setTasks]   = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [filter,  setFilter]  = useState('active'); // 'active' | 'done' | 'all'
  const [form,    setForm]    = useState({ title:'', description:'', assignedTo:'', dueDate:'', priority:'normal' });
  const [saving,  setSaving]  = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const load = async () => { const d=await getAllTasks().catch(()=>[]); setTasks(d); };
  useEffect(()=>{ load(); },[]);

  const handleCreate = async () => {
    if (!form.title || !form.assignedTo) return showToast('Completá título y empleado','error');
    setSaving(true);
    try {
      await createTask({ title:form.title, description:form.description, assignedTo:form.assignedTo, dueDate:form.dueDate||null, priority:form.priority, createdBy:adminId });
      setShowNew(false); setForm({title:'',description:'',assignedTo:'',dueDate:'',priority:'normal'});
      await load(); showToast('✓ Tarea creada');
    } catch(e){ showToast(e.message,'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    await deleteTask(id); await load(); showToast('Tarea eliminada');
  };

  const filtered = tasks.filter(t =>
    filter==='all' ? true : filter==='done' ? t.status==='done' : t.status!=='done'
  );

  const pending    = filtered.filter(t=>t.status==='pending').length;
  const inProgress = filtered.filter(t=>t.status==='in_progress').length;
  const overdue    = tasks.filter(t=>t.due_date&&t.due_date<today&&t.status!=='done').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>Tareas</h2>
          <div className="flex gap-2 mt-1">
            {pending>0&&<span className="text-xs text-sky-600 font-semibold">{pending} pendientes</span>}
            {inProgress>0&&<span className="text-xs text-amber-600 font-semibold">{inProgress} en progreso</span>}
            {overdue>0&&<span className="text-xs text-red-600 font-semibold">{overdue} vencidas</span>}
          </div>
        </div>
        <button onClick={()=>setShowNew(true)}
          className="px-4 py-2.5 rounded-2xl text-sm font-bold text-white"
          style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
          + Nueva tarea
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-1.5">
        {[['active','Activas'],['done','Completadas'],['all','Todas']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${filter===v?'bg-sky-100 text-sky-700':'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* New task form */}
      {showNew&&(
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Nueva tarea</h3>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Título</label>
            <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}
              placeholder="Ej: Limpiar depósito, Atender llamados..."
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Descripción (opcional)</label>
            <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2}
              placeholder="Detalles, instrucciones..."
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"/>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Asignar a</label>
            <select value={form.assignedTo} onChange={e=>setForm(p=>({...p,assignedTo:e.target.value}))}
              className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-gray-50">
              <option value="">Seleccioná un empleado</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Vencimiento (opcional)</label>
              <input type="date" value={form.dueDate} min={today} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Prioridad</label>
              <select value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none bg-gray-50">
                {Object.entries(TASK_PRIORITIES).map(([v,t])=><option key={v} value={v}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setShowNew(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold border-2 border-gray-200 text-gray-500">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="flex-1 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
              style={{background:'linear-gradient(135deg,#0ea5e9,#6366f1)'}}>
              {saving?'Creando...':'Crear tarea'}
            </button>
          </div>
        </div>
      )}

      {/* Tasks list */}
      <div className="space-y-2">
        {filtered.length===0&&<p className="text-sm text-gray-400 text-center py-8 bg-white rounded-3xl border border-gray-100">Sin tareas</p>}
        {filtered.map(t=>{
          const emp=t.profiles;
          const isOverdue=t.due_date&&t.due_date<today&&t.status!=='done';
          return(
            <div key={t.id} className={`bg-white rounded-3xl shadow-sm border border-gray-100 border-l-4 p-4 ${priorityColor(t.priority)}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className={`text-sm font-bold ${t.status==='done'?'text-gray-400 line-through':'text-gray-900'}`}>{t.title}</p>
                    {t.status==='done'&&<Badge color="green">✓ Completada</Badge>}
                    {t.status==='in_progress'&&<Badge color="blue">En progreso</Badge>}
                    {isOverdue&&<Badge color="red">⚠️ Vencida</Badge>}
                  </div>
                  {t.description&&<p className="text-xs text-gray-500 mb-2">{t.description}</p>}
                  <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                    {emp&&<span className="font-semibold text-gray-600">→ {emp.name}</span>}
                    {t.due_date&&<span className={isOverdue?'text-red-500 font-bold':''}>📅 {fmtDate(t.due_date)}</span>}
                    <span>{TASK_PRIORITIES[t.priority]?.icon} {TASK_PRIORITIES[t.priority]?.label}</span>
                  </div>
                  {t.notes&&<p className="text-xs text-emerald-600 mt-1 italic">✓ "{t.notes}"</p>}
                  {t.completed_at&&<p className="text-xs text-gray-300 mt-0.5">Completada: {fmtDate(t.completed_at?.split('T')[0])}</p>}
                </div>
                {t.status!=='done'&&(
                  <button onClick={()=>handleDelete(t.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
