// src/components/common/PaymentSplitEditor.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { classNames } from '../../utils/classNames';

const toInt = (v) => {
  const n = Math.floor(Number(v || 0));
  return Number.isFinite(n) ? n : 0;
};

const normKey = (s) => (s || '').toString().trim().toLowerCase();

const buildMethodOptions = (catalogMethods) => {
  if (Array.isArray(catalogMethods) && catalogMethods.length) {
    const names = catalogMethods
      .map((m) => (typeof m === 'string' ? m : (m?.name || m?.label || '')))
      .filter(Boolean);
    return Array.from(new Set(names));
  }
  return ['Efectivo', 'Nequi', 'Daviplata'];
};

export default function PaymentSplitEditor({
  theme = 'light',
  total = 0,
  value = [],
  onChange,
  catalogMethods = [],
  disabled = false,
}) {
  const methods = useMemo(() => buildMethodOptions(catalogMethods), [catalogMethods]);

  const [rows, setRows] = useState(() => {
    const sanitized = Array.isArray(value) ? value : [];
    if (sanitized.length) {
      return sanitized.map((r) => ({
        method: typeof r.method === 'string' ? r.method : (r?.method?.name || ''),
        amount: toInt(r.amount),
        note: r.note || '',
      }));
    }
    return [{ method: 'Efectivo', amount: toInt(total), note: '' }];
  });

  useEffect(() => {
    const sanitized = Array.isArray(value) ? value : [];
    if (sanitized.length) {
      setRows(
        sanitized.map((r) => ({
          method: typeof r.method === 'string' ? r.method : (r?.method?.name || ''),
          amount: toInt(r.amount),
          note: r.note || '',
        }))
      );
    }
  }, [value]);

  const sum = rows.reduce((acc, r) => acc + toInt(r.amount), 0);
  const diff = toInt(total) - sum;
  const ok = diff === 0;

  const emit = (next) => {
    setRows(next);
    onChange &&
      onChange(
        next.map((r) => ({
          method: r.method,
          amount: toInt(r.amount),
          note: r.note || '',
        }))
      );
  };

  const handleChange = (idx, key, val) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [key]: key === 'amount' ? toInt(val) : val } : r));
    emit(next);
  };

  const addRow = () => {
    const unused = methods.find((m) => !rows.some((r) => normKey(r.method) === normKey(m))) || methods[0];
    const next = [...rows, { method: unused, amount: Math.max(0, diff), note: '' }];
    emit(next);
  };

  const removeRow = (idx) => {
    const next = rows.filter((_, i) => i !== idx);
    emit(next.length ? next : [{ method: 'Efectivo', amount: toInt(total), note: '' }]);
  };

  const fill5050 = () => {
    if (methods.length < 2) return;
    const half = Math.floor(toInt(total) / 2);
    const rest = toInt(total) - half;
    emit([
      { method: methods[0], amount: half, note: '' },
      { method: methods[1], amount: rest, note: '' },
    ]);
  };

  const split3 = () => {
    const a = Math.floor(toInt(total) / 3);
    const b = Math.floor((toInt(total) - a) / 2);
    const c = toInt(total) - a - b;
    emit([
      { method: methods[0] || 'Efectivo', amount: a, note: '' },
      { method: methods[1] || 'Nequi', amount: b, note: '' },
      { method: methods[2] || 'Daviplata', amount: c, note: '' },
    ]);
  };

  const setAllTo = (m) => {
    emit([{ method: m, amount: toInt(total), note: '' }]);
  };

  return (
    <div className={classNames("p-3 rounded-lg border", theme === 'dark' ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-gray-50')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h5 className="font-semibold text-sm">Dividir pago</h5>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={disabled} onClick={fill5050}
            className={classNames("px-2 py-1 rounded text-xs border", theme==='dark'?'border-gray-500 hover:bg-gray-700':'border-gray-300 hover:bg-white')}>
            50 / 50
          </button>
          <button type="button" disabled={disabled} onClick={split3}
            className={classNames("px-2 py-1 rounded text-xs border", theme==='dark'?'border-gray-500 hover:bg-gray-700':'border-gray-300 hover:bg-white')}>
            1/3 cada uno
          </button>
          {methods.map((m) => (
            <button key={m} type="button" disabled={disabled} onClick={() => setAllTo(m)}
              className={classNames("px-2 py-1 rounded text-xs border", theme==='dark'?'border-gray-500 hover:bg-gray-700':'border-gray-300 hover:bg-white')}>
              Todo {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <select
              disabled={disabled}
              value={r.method}
              onChange={(e) => handleChange(idx, 'method', e.target.value)}
              className={classNames("sm:col-span-4 p-2 rounded border text-sm", theme==='dark'?'border-gray-600 bg-gray-700 text-white':'border-gray-300 bg-white')}
            >
              {methods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <input
              disabled={disabled}
              type="number"
              min="0"
              step="1"
              value={r.amount}
              onChange={(e) => handleChange(idx, 'amount', e.target.value)}
              className={classNames("sm:col-span-4 p-2 rounded border text-sm", theme==='dark'?'border-gray-600 bg-gray-700 text-white':'border-gray-300 bg-white')}
              placeholder="Monto en COP"
            />

            <input
              disabled={disabled}
              type="text"
              value={r.note || ''}
              onChange={(e) => handleChange(idx, 'note', e.target.value)}
              className={classNames("sm:col-span-3 p-2 rounded border text-sm", theme==='dark'?'border-gray-600 bg-gray-700 text-white':'border-gray-300 bg-white')}
              placeholder="Nota (opcional)"
            />

            <div className="sm:col-span-1 flex justify-end">
              <button type="button" disabled={disabled} onClick={() => removeRow(idx)}
                className={classNames("px-2 py-1 rounded text-xs border", theme==='dark'?'border-gray-500 hover:bg-gray-700':'border-gray-300 hover:bg-white')}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button type="button" disabled={disabled} onClick={addRow}
          className={classNames("px-3 py-1 rounded border", theme==='dark'?'border-gray-500 hover:bg-gray-700':'border-gray-300 hover:bg-white')}>
          + Añadir línea
        </button>

        <div className="flex items-center gap-2">
          <span>Total pedido:</span>
          <strong>${toInt(total).toLocaleString('es-CO')}</strong>
        </div>
      </div>

      <div className="mt-2">
        {ok ? (
          <span className={classNames("inline-block text-xs px-2 py-1 rounded", theme==='dark'?'bg-green-700 text-white':'bg-green-100 text-green-800')}>
            ✔ Suma exacta
          </span>
        ) : diff > 0 ? (
          <span className={classNames("inline-block text-xs px-2 py-1 rounded", theme==='dark'?'bg-yellow-700 text-white':'bg-yellow-100 text-yellow-800')}>
            Falta asignar ${diff.toLocaleString('es-CO')}
          </span>
        ) : (
          <span className={classNames("inline-block text-xs px-2 py-1 rounded", theme==='dark'?'bg-red-700 text-white':'bg-red-100 text-red-800')}>
            Sobran ${Math.abs(diff).toLocaleString('es-CO')}
          </span>
        )}
      </div>
    </div>
  );
}
