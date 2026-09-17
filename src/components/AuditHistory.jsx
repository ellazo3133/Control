import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}) : null;
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';

const FIELD_LABELS = {
  check_in:      'Hora entrada',
  check_out:     'Hora salida',
  status:        'Estado',
  justification: 'Justificación',
  edit_reason:   'Motivo',
  minutes_late:  'Minutos tarde',
  minutes_worked:'Minutos trabajados',
};

const STATUS_LABELS = {
  present:   'Presente',
  absent:    'Ausente',
  justified: 'Justificada',
  holiday:   'Feriado',
};

function formatValue(field, val) {
  if (!val || val === 'null') return '—';
  if (field === 'check_in' || field === 'check_out') return fmtTime(val) || val;
  if (field === 'status') return STATUS_LABELS[val] || val;
  return val;
}

export default function AuditHistory({ recordId, onClose }) {
  const [edits, setEdits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!recordId) return;
    supabase
      .from('attendance_edits')
      .select('*, profiles!attendance_edits_edited_by_fkey(name, avatar)')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEdits(data || []); setLoading(false); });
  }, [recordId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900" style={{fontFamily:"'Playfair Display',serif"}}>
            Historial de cambios
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {loading && (
            <div className="text-center py-8">
              <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto"/>
            </div>
          )}

          {!loading && edits.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="text-3xl">📋</p>
              <p className="text-sm font-bold text-gray-700">Sin cambios registrados</p>
              <p className="text-xs text-gray-400">Este registro no fue editado manualmente</p>
            </div>
          )}

          {!loading && edits.length > 0 && (
            <div className="space-y-3">
              {edits.map(edit => (
                <div key={edit.id} className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {edit.profiles?.avatar || 'A'}
                      </div>
                      <span className="text-xs font-bold text-gray-700">
                        {edit.profiles?.name || 'Admin'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{fmtDateTime(edit.created_at)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 w-28 flex-shrink-0">
                        {FIELD_LABELS[edit.field_changed] || edit.field_changed}
                      </span>
                      <span className="text-red-400 line-through">
                        {formatValue(edit.field_changed, edit.old_value)}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-emerald-600 font-bold">
                        {formatValue(edit.field_changed, edit.new_value)}
                      </span>
                    </div>

                    {edit.reason && (
                      <p className="text-xs text-gray-400 italic mt-1">
                        Motivo: "{edit.reason}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
