// src/components/Waiter/WaiterPayments.js
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { db } from '../../config/firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  where,
  setDoc
} from 'firebase/firestore';
import { Edit2, PlusCircle, XCircle, ChevronLeft } from 'lucide-react';
import { useAuth } from '../Auth/AuthProvider';

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

const WaiterPayments = ({ setError, setSuccess, theme }) => {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [formFields, setFormFields] = useState([{ name: '', units: '', amount: '', store: '' }]);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [initialStore, setInitialStore] = useState('');

  // Ver pagos por tienda
  const [selectedStore, setSelectedStore] = useState(null);
  const [showStoreDetails, setShowStoreDetails] = useState(false);

  // NUEVO: fecha seleccionada + snapshot del día (no editable para meseros)
  const [selectedDate, setSelectedDate] = useState(getColombiaLocalDateString()); // YYYY-MM-DD fijado en hoy
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

  // ========= Refresh snapshot para una fecha =========
  const refreshPaymentsSnapshotForDate = useCallback(async (dateStr) => {
    try {
      const dayPayments = payments.filter((p) => paymentLocalYMD(p) === dateStr);
      
      // Agrupar por tienda y calcular total
      const byStore = {};
      let total = 0;
      let count = 0;

      dayPayments.forEach((p) => {
        const amt = Math.floor(Number(p?.amount || 0)) || 0;
        const store = p?.store || 'Sin tienda';
        if (!byStore[store]) byStore[store] = 0;
        byStore[store] += amt;
        total += amt;
        count += 1;
      });

      // Actualizar documento en Firestore
      await setDoc(
        doc(db, 'paymentsByDay', dateStr),
        { 
          date: dateStr, 
          totals: { general: total }, 
          byStore,
          counts: { payments: count },
          updatedAt: serverTimestamp(),
          updatedBy: user?.email || ''
        },
        { merge: true }
      );
    } catch (e) {
      console.error('Error actualizando snapshot paymentsByDay:', e?.message || e);
    }
  }, [payments, user?.email]);

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
          createdBy: user?.email || '' // Aseguramos registro de usuario real
        });
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return;
      }

      // MODIFICACIÓN: ACTUALIZAMOS EL PAGO EXISTENTE O CREAMOS UNO NUEVO
      if (editingPaymentId) {
        try {
          // Obtenemos el pago original para mantener algunos datos
          const prevPayment = payments.find(p => p.id === editingPaymentId);
          
          // Verificamos que el pago pertenezca al usuario actual (verificación local)
          if (prevPayment.createdBy !== user?.email && prevPayment.createdBy !== "") {
            setError("No puedes editar pagos creados por otros usuarios.");
            return;
          }
          
          console.log("Intentando actualizar pago con ID:", editingPaymentId);
          
          // ENFOQUE MIXTO: Primero intentamos actualizar el documento existente
          const paymentRef = doc(db, 'payments', editingPaymentId);
          const updatedPayment = {
            ...paymentsToSave[0], // Tomamos el primer (y único) pago del formulario
            updatedAt: serverTimestamp(),
            updatedBy: user?.email || ''
          };
          
          await updateDoc(paymentRef, updatedPayment);
          console.log("Pago actualizado exitosamente");
          
          setSuccess("Pago actualizado exitosamente");
          setEditingPaymentId(null);
          setFormFields([{ name: '', units: '', amount: '', store: '' }]);
          setShowForm(false);
          
          // Actualizar snapshot
          await refreshPaymentsSnapshotForDate(getColombiaLocalDateString());
          
        } catch (updateError) {
          console.error("Error al actualizar pago:", updateError);
          setError(`Error al actualizar el pago: ${updateError.message}`);
        }
      } else {
        // CREAR NUEVOS PAGOS
        const promises = paymentsToSave.map(payment => addDoc(collection(db, 'payments'), payment));
        await Promise.all(promises);
        
        setSuccess(`${paymentsToSave.length} pago(s) guardado(s) exitosamente`);
        setFormFields([{ name: '', units: '', amount: '', store: '' }]);
        setShowForm(false);
        
        // Actualizar snapshot
        await refreshPaymentsSnapshotForDate(getColombiaLocalDateString());
      }
    } catch (error) {
      console.error('Error guardando pagos:', error);
      setError(`Error al guardar pagos: ${error.message}`);
    }
  };

  // ========= Editar pago =========
  const handleEdit = (payment) => {
    setEditingPaymentId(payment.id);
    setFormFields([{
      name: payment.name || '',
      units: payment.units?.toString() || '',
      amount: payment.amount?.toString() || '',
      store: payment.store || ''
    }]);
    setShowForm(true);
  };

  // ========= Ver detalles de tienda =========
  const handleViewStoreDetails = (store) => {
    setSelectedStore(store);
    setShowStoreDetails(true);
  };

  const handleBackToDashboard = () => {
    setSelectedStore(null);
    setShowStoreDetails(false);
  };

  // ========= Calculados y filtros =========
  // Filtrar por fecha seleccionada Y que las fechas locales coincidan
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => paymentLocalYMD(p) === selectedDate);
  }, [payments, selectedDate]);

  const totalExpensesByStore = useMemo(() => {
    const totals = {};
    filteredPayments.forEach(payment => {
      const store = payment.store || 'Sin tienda';
      totals[store] = (totals[store] || 0) + (payment.amount || 0);
    });
    return totals;
  }, [filteredPayments]);

  const groupedPaymentsByStoreAndDate = useMemo(() => {
    const grouped = {};
    filteredPayments.forEach(payment => {
      const store = payment.store || 'Sin tienda';
      const dateKey = paymentLocalYMD(payment);
      
      if (!grouped[store]) grouped[store] = {};
      if (!grouped[store][dateKey]) grouped[store][dateKey] = [];
      
      grouped[store][dateKey].push(payment);
    });
    return grouped;
  }, [filteredPayments]);

  // ======= Pagos del día seleccionado (o hoy por defecto) =======
  const effectiveDay = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)
    ? selectedDate
    : getColombiaLocalDateString();

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
      {/* Encabezado / fecha (igual que en DeliveryPayments) */}
      <div className="flex flex-col sm:flex-row items-center justify-between mb-4 sm:mb-8 p-3 sm:p-4 rounded-xl shadow-lg bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight mb-2 sm:mb-0 text-center sm:text-left">
          Registro de Pagos 💸
        </h2>

        <div className="text-lg font-semibold rounded-lg text-sm px-3 py-2 border border-white/30">
          {new Date(effectiveDay.replace(/-/g, '/')).toLocaleDateString('es-CO', {
            weekday: 'long', month: 'long', day: 'numeric'
          })}
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
                    <label htmlFor={`store-${index}`} className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
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
                            ${payment.createdBy === user?.email 
                              ? theme === 'dark' 
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100 border-l-4 border-green-500' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-l-4 border-green-500'
                              : theme === 'dark'
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                            } shadow-sm`}
                        >
                          <div className="flex-grow mb-1 sm:mb-0">
                            <p className="text-sm sm:text-base font-medium">
                              <span className="text-blue-400">{payment.name}</span> {payment.units ? `(${payment.units} unidades)` : ''} - <strong>{copFormatter.format(payment.amount)}</strong>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Fecha de Registro: {(
                                toDateFromTS(payment?.timestamp)
                              )?.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) || '—'}
                              {payment.createdBy && payment.createdBy !== "" && (
                                <span className={`ml-2 ${payment.createdBy === user?.email ? 'text-green-500 font-semibold' : ''}`}>
                                  Registrado por: {payment.createdBy}
                                  {payment.createdBy === user?.email && ' (tú)'}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex space-x-2 mt-2 sm:mt-0">
                            {(payment.createdBy === user?.email && payment.createdBy !== "" && payment.createdBy) && (
                              <button
                                onClick={() => handleEdit(payment)}
                                className="text-yellow-500 hover:text-yellow-400 p-1.5 sm:p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                title="Editar pago"
                              >
                                <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                              </button>
                            )}
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
              </div>
              
              {Object.keys(totalExpensesByStore).length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4 sm:py-8 text-sm sm:text-base">
                  No hay gastos registrados para esta fecha.
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

export default WaiterPayments;