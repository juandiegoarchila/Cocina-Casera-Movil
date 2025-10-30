// ...existing code...

// DEBUG: Mostrar fechas locales y UTC de los pedidos
// Este useEffect debe ir después de la declaración de useState de orders

// src/components/Admin/TableOrdersAdmin.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../Auth/AuthProvider';
import { db } from '../../config/firebase';
import { collection, onSnapshot, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { classNames } from '../../utils/classNames';
import QRCode from 'qrcode';
import PrinterPlugin from '../../plugins/PrinterPlugin.ts';
import {
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';
import LoadingIndicator from '../LoadingIndicator';
import ErrorMessage from '../ErrorMessage';
import OrderSummary from '../OrderSummary';
import BreakfastOrderSummary from '../BreakfastOrderSummary';
import OptionSelector from '../OptionSelector';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { calculateTotal } from '../../utils/MealCalculations';
import { calculateTotalBreakfastPrice } from '../../utils/BreakfastLogic';
import { format } from 'date-fns';

// === NUEVO: pagos
import PaymentSplitEditor from '../common/PaymentSplitEditor';
import { summarizePayments, sumPaymentsByMethod, defaultPaymentsForOrder, extractOrderPayments } from '../../utils/payments';

// ===== Helpers para buscar por nombre y asegurar estructura =====
const normalizeName = (s) => (s || '').replace(/\s*NUEVO\s*$/i, '').trim();

const byName = (list, value) => {
  if (!value) return null;
  const name = typeof value === 'string' ? value : value?.name;
  return list.find((o) => normalizeName(o.name) === normalizeName(name)) || null;
};

const manyByName = (list, arr) =>
  Array.isArray(arr) ? arr.map((v) => byName(list, v)).filter(Boolean) : [];

const ensureAddress = (addr = {}, fallback = {}) => ({
  address: addr.address ?? fallback.address ?? '',
  phoneNumber: addr.phoneNumber ?? fallback.phoneNumber ?? '',
  addressType: addr.addressType ?? fallback.addressType ?? '',
  localName: addr.localName ?? fallback.localName ?? '',
  unitDetails: addr.unitDetails ?? fallback.unitDetails ?? '',
  recipientName: addr.recipientName ?? fallback.recipientName ?? '',
  details: addr.details ?? fallback.details ?? '',
});

// === POS editing: catálogo de Caja ===
const currencyCO = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

// ===== Helpers NUEVOS / ROBUSTOS para pago =====
const formatValue = (value) => {
  if (value === null || value === undefined) return 'N/A';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  const candidates = [
    value.name, value.label, value.title, value.method, value.type, value.payment, value.value,
    value?.method?.name, value?.payment?.name, value?.value?.name, value?.type?.name
  ].filter((v) => typeof v === 'string' && v.trim());
  return candidates[0] || 'N/A';
};

// Devuelve raw pago desde la orden
const getOrderPaymentRaw = (order) =>
  order?.meals?.[0]?.paymentMethod ??
  order?.breakfasts?.[0]?.payment ??
  order?.breakfasts?.[0]?.paymentMethod ??
  order?.payment ??
  order?.paymentMethod ??
  null;

const getOrderPaymentText = (order) => formatValue(getOrderPaymentRaw(order));

const normalizePaymentKey = (raw) =>
  (typeof raw === 'string' ? raw : formatValue(raw)).toLowerCase().trim();

// === NUEVO: mostrar solo método(s) sin montos ===
const displayPaymentLabel = (val) => {
  const raw = (typeof val === 'string' ? val : val?.name || val?.label || val?.method || val?.type || '').toString().trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('efect') || raw.includes('cash')) return 'Efectivo';
  if (raw.includes('nequi')) return 'Nequi';
  if (raw.includes('davi')) return 'Daviplata';
  return '';
};

const paymentMethodsOnly = (order) => {
  try {
    const rows = extractOrderPayments(order || {});
    const methodName = (k) => (k === 'cash' ? 'Efectivo' : k === 'nequi' ? 'Nequi' : k === 'daviplata' ? 'Daviplata' : '');
    const names = [...new Set(rows.map(r => methodName(r.methodKey)).filter(Boolean))];
    if (names.length) return names.join(' + ');
  } catch (e) {
    console.error('extractOrderPayments error', e);
  }
  return displayPaymentLabel(getOrderPaymentRaw(order)) || 'Sin pago';
};


const TableOrdersAdmin = ({ theme = 'light' }) => {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [allSides, setAllSides] = useState([]);

  useEffect(() => {
    const unsubSides = onSnapshot(collection(db, 'sides'), (snapshot) => {
      setAllSides(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubSides();
  }, []);

  // DEBUG: Mostrar fechas locales y UTC de los pedidos
  React.useEffect(() => {
    if (orders && orders.length) {
      console.log('Pedidos actuales (fecha local y UTC):');
      orders.forEach(o => {
        console.log(`ID: ${o.id} | createdAtLocal: ${o.createdAtLocal} | createdAt:`, o.createdAt);
      });
    }
  }, [orders]);

  // DEBUG: Mostrar fechas locales y UTC de los pedidos
  React.useEffect(() => {
    if (orders && orders.length) {
      console.log('Pedidos actuales (fecha local y UTC):');
      orders.forEach(o => {
        console.log(`ID: ${o.id} | createdAtLocal: ${o.createdAtLocal} | createdAt:`, o.createdAt);
      });
    }
  }, [orders]);
  const [searchTerm, setSearchTerm] = useState('');
  // Filtro de fecha para mesas - inicializar con fecha actual
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // Formato YYYY-MM-DD
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showMealDetails, setShowMealDetails] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderTypeFilter, setOrderTypeFilter] = useState('all'); // 'all', 'breakfast', 'lunch'
  const [breakfastTypes, setBreakfastTypes] = useState([]);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const menuRef = useRef(null);

    // Función para imprimir recibo directamente a impresora TCP (IDÉNTICA A CajaPOS)
    const handlePrintReceipt = async (order) => {
      try {
        // Obtener configuración de impresora desde localStorage (mismo formato que CajaPOS)
        const printerIp = localStorage.getItem('printerIp') || '192.168.1.100';
        const printerPort = parseInt(localStorage.getItem('printerPort')) || 9100;
        
        if (!printerIp || !printerPort) {
          setErrorMessage('❌ Configure la impresora primero en Caja POS > Configuración de Impresora');
          return;
        }

        // Preparar datos EXACTAMENTE como CajaPOS
        const fecha = (order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt)).toLocaleString('es-CO');
        const isBreakfast = order.type === 'breakfast';
        const isPOS = Array.isArray(order.items) && order.items.length && !Array.isArray(order.breakfasts) && !Array.isArray(order.meals);
        
        // Determinar tipo de orden (EXACTO A CajaPOS)
        let orderTypeNormalized, serviceType, tableNumber, takeaway, paymentMethod, cashReceived, changeGiven, note;
        
        if (isPOS) {
          orderTypeNormalized = order.orderTypeNormalized;
          serviceType = order.serviceType;
          tableNumber = order.tableNumber;
          takeaway = order.takeaway;
          paymentMethod = order.paymentMethod;
          cashReceived = order.cashReceived;
          changeGiven = order.changeGiven;
          note = order.paymentNote || order.notes;
        } else {
          // Para órdenes de mesas normales
          const mealType = isBreakfast ? 'desayuno' : 'almuerzo';
          const svcType = order.tableNumber ? 'mesa' : 'llevar';
          orderTypeNormalized = `${mealType}_${svcType}`;
          serviceType = svcType;
          tableNumber = order.tableNumber;
          takeaway = !order.tableNumber;
          
          // Determinar método de pago para mesas
          if (Array.isArray(order.payments) && order.payments.length) {
            paymentMethod = order.payments.map(p => p.method).join(', ');
          } else {
            paymentMethod = 'efectivo';
          }
          note = order.notes;
        }
        
        // Preparar items exactamente como CajaPOS
        let items = [];
        if (isPOS && Array.isArray(order.items)) {
          items = order.items.map(item => ({
            name: item.name,
            quantity: item.quantity || 1,
            price: item.unitPrice || item.price || 0
          }));
        } else if (isBreakfast && Array.isArray(order.breakfasts)) {
          items = order.breakfasts.map((breakfast, index) => ({
            name: `Desayuno #${index + 1}`,
            quantity: 1,
            price: 15000
          }));
        } else if (Array.isArray(order.meals)) {
          items = order.meals.map((meal, index) => ({
            name: `Almuerzo #${index + 1}`,
            quantity: 1,
            price: 18000
          }));
        }

        // Calcular total
        const total = order.total || items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        // Llamar a la MISMA función de CajaPOS
        await printReceiptFromCajaPOS({
          id: order.id,
          date: new Date(fecha),
          items,
          total,
          paymentMethod,
          cashReceived,
          changeGiven,
          note,
          orderType: orderTypeNormalized?.split('_')[0] || (isBreakfast ? 'desayuno' : 'almuerzo'),
          orderTypeNormalized,
          serviceType,
          tableNumber,
          takeaway
        }, false); // false = no abrir caja registradora en reimpresiones

        setSuccessMessage('✅ Recibo impreso exitosamente');
        setTimeout(() => setSuccessMessage(''), 3000);

      } catch (error) {
        console.error('Error imprimiendo recibo:', error);
        setErrorMessage(`❌ Error al imprimir: ${error.message}`);
        setTimeout(() => setErrorMessage(''), 5000);
      }
    };

    // Función de impresión EXACTA de CajaPOS
    const printReceiptFromCajaPOS = async ({ id, date, items, total, paymentMethod, cashReceived, changeGiven, note, orderType, orderTypeNormalized, serviceType, tableNumber, takeaway }, openCashDrawer = false) => {
      const fecha = date.toLocaleString('es-CO');
      const kind = (orderTypeNormalized?.split('_')[0] || orderType || '').toLowerCase();
      const svc = (orderTypeNormalized?.split('_')[1] || serviceType || (tableNumber ? 'mesa' : (takeaway ? 'llevar' : ''))).toLowerCase();
      const cap = (s) => s ? s.charAt(0).toUpperCase()+s.slice(1) : '';
      const tipoLabel = `${cap(kind)} ${svc ? cap(svc) : ''}`.trim();

      // Generar recibo de texto para impresora térmica (IDÉNTICO AL WEB)
      const generateThermalReceipt = () => {
        let receipt = '';
        
        // Comandos ESC/POS para centrar texto y configurar impresión
        const ESC = '\x1B';
        const GS = '\x1D';
        
        // Inicializar impresora
        receipt += ESC + '@'; // Inicializar
        
        // El logo se imprime como imagen separadamente
        // Después del logo, agregar el título centrado
        receipt += ESC + 'a' + '\x01'; // Centrar texto
        receipt += ESC + '!' + '\x18'; // Texto doble altura y ancho
        receipt += 'Cocina Casera\n';
        receipt += ESC + '!' + '\x00'; // Texto normal
        receipt += '(Uso interno - No es factura DIAN)\n';
        receipt += '\n';
        
        // Línea divisoria
        receipt += ESC + 'a' + '\x00'; // Alinear izquierda
        receipt += '================================\n';
        
        // Información del pedido (igual al web)
        receipt += `Tipo: ${tipoLabel}\n`;
        if (tableNumber) receipt += `Mesa: ${tableNumber}\n`;
        receipt += `Fecha: ${fecha}\n`;
        if (note) receipt += `Nota: ${note}\n`;
        receipt += '================================\n';
        
        // Items del pedido (formato igual al web)
        receipt += 'Items:\n';
        
        items.forEach(item => {
          const qty = Number(item.quantity || 0);
          const unit = Number(item.price || 0);
          const lineTotal = qty * unit;
          
          // Nombre del item en negrita
          receipt += ESC + '!' + '\x08'; // Negrita
          receipt += `${item.name}\n`;
          receipt += ESC + '!' + '\x00'; // Normal
          
          // Cantidad y precio con alineación
          const qtyLine = `  ${qty}x $${unit.toLocaleString('es-CO')}`;
          const totalText = `$${lineTotal.toLocaleString('es-CO')}`;
          const spaces = ' '.repeat(Math.max(1, 32 - qtyLine.length - totalText.length));
          receipt += `${qtyLine}${spaces}${totalText}\n`;
        });
        
        receipt += '================================\n';
        
        // Totales (formato igual al web)
        receipt += ESC + '!' + '\x08'; // Negrita
        receipt += `Total: $${total.toLocaleString('es-CO')}\n`;
        receipt += ESC + '!' + '\x00'; // Normal
        receipt += `Pago: ${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}\n`;
        if (paymentMethod === 'efectivo') {
          receipt += `Recibido: $${(cashReceived || 0).toLocaleString('es-CO')}\n`;
          receipt += `Vueltos: $${(changeGiven || 0).toLocaleString('es-CO')}\n`;
        }
        
        receipt += '================================\n';
        
        // Mensaje de agradecimiento (centrado como web)
        receipt += ESC + 'a' + '\x01'; // Centrar
        receipt += ESC + '!' + '\x08'; // Negrita
        receipt += '¡Gracias por su compra!\n';
        receipt += ESC + '!' + '\x00'; // Normal
        receipt += 'Te esperamos mañana con un\n';
        receipt += 'nuevo menú.\n';
        receipt += 'Escríbenos al 301 6476916\n';
        receipt += 'Calle 133#126c-09\n';
        receipt += '\n';
        
        // QR Code texto (igual al web)
        receipt += 'Escanea este código QR para\n';
        receipt += 'unirte a nuestro canal de\n';
        receipt += 'WhatsApp y recibir nuestro\n';
        receipt += 'menú diario:\n';
        receipt += '\n';
        
        // Generar QR code nativo
        receipt += GS + '(k' + '\x04' + '\x00' + '\x31' + '\x41' + '\x32' + '\x00'; // QR setup
        receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x43' + '\x08'; // QR size 8
        receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x45' + '\x30'; // QR error correction
        
        // Datos del QR (WhatsApp - igual al web)
        const qrData = 'https://wa.me/573016476916?text=Hola%20quiero%20el%20menú';
        const qrLength = qrData.length + 3;
        const qrLenLow = qrLength % 256;
        const qrLenHigh = Math.floor(qrLength / 256);
        receipt += GS + '(k' + String.fromCharCode(qrLenLow, qrLenHigh) + '\x00' + '\x31' + '\x50' + '\x30' + qrData;
        receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x51' + '\x30'; // Imprimir QR
        
        receipt += '\n\n\n';
        
        // Cortar papel
        receipt += GS + 'V' + '\x41' + '\x03'; // Corte parcial
        
        return receipt;
      };

      // Función para convertir imagen a base64
      const getLogoBase64 = async () => {
        try {
          const response = await fetch('/logo.png');
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1]; // Remover prefijo data:image/png;base64,
              resolve(base64);
            };
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          console.warn('No se pudo cargar el logo:', error);
          return null;
        }
      };

      // Imprimir (EXACTO A CajaPOS)
      const currentPrinterIp = localStorage.getItem('printerIp') || '192.168.1.100';
      const currentPrinterPort = parseInt(localStorage.getItem('printerPort')) || 9100;
      
      console.log(`🖨️ Mesas: Intentando imprimir en ${currentPrinterIp}:${currentPrinterPort}`);
      
      const thermalData = generateThermalReceipt();
      const logoBase64 = await getLogoBase64();
      
      if (logoBase64) {
        // Usar la nueva función con imagen
        await PrinterPlugin.printWithImage({
          ip: currentPrinterIp,
          port: currentPrinterPort,
          data: thermalData,
          imageBase64: logoBase64
        });
      } else {
        // Usar función básica sin imagen
        await PrinterPlugin.printTCP({
          ip: currentPrinterIp,
          port: currentPrinterPort,
          data: thermalData
        });
      }
      console.log('✅ Mesas: Recibo impreso en impresora térmica');
    };

  // Catálogos almuerzo
  const [soups, setSoups] = useState([]);
  const [soupReplacements, setSoupReplacements] = useState([]);
  const [principles, setPrinciples] = useState([]);
  const [menuProteins, setMenuProteins] = useState([]);
  const [drinks, setDrinks] = useState([]);
  const [sides, setSides] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  // Catálogos desayuno
  const [breakfastEggs, setBreakfastEggs] = useState([]);
  const [breakfastBroths, setBreakfastBroths] = useState([]);
  const [breakfastRiceBread, setBreakfastRiceBread] = useState([]);
  const [breakfastDrinks, setBreakfastDrinks] = useState([]);
  const [breakfastAdditions, setBreakfastAdditions] = useState([]);
  const [breakfastProteins, setBreakfastProteins] = useState([]);

  // --- Auth & carga inicial
  useEffect(() => {
    if (loading) return;
    if (!user || role !== 2) {
      setErrorMessage('Acceso denegado. Solo los administradores pueden acceder a esta página.');
      setTimeout(() => navigate('/login'), 3000);
      return;
    }

    setIsLoading(true);

    // Tipos de desayuno
    const breakfastTypesUnsubscribe = onSnapshot(
      collection(db, 'breakfastTypes'),
      (snapshot) => {
        const types = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setBreakfastTypes(types);
      },
      (error) => {
        console.error('Error al escuchar breakfastTypes:', error);
        setErrorMessage('Error al cargar tipos de desayuno. Intenta de nuevo.');
      }
    );

    // Órdenes desayuno
    const breakfastOrdersUnsubscribe = onSnapshot(
      collection(db, 'breakfastOrders'),
      (snapshot) => {
        const breakfastOrders = snapshot.docs.map((doc) => ({
          id: doc.id, ...doc.data(), type: 'breakfast', __collection: 'breakfastOrders', // <-- NUEVO
        }));
        setOrders((prev) => [
          ...prev.filter((order) => order.type !== 'breakfast'),
          ...breakfastOrders,
        ]);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error al escuchar breakfastOrders:', error);
        setErrorMessage('Error al cargar órdenes de desayunos. Intenta de nuevo.');
        setIsLoading(false);
      }
    );

    // Órdenes mesa
    const tableOrdersUnsubscribe = onSnapshot(
      collection(db, 'tableOrders'),
      (snapshot) => {
        const tableOrders = snapshot.docs.map((doc) => ({
          id: doc.id, ...doc.data(), type: 'lunch', __collection: 'tableOrders', // <-- NUEVO
        }));
        setOrders((prev) => [
          ...prev.filter((order) => order.type !== 'lunch'),
          ...tableOrders,
        ]);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error al escuchar tableOrders:', error);
        setErrorMessage('Error al cargar órdenes de mesas. Intenta de nuevo.');
        setIsLoading(false);
      }
    );

    return () => {
      breakfastTypesUnsubscribe();
      breakfastOrdersUnsubscribe();
      tableOrdersUnsubscribe();
    };
  }, [user, loading, role, navigate]);

  // Escucha catálogos para OptionSelector
  useEffect(() => {
    const unsubs = [];
    const listen = (name, setter) => {
      const u = onSnapshot(collection(db, name), (snap) => {
        setter(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });
      unsubs.push(u);
    };

    // Almuerzo
    listen('soups', setSoups);
    listen('soupReplacements', setSoupReplacements);
    listen('principles', setPrinciples);
    listen('proteins', setMenuProteins);
    listen('drinks', setDrinks);
    listen('sides', setSides);
    listen('additions', setAdditions);
    listen('paymentMethods', setPaymentMethods);

    // Desayuno
    listen('breakfastEggs', setBreakfastEggs);
    listen('breakfastBroths', setBreakfastBroths);
    listen('breakfastRiceBread', setBreakfastRiceBread);
    listen('breakfastDrinks', setBreakfastDrinks);
    listen('breakfastAdditions', setBreakfastAdditions);
    listen('breakfastProteins', setBreakfastProteins);

    return () => unsubs.forEach((u) => u && u());
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Manejar clics fuera de los modales
  useEffect(() => {
    function handleModalClickOutside(event) {
      // Cerrar modal de detalles si se hace clic fuera
      if (showMealDetails && event.target.classList.contains('modal-backdrop')) {
        setShowMealDetails(null);
      }
      // Cerrar modal de edición si se hace clic fuera
      if (editingOrder && event.target.classList.contains('modal-backdrop')) {
        setEditingOrder(null);
      }
      // Cerrar modal de eliminar todos si se hace clic fuera
      if (showDeleteAllModal && event.target.classList.contains('modal-backdrop')) {
        setShowDeleteAllModal(false);
        setDeleteConfirmText('');
      }
    }
    
    if (showMealDetails || editingOrder || showDeleteAllModal) {
      document.addEventListener('mousedown', handleModalClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleModalClickOutside);
    };
  }, [showMealDetails, editingOrder, showDeleteAllModal]);

  // Auto-cerrar mensajes después de 10 segundos
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage(null);
      }, 10000); // 10 segundos

      return () => clearTimeout(timer);
    }
  }, [errorMessage]);


  // ===== Filtro/búsqueda (incluye pago) =====
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter(order => {
      // Fecha
      let matchesDate = true;
      if (selectedDate) {
        const selectedIso = new Date(selectedDate).toISOString().split('T')[0];
        if (order.createdAtLocal) {
          matchesDate = order.createdAtLocal === selectedIso;
        } else if (order.createdAt) {
          let orderDate = null;
            if (order.createdAt instanceof Date) {
              orderDate = order.createdAt;
            } else if (order.createdAt && typeof order.createdAt === 'object' && order.createdAt.seconds) {
              orderDate = new Date(order.createdAt.seconds * 1000);
            } else if (typeof order.createdAt === 'string' || typeof order.createdAt === 'number') {
              orderDate = new Date(order.createdAt);
            }
          if (orderDate && !isNaN(orderDate)) {
            matchesDate = orderDate.toISOString().split('T')[0] === selectedIso;
          } else {
            matchesDate = false;
          }
        }
      }

      if (!matchesDate) return false;
      if (orderTypeFilter !== 'all' && order.type !== orderTypeFilter) return false;
      if (!term) return true; // sin término, ya pasa filtros de fecha y tipo

      const parts = [];
      parts.push(order.id || '');
      parts.push(order.type === 'breakfast' ? 'desayuno' : 'almuerzo');
      parts.push(order.status || '');
      // Pagos (nuevo esquema y legacy)
      if (Array.isArray(order.payments)) {
        order.payments.forEach(p => {
          parts.push(normalizePaymentKey(p.method || ''));
        });
      }
      // Total
      if (order.total) parts.push(String(order.total));

      // Almuerzos
      if (Array.isArray(order.meals)) {
        order.meals.forEach(m => {
          parts.push(m.tableNumber || '');
          parts.push(m.notes || '');
          ['soup','soupReplacement','principle','protein','drink'].forEach(f => {
            const val = m[f];
            if (val) parts.push(typeof val === 'string' ? val : val.name || '');
          });
          if (Array.isArray(m.sides)) {
            m.sides.forEach(s => { if (s) parts.push(typeof s === 'string' ? s : s.name || ''); });
          }
          if (Array.isArray(m.additions)) {
            m.additions.forEach(a => { if (a) parts.push(typeof a === 'string' ? a : a.name || ''); });
          }
          if (m.paymentMethod) {
            parts.push(normalizePaymentKey(m.paymentMethod.name || m.paymentMethod));
          }
          if (m.address) {
            if (m.address.address) parts.push(m.address.address);
            if (m.address.phone) parts.push(m.address.phone);
          }
        });
      }

      // Desayunos
      if (Array.isArray(order.breakfasts)) {
        order.breakfasts.forEach(b => {
          parts.push(b.tableNumber || '');
            ['type','broth','eggs','riceBread','drink','protein'].forEach(f => {
              const val = b[f];
              if (val) parts.push(typeof val === 'string' ? val : val.name || '');
            });
          if (Array.isArray(b.additions)) {
            b.additions.forEach(a => { if (a) parts.push(typeof a === 'string' ? a : a.name || ''); });
          }
          if (b.notes) parts.push(b.notes);
          if (b.payment || b.paymentMethod) parts.push(normalizePaymentKey((b.payment && b.payment.name) || b.payment || (b.paymentMethod && b.paymentMethod.name) || b.paymentMethod || ''));
          if (b.address) {
            if (b.address.address) parts.push(b.address.address);
            if (b.address.phone) parts.push(b.address.phone);
          }
        });
      }

      const haystack = parts.join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, searchTerm, selectedDate, orderTypeFilter]);

  // ====== Totales usando split de pagos (con fallback legacy) EXCLUYENDO cancelados, SOLO sobre órdenes filtradas ======
  const totals = sumPaymentsByMethod(
    filteredOrders.filter(order => order.status !== 'Cancelada')
  );

  // ===== Ordenamiento simple =====
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const field = sortField === 'orderNumber' ? 'id' : sortField;
    const aValue = field === 'id' ? a.id : a[field] || '';
    const bValue = field === 'id' ? b.id : b[field] || '';
    return sortOrder === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
  });

  const totalPages = Math.ceil(sortedOrders.length / itemsPerPage);
  const paginatedOrders = sortedOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField === field) {
      return sortOrder === 'asc' ? '↑' : '↓';
    }
    return '';
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      setIsLoading(true);
      const order = orders.find((o) => o.id === orderId);
      const collectionName = order.type === 'breakfast' ? 'breakfastOrders' : 'tableOrders';
      const orderRef = doc(db, collectionName, orderId);
      await updateDoc(orderRef, { status: newStatus, updatedAt: new Date() });
      setErrorMessage(null);
    } catch (error) {
      console.error('Error al actualizar estado:', error);
      setErrorMessage('Error al actualizar el estado de la orden. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta orden?')) return;
    try {
      setIsLoading(true);
      const order = orders.find((o) => o.id === orderId);
      const collectionName = order.type === 'breakfast' ? 'breakfastOrders' : 'tableOrders';
      await deleteDoc(doc(db, collectionName, orderId));
      setErrorMessage(null);
    } catch (error) {
      console.error('Error al eliminar orden:', error);
      setErrorMessage('Error al eliminar la orden. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAllOrders = async () => {
    const totalOrders = filteredOrders.length;
    if (totalOrders === 0) {
      setErrorMessage('No hay órdenes para eliminar.');
      return;
    }

    // Mostrar modal de confirmación en lugar de confirm nativo
    setShowDeleteAllModal(true);
  };

  const executeDeleteAllOrders = async () => {
    if (deleteConfirmText.toLowerCase() !== 'confirmar') {
      setErrorMessage('Debes escribir "confirmar" para proceder con la eliminación.');
      return;
    }

    const totalOrders = filteredOrders.length;
    
    try {
      setIsLoading(true);
      setShowDeleteAllModal(false);
      setDeleteConfirmText('');
      
      let deletedCount = 0;
      let errorCount = 0;

      // Eliminar cada orden individualmente
      for (const order of filteredOrders) {
        try {
          const collectionName = order.type === 'breakfast' ? 'breakfastOrders' : 'tableOrders';
          await deleteDoc(doc(db, collectionName, order.id));
          deletedCount++;
        } catch (error) {
          console.error(`Error al eliminar orden ${order.id}:`, error);
          errorCount++;
        }
      }

      if (errorCount === 0) {
        setErrorMessage(`Se eliminaron exitosamente ${deletedCount} órdenes.`);
      } else {
        setErrorMessage(`Se eliminaron ${deletedCount} órdenes. ${errorCount} órdenes no se pudieron eliminar.`);
      }
    } catch (error) {
      console.error('Error al eliminar órdenes:', error);
      setErrorMessage('Error al eliminar las órdenes. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOrder = (order) => {
    setEditingOrder(order);
  };

  // Hidratación para OptionSelector
  const hydratedRef = useRef(null);
  useEffect(() => {
    if (!editingOrder) { hydratedRef.current = null; return; }

    const catalogsLoaded =
      soups.length || principles.length || menuProteins.length || drinks.length || sides.length || additions.length ||
      breakfastTypes.length || breakfastBroths.length || breakfastEggs.length || breakfastRiceBread.length ||
      breakfastDrinks.length || breakfastAdditions.length || breakfastProteins.length || paymentMethods.length;

    if (!catalogsLoaded) return;
    if (hydratedRef.current === editingOrder.id) return;

    // Si es una orden POS (Caja) con items planos, no hidratar a breakfasts/meals
    if (Array.isArray(editingOrder.items) && !Array.isArray(editingOrder.breakfasts) && !Array.isArray(editingOrder.meals)) {
      hydratedRef.current = editingOrder.id;
      return;
    }

    const isBreakfast = Array.isArray(editingOrder.breakfasts);
    const fallbackAddress = editingOrder.address || {};

    if (isBreakfast) {
      const breakfasts = (editingOrder.breakfasts || []).map((b) => ({
        type: byName(breakfastTypes, b.type),
        broth: byName(breakfastBroths, b.broth),
        eggs: byName(breakfastEggs, b.eggs),
        riceBread: byName(breakfastRiceBread, b.riceBread),
        drink: byName(breakfastDrinks, b.drink),
        protein: byName(breakfastProteins, b.protein),
        additions: Array.isArray(b.additions)
          ? b.additions.map((a) => {
              const full = byName(breakfastAdditions, a);
              return full
                ? {
                    id: full.id || a.id || a.name,
                    name: full.name,
                    quantity: typeof a.quantity === 'number' ? a.quantity : 1,
                    price: typeof a.price === 'number' ? a.price : full.price || 0
                  }
                : {
                    id: a.id || a.name,
                    name: a.name,
                    quantity: typeof a.quantity === 'number' ? a.quantity : 1,
                    price: typeof a.price === 'number' ? a.price : 0
                  };
            })
          : [],
        cutlery: !!b.cutlery,
        time: typeof b.time === 'string' ? b.time : b.time?.name || '',
        address: ensureAddress(b.address, fallbackAddress),
        notes: b.notes || '',
        paymentMethod: byName(paymentMethods, b.payment || b.paymentMethod),
        orderType: b.orderType || '',
        tableNumber: b.tableNumber || '',
      }));
      setEditingOrder((prev) => ({ ...prev, type: 'breakfast', breakfasts }));
    } else {
      const meals = (editingOrder.meals || []).map((m) => ({
        soup: byName(soups, m.soup),
        soupReplacement: byName(soupReplacements, m.soupReplacement),
        principle: manyByName(principles, m.principle),
        protein: byName(menuProteins, m.protein),
        drink: byName(drinks, m.drink),
        sides: manyByName(sides, m.sides),
        additions: Array.isArray(m.additions)
          ? m.additions.map((a) => {
              const full = byName(additions, a);
              return full
                ? {
                    id: full.id || a.id || a.name,
                    name: full.name,
                    price: typeof a.price === 'number' ? a.price : full.price || 0,
                    protein: a.protein || '',
                    replacement: a.replacement || '',
                    quantity: typeof a.quantity === 'number' ? a.quantity : 1
                  }
                : {
                    id: a.id || a.name,
                    name: a.name,
                    price: typeof a.price === 'number' ? a.price : 0,
                    protein: a.protein || '',
                    replacement: a.replacement || '',
                    quantity: typeof a.quantity === 'number' ? a.quantity : 1
                  };
            })
          : [],
        cutlery: !!m.cutlery,
        time: typeof m.time === 'string' ? m.time : m.time?.name || '',
        address: ensureAddress(m.address, fallbackAddress),
        notes: m.notes || '',
        paymentMethod: m.paymentMethod ? byName(paymentMethods, m.paymentMethod) : null,
        orderType: m.orderType || '',
        tableNumber: m.tableNumber || '',
      }));
      setEditingOrder((prev) => ({ ...prev, type: 'lunch', meals }));
    }

    hydratedRef.current = editingOrder.id;
  }, [
    editingOrder,
    soups, soupReplacements, principles, menuProteins, drinks, sides, additions, paymentMethods,
    breakfastTypes, breakfastBroths, breakfastEggs, breakfastRiceBread, breakfastDrinks, breakfastAdditions, breakfastProteins
  ]);

  // Recalcular total en vivo
  useEffect(() => {
    if (!editingOrder) return;

    if (Array.isArray(editingOrder.meals)) {
      const newTotal = Number(calculateTotal(editingOrder.meals, 3) || 0);
      if ((editingOrder.total || 0) !== newTotal) {
        setEditingOrder((prev) => ({ ...prev, total: newTotal }));
      }
    } else if (Array.isArray(editingOrder.breakfasts)) {
      const newTotal = Number(calculateTotalBreakfastPrice(editingOrder.breakfasts, role, breakfastTypes) || 0);
      if ((editingOrder.total || 0) !== newTotal) {
        setEditingOrder((prev) => ({ ...prev, total: newTotal }));
      }
    }
  }, [editingOrder?.meals, editingOrder?.breakfasts, role, breakfastTypes]); // eslint-disable-line

  // Ajustar automáticamente el split de pagos si el total cambia
  useEffect(() => {
    if (!editingOrder || typeof editingOrder !== 'object' || editingOrder === null) return;
    if (!Array.isArray(editingOrder.payments) || !editingOrder.payments.length) return;
    if (typeof editingOrder.total !== 'number') return;
    const sum = editingOrder.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const diff = (Number(editingOrder.total) || 0) - sum;
    if (diff !== 0) {
      setEditingOrder((prev) => {
        if (!prev || typeof prev !== 'object' || prev === null) return prev;
        if (!Array.isArray(prev.payments) || !prev.payments.length) return prev;
        if (typeof prev.total !== 'number') return prev;
        const newPayments = prev.payments.map((p, i) =>
          i === prev.payments.length - 1
            ? { ...p, amount: (Number(p.amount) || 0) + diff }
            : p
        );
        return { ...prev, payments: newPayments };
      });
    }
  }, [editingOrder && editingOrder.total]);

  // Recalcular total automáticamente para órdenes POS (items) al editar cantidades
  useEffect(() => {
    if (!editingOrder || !Array.isArray(editingOrder.items)) return;
    const total = editingOrder.items.reduce((s, it) => s + (Number(it.unitPrice || it.price || 0) * Number(it.quantity || 0)), 0);
    if ((editingOrder.total || 0) !== total) {
      setEditingOrder(prev => ({ ...prev, total }));
    }
  }, [editingOrder && JSON.stringify(editingOrder.items)]); // depende de items

  const setMealField = (i, key, value) => {
    setEditingOrder((prev) => {
      const list = [...(prev.meals || [])];
      const row = { ...(list[i] || {}) };

      if (key === 'soup') {
        row.soup = value || null;
        row.soupReplacement = null;
      } else if (key === 'soupReplacement') {
        row.soupReplacement = value || null;
        row.soup = null;
      } else if (key.includes('.')) {
        const [p, c] = key.split('.');
        row[p] = { ...(row[p] || {}), [c]: value };
      } else {
        row[key] = value;
      }

      list[i] = row;
      return { ...prev, meals: list };
    });
  };

  const setBreakfastField = (i, key, value) => {
    setEditingOrder((prev) => {
      const list = [...(prev.breakfasts || [])];
      const row = { ...(list[i] || {}) };
      if (key.includes('.')) {
        const [p, c] = key.split('.');
        row[p] = { ...(row[p] || {}), [c]: value };
      } else {
        row[key] = value;
      }
      list[i] = row;
      return { ...prev, breakfasts: list };
    });
  };

  const setEditingTotal = (value) => {
    setEditingOrder((prev) => ({ ...prev, total: Number(value) || 0 }));
  };

  const handleSaveEdit = async () => {
    try {
      setIsLoading(true);
  const isPOS = Array.isArray(editingOrder.items) && !Array.isArray(editingOrder.breakfasts) && !Array.isArray(editingOrder.meals);
  const isBreakfast = !isPOS && Array.isArray(editingOrder.breakfasts);
  const collectionName = editingOrder.__collection || (isBreakfast ? 'breakfastOrders' : 'tableOrders');
      const orderRef = doc(db, collectionName, editingOrder.id);

      // Recalcular total actualizado
      const newTotal = isPOS
        ? Number((editingOrder.items || []).reduce((s, it) => s + (Number(it.unitPrice || it.price || 0) * Number(it.quantity || 0)), 0))
        : isBreakfast
          ? Number(calculateTotalBreakfastPrice(editingOrder.breakfasts, role, breakfastTypes) || 0)
          : Number(calculateTotal(editingOrder.meals, role) || 0);

      // --- Split de pagos sincronizado ---
      let payments = Array.isArray(editingOrder.payments) && editingOrder.payments.length
        ? editingOrder.payments.map((p) => ({
            method: (typeof p.method === 'string' ? p.method : p?.method?.name || ''),
            amount: Math.floor(Number(p.amount || 0)) || 0,
            note: p.note || '',
          }))
        : defaultPaymentsForOrder({ ...editingOrder, total: newTotal });

      // Si el split existe pero el total cambió, reescalar proporcionalmente
      const sumPagos = payments.reduce((a, b) => a + (b.amount || 0), 0);
      if (sumPagos !== newTotal) {
        // Reescalar proporcionalmente
        payments = payments.map((p) => ({
          ...p,
          amount: Math.round((Number(p.amount) || 0) * (newTotal / (sumPagos || 1)))
        }));
        // Ajuste por redondeo
        const diff = newTotal - payments.reduce((a, b) => a + (b.amount || 0), 0);
        if (diff !== 0 && payments.length) {
          payments[0].amount += diff;
        }
      }
      // --- Fin split pagos ---

      // Determinar el método de pago principal (mayor monto)
      let mainMethod = '';
      if (payments.length) {
        const max = payments.reduce((a, b) => (b.amount > a.amount ? b : a), payments[0]);
        mainMethod = max.method;
      }

      let payload;
      if (isPOS) {
        // Mantener estructura POS
        const items = (editingOrder.items || []).map(ci => ({
          id: ci.id || ci.refId,
          name: ci.name,
          unitPrice: Number(ci.unitPrice || ci.price || 0),
          quantity: Number(ci.quantity || 0),
          type: ci.type || null,
          category: ci.category || null,
        }));
        payload = {
          items,
          total: newTotal,
          paymentAmount: newTotal,
          payments,
          updatedAt: new Date(),
        };
        // preservar normalizados si existen
        if (editingOrder.orderTypeNormalized) payload.orderTypeNormalized = editingOrder.orderTypeNormalized;
        if (editingOrder.serviceType) payload.serviceType = editingOrder.serviceType;
        if (editingOrder.tableNumber) payload.tableNumber = editingOrder.tableNumber;
        if (editingOrder.takeaway) payload.takeaway = true;
        if (editingOrder.paymentMethod) payload.paymentMethod = editingOrder.paymentMethod;
        if (typeof editingOrder.cashReceived !== 'undefined') payload.cashReceived = editingOrder.cashReceived;
        if (typeof editingOrder.changeGiven !== 'undefined') payload.changeGiven = editingOrder.changeGiven;
      } else if (isBreakfast) {
        // Actualizar paymentMethod y payment en cada desayuno
        const updatedBreakfasts = editingOrder.breakfasts.map(b => ({
          ...b,
          paymentMethod: mainMethod ? { name: mainMethod } : null,
          payment: mainMethod ? { name: mainMethod } : null,
        }));
        payload = { breakfasts: updatedBreakfasts };
      } else {
        // Actualizar paymentMethod y payment en cada meal
        const updatedMeals = editingOrder.meals.map(m => ({
          ...m,
          paymentMethod: mainMethod ? { name: mainMethod } : null,
          payment: mainMethod ? { name: mainMethod } : null,
        }));
        payload = { meals: updatedMeals };
      }

      await updateDoc(orderRef, {
        ...payload,
        payments,
        total: newTotal,
        updatedAt: new Date(),
      });

      setEditingOrder(null);
      setErrorMessage(null);
    } catch (error) {
      console.error('Error al guardar edición:', error);
      setErrorMessage('Error al guardar los cambios. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  // =====================
  // Catálogo POS para edición de órdenes creadas en Caja
  // =====================
  const [posItems, setPosItems] = useState([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'posItems'), (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setPosItems(docs);
    });
    return () => unsub && unsub();
  }, []);

  const activePosItems = useMemo(() => posItems.filter(i => i.active !== false), [posItems]);
  const posCategories = useMemo(() => {
    const s = new Set();
    activePosItems.forEach(i => { if (i.category) s.add(i.category); });
    return Array.from(s).sort();
  }, [activePosItems]);
  const [posCategoryFilter, setPosCategoryFilter] = useState('');
  const filteredPosItems = useMemo(() => posCategoryFilter ? activePosItems.filter(i => i.category === posCategoryFilter) : activePosItems, [activePosItems, posCategoryFilter]);
  const groupedPosItems = useMemo(() => {
    const map = new Map();
    filteredPosItems.forEach(it => { const k = it.category || ''; if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
    return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
  }, [filteredPosItems]);

  // ===== Exportaciones =====
  const exportToExcel = () => {
    const data = filteredOrders.map((order) => {
      const paymentText = (Array.isArray(order.payments) && order.payments.length)
        ? summarizePayments(order.payments)
        : getOrderPaymentText(order);

      return {
        'Nº Orden': order.id.slice(0, 8),
        'Tipo': order.type === 'breakfast' ? 'Desayuno' : 'Almuerzo',
        'Mesa': formatValue(order.meals?.[0]?.tableNumber || order.breakfasts?.[0]?.tableNumber),
        'Estado': order.status,
        'Total': `$${order.total?.toLocaleString('es-CO') || 'N/A'}`,
        'Método de Pago': paymentText,
        'Detalles':
          order.type === 'lunch'
            ? order.meals
                .map((meal, index) =>
                  (() => { const sel = Array.isArray(meal.sides)? meal.sides.map(s=>s?.name).filter(Boolean):[]; const hasNone=sel.includes('Ninguno'); const all=allSides.map(s=>s.name).filter(n=>n && n!=='Ninguno' && n!=='Todo incluído' && n!=='Todo incluido'); const missing=!hasNone && sel.length>0? all.filter(n=>!sel.includes(n)):[]; return `Almuerzo #${index + 1}: Sopa: ${formatValue(meal.soup || meal.soupReplacement)}, Principio: ${formatValue(meal.principle)}, Proteína: ${formatValue(meal.protein)}, Bebida: ${formatValue(meal.drink)}, Acompañamientos: ${formatValue(meal.sides)}${missing.length? ' | No Incluir: '+missing.join(', '):''}, Notas: ${meal.notes || 'Ninguna'}` })()
                )
                .join('; ')
            : order.breakfasts
                .map((breakfast, index) =>
                  `Desayuno #${index + 1}: Tipo: ${formatValue(breakfast.type)}, Caldo: ${formatValue(breakfast.broth)}, Huevos: ${formatValue(breakfast.eggs)}, Arroz/Pan: ${formatValue(breakfast.riceBread)}, Bebida: ${formatValue(breakfast.drink)}, Proteína: ${formatValue(breakfast.protein)}, Adiciones: ${formatValue(breakfast.additions)}, Notas: ${breakfast.notes || 'Ninguna'}`
                )
                .join('; '),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Órdenes');
    XLSX.writeFile(workbook, `ordenes_${orderTypeFilter}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.xlsx`);
  };

  const exportToPDF = () => {
    const docx = new jsPDF();
    docx.text('Órdenes', 14, 10);
    docx.autoTable({
  // Columnas ajustadas: se eliminan Dirección y Teléfono según nuevo requerimiento
  head: [['Nº Orden', 'Tipo', 'Mesa', 'Estado', 'Total', 'Método de Pago', 'Detalles']],
      body: filteredOrders.map((order) => {
        const paymentText = (Array.isArray(order.payments) && order.payments.length)
          ? summarizePayments(order.payments)
          : getOrderPaymentText(order);

        return [
          order.id.slice(0, 8),
          order.type === 'breakfast' ? 'Desayuno' : 'Almuerzo',
          formatValue(order.meals?.[0]?.tableNumber || order.breakfasts?.[0]?.tableNumber),
          order.status,
          `$${order.total?.toLocaleString('es-CO') || 'N/A'}`,
          paymentText,
          order.type === 'lunch'
            ? order.meals
                .map((meal, index) =>
                  (() => { const sel = Array.isArray(meal.sides)? meal.sides.map(s=>s?.name).filter(Boolean):[]; const hasNone=sel.includes('Ninguno'); const all=allSides.map(s=>s.name).filter(n=>n && n!=='Ninguno' && n!=='Todo incluído' && n!=='Todo incluido'); const missing=!hasNone && sel.length>0? all.filter(n=>!sel.includes(n)):[]; return `Almuerzo #${index + 1}: Sopa: ${formatValue(meal.soup || meal.soupReplacement)}, Principio: ${formatValue(meal.principle)}, Proteína: ${formatValue(meal.protein)}, Bebida: ${formatValue(meal.drink)}, Acompañamientos: ${formatValue(meal.sides)}${missing.length? ' | No Incluir: '+missing.join(', '):''}` })()
                )
                .join('; ')
            : order.breakfasts
                .map((breakfast, index) =>
                  `Desayuno #${index + 1}: Tipo: ${formatValue(breakfast.type)}, Caldo: ${formatValue(breakfast.broth)}, Huevos: ${formatValue(breakfast.eggs)}, Arroz/Pan: ${formatValue(breakfast.riceBread)}, Bebida: ${formatValue(breakfast.drink)}, Proteína: ${formatValue(breakfast.protein)}, Adiciones: ${formatValue(breakfast.additions)}`
                )
                .join('; '),
        ];
      }),
    });
    docx.save(`ordenes_${orderTypeFilter}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.pdf`);
  };

  const exportToCSV = () => {
    const rows = [
  // Encabezados CSV ajustados (sin Dirección ni Teléfono)
  ['Nº Orden', 'Tipo', 'Mesa', 'Estado', 'Total', 'Método de Pago', 'Detalles'],
      ...filteredOrders.map((order) => {
        const paymentText = (Array.isArray(order.payments) && order.payments.length)
          ? summarizePayments(order.payments)
          : getOrderPaymentText(order);

        return [
          order.id.slice(0, 8),
          order.type === 'breakfast' ? 'Desayuno' : 'Almuerzo',
          formatValue(order.meals?.[0]?.tableNumber || order.breakfasts?.[0]?.tableNumber),
          order.status,
          `$${order.total?.toLocaleString('es-CO') || 'N/A'}`,
          paymentText,
          `${
            order.type === 'lunch'
              ? order.meals
                  .map((meal, index) =>
                    (() => { const sel = Array.isArray(meal.sides)? meal.sides.map(s=>s?.name).filter(Boolean):[]; const hasNone=sel.includes('Ninguno'); const all=allSides.map(s=>s.name).filter(n=>n && n!=='Ninguno' && n!=='Todo incluído' && n!=='Todo incluido'); const missing=!hasNone && sel.length>0? all.filter(n=>!sel.includes(n)):[]; return `Almuerzo #${index + 1}: Sopa: ${formatValue(meal.soup || meal.soupReplacement)}, Principio: ${formatValue(meal.principle)}, Proteína: ${formatValue(meal.protein)}, Bebida: ${formatValue(meal.drink)}, Acompañamientos: ${formatValue(meal.sides)}${missing.length? ' | No Incluir: '+missing.join(', '):''}, Notas: ${meal.notes || 'Ninguna'}` })()
                  )
                  .join('; ')
              : order.breakfasts
                  .map((breakfast, index) =>
                    `Desayuno #${index + 1}: Tipo: ${formatValue(breakfast.type)}, Caldo: ${formatValue(breakfast.broth)}, Huevos: ${formatValue(breakfast.eggs)}, Arroz/Pan: ${formatValue(breakfast.riceBread)}, Bebida: ${formatValue(breakfast.drink)}, Proteína: ${formatValue(breakfast.protein)}, Adiciones: ${formatValue(breakfast.additions)}, Notas: ${breakfast.notes || 'Ninguna'}`
                  )
                  .join('; ')
          }`,
        ];
      }),
    ];
    const csvContent = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ordenes_${orderTypeFilter}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;
    link.click();
  };

  const handleExport = (exportFunc) => {
    exportFunc();
    setErrorMessage(null);
  };

  useEffect(() => {
    if (!selectedDate) return;

    const searchDate = new Date(selectedDate + 'T00:00:00');
    const filtered = orders.filter(order => {
      const orderDate = order.createdAt ? new Date(order.createdAt) : null;
      return orderDate && orderDate.toDateString() === searchDate.toDateString();
    });
  }, [selectedDate, orders]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">Cargando...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">Gestión de pedidos Mesas</h2>

      {/* Totals Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-sm text-gray-700 dark:text-gray-300">
        <div className={classNames("p-3 sm:p-4 rounded-lg shadow-sm", theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
          <p className="font-semibold text-sm sm:text-base">Total Efectivo</p>
          <p className="text-lg sm:text-xl font-bold">${Math.floor(totals.cash).toLocaleString('es-CO')}</p>
        </div>
        <div className={classNames("p-3 sm:p-4 rounded-lg shadow-sm", theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
          <p className="font-semibold text-sm sm:text-base">Total Daviplata</p>
          <p className="text-lg sm:text-xl font-bold">${Math.floor(totals.daviplata).toLocaleString('es-CO')}</p>
        </div>
        <div className={classNames("p-3 sm:p-4 rounded-lg shadow-sm", theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
          <p className="font-semibold text-sm sm:text-base">Total Nequi</p>
          <p className="text-lg sm:text-xl font-bold">${Math.floor(totals.nequi).toLocaleString('es-CO')}</p>
        </div>
        <div className={classNames("p-3 sm:p-4 rounded-lg shadow-sm", theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
          <p className="font-semibold text-sm sm:text-base">Total General</p>
          <p className="text-lg sm:text-xl font-bold">${Math.floor(totals.cash + totals.daviplata + totals.nequi).toLocaleString('es-CO')}</p>
        </div>
      </div>

      {/* Search and Menu */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-3 sm:gap-4">
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cualquier dato: ID, mesa, tipo, pago, notas, ingredientes, dirección, teléfono..."
            className={classNames(
              "p-2 sm:p-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 w-full shadow-sm text-sm sm:text-base transition-all duration-200",
              theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
            )}
          />
        </div>
        <label
          className={classNames(
            'relative flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold shadow-sm border transition-colors duration-200 flex-shrink-0 cursor-pointer',
            theme === 'dark' ? 'bg-gray-700 text-white border-gray-500' : 'bg-gray-200 text-gray-900 border-gray-400'
          )}
          style={{ position: 'relative', marginLeft: 'auto' }}
          onClick={(e) => {
            const input = e.currentTarget.querySelector('input[type=date]');
            if (input) input.showPicker();
          }}
        >
          {selectedDate
            ? new Date(selectedDate.replace(/-/g, '/')).toLocaleDateString('es-CO', {
                weekday: 'long', month: 'long', day: 'numeric'
              })
            : new Date().toLocaleDateString('es-CO', {
                weekday: 'long', month: 'long', day: 'numeric'
              })}
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-transparent"
          />
        </label>
        <div className="relative z-50 flex-shrink-0" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={classNames(
              "flex items-center justify-center p-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200",
              'focus:outline-none focus:ring-2 focus:ring-blue-500'
            )}
            aria-label="Opciones de menú"
          >
            <EllipsisVerticalIcon
              className={classNames(
                "w-6 h-6",
                theme === 'dark' ? 'text-gray-200 hover:text-white' : 'text-gray-700 hover:text-gray-900'
              )}
            />
          </button>
          {isMenuOpen && (
            <div
              className={classNames(
                "absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50",
                theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-900'
              )}
            >
              <div className="py-1">
                <button onClick={() => { setOrderTypeFilter('breakfast'); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">
                  Ver Desayunos
                </button>
                <button onClick={() => { setOrderTypeFilter('lunch'); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">
                  Ver Almuerzos
                </button>
                <button onClick={() => { setOrderTypeFilter('all'); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">
                  Ver Todos
                </button>
                <button onClick={() => { handleExport(exportToExcel); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  Exportar Excel
                </button>
                <button onClick={() => { handleExport(exportToPDF); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  Exportar PDF
                </button>
                <button onClick={() => { handleExport(exportToCSV); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                  <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                  Exportar CSV
                </button>
                <button onClick={() => { handleDeleteAllOrders(); setIsMenuOpen(false); }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-red-100 dark:hover:bg-red-600 transition-all duration-200 flex items-center text-red-600 dark:text-red-400">
                  <TrashIcon className="w-4 h-4 mr-2" />
                  Eliminar Todos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className={classNames(
        "p-3 sm:p-4 rounded-2xl shadow-xl max-h-[70vh] overflow-y-auto custom-scrollbar transition-all duration-300",
        theme === 'dark' ? 'bg-gray-800' : 'bg-white'
      )}>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left border-collapse text-sm">
                <thead>
                  <tr className={classNames(
                    "font-semibold sticky top-0 z-10 shadow-sm",
                    theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'
                  )}>
                    <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('orderNumber')}>
                      Nº {getSortIcon('orderNumber')}
                    </th>
                    <th className="p-2 sm:p-3 border-b whitespace-nowrap">Detalles</th>
                    <th className="p-2 sm:p-3 border-b whitespace-nowrap">Tipo</th>
                    {/* Columnas Dirección y Teléfono ocultas por requerimiento */}
                    <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('meals.0.tableNumber')}>
                      Mesa {getSortIcon('meals.0.tableNumber')}
                    </th>
                    <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('meals.0.paymentMethod.name')}>
                      Pago {getSortIcon('meals.0.paymentMethod.name')}
                    </th>
                    <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('total')}>
                      Total {getSortIcon('total')}
                    </th>
                    <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('status')}>
                      Estado {getSortIcon('status')}
                    </th>
                    <th className="p-2 sm:p-3 border-b whitespace-nowrap">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-6 text-center text-gray-500 dark:text-gray-400">
                        No se encontraron órdenes de mesas. Intenta ajustar tu búsqueda.
                      </td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order, index) => {
                      const displayNumber =
                        sortOrder === 'asc'
                          ? (currentPage - 1) * itemsPerPage + index + 1
                          : paginatedOrders.length - ((currentPage - 1) * itemsPerPage + index);

                  const paymentDisplay = paymentMethodsOnly(order);

                      const statusClass =
                        order.status === 'Pendiente'
                          ? 'bg-yellow-500 text-black'
                          : order.status === 'Preparando'
                          ? 'bg-blue-500 text-white'
                          : order.status === 'Completada'
                          ? 'bg-green-500 text-white'
                          : order.status === 'Cancelada'
                          ? 'bg-red-500 text-white'
                          : '';

                      return (
                        <tr
                          key={order.id}
                          className={classNames(
                            "border-b transition-colors.duration-150",
                            theme === 'dark' ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50',
                            index % 2 === 0 ? (theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50') : ''
                          )}
                        >
                          <td className="p-2 sm:p-3 text-gray-300">{displayNumber}</td>
                          <td className="p-2 sm:p-3 text-gray-300">
                            <button
                              onClick={() => {
                                // Hidratar la orden para mostrar en el modal
                                const hydratedOrder = { ...order };
                                
                                if (Array.isArray(order.breakfasts)) {
                                  // Determinar método principal del split de pagos
                                  let mainMethod = '';
                                  if (Array.isArray(order.payments) && order.payments.length) {
                                    const max = order.payments.reduce((a, b) => (b.amount > a.amount ? b : a), order.payments[0]);
                                    mainMethod = max.method;
                                  }
                                  hydratedOrder.breakfasts = order.breakfasts.map((b) => ({
                                    ...b,
                                    orderType: 'table', // Forzar orderType='table' para el cálculo correcto de precio
                                    type: byName(breakfastTypes, b.type),
                                    broth: byName(breakfastBroths, b.broth),
                                    eggs: byName(breakfastEggs, b.eggs),
                                    riceBread: byName(breakfastRiceBread, b.riceBread),
                                    drink: byName(breakfastDrinks, b.drink),
                                    protein: byName(breakfastProteins, b.protein),
                                    additions: Array.isArray(b.additions)
                                      ? b.additions
                                          .map((a) => {
                                            const full = byName(breakfastAdditions, a);
                                            const result = full ? { ...full, quantity: a.quantity || 1, price: full.price ?? a.price ?? 0 } : null;
                                            console.log('Modal Addition mapping:', { original: a, found: full, result });
                                            return result;
                                          })
                                          .filter(Boolean)
                                      : [],
                                    time: typeof b.time === 'string' ? b.time : b.time?.name || '',
                                    paymentMethod: mainMethod ? { name: mainMethod } : byName(paymentMethods, b.payment || b.paymentMethod),
                                    payment: mainMethod ? { name: mainMethod } : byName(paymentMethods, b.payment || b.paymentMethod),
                                  }));
                                  hydratedOrder.type = 'breakfast';
                                } else if (Array.isArray(order.meals)) {
                                  // Determinar método principal del split de pagos
                                  let mainMethod = '';
                                  if (Array.isArray(order.payments) && order.payments.length) {
                                    const max = order.payments.reduce((a, b) => (b.amount > a.amount ? b : a), order.payments[0]);
                                    mainMethod = max.method;
                                  }
                                  hydratedOrder.meals = order.meals.map((m) => ({
                                    ...m,
                                    soup: byName(soups, m.soup),
                                    soupReplacement: byName(soupReplacements, m.soupReplacement),
                                    principle: manyByName(principles, m.principle),
                                    protein: byName(menuProteins, m.protein),
                                    drink: byName(drinks, m.drink),
                                    sides: manyByName(sides, m.sides),
                                    additions: Array.isArray(m.additions)
                                      ? m.additions
                                          .map((a) => {
                                            const full = byName(additions, a);
                                            return full ? { ...full, quantity: a.quantity || 1, price: a.price ?? full.price ?? 0 } : null;
                                          })
                                          .filter(Boolean)
                                      : [],
                                    time: typeof m.time === 'string' ? m.time : m.time?.name || '',
                                    paymentMethod: mainMethod ? { name: mainMethod } : byName(paymentMethods, m.payment || m.paymentMethod),
                                  }));
                                  hydratedOrder.type = 'meal';
                                }
                                
                                console.log('Showing hydrated order in modal:', hydratedOrder);
                                setShowMealDetails(hydratedOrder);
                              }}
                              className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm flex items-center"
                              title="Ver detalles de la orden"
                            >
                              <InformationCircleIcon className="w-4 h-4 mr-1" />
                              Ver
                            </button>
                          </td>
                          <td className="p-2 sm:p-3 text-gray-300 font-medium">
                            {order.type === 'breakfast' ? 'Desayuno' : 'Almuerzo'}
                          </td>
                          <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">
                            {formatValue(order.tableNumber || order.meals?.[0]?.tableNumber || order.breakfasts?.[0]?.tableNumber)}
                          </td>
                          <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">{paymentDisplay}</td>
                          <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">
                            ${order.total?.toLocaleString('es-CO') || 'N/A'}
                          </td>
                          <td className="p-2 sm:p-3 whitespace-nowrap">
                            <select
                              value={order.status || 'Pendiente'}
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              className={classNames(
                                "px-2 py-1 rounded-full text-xs font-semibold appearance-none cursor-pointer",
                                statusClass,
                                theme === 'dark' ? 'bg-opacity-70' : 'bg-opacity-90',
                                "focus:outline-none focus:ring-2 focus:ring-blue-500"
                              )}
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="Preparando">Preparando</option>
                              <option value="Completada">Completada</option>
                              <option value="Cancelada">Cancelada</option>
                            </select>
                          </td>
                          <td className="p-2 sm:p-3 whitespace-nowrap flex gap-1">
                            <button
                              onClick={() => handleEditOrder(order)}
                              className="text-blue-500 hover:text-blue-400 transition-colors duration-150 p-1 rounded-md mr-2"
                              title="Editar orden"
                              aria-label={`Editar orden ${displayNumber}`}
                            >
                              <PencilIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteOrder(order.id)}
                              className="text-red-500 hover:text-red-400 transition-colors duration-150 p-1 rounded-md mr-2"
                              title="Eliminar orden"
                              aria-label={`Eliminar orden ${displayNumber}`}
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handlePrintReceipt(order)}
                              className="text-green-600 hover:text-green-500 transition-colors duration-150 p-1 rounded-md border border-green-600"
                              title="Imprimir recibo"
                              aria-label={`Imprimir recibo orden ${displayNumber}`}
                            >
                              <PrinterIcon className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap justify-between items-center mt-6 gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <span>Órdenes por página:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className={classNames(
                    "p-2 rounded-md border text-sm",
                    theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900'
                  )}
                >
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                </select>
              </div>
              <div className="flex.items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={classNames(
                    "p-2 rounded-md transition-colors duration-200",
                    currentPage === 1
                      ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                      : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
                  )}
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span>Página {currentPage} de {totalPages}</span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={classNames(
                    "p-2 rounded-md transition-colors duration-200",
                    currentPage === totalPages
                      ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                      : theme === 'dark' ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
                  )}
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Meal Details Modal */}
            {showMealDetails && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] modal-backdrop">
                <div className={classNames(
                    "p-4 sm:p-6 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto",
                    theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
                  )}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">
                      {showMealDetails.type === 'breakfast' ? 'Desayuno' : 'Almuerzo'} #{
                        // Calcular el número secuencial basado en el tipo de orden
                        showMealDetails.type === 'breakfast' 
                          ? orders.filter(o => o.type === 'breakfast').findIndex(o => o.id === showMealDetails.id) + 1
                          : orders.filter(o => o.type === 'lunch').findIndex(o => o.id === showMealDetails.id) + 1
                      } - Mesa {formatValue(showMealDetails.tableNumber || showMealDetails.meals?.[0]?.tableNumber || showMealDetails.breakfasts?.[0]?.tableNumber)} - #{showMealDetails.id.slice(-4)}
                    </h3>
                    <div className="relative">
                      <span className="text-gray-600">⋮</span>
                    </div>
                  </div>
                  
                  {/* Usar los mismos componentes que el WaiterDashboard */}
                  <div className="bg-white rounded-lg p-4">
                    {showMealDetails.type === 'breakfast' ? (
                      Array.isArray(showMealDetails.breakfasts) && showMealDetails.breakfasts.length ? (
                        <BreakfastOrderSummary
                          items={showMealDetails.breakfasts}
                          user={{ role: 3 }}
                          breakfastTypes={breakfastTypes}
                          isWaiterView={true}
                          statusClass={''}
                          showSaveButton={false}
                        />
                      ) : (
                        // Fallback para órdenes de desayuno creadas desde Caja POS (sin estructura breakfasts)
                        (() => {
                          const order = showMealDetails || {};
                          const kind = (order.orderTypeNormalized?.split('_')[0] || order.orderType || 'desayuno').toLowerCase();
                          const svc = (order.orderTypeNormalized?.split('_')[1] || order.serviceType || (order.tableNumber ? 'mesa' : (order.takeaway ? 'llevar' : ''))).toLowerCase();
                          const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
                          const tipoLabel = `${cap(kind)} ${svc ? cap(svc) : ''}`.trim();
                          const fecha = (() => {
                            try { return order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt) } catch(_) { return new Date(); }
                          })();
                          const items = Array.isArray(order.items) ? order.items : [];
                          const fmt = (v) => (Number(v)||0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
                          const payName = (() => {
                            const raw = (typeof order.paymentMethod === 'string' ? order.paymentMethod : order.paymentMethod?.name || '').toLowerCase();
                            if (raw.includes('efect')) return 'Efectivo';
                            if (raw.includes('nequi')) return 'Nequi';
                            if (raw.includes('davi')) return 'Daviplata';
                            return order.paymentMethod?.name || order.paymentMethod || '';
                          })();
                          return (
                            <div className={classNames('rounded-lg border p-4', theme==='dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-gray-50 border-gray-200 text-gray-900')}>
                              <div className="text-sm">Tipo: <strong>{tipoLabel}</strong></div>
                              {order.tableNumber ? <div className="text-sm">Mesa: <strong>{order.tableNumber}</strong></div> : null}
                              <div className="text-sm">Fecha: {fecha.toLocaleString('es-CO')}</div>
                              {order.paymentNote ? <div className="text-sm">Nota: {order.paymentNote}</div> : null}
                              <hr className={theme==='dark' ? 'border-gray-700 my-2' : 'border-gray-200 my-2'} />
                              <div className="font-semibold mb-1">Items:</div>
                              <div className="space-y-1">
                                {items.map((it, idx) => {
                                  const qty = Number(it.quantity||0);
                                  const unit = Number(it.unitPrice||0);
                                  const lineTotal = qty * unit;
                                  return (
                                    <div key={idx} className="flex items-center justify-between gap-2">
                                      <div>
                                        <div className="font-medium">{it.name}</div>
                                        <div className="text-xs opacity-80">{qty}x {fmt(unit)}</div>
                                      </div>
                                      <div className="text-sm font-semibold">{fmt(lineTotal)}</div>
                                    </div>
                                  );
                                })}
                                {items.length === 0 && <div className="text-sm opacity-70">Sin items</div>}
                              </div>
                              <hr className={theme==='dark' ? 'border-gray-700 my-2' : 'border-gray-200 my-2'} />
                              <div className="text-sm">Total: <strong>{fmt(order.total)}</strong></div>
                              <div className="text-sm">Pago: <strong>{payName}</strong></div>
                              {typeof order.cashReceived !== 'undefined' && <div className="text-sm">Recibido: <strong>{fmt(order.cashReceived)}</strong></div>}
                              {typeof order.changeGiven !== 'undefined' && <div className="text-sm">Vueltos: <strong>{fmt(order.changeGiven)}</strong></div>}
                            </div>
                          );
                        })()
                      )
                    ) : (
                      (() => {
                        const order = showMealDetails || {};
                        const isPOS = Array.isArray(order.items) && !Array.isArray(order.meals);
                        if (isPOS) {
                          const kind = (order.orderTypeNormalized?.split('_')[0] || order.orderType || 'almuerzo').toLowerCase();
                          const svc = (order.orderTypeNormalized?.split('_')[1] || order.serviceType || (order.tableNumber ? 'mesa' : (order.takeaway ? 'llevar' : ''))).toLowerCase();
                          const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
                          const tipoLabel = `${cap(kind)} ${svc ? cap(svc) : ''}`.trim();
                          const fecha = (() => {
                            try { return order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.createdAt) } catch(_) { return new Date(); }
                          })();
                          const items = Array.isArray(order.items) ? order.items : [];
                          const fmt = (v) => (Number(v)||0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
                          const payName = (() => {
                            const raw = (typeof order.paymentMethod === 'string' ? order.paymentMethod : order.paymentMethod?.name || '').toLowerCase();
                            if (raw.includes('efect')) return 'Efectivo';
                            if (raw.includes('nequi')) return 'Nequi';
                            if (raw.includes('davi')) return 'Daviplata';
                            return order.paymentMethod?.name || order.paymentMethod || '';
                          })();
                          return (
                            <div className={classNames('rounded-lg border p-4', theme==='dark' ? 'bg-gray-900 border-gray-700 text-gray-100' : 'bg-gray-50 border-gray-200 text-gray-900')}>
                              <div className="text-sm">Tipo: <strong>{tipoLabel}</strong></div>
                              {order.tableNumber ? <div className="text-sm">Mesa: <strong>{order.tableNumber}</strong></div> : null}
                              <div className="text-sm">Fecha: {fecha.toLocaleString('es-CO')}</div>
                              {order.paymentNote ? <div className="text-sm">Nota: {order.paymentNote}</div> : null}
                              <hr className={theme==='dark' ? 'border-gray-700 my-2' : 'border-gray-200 my-2'} />
                              <div className="font-semibold mb-1">Items:</div>
                              <div className="space-y-1">
                                {items.map((it, idx) => (
                                  <div key={idx}>
                                    <div className="font-medium">{it.name}</div>
                                    <div className="text-xs opacity-80">{it.quantity}x {fmt(it.unitPrice)}</div>
                                  </div>
                                ))}
                                {items.length === 0 && <div className="text-sm opacity-70">Sin items</div>}
                              </div>
                              <hr className={theme==='dark' ? 'border-gray-700 my-2' : 'border-gray-200 my-2'} />
                              <div className="text-sm">Total: <strong>{fmt(order.total)}</strong></div>
                              <div className="text-sm">Pago: <strong>{payName}</strong></div>
                              {typeof order.cashReceived !== 'undefined' && <div className="text-sm">Recibido: <strong>{fmt(order.cashReceived)}</strong></div>}
                              {typeof order.changeGiven !== 'undefined' && <div className="text-sm">Vueltos: <strong>{fmt(order.changeGiven)}</strong></div>}
                            </div>
                          );
                        }
                        // Si no es POS, usar el resumen clásico de almuerzos
                        const rawMeals = Array.isArray(order.meals) ? order.meals : [];
                        const normalizedMeals = rawMeals.map(m => {
                          const principleRaw = Array.isArray(m.principle) ? m.principle : [];
                          // Detect placeholder inside principle to derive replacement
                          let derivedReplacement = null;
                          if (Array.isArray(m.principle)) {
                            const placeholder = m.principle.find(p => {
                              const n = typeof p === 'string' ? p : p?.name;
                              return n && n.toLowerCase().includes('remplazo por principio');
                            });
                            if (placeholder) {
                              let candidate = '';
                              if (typeof placeholder === 'object') {
                                let rawCandidate = placeholder.replacement || placeholder.selectedReplacement || placeholder.value || '';
                                if (rawCandidate && typeof rawCandidate === 'object') {
                                  rawCandidate = rawCandidate.name || '';
                                }
                                candidate = rawCandidate;
                                if (!candidate && typeof placeholder.name === 'string') {
                                  const match = placeholder.name.match(/remplazo por principio\s*\(([^)]+)\)/i);
                                  if (match && match[1]) candidate = match[1];
                                }
                              } else if (typeof placeholder === 'string') {
                                const match = placeholder.match(/remplazo por principio\s*\(([^)]+)\)/i);
                                if (match && match[1]) candidate = match[1];
                              }
                              if (candidate && typeof candidate === 'string' && candidate.trim()) {
                                derivedReplacement = { name: candidate.trim() };
                              }
                            }
                          }
                          // Prefer existing principleReplacement if valid
                          const finalPrincipleReplacement = (() => {
                            if (m.principleReplacement && typeof m.principleReplacement === 'object' && m.principleReplacement.name) return { name: m.principleReplacement.name };
                            if (typeof m.principleReplacement === 'string' && m.principleReplacement.trim()) return { name: m.principleReplacement.trim() };
                            if (derivedReplacement) return derivedReplacement;
                            return null;
                          })();
                          // Filter out placeholder from principle list
                          const cleanedPrinciple = Array.isArray(m.principle)
                            ? m.principle.filter(p => {
                                const n = typeof p === 'string' ? p : p?.name;
                                return !(n && n.toLowerCase().includes('remplazo por principio'));
                              }).map(p => (typeof p === 'string' ? { name: p } : p))
                            : [];
                          try {
                            console.log('[TABLE MODAL DEBUG] Meal normalization:', { originalPrinciple: m.principle, principleRaw, finalPrincipleReplacement });
                          } catch(_) {}
                          return { ...m, principle: cleanedPrinciple, principleRaw, principleReplacement: finalPrincipleReplacement };
                        });
                        return (
                          <OrderSummary
                            meals={normalizedMeals}
                            isTableOrder={true}
                            calculateTotal={() => order.total}
                            isWaiterView={true}
                            statusClass={''}
                            userRole={3}
                            allSides={allSides}
                          />
                        );
                      })()
                    )}
                  </div>
                  
                  <button
                    onClick={() => setShowMealDetails(null)}
                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}

            {/* Edit Order Modal con OptionSelector y Split de Pagos */}
            {editingOrder && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] modal-backdrop">
                <div className={classNames(
                    "p-4 sm:p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto",
                    theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
                  )}>
                  <h3 className="text-lg font-semibold mb-4">
                    Editar Orden #{editingOrder.id.slice(0, 8)}
                  </h3>

                  {/* === POS (Caja) === */}
                  {Array.isArray(editingOrder.items) && !Array.isArray(editingOrder.breakfasts) && !Array.isArray(editingOrder.meals) ? (
                    <>
                      {/* Resumen editable similar a Caja POS */}
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold mb-2">Resumen</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {(Array.isArray(editingOrder.items) ? editingOrder.items : []).map((ci, idx) => (
                            <div key={ci.id || idx} className="flex items-center justify-between text-sm border rounded p-2">
                              <div className="flex-1 mr-2">
                                <div className="font-medium truncate">{ci.name}</div>
                                <div className="text-[11px] opacity-75">{currencyCO.format(ci.unitPrice || ci.price || 0)} c/u</div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditingOrder(prev => {
                                  const items = [...(prev.items || [])];
                                  const row = { ...(items[idx] || {}) };
                                  const q = Number(row.quantity || 0) - 1;
                                  if (q <= 0) { items.splice(idx, 1); }
                                  else { row.quantity = q; items[idx] = row; }
                                  return { ...prev, items };
                                })} className="w-6 h-6 bg-red-600 text-white rounded text-xs">-</button>
                                <input type="number" value={ci.quantity || 0} onChange={(e)=>{
                                  const val = Number(e.target.value || 0);
                                  setEditingOrder(prev => { const items = [...(prev.items || [])]; items[idx] = { ...(items[idx] || {}), quantity: val }; return { ...prev, items }; });
                                }} className="w-10 px-1 py-0.5 text-center rounded border text-xs" />
                                <button onClick={() => setEditingOrder(prev => {
                                  const items = [...(prev.items || [])];
                                  items[idx] = { ...(items[idx] || {}), quantity: (Number(items[idx]?.quantity || 0) + 1) };
                                  return { ...prev, items };
                                })} className="w-6 h-6 bg-green-600 text-white rounded text-xs">+</button>
                                <button onClick={() => setEditingOrder(prev => { const items = (prev.items || []).filter((_,i)=>i!==idx); return { ...prev, items }; })} className="w-6 h-6 bg-red-700 text-white rounded text-xs">x</button>
                                <button onClick={() => setEditingOrder(prev => { const items = [...(prev.items || [])]; items.splice(idx+1, 0, { ...(items[idx] || {}), id: (items[idx]?.id || items[idx]?.refId) + '-dup-' + Date.now() }); return { ...prev, items }; })} className="ml-1 px-2 h-6 bg-yellow-600 text-white rounded text-xs">dup</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Catálogo Caja POS para agregar más */}
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-semibold">Selecciona artículos y procesa el pago rápido</div>
                        <div>
                          <select value={posCategoryFilter} onChange={(e)=>setPosCategoryFilter(e.target.value)} className="px-2 py-1 rounded border text-xs">
                            <option value="">Todas</option>
                            {posCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto pr-1 space-y-4">
                        {groupedPosItems.map(g => (
                          <div key={g.category || 'sin-cat'}>
                            <div className="flex items-center mb-2">
                              <span className="text-[10px] uppercase tracking-wide opacity-70 bg-gray-200 dark:bg-gray-700/40 px-2 py-1 rounded">{g.category || 'Sin Categoría'}</span>
                              <span className="ml-2 text-[10px] opacity-60">{g.items.length}</span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                              {g.items.map(item => (
                                <button key={item.id} onClick={() => setEditingOrder(prev => {
                                  const items = Array.isArray(prev.items) ? [...prev.items] : [];
                                  const existingIdx = items.findIndex(ci => (ci.id||ci.refId) === item.id);
                                  if (existingIdx >= 0) {
                                    items[existingIdx] = { ...items[existingIdx], quantity: (Number(items[existingIdx].quantity||0) + 1) };
                                  } else {
                                    items.push({ id: item.id, refId: item.id, name: item.name, unitPrice: Number(item.price||0), quantity: 1, type: item.type||null, category: item.category||null });
                                  }
                                  return { ...prev, items };
                                })} className="p-3 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 text-left shadow">
                                  <div className="font-medium text-sm">{item.name}</div>
                                  <div className="text-[11px] opacity-70">{currencyCO.format(item.price||0)}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        {groupedPosItems.length===0 && <div className="text-sm opacity-60">No hay artículos</div>}
                      </div>
                    </>
                  ) : Array.isArray(editingOrder.breakfasts) ? (
                  /* === Desayuno === */
                    !breakfastAdditions.length ? (
                      <div className="flex justify-center items-center h-32">
                        <LoadingIndicator />
                        <span className="ml-2">Cargando catálogo de adiciones...</span>
                      </div>
                    ) : (
                      editingOrder.breakfasts.map((b, index) => (
                        <div key={index} className="mb-6 p-4 border rounded-md border-gray-200 dark:border-gray-700">
                          <h4 className="text-sm font-medium mb-2">Desayuno #{index + 1}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium mb-1">Tipo</label>
                              <OptionSelector
                                title="Tipo" emoji="🥞" options={breakfastTypes}
                                selected={b.type || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'type', v)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Caldo</label>
                              <OptionSelector
                                title="Caldo" emoji="🥣" options={breakfastBroths}
                                selected={b.broth || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'broth', v)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium.mb-1">Huevos</label>
                              <OptionSelector
                                title="Huevos" emoji="🥚" options={breakfastEggs}
                                selected={b.eggs || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'eggs', v)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Arroz/Pan</label>
                              <OptionSelector
                                title="Arroz/Pan" emoji="🍞" options={breakfastRiceBread}
                                selected={b.riceBread || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'riceBread', v)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Bebida</label>
                              <OptionSelector
                                title="Bebida" emoji="🥤" options={breakfastDrinks}
                                selected={b.drink || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'drink', v)}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1">Proteína</label>
                              <OptionSelector
                                title="Proteína" emoji="🍖" options={breakfastProteins}
                                selected={b.protein || null} multiple={false}
                                onImmediateSelect={(v) => setBreakfastField(index, 'protein', v)}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium mb-1">Adiciones</label>
                              <OptionSelector
                                title="Adiciones (por desayuno)" emoji="➕" options={breakfastAdditions}
                                selected={
                                  Array.isArray(b.additions)
                                    ? b.additions.map((a) => {
                                        const full = breakfastAdditions.find((opt) => opt.id === a.id || opt.name === a.name);
                                        return {
                                          id: full?.id || a.id || a.name,
                                          name: full?.name || a.name,
                                          quantity: typeof a.quantity === 'number' ? a.quantity : 1,
                                          price: typeof a.price === 'number' ? a.price : (full?.price ?? a.price ?? 0)
                                        };
                                      })
                                    : []
                                }
                                multiple={true}
                                showQuantityControls={true}
                                onImmediateSelect={(sel) =>
                                  setBreakfastField(
                                    index,
                                    'additions',
                                    sel.map((a) => ({
                                      id: a.id || a.name,
                                      name: a.name,
                                      quantity: typeof a.quantity === 'number' ? a.quantity : 1,
                                      price: typeof a.price === 'number' ? a.price : 0
                                    }))
                                  )
                                }
                                onRemove={(id) => {
                                  const newAdditions = (Array.isArray(b.additions) ? b.additions : []).filter((a) => (a.id || a.name) !== id);
                                  setBreakfastField(index, 'additions', newAdditions);
                                }}
                                onIncrease={(id) => {
                                  const newAdditions = (Array.isArray(b.additions) ? b.additions : []).map((a) => {
                                    if ((a.id || a.name) === id) {
                                      return { ...a, quantity: (typeof a.quantity === 'number' ? a.quantity : 1) + 1 };
                                    }
                                    return a;
                                  });
                                  setBreakfastField(index, 'additions', newAdditions);
                                }}
                              />
                            </div>

                          {/* Operativos */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Método de Pago</label>
                            <OptionSelector
                              title="Método de Pago" emoji="💳" options={paymentMethods}
                              selected={b.paymentMethod || null} multiple={false}
                              onImmediateSelect={(v) => setBreakfastField(index, 'paymentMethod', v)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Número de Mesa</label>
                            <input
                              type="text" value={b.tableNumber || ''}
                              onChange={(e) => setBreakfastField(index, 'tableNumber', e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text-white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Tipo de Pedido</label>
                            <select
                              value={b.orderType || ''}
                              onChange={(e) => setBreakfastField(index, 'orderType', e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text-white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            >
                              <option value="">Seleccionar</option>
                              <option value="table">Para mesa</option>
                              <option value="takeaway">Para llevar</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium mb-1">Notas</label>
                            <input
                              type="text" value={b.notes || ''} onChange={(e) => setBreakfastField(index, 'notes', e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text-white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) // fin breakfastAdditions.length ? loader : map
                  ) : (
                    // === Almuerzo ===
                    editingOrder.meals?.map((m, index) => (
                      <div key={index} className="mb-6 p-4 border rounded-md border-gray-200 dark:border-gray-700">
                        <h4 className="text-sm font-medium mb-2">Almuerzo #{index + 1}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium mb-1">Sopa (excluyente con Reemplazo)</label>
                            <OptionSelector
                              title="Sopa" emoji="🥣" options={soups}
                              selected={m.soup || null} multiple={false}
                              onImmediateSelect={(v) => setMealField(index, 'soup', v)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Reemplazo (ej: Solo bandeja)</label>
                            <OptionSelector
                              title="Reemplazo" emoji="🚫" options={soupReplacements}
                              selected={m.soupReplacement || null} multiple={false}
                              onImmediateSelect={(v) => setMealField(index, 'soupReplacement', v)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Principio</label>
                            <OptionSelector
                              title="Principio" emoji="🍚" options={principles}
                              selected={m.principle || []} multiple={true} showConfirmButton={true}
                              onImmediateSelect={(sel) => setMealField(index, 'principle', sel)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Proteína</label>
                            <OptionSelector
                              title="Proteína" emoji="🍖" options={menuProteins}
                              selected={m.protein || null} multiple={false}
                              onImmediateSelect={(v) => setMealField(index, 'protein', v)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Bebida</label>
                            <OptionSelector
                              title="Bebida" emoji="🥤" options={drinks}
                              selected={m.drink || null} multiple={false}
                              onImmediateSelect={(v) => setMealField(index, 'drink', v)}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium mb-1">Acompañamientos</label>
                            <OptionSelector
                              title="Acompañamientos" emoji="🥗" options={sides}
                              selected={m.sides || []} multiple={true}
                              onImmediateSelect={(sel) => setMealField(index, 'sides', sel)}
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium mb-1">Adiciones</label>
                            <OptionSelector
                              title="Adiciones (por almuerzo)" emoji="➕" options={additions}
                              selected={
                                Array.isArray(m.additions)
                                  ? m.additions.map((a) => {
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
                                setMealField(
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
                              onRemove={(id) => {
                                const newAdditions = (Array.isArray(m.additions) ? m.additions : []).filter((a) => (a.id || a.name) !== id);
                                setMealField(index, 'additions', newAdditions);
                              }}
                              onIncrease={(id) => {
                                const newAdditions = (Array.isArray(m.additions) ? m.additions : []).map((a) => {
                                  if ((a.id || a.name) === id) {
                                    return { ...a, quantity: (typeof a.quantity === 'number' ? a.quantity : 1) + 1 };
                                  }
                                  return a;
                                });
                                setMealField(index, 'additions', newAdditions);
                              }}
                            />
                          </div>

                          {/* Operativos */}
                          <div>
                            <label className="block text-xs font-medium mb-1">Método de Pago (legacy)</label>
                            <OptionSelector
                              title="Método de Pago" emoji="💳" options={paymentMethods}
                              selected={m.paymentMethod || null} multiple={false}
                              onImmediateSelect={(v) => {
                                setMealField(index, 'paymentMethod', v);
                                // Si hay split de pagos, actualizarlo para reflejar el método seleccionado
                                setEditingOrder((prev) => {
                                  if (!prev || !Array.isArray(prev.meals)) return prev;
                                  // Si hay más de un meal, solo actualiza si todos tienen el mismo método
                                  const allSame = prev.meals.every((meal, i) => i === index || (meal.paymentMethod?.name === v?.name));
                                  if (allSame) {
                                    return {
                                      ...prev,
                                      payments: [
                                        {
                                          method: v?.name || '',
                                          amount: Number(prev.total) || 0,
                                          note: ''
                                        }
                                      ]
                                    };
                                  }
                                  return prev;
                                });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Número de Mesa</label>
                            <input
                              type="text" value={m.tableNumber || ''} onChange={(e) => setMealField(index, e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text.white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1">Tipo de Pedido</label>
                            <select
                              value={m.orderType || ''} onChange={(e) => setMealField(index, 'orderType', e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text.white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            >
                              <option value="">Seleccionar</option>
                              <option value="table">Para mesa</option>
                              <option value="takeaway">Para llevar</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium mb-1">Notas</label>
                            <input
                              type="text" value={m.notes || ''} onChange={(e) => setMealField(index, 'notes', e.target.value)}
                              className={classNames(
                                "w-full p-2 rounded-md border text-sm",
                                theme === 'dark'
                                  ? 'border-gray-600 bg-gray-700 text.white'
                                  : 'border-gray-200 bg-white text-gray-900',
                                "focus:outline-none focus:ring-1 focus:ring-blue-500"
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Total y acciones */}
                  <div>
                    <label className="text-xs block mb-1">Total (se recalcula automáticamente)</label>
                    <input
                      type="number" value={editingOrder.total || 0}
                      onChange={(e) => setEditingTotal(e.target.value)} placeholder="Total"
                      className={classNames(
                        "w-full p-2 mt-1 border rounded text-sm",
                        theme === 'dark'
                          ? 'border-gray-600 bg-gray-700 text-white'
                          : 'border-gray-200 bg-white text-gray-900'
                      )}
                    />
                  </div>

                  {/* Split de Pagos */}
                  <div className="mt-4">
                    <PaymentSplitEditor
                      theme={theme}
                      total={editingOrder.total || 0}
                      value={
                        Array.isArray(editingOrder.payments) && editingOrder.payments.length
                          ? editingOrder.payments
                          : defaultPaymentsForOrder(editingOrder)
                      }
                      catalogMethods={paymentMethods}
                      onChange={(rows) => {
                        setEditingOrder((prev) => ({ ...prev, payments: rows }));
                      }}
                    />
                  </div>

                  <div className="mt-4 flex space-x-2">
                    <button onClick={handleSaveEdit} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm">
                      Guardar
                    </button>
                    <button onClick={() => setEditingOrder(null)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm">
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal de confirmación para eliminar todos */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10003] modal-backdrop">
          <div className={classNames(
            "p-6 rounded-lg max-w-md w-full mx-4",
            theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900'
          )}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">
                Confirmar Eliminación Masiva
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Estás a punto de eliminar <strong>TODOS los {filteredOrders.length} pedidos</strong> mostrados. 
                Esta acción es irreversible. Para confirmar, escribe <strong>"confirmar"</strong> a continuación:
              </p>
              
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="escribe 'confirmar'"
                className={classNames(
                  "w-full p-3 rounded-md border text-sm",
                  theme === 'dark'
                    ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500',
                  "focus:outline-none focus:ring-2 focus:ring-red-500"
                )}
                autoFocus
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteAllModal(false);
                  setDeleteConfirmText('');
                }}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={executeDeleteAllOrders}
                disabled={deleteConfirmText.toLowerCase() !== 'confirmar'}
                className={classNames(
                  "flex-1 px-4 py-2 rounded text-sm transition-colors duration-200",
                  deleteConfirmText.toLowerCase() === 'confirmar'
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                )}
              >
                Eliminar Todos
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-16 right-4 z-[10002] space-y-2 w-80 max-w-xs">
        {isLoading && <LoadingIndicator />}
        {errorMessage && <ErrorMessage message={errorMessage} onClose={() => setErrorMessage(null)} />}
      </div>
    </div>
  );
};

export default TableOrdersAdmin;
