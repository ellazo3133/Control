import { useState } from 'react';

export const ALL_PERMISSIONS = [
  { key:'dashboard',       label:'Panel de hoy',          desc:'Ver quién vino y quién faltó hoy',         icon:'📊' },
  { key:'records',         label:'Ver registros',          desc:'Ver historial de asistencia',              icon:'📋' },
  { key:'records_edit',    label:'Editar registros',       desc:'Editar y agregar registros manualmente',   icon:'✏️' },
  { key:'employees',       label:'Ver empleados',          desc:'Ver lista y datos de empleados',           icon:'👥' },
  { key:'employees_edit',  label:'Gestionar empleados',    desc:'Crear, editar y desactivar empleados',     icon:'👤' },
  { key:'analysis',        label:'Análisis',               desc:'Ver estadísticas y tendencias del mes',    icon:'📈' },
  { key:'salaries',        label:'Ver sueldos',            desc:'Ver sueldos y liquidaciones',              icon:'💰' },
  { key:'salaries_edit',   label:'Editar sueldos',         desc:'Editar sueldos y aprobar liquidaciones',   icon:'💼' },
  { key:'export',          label:'Exportar',               desc:'Exportar CSV y PDF',                       icon:'📤' },
  { key:'holidays',        label:'Feriados',               desc:'Gestionar feriados',                       icon:'📅' },
  { key:'exceptions',      label:'Excepciones horario',    desc:'Gestionar excepciones de horario',         icon:'⏰' },
  { key:'notifications',   label:'Notificaciones',         desc:'Ver alertas y notificaciones del sistema', icon:'🔔' },
];

// Which permissions require others to be on
export const PERMISSION_DEPS = {
  records_edit:   ['records'],
  employees_edit: ['employees'],
  salaries_edit:  ['salaries'],
};

export function hasPermission(profile, key) {
  if (!profile) return false;
  if (profile.role !== 'admin') return false;
  if (profile.is_super_admin) return true;
  if (!profile.admin_permissions) return true; // legacy admin = full access
  return !!profile.admin_permissions[key];
}

export function AdminPermissionsEditor({ value, onChange }) {
  const perms = value || {};

  const toggle = (key) => {
    const next = { ...perms, [key]: !perms[key] };
    const deps = PERMISSION_DEPS[key] || [];
    // Enabling: also enable dependencies
    if (!perms[key]) deps.forEach(d => { next[d] = true; });
    // Disabling a parent: disable children that depend on it
    Object.entries(PERMISSION_DEPS).forEach(([child, parents]) => {
      if (parents.includes(key) && !next[key]) next[child] = false;
    });
    onChange(next);
  };

  const allOn = ALL_PERMISSIONS.every(p => perms[p.key]);
  const toggleAll = () => {
    if (allOn) { onChange({}); return; }
    const all = {};
    ALL_PERMISSIONS.forEach(p => { all[p.key] = true; });
    onChange(all);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Permisos</p>
        <button onClick={toggleAll}
          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all ${allOn?'bg-sky-100 text-sky-700':'bg-gray-100 text-gray-500'}`}>
          {allOn ? 'Quitar todos' : 'Dar todos'}
        </button>
      </div>
      {ALL_PERMISSIONS.map(p => {
        const on = !!perms[p.key];
        // Is this perm required by an active child perm?
        const isRequired = Object.entries(PERMISSION_DEPS).some(
          ([child, parents]) => parents.includes(p.key) && perms[child]
        );
        return (
          <div key={p.key}
            onClick={() => !isRequired && toggle(p.key)}
            className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all
              ${on ? 'border-sky-200 bg-sky-50' : 'border-gray-100 bg-white hover:border-gray-200'}
              ${isRequired ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
            <span className="text-lg flex-shrink-0">{p.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${on?'text-sky-700':'text-gray-700'}`}>{p.label}</p>
              <p className="text-xs text-gray-400">{p.desc}</p>
              {isRequired && <p className="text-xs text-amber-500 mt-0.5">Requerido por otro permiso activo</p>}
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 relative ${on?'bg-sky-500':'bg-gray-200'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on?'translate-x-5':'translate-x-0.5'}`}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}
