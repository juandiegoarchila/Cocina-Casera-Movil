// src/components/Admin/Payments.js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../../config/firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  setDoc
} from 'firebase/firestore';
import { Edit2, Trash2, PlusCircle, XCircle, ChevronLeft, TrashIcon } from 'lucide-react';

// 🇨🇴 util para fecha local (YYYY-MM-DD Bogotá)
import { getColombiaLocalDateString } from '../../utils/bogotaDate';

// Colombian Peso formatter
const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
});

// =================== Helpers de fecha (Bogotá) y TS ===================
const toDateFromTS = (ts) => (ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null));

const ymdBogota = (dateObj) => {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(dateObj);
    const y = parts.find(p => p.type === 'year')?.value ?? '0000';
    const m = parts.find(p => p.type === 'month')?.value ?? '01';
    const d = parts.find(p => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    // Fallback ISO local sin zona
    return new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
};

const paymentLocalYMD = (p) => {
  if (p?.createdAtLocal && /^\d{4}-\d{2}-\d{2}$/.test(p.createdAtLocal)) return p.createdAtLocal;
  const d = toDateFromTS(p?.timestamp);
  return d ? ymdBogota(d) : getColombiaLocalDateString();
};

// =================== Snapshot diario: compute & write ===================
const computeDailyPaymentsSnapshot = (paymentsForDay) => {
  const byStore = {};
  let total = 0;
  let count = 0;

  paymentsForDay.forEach((p) => {
    const amt = Math.floor(Number(p?.amount || 0)) || 0;
    const store = p?.store || 'Sin tienda';
    if (!byStore[store]) byStore[store] = 0;
    byStore[store] += amt;
    total += amt;
    count += 1;
  });

  return {
    totals: { general: total },
    byStore,
    counts: { payments: count }
  };
};

const Payments = ({ setError, setSuccess, theme }) => {
  const [payments, setPayments] = useState([]);
  const [formFields, setFormFields] = useState([{ name: '', units: '', amount: '', store: '' }]);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [initialStore, setInitialStore] = useState('');

  // Ver pagos por tienda
  const [selectedStore, setSelectedStore] = useState(null);
  const [showStoreDetails, setShowStoreDetails] = useState(false);

  // NUEVO: fecha seleccionada + snapshot del día
  const [selectedDate, setSelectedDate] = useState(''); // YYYY-MM-DD
  const [selectedDaySnapshot, setSelectedDaySnapshot] = useState(null);

  // Load payments
  useEffect(() => {
    const paymentsQuery = query(collection(db, 'payments'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => setError(`Error al cargar pagos: ${error.message}`)
    );
    return () => unsubscribe();
  }, [setError]);

  // ======== Suscripción al snapshot del día seleccionado ========
  useEffect(() => {
    const day = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
      ? selectedDate
      : getColombiaLocalDateString();

    const unsub = onSnapshot(
      doc(db, 'paymentsByDay', day),
      (d) => setSelectedDaySnapshot(d.exists() ? d.data() : null),
      () => setSelectedDaySnapshot(null)
    );
    return () => unsub();
  }, [selectedDate]);

  // Maneja los cambios en los inputs de CUALQUIER formulario dinámico
  const handleFormInputChange = (index, e) => {
    const { name, value } = e.target;
    const cleanValue = name === 'amount' ? value.replace(/[^0-9]/g, '') : value;
    const updatedFormFields = [...formFields];
    updatedFormFields[index] = { ...updatedFormFields[index], [name]: cleanValue };
    setFormFields(updatedFormFields);
  };

  const handleAddAnotherForm = () => {
    const lastStore = formFields[formFields.length - 1]?.store || '';
    setInitialStore(lastStore);
    setFormFields([...formFields, { name: '', units: '', amount: '', store: lastStore }]);
  };

  const handleRemoveForm = (index) => {
    const updatedFormFields = formFields.filter((_, i) => i !== index);
    setFormFields(updatedFormFields);
    if (updatedFormFields.length === 0) {
      setShowForm(false);
    }
  };

  // ========= Refresh snapshot para una fecha =========
  const refreshPaymentsSnapshotForDate = useCallback(async (dateStr) => {
    try {
      const dayPayments = payments.filter((p) => paymentLocalYMD(p) === dateStr);
      const snap = computeDailyPaymentsSnapshot(dayPayments);
      await setDoc(
        doc(db, 'paymentsByDay', dateStr),
        { date: dateStr, ...snap, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (e) {
      console.error('Error actualizando snapshot paymentsByDay:', e?.message || e);
    }
  }, [payments]);

  // Debounce: cuando cambian los pagos, refrescamos snapshot de HOY
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!payments.length) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const today = getColombiaLocalDateString();
      refreshPaymentsSnapshotForDate(today);
    }, 700);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [payments, refreshPaymentsSnapshotForDate]);

  // ========= Guardar TODOS los formularios =========
  const handleSaveAllForms = async () => {
    try {
      const paymentsToSave = [];
      const errors = [];

      formFields.forEach((payment, index) => {
        if (!payment.name || !payment.amount || !payment.store) {
          errors.push(`El pago ${index + 1} requiere Producto/Gasto, Monto y Tienda.`);
          return;
        }
        const amount = parseInt(payment.amount);
        if (isNaN(amount) || amount <= 0) {
          errors.push(`El monto del pago ${index + 1} debe ser un número válido mayor que 0.`);
          return;
        }
        paymentsToSave.push({
          name: payment.name,
          units: parseInt(payment.units) || 0,
          amount: amount,
          store: payment.store,
          provider: payment.store,
          timestamp: serverTimestamp(),
          createdAtLocal: getColombiaLocalDateString(), // 👈 para snapshots por día
        });
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return;
      }

      if (editingPaymentId) {
        // Para edición, usamos el primer formulario
        const updated = paymentsToSave[0];
        // Obtener fecha previa para refrescar su snapshot también
        const prev = payments.find(p => p.id === editingPaymentId);
        const prevDay = prev ? paymentLocalYMD(prev) : null;

        await updateDoc(doc(db, 'payments', editingPaymentId), updated);
        setSuccess('Pago actualizado exitosamente.');

        // Refrescar snapshots afectadas (previa y la nueva —usualmente el día de hoy—)
        if (prevDay) await refreshPaymentsSnapshotForDate(prevDay);
        await refreshPaymentsSnapshotForDate(updated.createdAtLocal);
      } else {
        const promises = paymentsToSave.map(payment =>
          addDoc(collection(db, 'payments'), payment)
        );
        await Promise.all(promises);
        setSuccess('Pagos registrados exitosamente.');

        // Refrescar snapshot del día actual
        await refreshPaymentsSnapshotForDate(getColombiaLocalDateString());
      }

      setFormFields([{ name: '', units: '', amount: '', store: '' }]);
      setEditingPaymentId(null);
      setShowForm(false);
    } catch (error) {
      setError(`Error al guardar pagos: ${error.message}`);
    }
  };

  // Eliminar pago
  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este pago?')) {
      try {
        const p = payments.find(pp => pp.id === id);
        const day = p ? paymentLocalYMD(p) : getColombiaLocalDateString();

        await deleteDoc(doc(db, 'payments', id));
        setSuccess('Pago eliminado exitosamente.');

        await refreshPaymentsSnapshotForDate(day);
      } catch (error) {
        setError(`Error al eliminar pago: ${error.message}`);
      }
    }
  };

  // Editar
  const handleEdit = (payment) => {
    setEditingPaymentId(payment.id);
    setFormFields([{ ...payment, amount: String(payment.amount ?? '') }]);
    setShowForm(true);
    setInitialStore(payment.store || '');
    setShowStoreDetails(false);
  };

  // ======= Pagos del día seleccionado (o hoy por defecto) =======
  const effectiveDay = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? selectedDate
    : getColombiaLocalDateString();

  const paymentsOfDay = useMemo(() => {
    return payments.filter((p) => paymentLocalYMD(p) === effectiveDay);
  }, [payments, effectiveDay]);

  // ======= Agrupar por tienda y fecha (dentro del día elegido) =======
  const groupedPaymentsByStoreAndDate = useMemo(() => {
    return paymentsOfDay.reduce((acc, payment) => {
      const date = effectiveDay; // ya filtrado por día
      const store = payment.store || 'Sin tienda';
      if (!acc[store]) acc[store] = {};
      if (!acc[store][date]) acc[store][date] = [];
      acc[store][date].push(payment);
      return acc;
    }, {});
  }, [paymentsOfDay, effectiveDay]);

  // Totales por tienda (del día)
  const totalExpensesByStore = useMemo(() => {
    const totals = {};
    paymentsOfDay.forEach(payment => {
      const store = payment.store || 'Sin tienda';
      totals[store] = (totals[store] || 0) + (Math.floor(Number(payment.amount || 0)) || 0);
    });
    return totals;
  }, [paymentsOfDay]);

  // Total general del día (prefiere snapshot)
  const totalOverallExpenses = useMemo(() => {
    if (selectedDaySnapshot?.totals?.general != null) {
      return Math.floor(Number(selectedDaySnapshot.totals.general) || 0);
    }
    return paymentsOfDay.reduce((sum, p) => sum + (Math.floor(Number(p.amount || 0)) || 0), 0);
  }, [paymentsOfDay, selectedDaySnapshot]);

  // Ver tienda
  const handleViewStoreDetails = (storeName) => {
    setSelectedStore(storeName);
    setShowStoreDetails(true);
  };

  // Volver
  const handleBackToDashboard = () => {
    setSelectedStore(null);
    setShowStoreDetails(false);
  };

  // Borrado masivo del día seleccionado
  const handleDeleteAllForSelectedDay = async () => {
    const human = new Date(effectiveDay.replace(/-/g, '/')).toLocaleDateString('es-CO', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    if (!window.confirm(`¿Eliminar TODOS los pagos del ${human}? Esta acción no se puede deshacer.`)) return;

    const dayPayments = paymentsOfDay;
    if (!dayPayments.length) {
      setError('No hay pagos registrados en la fecha seleccionada.');
      return;
    }

    try {
      await Promise.all(dayPayments.map(p => deleteDoc(doc(db, 'payments', p.id))));
      setSuccess(`${dayPayments.length} pagos del ${human} fueron eliminados.`);
      await refreshPaymentsSnapshotForDate(effectiveDay);
    } catch (error) {
      console.error('Error al eliminar pagos del día:', error);
      setError(`Error al eliminar los pagos: ${error.message}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
      {/* Encabezado / fecha / Total del día */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-8 p-3 sm:p-4 rounded-xl shadow-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight mb-2 sm:mb-0 text-center sm:text-left">
          Gestión de Pagos 💸
        </h2>

        <label
          className="relative flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm border border-white/30 cursor-pointer"
          onClick={(e) => {
            const input = e.currentTarget.querySelector('input[type=date]');
            if (input) input.showPicker();
          }}
        >
          {new Date((selectedDate || getColombiaLocalDateString()).replace(/-/g, '/')).toLocaleDateString('es-CO', {
            weekday: 'long', month: 'long', day: 'numeric'
          })}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-transparent"
          />
        </label>

        <div className="text-lg sm:text-xl font-semibold mt-2 sm:mt-0">
          <p>Total Gastado: {copFormatter.format(totalOverallExpenses)}</p>
        </div>
      </div>

      {/* Botón para mostrar/ocultar formulario */}
      <button
        onClick={() => {
          setShowForm(!showForm);
          setEditingPaymentId(null);
          setFormFields([{ name: '', units: '', amount: '', store: '' }]);
          setInitialStore('');
          setShowStoreDetails(false);
        }}
        className={`mb-4 sm:mb-6 px-4 py-2 sm:px-6 sm:py-3 rounded-full flex items-center justify-center space-x-2 transition-all duration-300 ease-in-out w-full sm:w-auto mx-auto
          ${showForm ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white shadow-lg
          transform hover:scale-105 text-sm sm:text-base`}
      >
        {showForm ? <XCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
        <span>{showForm ? 'Cerrar Formulario' : 'Registrar Nuevo Pago'}</span>
      </button>

      {/* Formularios Dinámicos */}
      {showForm && (
        <div className={`p-4 sm:p-6 rounded-xl shadow-xl transform transition-all duration-500 ease-in-out ${
          theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        } ${showForm ? 'scale-100 opacity-100' : 'scale-95 opacity-0'} mb-6`}>
          <h3 className={`text-xl sm:text-2xl font-bold mb-4 sm:mb-6 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {editingPaymentId ? 'Editar Pago' : 'Registrar Nuevos Pagos'}
          </h3>
          <form onSubmit={(e) => { e.preventDefault(); handleSaveAllForms(); }}>
            {formFields.map((field, index) => (
              <div key={index} className={`p-3 sm:p-4 rounded-lg border mb-4 ${theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <div>
                    <label htmlFor={`name-${index}`} className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Producto/Gasto
                    </label>
                    <input
                      type="text"
                      name="name"
                      id={`name-${index}`}
                      value={field.name}
                      onChange={(e) => handleFormInputChange(index, e)}
                      className={`mt-1 p-2 sm:p-3 w-full rounded-lg border focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm sm:text-base
                        ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900'} shadow-sm`}
                      placeholder="Ej: Leche, Almuerzo"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`units-${index}`} className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Unidades (Opcional)
                    </label>
                    <input
                      type="number"
                      name="units"
                      id={`units-${index}`}
                      value={field.units}
                      onChange={(e) => handleFormInputChange(index, e)}
                      className={`mt-1 p-2 sm:p-3 w-full rounded-lg border focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm sm:text-base
                        ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900'} shadow-sm`}
                      placeholder="Ej: 2"
                    />
                  </div>
                  <div>
                    <label htmlFor={`amount-${index}`} className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto Total (COP)
                    </label>
                    <input
                      type="text"
                      name="amount"
                      id={`amount-${index}`}
                      value={field.amount}
                      onChange={(e) => handleFormInputChange(index, e)}
                      placeholder="Ej: 4700"
                      className={`mt-1 p-2 sm:p-3 w-full rounded-lg border focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm sm:text-base
                        ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900'} shadow-sm`}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`store-${index}`} className="block text-xs sm:text-sm font-medium text-gray-700.dark:text-gray-300 mb-1">
                      Tienda/Lugar
                    </label>
                    <input
                      type="text"
                      name="store"
                      id={`store-${index}`}
                      value={field.store}
                      onChange={(e) => handleFormInputChange(index, e)}
                      className={`mt-1 p-2 sm:p-3 w-full rounded-lg border focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm sm:text-base
                        ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900'} shadow-sm`}
                      placeholder="Ej: Éxito, Cafetería"
                      required
                      onBlur={(e) => setInitialStore(e.target.value)}
                    />
                  </div>
                </div>
                {!editingPaymentId && formFields.length > 1 && (
                  <div className="flex justify-end mt-3">
                    <button
                      type="button"
                      onClick={() => handleRemoveForm(index)}
                      className="text-red-500 hover:text-red-600 transition-colors flex items-center text-sm"
                    >
                      <Trash2 className="w-4 h-4 mr-1" /> Eliminar este pago
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div className="mt-4 sm:mt-6 flex flex-wrap justify-center sm:justify-start gap-3 sm:gap-4">
              {!editingPaymentId && (
                <button
                  type="button"
                  onClick={handleAddAnotherForm}
                  className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg flex items-center justify-center space-x-1 sm:space-x-2 transition-colors duration-200 text-xs sm:text-sm
                    ${theme === 'dark' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'} text-white shadow-md`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Agregar Otro Pago</span>
                </button>
              )}
              <button
                type="submit"
                className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg flex items-center justify-center space-x-1 sm:space-x-2 transition-colors duration-200 text-xs sm:text-sm
                  ${theme === 'dark' ? 'bg-purple-700 hover:bg-purple-800' : 'bg-purple-600 hover:bg-purple-700'} text-white shadow-md`}
              >
                <PlusCircle className="w-4 h-4" />
                <span>{editingPaymentId ? 'Actualizar Pago' : 'Guardar Pagos'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vista de Dashboard / Detalles (filtrada por día seleccionado) */}
      {!showForm && (
        <div className={`p-4 sm:p-6 rounded-xl shadow-xl max-h-[70vh] overflow-y-auto custom-scrollbar ${
          theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
        } mb-6`}>
          {showStoreDetails ? (
            // --- Detalle por tienda (del día seleccionado) ---
            <div>
              <button
                onClick={handleBackToDashboard}
                className={`mb-4 px-3 py-1.5 rounded-full flex items-center space-x-2 transition-colors duration-200 text-sm
                  ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'} shadow-md`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Volver al Dashboard de Tiendas</span>
              </button>
              <h3 className={`text-xl sm:text-2xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                Pagos en {selectedStore}
                <span className="ml-2 text-blue-500">
                  ({copFormatter.format(totalExpensesByStore[selectedStore] || 0)})
                </span>
              </h3>
              {Object.keys(groupedPaymentsByStoreAndDate[selectedStore] || {}).length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4 sm:py-8 text-sm sm:text-base">
                  No hay pagos registrados para {selectedStore} en la fecha seleccionada.
                </p>
              ) : (
                Object.entries(groupedPaymentsByStoreAndDate[selectedStore]).map(([date, dailyPayments]) => (
                  <div key={date} className="mb-6">
                    <h4 className={`text-lg font-semibold mb-3 px-3 py-2 rounded-lg ${
                      theme === 'dark' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
                    }`}>
                      📅 {new Date(date.replace(/-/g, '/')).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </h4>
                    <div className="space-y-2">
                      {dailyPayments.map(payment => (
                        <div
                          key={payment.id}
                          className={`p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center transition-colors duration-200
                            ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} shadow-sm`}
                        >
                          <div className="flex-grow mb-1 sm:mb-0">
                            <p className="text-sm sm:text-base font-medium">
                              <span className="text-blue-400">{payment.name}</span> {payment.units ? `(${payment.units} unidades)` : ''} - <strong>{copFormatter.format(payment.amount)}</strong>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Fecha de Registro: {(
                                toDateFromTS(payment?.timestamp)
                              )?.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) || '—'}
                            </p>
                          </div>
                          <div className="flex space-x-2 mt-2 sm:mt-0">
                            <button
                              onClick={() => handleEdit(payment)}
                              className="text-yellow-500 hover:text-yellow-400 p-1.5 sm:p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Editar pago"
                            >
                              <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(payment.id)}
                              className="text-red-500 hover:text-red-400 p-1.5 sm:p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                              title="Eliminar pago"
                            >
                              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            // --- Dashboard por tienda (del día seleccionado) ---
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-xl sm:text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                  Gastos por Tienda 📊
                </h3>
                <button
                  onClick={handleDeleteAllForSelectedDay}
                  className={`p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200
                    ${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'}`}
                  title="Eliminar todos los pagos del día seleccionado"
                >
                  <TrashIcon className="w-6 h-6" />
                </button>
              </div>
              {Object.keys(totalExpensesByStore).length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4 sm:py-8 text-sm sm:text-base">
                  No hay tiendas con gastos registrados para esta fecha.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(totalExpensesByStore).map(([store, total]) => (
                    <div
                      key={store}
                      onClick={() => handleViewStoreDetails(store)}
                      className={`p-4 sm:p-5 rounded-lg shadow-md cursor-pointer transition-transform duration-200 hover:scale-[1.02]
                        ${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-blue-50 hover:bg-blue-100 text-gray-900'} border border-transparent hover:border-blue-400`}
                    >
                      <h4 className="text-lg font-semibold mb-1 flex items-center">
                        <span className="text-blue-500 mr-2">🛍️</span> {store}
                      </h4>
                      <p className="text-xl font-bold text-red-400">
                        {copFormatter.format(total)}
                      </p>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleViewStoreDetails(store); }}
                        className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Ver todos los pagos
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Payments;
