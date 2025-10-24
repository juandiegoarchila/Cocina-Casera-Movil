// src/components/TableSelector.js
import React, { useEffect, useState } from 'react';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// Selector de mesas basado en colección 'tables' en Firestore
// Props:
//  - value: string (nombre de mesa seleccionado)
//  - onChange: function(newValue)
//  - disabled: boolean
//  - placeholder: string
const TableSelector = ({ value, onChange, disabled = false, placeholder = 'Selecciona mesa' }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'tables'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <div className="space-y-1">
      <select
        className="w-full p-2 text-sm border rounded-md bg-white"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || loading}
      >
        <option value="" disabled>{loading ? 'Cargando mesas...' : placeholder}</option>
        {tables.map(t => (
          <option key={t.id} value={t.name}>{t.name}</option>
        ))}
      </select>
    </div>
  );
};

export default TableSelector;
