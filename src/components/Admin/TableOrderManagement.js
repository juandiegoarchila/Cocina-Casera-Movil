//src/components/Admin/TableOrderManagement.js
import React, { useState, useEffect } from 'react';
import OptionSelector from '../OptionSelector';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Auth/AuthProvider';
import { db } from '../../config/firebase';
import { collection, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import LoadingIndicator from '../LoadingIndicator';
import ErrorMessage from '../ErrorMessage';
import { calculateTotal } from '../../utils/MealCalculations';
import { PrinterIcon } from '@heroicons/react/24/outline';
import PrinterPlugin from '../../plugins/PrinterPlugin.ts';
import QRCode from 'qrcode';

// NOTA: Debes importar tu catálogo de adiciones correctamente. Aquí se asume que additions está disponible.
import additions from '../../utils/additionsCatalog'; // Ajusta la ruta según tu proyecto

const TableOrderManagement = () => {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [allSides, setAllSides] = useState([]);

  // Cargar acompañamientos para poder derivar "No Incluir"
  useEffect(() => {
    const unsubSides = onSnapshot(collection(db, 'sides'), (snapshot) => {
      setAllSides(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubSides();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || (role !== 2 && role !== 3)) {
      setErrorMessage('Acceso denegado. Solo administradores y meseras pueden acceder a esta página.');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(collection(db, 'tableOrders'), (snapshot) => {
      const orderData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      const filteredOrders = role === 3 ? orderData.filter(order => order.userId === user.uid) : orderData;
      setOrders(filteredOrders);
      setIsLoading(false);
      if (process.env.NODE_ENV === 'development') {
        console.log('Órdenes cargadas:', filteredOrders);
      }
    }, (error) => {
      console.error('Error al escuchar tableOrders:', error);
      setErrorMessage('Error al cargar órdenes de mesas. Intenta de nuevo.');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user, loading, role, navigate]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setIsLoading(true);
      console.log('Attempting to update status for orderId:', orderId, 'to', newStatus, 'with role:', role);
      const orderRef = doc(db, 'tableOrders', orderId);
      await updateDoc(orderRef, {
        status: newStatus,
        updatedAt: new Date(),
      });
      setErrorMessage(null);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Estado de la orden ${orderId} actualizado a ${newStatus}`);
      }
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      setErrorMessage(`Error al actualizar el estado: ${error.message}. Verifica tu rol y permisos.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder({
      ...order,
      meals: order.meals.map(meal => ({
        ...meal,
        soup: meal.soup || null,
        soupReplacement: meal.soupReplacement || null,
        principle: meal.principle || [],
        protein: meal.protein || null,
        drink: meal.drink || null,
        sides: meal.sides || [],
        paymentMethod: meal.paymentMethod || null,
        tableNumber: meal.tableNumber || '',
        orderType: meal.orderType || '',
        notes: meal.notes || '',
      })),
    });
  };

const handleSaveEdit = async () => {
  for (const meal of editingOrder.meals) {
    if (!meal.orderType) {
      setErrorMessage('El tipo de pedido es obligatorio.');
      return;
    }
    if (!meal.tableNumber && meal.orderType === 'table') {
      setErrorMessage('El número de mesa es obligatorio para pedidos "Para mesa".');
      return;
    }
    if(!meal.paymentMethod){
      setErrorMessage('El método de pago es obligatorio.');
      return;
    }
  }

  try {
    setIsLoading(true);
    const orderRef = doc(db, 'tableOrders', editingOrder.id);
    const total = calculateTotal(editingOrder.meals);

    // Construir paymentLines agrupando por método usando el precio de cada meal
    const linesMap = {};
    for (const meal of editingOrder.meals) {
      const method = meal.paymentMethod?.name || 'Efectivo';
      const amount = Math.floor(calculateTotal([meal]) || 0);
      linesMap[method] = (linesMap[method] || 0) + amount;
    }
    const paymentLines = Object.entries(linesMap).map(([method, amount]) => ({ method, amount: Math.floor(amount) }));
    const paymentAmount = paymentLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

    const paymentSummary = {
      Efectivo: linesMap['Efectivo'] || 0,
      Daviplata: linesMap['Daviplata'] || 0,
      Nequi: linesMap['Nequi'] || 0,
    };

    const payload = {
      meals: editingOrder.meals.map(meal => ({
        ...meal,
        soup: meal.soup ? { name: meal.soup.name } : null,
        soupReplacement: meal.soupReplacement ? { name: meal.soupReplacement.name } : null,
        principle: Array.isArray(meal.principle) ? meal.principle.map(p => ({ name: p.name })) : [],
       principle: Array.isArray(meal.principle) ? meal.principle.map(p => ({ name: p.name })) : [],
       protein: meal.protein ? { name: meal.protein.name } : null,
        drink: meal.drink ? { name: meal.drink.name } : null,
        sides: Array.isArray(meal.sides) ? meal.sides.map(s => ({ name: s.name })) : [],
        additions: meal.additions ? meal.additions.map(a => ({
          name: a.name,
          protein: a.protein || '',
          replacement: a.replacement || '',
          quantity: a.quantity || 1,
        })) : [],
        tableNumber: meal.tableNumber || '',
        paymentMethod: meal.paymentMethod ? { name: meal.paymentMethod.name } : { name: 'Efectivo' },
        orderType: meal.orderType || '',
        notes: meal.notes || '',
      })),
      total,
      paymentSummary,
      payments: paymentLines,
      paymentLines,
      paymentAmount,
      // Marcar como pagada si la suma de líneas coincide con el total
      isPaid: paymentAmount === Math.floor(total),
      paymentMethod: paymentLines.length === 1 ? paymentLines[0].method : undefined,
      status: paymentAmount === Math.floor(total) ? 'Completada' : editingOrder.status || 'Pendiente',
      paymentDate: paymentAmount === Math.floor(total) ? (serverTimestamp ? serverTimestamp() : new Date()) : undefined,
      updatedAt: serverTimestamp ? serverTimestamp() : new Date(),
    };

    await updateDoc(orderRef, payload);
    setEditingOrder(null);
    setErrorMessage(null);
  } catch (error) {
    console.error('Error al guardar edición:', error);
    setErrorMessage(`Error al guardar: ${error.message}`);
  } finally {
    setIsLoading(false);
  }
};

  // Función para imprimir ticket desde gestión de pedidos
  const handlePrintReceipt = async (order) => {
    try {
      // Obtener configuración de impresora desde localStorage (mismo formato que CajaPOS)
      const printerIp = localStorage.getItem('printerIp') || '192.168.1.100';
      const printerPort = parseInt(localStorage.getItem('printerPort')) || 9100;
      
      if (!printerIp || !printerPort) {
        setErrorMessage('❌ Configure la impresora primero en Caja POS > Configuración de Impresora');
        return;
      }

      // Calcular total y preparar datos del recibo
      const total = calculateTotal(order.meals);
      const formatPrice = (v) => new Intl.NumberFormat('es-CO',{ style:'currency', currency:'COP', maximumFractionDigits:0 }).format(v||0);
      
      // Determinar tipo de orden principal
      const orderType = order.meals[0]?.orderType === 'takeaway' ? 'Llevar' : 'Mesa';
      const mealType = order.meals[0]?.name || 'Pedido';
      
      // Crear lista de items
      let itemsText = '';
      order.meals.forEach(meal => {
        itemsText += `${meal.name || 'Item'}\n`;
        itemsText += `1x ${formatPrice(calculateTotal([meal]))}\n`;
        if (meal.notes) {
          itemsText += `Notas: ${meal.notes}\n`;
        }
        itemsText += `\n`;
      });

      // Generar código QR para WhatsApp
      let qrCodeData = '';
      try {
        qrCodeData = await QRCode.toString('https://chat.whatsapp.com/JvtlBINb8LJHnr9lXYYLfr', {
          type: 'terminal',
          small: true
        });
      } catch (error) {
        console.warn('Error generando QR:', error);
      }

      // Formatear fecha
      const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt);
      const formattedDate = orderDate.toLocaleString('es-CO');

      // Construir recibo
      const receiptData = `
================================
      COCINA CASERA
(Uso interno - No es factura DIAN)
================================
Tipo: ${mealType} ${orderType}
Fecha: ${formattedDate}

Items:
${itemsText}
${formatPrice(total)}
Total: ${formatPrice(total)}

Pago: ${order.paymentMethod || 'Efectivo'}
Estado: ${order.status || 'Completada'}

¡Gracias por su compra!
Te esperamos mañana con un
nuevo menú.

Escríbenos al 301 6476916
Calle 133#126c-09

Escanea este código QR para unirte a
nuestro canal de WhatsApp
y recibir nuestro menú diario:

${qrCodeData}

================================



\x1b\x69`;  // Comando ESC/POS para corte automático

      // Imprimir
      await PrinterPlugin.printTCP({
        ip: printerIp,
        port: printerPort,
        data: receiptData
      });

      setErrorMessage('✅ Recibo impreso exitosamente');
      setTimeout(() => setErrorMessage(null), 3000);

    } catch (error) {
      console.error('Error imprimiendo recibo:', error);
      setErrorMessage(`❌ Error al imprimir: ${error.message}`);
      setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const handleFormChange = (index, field, value) => {
    const newMeals = [...editingOrder.meals];
    if (field === 'principle' || field === 'sides') {
      newMeals[index] = { ...newMeals[index], [field]: value ? value.split(', ').map(name => ({ name })) : [] };
    } else if (field === 'soup' || field === 'soupReplacement' || field === 'protein' || field === 'drink' || field === 'paymentMethod') {
      newMeals[index] = { ...newMeals[index], [field]: value ? { name: value } : null };
    } else {
      newMeals[index] = { ...newMeals[index], [field]: value };
    }
    setEditingOrder({ ...editingOrder, meals: newMeals });
  };

  const formatValue = (value) => {
    if (!value) return 'N/A';
    if (typeof value === 'string') return value;
    if (value.name) return value.name;
    return 'N/A';
  };

  const formatArray = (arr) => {
    if (!arr || !Array.isArray(arr)) return formatValue(arr);
    if (arr.length === 0) return 'N/A';
    return arr.map(item => formatValue(item)).filter(v => v !== 'N/A').join(', ');
  };

  const statusColors = {
    'Pendiente': 'bg-gray-100',
    'Preparando': 'bg-blue-100',
    'Completada': 'bg-green-100',
    'Cancelada': 'bg-red-100',
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Cargando...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col">
      <header className="bg-gray-800 text-white p-4">
        <h1 className="text-lg font-bold">Gestión de pedidos Mesas</h1>
      </header>
      <main className="p-4 flex-grow w-full max-w-4xl mx-auto">
        {isLoading && <LoadingIndicator />}
        {errorMessage && (
          <ErrorMessage message={errorMessage} onClose={() => setErrorMessage(null)} />
        )}
        {orders.length === 0 ? (
          <p className="text-center text-gray-700">No hay órdenes de mesas registradas.</p>
        ) : (
          <div className="space-y-4">
            {orders.map(order => (
              <div key={order.id} className={`p-4 rounded-lg shadow-md ${statusColors[order.status] || 'bg-white'}`}>
                <h2 className="text-sm font-semibold text-gray-800">
                  Orden #{order.id.slice(0, 8)} - Mesa {formatValue(order.meals[0]?.tableNumber)}
                </h2>
                <p className="text-xs text-gray-600">Estado: {order.status}</p>
                <p className="text-xs text-gray-600">Total: ${order.total?.toLocaleString('es-CO') || 'N/A'}</p>
                <div className="mt-2">
                  <h3 className="text-xs font-medium text-gray-700">Detalles:</h3>
                  {order.meals.map((meal, index) => (
                    <div key={index} className="text-xs text-gray-600 mt-1">
                      <p>Almuerzo #{index + 1}:</p>
                      <p>Sopa: {formatValue(meal.soup || meal.soupReplacement)}</p>
                      <p>Principio: {formatArray(meal.principle)}</p>
                      <p>Proteína: {formatValue(meal.protein)}</p>
                      <p>Bebida: {formatValue(meal.drink)}</p>
                      <p>Acompañamientos: {formatArray(meal.sides)}</p>
                      {(() => {
                        const selected = Array.isArray(meal.sides) ? meal.sides.map(s => s?.name).filter(Boolean) : [];
                        const hasNinguno = selected.includes('Ninguno');
                        if (selected.length > 0 && !hasNinguno) {
                          const all = allSides.map(s => s.name).filter(n => n && n !== 'Ninguno');
                          const missing = all.filter(n => !selected.includes(n));
                          if (missing.length > 0) {
                            return <p>No Incluir: {missing.join(', ')}</p>;
                          }
                        }
                        return null;
                      })()}
                      <p>Método de Pago: {formatValue(meal.paymentMethod)}</p>
                      <p>Tipo: {meal.orderType === 'takeaway' ? 'Para llevar' : 'Para mesa'}</p>
                      <p>Notas: {meal.notes || 'Ninguna'}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex space-x-2">
                  <button
                    onClick={() => handleStatusChange(order.id, 'Pendiente')}
                    className="px-2 py-1 bg-gray-500 text-white rounded text-xs hover:bg-gray-600 disabled:bg-gray-300"
                    disabled={order.status === 'Pendiente'}
                  >
                    Pendiente
                  </button>
                  <button
                    onClick={() => handleStatusChange(order.id, 'Preparando')}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-blue-300"
                    disabled={order.status === 'Preparando'}
                  >
                    Preparando
                  </button>
                  <button
                    onClick={() => handleStatusChange(order.id, 'Completada')}
                    className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 disabled:bg-green-300"
                    disabled={order.status === 'Completada'}
                  >
                    Completada
                  </button>
                  <button
                    onClick={() => handleStatusChange(order.id, 'Cancelada')}
                    className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:bg-red-300"
                    disabled={order.status === 'Cancelada'}
                  >
                    Cancelada
                  </button>
                  <button
                    onClick={() => handleEditOrder(order)}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handlePrintReceipt(order)}
                    className="px-2 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1"
                    title="Imprimir Recibo"
                  >
                    <PrinterIcon className="w-3 h-3" />
                    Imprimir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {editingOrder && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-4 rounded-lg max-w-lg w-full">
              <h2 className="text-lg font-bold">Editar Orden #{editingOrder.id.slice(0, 8)}</h2>
              {editingOrder.meals.map((meal, index) => (
                <div key={index} className="mt-2">
                  <h3 className="text-sm font-medium">Almuerzo #{index + 1}</h3>
                  {/* ...campos existentes... */}
                  {/* Adiciones con controles de cantidad y eliminar */}
                  <div className="mt-1">
                    <label className="text-xs">Adiciones</label>
                    <OptionSelector
                      title="Adiciones"
                      emoji="➕"
                      options={additions}
                      selected={
                        Array.isArray(meal.additions)
                          ? meal.additions.map((a) => {
                              const full = additions.find((opt) => opt.name === a.name || opt.id === a.id);
                              return {
                                id: full?.id || a.id || a.name,
                                name: a.name,
                                price: typeof a.price === 'number' ? a.price : (full?.price || 0),
                                protein: a.protein || '',
                                replacement: a.replacement || '',
                                quantity: typeof a.quantity === 'number' ? a.quantity : 1
                              };
                            })
                          : []
                      }
                      multiple={true}
                      showQuantityControls={true}
                      onImmediateSelect={(sel) =>
                        handleFormChange(
                          index,
                          'additions',
                          sel.map((a) => ({
                            id: a.id || a.name,
                            name: a.name,
                            price: typeof a.price === 'number' ? a.price : 0,
                            protein: a.protein || '',
                            replacement: a.replacement || '',
                            quantity: typeof a.quantity === 'number' ? a.quantity : 1
                          }))
                        )
                      }
                    />
                  </div>
                  {/* ...campos existentes... */}
                  <div className="mt-1">
                    <label className="text-xs">Sopa o Reemplazo</label>
                    <input
                      type="text"
                      value={meal.soup?.name || meal.soupReplacement?.name || ''}
                      onChange={(e) => handleFormChange(index, meal.soup ? 'soup' : 'soupReplacement', e.target.value)}
                      placeholder="Sopa o reemplazo"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Principio</label>
                    <input
                      type="text"
                      value={formatArray(meal.principle)}
                      onChange={(e) => handleFormChange(index, 'principle', e.target.value)}
                      placeholder="Principio"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Proteína</label>
                    <input
                      type="text"
                      value={meal.protein?.name || ''}
                      onChange={(e) => handleFormChange(index, 'protein', e.target.value)}
                      placeholder="Proteína"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Bebida</label>
                    <input
                      type="text"
                      value={meal.drink?.name || ''}
                      onChange={(e) => handleFormChange(index, 'drink', e.target.value)}
                      placeholder="Bebida"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Acompañamientos</label>
                    <input
                      type="text"
                      value={formatArray(meal.sides)}
                      onChange={(e) => handleFormChange(index, 'sides', e.target.value)}
                      placeholder="Acompañamientos"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Método de Pago</label>
                    <input
                      type="text"
                      value={meal.paymentMethod?.name || ''}
                      onChange={(e) => handleFormChange(index, 'paymentMethod', e.target.value)}
                      placeholder="Método de pago"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Número de Mesa</label>
                    <input
                      type="text"
                      value={meal.tableNumber || ''}
                      onChange={(e) => handleFormChange(index, 'tableNumber', e.target.value)}
                      placeholder="Número de mesa"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Tipo de Pedido</label>
                    <select
                      value={meal.orderType || ''}
                      onChange={(e) => handleFormChange(index, 'orderType', e.target.value)}
                      className="w-full p-2 mt-1 border rounded text-sm"
                    >
                      <option value="">Seleccionar</option>
                      <option value="table">Para mesa</option>
                      <option value="takeaway">Para llevar</option>
                    </select>
                  </div>
                  <div className="mt-1">
                    <label className="text-xs">Notas</label>
                    <textarea
                      value={meal.notes || ''}
                      onChange={(e) => handleFormChange(index, 'notes', e.target.value)}
                      placeholder="Notas"
                      className="w-full p-2 mt-1 border rounded text-sm"
                    />
                  </div>
                </div>
              ))}
              <div className="mt-4 flex space-x-2">
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default TableOrderManagement;