// src/components/Delivery/DeliveryOrdersPage.js
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../Auth/AuthProvider';
import { db } from '../../config/firebase';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import TablaPedidos from '../Admin/TablaPedidos';
import { cleanText, getAddressDisplay, getMealDetailsDisplay } from '../Admin/utils';
import { Disclosure, Transition } from '@headlessui/react';
import { Bars3Icon, XMarkIcon, SunIcon, MoonIcon, ArrowLeftOnRectangleIcon, ClipboardDocumentListIcon, CreditCardIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { signOut } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { openWhatsApp } from '../../utils/whatsapp';
import PaymentSplitEditor from '../common/PaymentSplitEditor';
import { defaultPaymentsForOrder } from '../../utils/payments';
import OrderSummary from '../OrderSummary';
import BreakfastOrderSummary from '../BreakfastOrderSummary';
import DeliveryPayments from './DeliveryPayments';
import DeliveryTasks from './DeliveryTasks';

const DeliveryOrdersPage = () => {
  const { user, loading, role } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [theme, setTheme] = useState('dark');

  const [orders, setOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState('orderNumber');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [orderTypeFilter, setOrderTypeFilter] = useState('all');
  const [showMealDetails, setShowMealDetails] = useState(null);

  const [editingPaymentsOrder, setEditingPaymentsOrder] = useState(null);
  const [deliveryPersons, setDeliveryPersons] = useState({});
  const [editingDeliveryId, setEditingDeliveryId] = useState(null);

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 4) {
      setError('No tienes permisos de domiciliario.');
      return;
    }
  }, [user, loading, role]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (e) {
      setError(`Error al cerrar sesión: ${e.message}`);
    }
  };

  // Cargar pedidos: almuerzo (orders), desayuno (deliveryBreakfastOrders) y clientes (clientOrders)
  useEffect(() => {
    setIsLoading(true);
    
    // Variables locales para acumular datos de cada colección
    let latestLunch = [];
    let latestBreakfast = [];
    let latestClientOrders = [];

    // Función centralizada para recomputar y actualizar el estado
    const recomputeAllOrders = () => {
      const clientBreakfasts = latestClientOrders.filter(order => order.type === 'breakfast');
      const clientMeals = latestClientOrders.filter(order => order.type === 'lunch');
      
      const merged = [
        ...latestLunch,
        ...latestBreakfast,
        ...clientMeals,
        ...clientBreakfasts
      ];

      console.log('🔍 [DeliveryOrdersPage] Merge final:', {
        lunchCount: latestLunch.length,
        breakfastCount: latestBreakfast.length,
        clientMealsCount: clientMeals.length,
        clientBreakfastsCount: clientBreakfasts.length,
        totalCount: merged.length
      });

      setOrders(merged);
      setIsLoading(false);
    };

    let unsubLunch = () => {};
    let unsubBreakfast = () => {};
    let unsubClient = () => {};

    try {
      unsubLunch = onSnapshot(collection(db, 'orders'), (snapshot) => {
        latestLunch = snapshot.docs.map((d) => ({ 
          id: d.id, 
          type: 'lunch', 
          ...d.data() 
        }));
        recomputeAllOrders();
      });
      
      unsubBreakfast = onSnapshot(collection(db, 'deliveryBreakfastOrders'), (snapshot) => {
        latestBreakfast = snapshot.docs.map((d) => ({ 
          id: d.id, 
          type: 'breakfast', 
          ...d.data() 
        }));
        recomputeAllOrders();
      });

      // Listener para pedidos de clientes no autenticados
      unsubClient = onSnapshot(collection(db, 'clientOrders'), (snapshot) => {
        latestClientOrders = snapshot.docs.map((doc) => {
          const data = doc.data();
          const isBreakfast = Array.isArray(data.breakfasts) && data.breakfasts.length > 0;
          
          return {
            id: doc.id,
            type: isBreakfast ? 'breakfast' : 'lunch',
            ...data,
            // Normalizar la estructura para compatibilidad
            meals: data.meals || [],
            breakfasts: data.breakfasts || [],
            payment: data.payment || (data.meals?.[0]?.payment?.name || data.breakfasts?.[0]?.payment?.name || 'Efectivo'),
            paymentSummary: data.paymentSummary || { Efectivo: 0, Daviplata: 0, Nequi: 0 },
            total: data.total || 0,
            deliveryPerson: data.deliveryPerson || 'Sin asignar',
            status: data.status || 'Pendiente'
          };
        });
        
        recomputeAllOrders();
      });
      
    } catch (e) {
      setError(`Error al cargar pedidos: ${e.message}`);
      setIsLoading(false);
    }

    return () => { 
      unsubLunch(); 
      unsubBreakfast(); 
      unsubClient(); 
    };
  }, []);

  const filteredOrders = useMemo(() => {
    const lowerSearch = (searchTerm || '').toLowerCase();
    return (orders || []).filter((order) => {
      // filtro por fecha local si existe
      let matchesDate = true;
      if (selectedDate) {
        const createdAtLocal = order.createdAtLocal;
        if (createdAtLocal) {
          matchesDate = createdAtLocal === selectedDate;
        } else {
          const ts = order.createdAt;
          let day = '';
          try {
            if (ts?.toDate) day = ts.toDate().toISOString().split('T')[0];
            else if (ts instanceof Date) day = ts.toISOString().split('T')[0];
            else if (typeof ts === 'string') day = ts.split('T')[0];
          } catch (_) { /* noop */ }
          matchesDate = day === selectedDate;
        }
      }

      const addr = order.meals?.[0]?.address || order.breakfasts?.[0]?.address || {};
      const address = (addr.address || '').toLowerCase();
      const phone = (addr.phoneNumber || '').toLowerCase();
      const full = getAddressDisplay(addr).toLowerCase();
      const timeObj = order.meals?.[0]?.time || order.breakfasts?.[0]?.time;
      const time = (typeof timeObj === 'string' ? timeObj : timeObj?.name || '').toLowerCase();
      const deliveryPerson = (order.deliveryPerson || '').toLowerCase();
      const status = (order.status || '').toLowerCase();

      return (
        matchesDate && (orderTypeFilter === 'all' || order.type === orderTypeFilter) && (
          address.includes(lowerSearch) || full.includes(lowerSearch) || phone.includes(lowerSearch) ||
          time.includes(lowerSearch) || deliveryPerson.includes(lowerSearch) || status.includes(lowerSearch)
        )
      );
    });
  }, [orders, searchTerm, orderTypeFilter, selectedDate]);

  const sortedOrders = useMemo(() => {
    // Primero ordenar por fecha de creación descendente (más recientes primero)
    const ordersByCreation = [...filteredOrders].sort((a, b) => {
      const getCreationTime = (order) => {
        if (order.createdAt && order.createdAt.seconds) {
          return order.createdAt.seconds;
        }
        if (order.createdAt instanceof Date) {
          return order.createdAt.getTime() / 1000;
        }
        if (typeof order.createdAt === 'string') {
          return new Date(order.createdAt).getTime() / 1000;
        }
        return 0;
      };
      
      const timeA = getCreationTime(a);
      const timeB = getCreationTime(b);
      return timeB - timeA; // Descendente: más recientes primero
    });

    const getValue = (obj, key) => {
      if (key === 'orderNumber') {
        // Usar el índice en el array ordenado por creación para mantener consistencia
        const index = ordersByCreation.findIndex(order => order.id === obj.id);
        return index + 1; // Número de orden basado en posición (1, 2, 3, etc.)
      }
      if (key === 'address') return cleanText(obj?.meals?.[0]?.address?.address || obj?.breakfasts?.[0]?.address?.address || '');
      if (key === 'phone') return cleanText(obj?.meals?.[0]?.address?.phoneNumber || obj?.breakfasts?.[0]?.address?.phoneNumber || '');
      if (key === 'time') return cleanText(obj?.meals?.[0]?.time?.name || obj?.breakfasts?.[0]?.time?.name || '');
      if (key === 'payment') return cleanText(obj?.payment || obj?.meals?.[0]?.payment?.name || obj?.breakfasts?.[0]?.payment?.name || '');
      if (key === 'total') return Number(obj?.total || 0);
      if (key === 'deliveryPerson') return cleanText(obj?.deliveryPerson || '');
      if (key === 'status') return cleanText(obj?.status || '');
      if (key === 'createdAt.seconds' && obj.createdAt && obj.createdAt.seconds) return obj.createdAt.seconds;
      return 0;
    };

    // Si se está ordenando por orderNumber, usar el array ya ordenado por creación
    if (sortBy === 'orderNumber') {
      return sortOrder === 'desc' ? ordersByCreation : [...ordersByCreation].reverse();
    }

    // Para otros campos, aplicar ordenamiento normal
    return ordersByCreation.sort((a, b) => {
      const va = getValue(a, sortBy);
      const vb = getValue(b, sortBy);
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortOrder === 'asc' ? va - vb : vb - va;
    });
  }, [filteredOrders, sortBy, sortOrder]);

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage) || 1;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedOrders.slice(start, end);
  }, [sortedOrders, currentPage, itemsPerPage]);

  const handleSort = (key) => {
    if (sortBy === key) setSortOrder((p) => (p === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(key); setSortOrder('asc'); }
    setCurrentPage(1);
  };

  const getSortIcon = (key) => {
    if (sortBy !== key) return null;
    return sortOrder === 'asc' ? (
      <svg className="w-4 h-4 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 inline ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Función helper para extraer el primer nombre del email
  const extractFirstNameFromEmail = (email) => {
    if (!email) return '';
    const username = email.split('@')[0];
    // Capitalizar primera letra y limpiar caracteres especiales
    return username.charAt(0).toUpperCase() + username.slice(1).toLowerCase().replace(/[^a-zA-Z]/g, '');
  };

  // Al cambiar estado a "Entregado", enviamos WhatsApp al cliente y asignamos domiciliario.
  // Supuestos: teléfonos colombianos; se normaliza a 57 + 10 dígitos cuando aplica.
  const handleStatusChange = async (orderId, newStatus) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      
      // Preparar objeto de actualización
      const updateData = { 
        status: newStatus, 
        updatedAt: new Date() 
      };

      // Si el domiciliario marca "Entregado", asignar automáticamente su nombre y enviar WhatsApp
      if (newStatus && /entregado/i.test(newStatus)) {
        // Auto-asignar domiciliario si no está asignado o está como "Sin asignar"
        const currentDeliveryPerson = order?.deliveryPerson || '';
        if (!currentDeliveryPerson || currentDeliveryPerson === 'Sin asignar' || currentDeliveryPerson.trim() === '') {
          const deliveryPersonName = extractFirstNameFromEmail(user?.email);
          if (deliveryPersonName) {
            updateData.deliveryPerson = deliveryPersonName;
          }
        }
        // Obtener el teléfono del pedido (almuerzo o desayuno)
        const addr = order?.meals?.[0]?.address || order?.breakfasts?.[0]?.address || order?.address || {};
        const phone = addr?.phoneNumber || addr?.phone || '';
        
        // Obtener la dirección completa con detalles entre paréntesis si existen
        let fullAddress = addr?.address || '';
        if (addr?.details && addr.details.trim()) {
          fullAddress += ` (${addr.details.trim()})`;
        }
        
        // Obtener método de pago y total
        const paymentMethod = order?.meals?.[0]?.paymentMethod?.name || 
                             order?.breakfasts?.[0]?.paymentMethod?.name || 
                             order?.paymentMethod?.name || 
                             order?.paymentMethod || 
                             'Efectivo';
        
        const total = order?.total || 0;
        const formattedTotal = new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
        }).format(total);
        
        // Construir el mensaje completo
        let msg = 'Tu pedido de Cocina Casera ya está en camino.\nLlega en 10-15 min. ¡Gracias por tu espera!';
        msg += '\n\nDirección: ' + fullAddress;
        msg += '\nMétodo de pago: ' + paymentMethod;
        msg += '\nTotal: ' + formattedTotal;
        
        // Abrimos WhatsApp en nueva pestaña; si falla, mostramos alerta pero continuamos
        const opened = openWhatsApp(phone, msg);
        if (!opened) {
          setError('No se pudo abrir WhatsApp: teléfono inválido o ausente.');
        }
      }
      
      const collectionName = order?.type === 'breakfast' ? 'deliveryBreakfastOrders' : 'orders';
      await updateDoc(doc(db, collectionName, orderId), updateData);
      
      // Mensaje de éxito personalizado
      const successMsg = updateData.deliveryPerson 
        ? `Estado actualizado y asignado a ${updateData.deliveryPerson} correctamente.`
        : 'Estado actualizado correctamente.';
      setSuccess(successMsg);
    } catch (e) {
      console.error('[Estado] actualización fallida', e);
      if (e && /Missing or insufficient permissions/i.test(String(e.message || e))) {
        setError('Error al actualizar estado: permisos insuficientes. Verifica que tu usuario tenga rol 4 en la colección "users" del proyecto prubeas-b510c y que las reglas estén desplegadas.');
      } else {
        setError(`Error al actualizar estado: ${e.message}`);
      }
    }
  };

  const handleDeliveryChange = async (orderId, deliveryPerson) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      const collectionName = order?.type === 'breakfast' ? 'deliveryBreakfastOrders' : 'orders';
      await updateDoc(doc(db, collectionName, orderId), { deliveryPerson: deliveryPerson || null, updatedAt: new Date() });
      setSuccess('Domiciliario asignado.');
    } catch (e) {
      setError(`Error al asignar domiciliario: ${e.message}`);
    }
  };

  // Permisos restringidos para domiciliario
  const permissions = useMemo(() => ({
    canEditOrder: false,
    canDeleteOrder: false,
    canEditPayments: true,
    canPrint: false,
    canLiquidate: false,
    showProteinModalButton: false,
    showMenuGenerateOrder: false,
    showPreviews: false,
    showExport: false,
    showDeleteAll: false,
    showResumen: false,
    showMealDetails: true,
    canViewOrderDetails: true
  }), []);

  const uniqueDeliveryPersons = useMemo(() => {
    const set = new Set();
    (orders || []).forEach((o) => {
      const name = (o.deliveryPerson || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  }, [orders]);

  useEffect(() => {
    if (error || success) {
      const t = setTimeout(() => { setError(''); setSuccess(''); }, 3000);
      return () => clearTimeout(t);
    }
  }, [error, success]);

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'} pb-4`}>
      {/* Header con menú hamburguesa estilo Admin */}
      <Disclosure as="nav" className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} shadow-lg fixed top-0 left-0 right-0 z-50`}>
        {({ open }) => (
          <>
            <div className="max-w-full mx-auto px-2 sm:px-4 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none -ml-2"
                  >
                    <span className="sr-only">Toggle sidebar</span>
                    {isSidebarOpen ? (
                      <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                    ) : (
                      <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                    )}
                  </button>
                  <h1 className="text-base sm:text-lg font-semibold ml-2 sm:ml-4">Panel del Domiciliario</h1>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className={`p-2 rounded-full ${theme === 'dark' ? 'text-yellow-400 hover:bg-gray-700' : 'text-orange-500 hover:bg-gray-300'} focus:outline-none`}
                    aria-label="Toggle theme"
                  >
                    {theme === 'dark' ? (
                      <SunIcon className="h-6 w-6" />
                    ) : (
                      <MoonIcon className="h-6 w-6" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <Transition
              show={isSidebarOpen}
              enter="transition-all duration-300 ease-out"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition-all duration-300 ease-in"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Disclosure.Panel className="sm:hidden fixed top-0 left-0 h-full w-full bg-black/50 z-[60]" onClick={() => setIsSidebarOpen(false)}>
                <div className={`h-full ${isSidebarOpen ? 'w-64' : 'w-0'} ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} p-4 transition-all duration-300 shadow-lg`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-6">
                    <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'}`}>Cocina Casera</h2>
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
                    >
                      <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>
                  <nav className="space-y-2 flex flex-col h-[calc(100vh-8rem)]">
                    <button
                      onClick={() => { navigate('/delivery'); setIsSidebarOpen(false); }}
                      className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-black hover:bg-gray-300'} transition-all duration-200`}
                    >
                      <ClipboardDocumentListIcon className={`w-6 h-6 mr-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
                      <span>Gestión de Pedidos</span>
                    </button>

                    <button
                      onClick={() => { navigate('/delivery/tasks'); setIsSidebarOpen(false); }}
                      className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-black hover:bg-gray-300'} transition-all duration-200`}
                    >
                      <ClipboardIcon className={`w-6 h-6 mr-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
                      <span>Gestión de Tareas</span>
                    </button>

                    <button
                      onClick={() => { navigate('/delivery/payments'); setIsSidebarOpen(false); }}
                      className={`flex items-center px-4 py-2 rounded-md text-sm font-medium ${theme === 'dark' ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-black hover:bg-gray-300'} transition-all duration-200`}
                    >
                      <CreditCardIcon className={`w-6 h-6 mr-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`} />
                      <span>Registro de Pagos</span>
                    </button>

                    <button
                      onClick={handleLogout}
                      className={`mt-auto flex items-center px-4 py-2 rounded-md text-sm font-medium ${theme === 'dark' ? 'text-red-300 hover:text-white hover:bg-red-700' : 'text-red-600 hover:text-red-800 hover:bg-red-200'} transition-all duration-200`}
                    >
                      <ArrowLeftOnRectangleIcon className={`w-6 h-6 mr-2 ${theme === 'dark' ? 'text-red-300' : 'text-red-600'}`} />
                      <span>Cerrar Sesión</span>
                    </button>
                  </nav>
                </div>
              </Disclosure.Panel>
            </Transition>
          </>
        )}
      </Disclosure>

      {/* Sidebar de escritorio (igual patrón que Admin) */}
      <div
        className={`hidden sm:block fixed top-16 bottom-0 left-0 ${
          isSidebarOpen ? 'w-64' : 'w-16'
        } ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-200'} p-4 transition-all duration-300 z-40`}
        onMouseEnter={() => setIsSidebarOpen(true)}
        onMouseLeave={() => setIsSidebarOpen(false)}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className={`text-xl font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-800'} ${isSidebarOpen ? 'block' : 'hidden'}`}>
            Cocina Casera
          </h2>
        </div>
        <nav className="space-y-2 flex flex-col h-[calc(100vh-8rem)]">
          <button
            onClick={() => navigate('/delivery')}
            className={`relative flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
              ${
                isSidebarOpen
                  ? theme === 'dark'
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700'
                    : 'text-gray-700 hover:text-black hover:bg-gray-300'
                  : 'justify-center'
              } transition-all duration-300`}
          >
            <ClipboardDocumentListIcon
              className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
              }`}
            />
            <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
              Gestión de Pedidos
            </span>
          </button>

          <button
            onClick={() => navigate('/delivery/tasks')}
            className={`relative flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
              ${
                isSidebarOpen
                  ? theme === 'dark'
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700'
                    : 'text-gray-700 hover:text-black hover:bg-gray-300'
                  : 'justify-center'
              } transition-all duration-300`}
          >
            <ClipboardIcon
              className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
              }`}
            />
            <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
              Gestión de Tareas
            </span>
          </button>

          <button
            onClick={() => navigate('/delivery/payments')}
            className={`relative flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
              ${
                isSidebarOpen
                  ? theme === 'dark'
                    ? 'text-gray-300 hover:text-white hover:bg-gray-700'
                    : 'text-gray-700 hover:text-black hover:bg-gray-300'
                  : 'justify-center'
              } transition-all duration-300`}
          >
            <CreditCardIcon
              className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
              }`}
            />
            <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
              Registro de Pagos
            </span>
          </button>

          <button
            onClick={handleLogout}
            className={`mt-auto flex items-center px-4 py-2 rounded-md text-sm font-medium min-w-[48px]
              ${
                isSidebarOpen
                  ? theme === 'dark'
                    ? 'text-red-300 hover:text-white hover:bg-red-700'
                    : 'text-red-600 hover:text-red-800 hover:bg-red-200'
                  : 'justify-center'
              } transition-all duration-300`}
          >
            <ArrowLeftOnRectangleIcon
              className={`w-6 h-6 ${isSidebarOpen ? 'mr-2' : 'mr-0'} ${
                theme === 'dark' ? 'text-red-300' : 'text-red-600'
              }`}
            />
            <span className={`transition-opacity duration-200 ${isSidebarOpen ? 'opacity-100 block' : 'opacity-0 hidden'}`}>
              Cerrar Sesión
            </span>
          </button>
        </nav>
      </div>

      {/* Contenido principal */}
      <div className={`flex-1 p-4 pt-20 sm:pt-20 ${isSidebarOpen ? 'sm:ml-64' : 'sm:ml-16'} transition-all duration-300 min-h-screen`}>
        {error && <div className="mb-3 p-2 bg-red-600 text-white rounded">{error}</div>}
        {success && <div className="mb-3 p-2 bg-green-600 text-white rounded">{success}</div>}

        <Routes>
          <Route path="/" element={
            <TablaPedidos
              theme={theme}
              orders={paginatedOrders}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              totals={{}}
              isLoading={isLoading}
              currentPage={currentPage}
              totalPages={totalPages}
              setCurrentPage={setCurrentPage}
              itemsPerPage={itemsPerPage}
              setItemsPerPage={setItemsPerPage}
              deliveryPersons={{}}
              handleEditOrder={() => {}}
              handleDeleteOrder={() => {}}
              handleStatusChange={handleStatusChange}
              handleSort={handleSort}
              getSortIcon={getSortIcon}
              editingDeliveryId={editingDeliveryId}
              setEditingDeliveryId={setEditingDeliveryId}
              editForm={{}}
              setEditForm={() => {}}
              handleDeliveryChange={handleDeliveryChange}
              sortOrder={sortOrder}
              totalOrders={filteredOrders.length}
              showProteinModal={false}
              setShowProteinModal={() => {}}
              showMealDetails={showMealDetails}
              setShowMealDetails={setShowMealDetails}
              isMenuOpen={isMenuOpen}
              setIsMenuOpen={setIsMenuOpen}
              handleOpenPreview={() => {}}
              handleOpenExcelPreview={() => {}}
              handleExport={() => {}}
              handleDeleteAllOrders={() => {}}
              setShowConfirmDeleteAll={() => {}}
              exportToExcel={() => {}}
              exportToPDF={() => {}}
              exportToCSV={() => {}}
              setShowAddOrderModal={() => {}}
              orderTypeFilter={orderTypeFilter}
              setOrderTypeFilter={setOrderTypeFilter}
              uniqueDeliveryPersons={uniqueDeliveryPersons}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              permissions={permissions}
              editingPaymentsOrder={editingPaymentsOrder}
              setEditingPaymentsOrder={setEditingPaymentsOrder}
            />
          } />
          <Route path="/tasks" element={
            <DeliveryTasks 
              setError={setError}
              setSuccess={setSuccess}
              theme={theme}
            />
          } />
          <Route path="/payments" element={
            <DeliveryPayments 
              setError={setError}
              setSuccess={setSuccess}
              theme={theme}
            />
          } />
          <Route path="*" element={<Navigate to="/delivery" replace />} />
        </Routes>
      </div>

      {/* Modal para mostrar detalles del pedido */}
      {showMealDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] modal-backdrop" onClick={(e) => {
          if (e.target.classList.contains('modal-backdrop')) {
            setShowMealDetails(null);
          }
        }}>
          <div className={`p-4 sm:p-6 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto ${theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'}`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">
                Detalles del Pedido
              </h3>
              <button onClick={() => setShowMealDetails(null)} className="text-gray-500 hover:text-gray-700">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
              {showMealDetails.type === 'breakfast' ? (
                <BreakfastOrderSummary
                  items={showMealDetails.breakfasts}
                  user={{ role: 4 }}
                  breakfastTypes={[]}
                  isWaiterView={false}
                  statusClass={''}
                  showSaveButton={false}
                />
              ) : (
                <OrderSummary
                  meals={showMealDetails.meals || []}
                  isDeliveryView={true}
                  calculateTotal={() => showMealDetails.total || 0}
                  isWaiterView={false}
                  statusClass={''}
                  userRole={4}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal para editar pagos */}
      {editingPaymentsOrder && (
        <PaymentSplitEditor
          isOpen={!!editingPaymentsOrder}
          onClose={() => setEditingPaymentsOrder(null)}
          order={editingPaymentsOrder}
          onSave={async (payments) => {
            try {
              // Determinar el tipo de colección (breakfast o regular)
              const collectionName = editingPaymentsOrder.type === 'breakfast'
                ? 'deliveryBreakfastOrders'
                : 'orders';
              
              // Actualizar solo los pagos, manteniendo el resto del documento igual
              await updateDoc(doc(db, collectionName, editingPaymentsOrder.id), {
                payments,
                paymentUpdatedAt: new Date(),
                paymentUpdatedBy: user?.email || 'domiciliario'
              });
              
              setSuccess('Pagos actualizados correctamente');
              setEditingPaymentsOrder(null);
            } catch (err) {
              console.error('Error al guardar pagos:', err);
              setError(`Error al guardar pagos: ${err.message}`);
            }
          }}
          defaultPayments={editingPaymentsOrder.payments || defaultPaymentsForOrder(editingPaymentsOrder)}
        />
      )}
    </div>
  );
};

export default DeliveryOrdersPage;
