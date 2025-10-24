// src/components/Waiter/WaiterCashier.js
import React, { useState, useEffect, useMemo } from 'react';
import { calculateMealPrice } from '../../utils/MealCalculations';
import { calculateBreakfastPrice } from '../../utils/BreakfastLogic';
import { db } from '../../config/firebase';
import { useAuth } from '../Auth/AuthProvider';
import { collection, onSnapshot, updateDoc, doc, serverTimestamp, addDoc, getDoc, runTransaction } from 'firebase/firestore';
import { 
  MagnifyingGlassIcon, 
  CurrencyDollarIcon, 
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  CreditCardIcon,
  BanknotesIcon,
  DevicePhoneMobileIcon,
  TrashIcon,
  PencilIcon,
  PlusCircleIcon,
  PhotoIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const WaiterCashier = ({ setError, setSuccess, theme, canDeleteAll = false }) => {
  const [tableOrders, setTableOrders] = useState([]);
  const [breakfastOrders, setBreakfastOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMode, setPaymentMode] = useState('simple'); // 'simple', 'split'
  const [paymentData, setPaymentData] = useState({});
  const [paymentLines, setPaymentLines] = useState([]); // para modo split: { method, amount }
  const [cashAmount, setCashAmount] = useState('');
  const [editableOrderType, setEditableOrderType] = useState('almuerzo'); // Para editar tipo en modal de pago
  // Adicionales que el cliente pidió (antes de confirmar pago)
  const [addedItems, setAddedItems] = useState([]); // { id, name, amount }
  const [addedItemsSource, setAddedItemsSource] = useState('new'); // 'new' | 'persisted'
  const [newAddedName, setNewAddedName] = useState('');
  const [newAddedAmount, setNewAddedAmount] = useState('');

  // Si cambian los adicionales, ajustar el monto a pagar automáticamente
  // displayedMainItems representa los items principales recuperados del pedido
  const [displayedMainItems, setDisplayedMainItems] = useState([]); // { id, name, unitPrice, quantity }
  const { user, role } = useAuth();

  useEffect(() => {
    if (!selectedOrder) return;
    // Calcular total a partir de los items principales actualmente mostrados y los adicionales temporales
    const mainTotal = (displayedMainItems || []).reduce((s, it) => s + (Number(it.unitPrice || 0) * Number(it.quantity || 1)), 0);
    const addedTotal = (addedItems || []).reduce((s, a) => s + (Number(a.amount || 0) * Number(a.quantity || 1)), 0);
    // Siempre sumar mainTotal + addedTotal, ya que addedItems contiene las adiciones actuales
    let newTotal = 0;
    if (Array.isArray(displayedMainItems) && displayedMainItems.length) {
      newTotal = Math.round(mainTotal + addedTotal);
    } else {
      // No hay items principales mostrados: partir del total guardado y añadir adicionales
      newTotal = Math.round((parseFloat(selectedOrder.total || 0) || 0) + addedTotal);
    }
    setPaymentData(prev => ({ ...prev, amount: newTotal }));
  }, [addedItems, selectedOrder, displayedMainItems]);
  const [currentTime, setCurrentTime] = useState(new Date());
  // Estados para creación manual de pedidos/pagos desde Caja
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState('manual'); // 'manual' or 'quick'
  const [manualOrder, setManualOrder] = useState({ orderType: 'almuerzo', tableNumber: '', takeaway: false, total: '', paymentMethod: 'efectivo', note: '' });
  const [manualAddedItems, setManualAddedItems] = useState([]);
  const [manualNewAddedName, setManualNewAddedName] = useState('');
  const [manualNewAddedAmount, setManualNewAddedAmount] = useState('');

  // Estados para modo rápido
  const [quickOrderType, setQuickOrderType] = useState('almuerzo'); // 'almuerzo' or 'desayuno'
  const [quickTableNumber, setQuickTableNumber] = useState('');
  const [quickPaymentMethod, setQuickPaymentMethod] = useState('efectivo');
  const [quickNote, setQuickNote] = useState('');
  const [quickItems, setQuickItems] = useState([]); // { id, type, subType, quantity, price, additions: [] }
  const [quickAdditions, setQuickAdditions] = useState([]); // Adiciones para almuerzo
  const [quickBreakfastAdditions, setQuickBreakfastAdditions] = useState([]); // Adiciones para desayuno

  // ================= NUEVO MODO POS =================
  const [posMode, setPosMode] = useState(true); // Mostrar la nueva interfaz POS
  const [posItems, setPosItems] = useState([]); // Artículos del catálogo POS (colección Firestore: posItems)
  const [cartItems, setCartItems] = useState([]); // { id, name, price, quantity, refId }
  const [posOrderType, setPosOrderType] = useState('almuerzo'); // almuerzo | desayuno | general
  const [posTableNumber, setPosTableNumber] = useState('');
  const [posPaymentMethod, setPosPaymentMethod] = useState('efectivo');
  const [posCashAmount, setPosCashAmount] = useState('');
  const [posCalculatedChange, setPosCalculatedChange] = useState(0);
  // Etapa del flujo POS: 'select' (solo items y total) | 'pay' (resumen ticket + métodos de pago)
  const [posStage, setPosStage] = useState('select');
  const [posNote, setPosNote] = useState('');
  const [showItemEditor, setShowItemEditor] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // objeto del item que se edita
  const [itemEditorMode, setItemEditorMode] = useState('color'); // color | image
  const [itemColor, setItemColor] = useState('#fb923c');
  const [itemShape, setItemShape] = useState('circle'); // circle | square | hex | outline
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState(''); // Nueva categoría para organizar artículos
  const [itemPrice, setItemPrice] = useState('');
  const [itemType, setItemType] = useState('almuerzo'); // almuerzo | desayuno | addition | other
  const [itemImageData, setItemImageData] = useState(null); // base64 simple
  const [itemActive, setItemActive] = useState(true);
  const colorPalette = ['#f3f4f6', '#f87171', '#fb923c', '#f472b6', '#f59e0b', '#84cc16', '#22c55e', '#3b82f6', '#a855f7'];
  const shapeOptions = [
    { id: 'circle', label: 'Círculo' },
    { id: 'square', label: 'Cuadrado' },
    { id: 'hex', label: 'Hexágono' },
    { id: 'outline', label: 'Borde' }
  ];

  // Suscripción a artículos POS
  useEffect(() => {
    if (!posMode) return; // sólo cuando el modo POS está activo
    const unsubscribe = onSnapshot(collection(db, 'posItems'), (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0));
      setPosItems(docs);
    }, (err) => console.error('Error cargando posItems:', err));
    return () => unsubscribe && unsubscribe();
  }, [posMode]);

  // Añadir al carrito (un click suma)
  const handleAddPosItem = (item) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.refId === item.id);
      if (existing) {
        return prev.map(ci => ci.refId === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      }
      return [...prev, { id: `${item.id}-${Date.now()}`, refId: item.id, name: item.name, price: Number(item.price||0), quantity: 1 }];
    });
  };
  const updateCartItemQuantity = (id, qty) => {
    setCartItems(prev => prev.filter(ci => (ci.id === id && qty <= 0) ? false : true).map(ci => ci.id === id ? { ...ci, quantity: qty } : ci));
  };
  const removeCartItem = (id) => setCartItems(prev => prev.filter(ci => ci.id !== id));
  const resetCart = () => {
    setCartItems([]); setPosCashAmount(''); setPosCalculatedChange(0); setPosNote(''); setPosStage('select');
  };
  const cartTotal = useMemo(() => cartItems.reduce((s,i)=> s + (i.price * i.quantity), 0), [cartItems]);

  // Recalcular vueltos POS
  useEffect(()=> {
    if (posPaymentMethod !== 'efectivo' || !posCashAmount) { setPosCalculatedChange(0); return; }
    const paid = parseFloat(posCashAmount)||0;
    setPosCalculatedChange(paid - cartTotal > 0 ? Math.round(paid - cartTotal) : 0);
  }, [posCashAmount, posPaymentMethod, cartTotal]);

  // Procesar venta rápida POS
  const handleProcessPosSale = async () => {
    if (cartItems.length === 0) { return setError('Agrega artículos antes de cobrar'); }
    // Si todavía estamos en la etapa de selección, pasar a la etapa de pago y no procesar aún
    if (posStage === 'select') {
      setPosStage('pay');
      return; // salir para que el usuario elija método, nota, etc.
    }
    try {
      const payload = {
        orderType: posOrderType === 'general' ? 'almuerzo' : posOrderType, // mapear general a almuerzo para colección
        isPaid: true,
        status: 'Completada',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paymentDate: serverTimestamp(),
        paymentMethod: posPaymentMethod,
        paymentAmount: cartTotal,
        total: cartTotal,
        paymentNote: posNote || '',
        items: cartItems.map(ci => ({ id: ci.refId, name: ci.name, unitPrice: ci.price, quantity: ci.quantity })),
      };
      if (posTableNumber.trim()) payload.tableNumber = posTableNumber.trim(); else payload.takeaway = true;
      if (posPaymentMethod === 'efectivo' && posCashAmount) {
        payload.cashReceived = parseFloat(posCashAmount)||0;
        payload.changeGiven = posCalculatedChange;
      }
      const collectionName = (posOrderType === 'desayuno') ? 'breakfastOrders' : 'tableOrders';
      await addDoc(collection(db, collectionName), payload);
      setSuccess('✅ Venta registrada');
      resetCart();
    } catch (err) {
      setError('Error registrando venta POS: ' + err.message);
    }
  };

  // Abrir editor para crear nuevo artículo
  const openNewItemEditor = () => {
    setEditingItem(null);
    setItemEditorMode('color');
    setItemColor('#fb923c');
    setItemShape('circle');
    setItemName('');
    setItemPrice('');
    setItemType('almuerzo');
    setItemCategory('');
    setItemImageData(null);
    setItemActive(true);
    setShowItemEditor(true);
  };

  // Abrir editor para editar existente
  const openEditItem = (item) => {
    setEditingItem(item);
    setItemEditorMode(item.imageData ? 'image' : 'color');
    setItemColor(item.color || '#fb923c');
    setItemShape(item.shape || 'circle');
    setItemName(item.name || '');
    setItemPrice(item.price != null ? String(item.price) : '');
    setItemType(item.type || 'almuerzo');
    setItemCategory(item.category || '');
    setItemImageData(item.imageData || null);
    setItemActive(item.active !== false);
    setShowItemEditor(true);
  };

  const handleSaveItem = async () => {
    if (!itemName.trim() || !itemPrice) return setError('Nombre y precio son obligatorios');
    const data = {
      name: itemName.trim(),
      price: Math.round(Number(itemPrice)||0),
      type: itemType,
      category: itemCategory.trim() || null,
      color: itemEditorMode === 'color' ? itemColor : null,
      shape: itemEditorMode === 'color' ? itemShape : null,
      imageData: itemEditorMode === 'image' ? itemImageData : null,
      active: itemActive,
      sortOrder: editingItem?.sortOrder || Date.now()
    };
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'posItems', editingItem.id), data);
        setSuccess('Artículo actualizado');
      } else {
        await addDoc(collection(db, 'posItems'), data);
        setSuccess('Artículo creado');
      }
      setShowItemEditor(false);
    } catch (err) {
      setError('Error guardando artículo: ' + err.message);
    }
  };

  const handleDeleteItem = async () => {
    if (!editingItem) return; if(!window.confirm('¿Eliminar artículo?')) return;
    try { await updateDoc(doc(db, 'posItems', editingItem.id), { active: false }); setSuccess('Artículo desactivado'); setShowItemEditor(false);} catch(err){ setError('Error eliminando: '+err.message);} }
  ;

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setItemImageData(ev.target.result); };
    reader.readAsDataURL(file);
  };
  // ================= FIN NUEVO MODO POS =================

  // Estados para calculadora de vueltos
  const [showChangeCalculator, setShowChangeCalculator] = useState(false);

  // ================= CATEGORÍAS POS =================
  const [categoryFilter, setCategoryFilter] = useState(''); // '' = todas
  const activeItems = useMemo(()=> posItems.filter(i=>i.active!==false), [posItems]);
  const categories = useMemo(()=> {
    const set = new Set();
    activeItems.forEach(i => { if (i.category) set.add(i.category); });
    return Array.from(set).sort();
  }, [activeItems]);
  const filteredItems = useMemo(()=> categoryFilter ? activeItems.filter(i=> i.category === categoryFilter) : activeItems, [activeItems, categoryFilter]);
  const groupedItems = useMemo(()=> {
    const groupsMap = new Map();
    filteredItems.forEach(item => {
      const key = item.category || '';
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key).push(item);
    });
    return Array.from(groupsMap.entries()).map(([category, items]) => ({ category, items }));
  }, [filteredItems]);

  const CategoryFilter = ({ posItems, onSelect, current }) => {
    return (
      <div className="flex items-center gap-2 text-xs">
        <select value={current} onChange={(e)=>onSelect(e.target.value)} className="px-2 py-1 rounded bg-gray-700 text-gray-200">
          <option value="">Todas</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        {current && (
          <button onClick={()=>onSelect('')} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-gray-100">Limpiar</button>
        )}
      </div>
    );
  };
  // =============== FIN CATEGORÍAS POS ===============
  const [calculatedChange, setCalculatedChange] = useState(0);

  // Cargar órdenes de mesas en tiempo real
  useEffect(() => {
    const unsubscribeTable = onSnapshot(collection(db, 'tableOrders'), (snapshot) => {
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data(), orderType: 'mesa' }));
      setTableOrders(orders);
    }, (error) => setError(`Error al cargar órdenes de mesa: ${error.message}`));

    const unsubscribeBreakfast = onSnapshot(collection(db, 'breakfastOrders'), (snapshot) => {
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data(), orderType: 'desayuno' }));
      setBreakfastOrders(orders);
    }, (error) => setError(`Error al cargar órdenes de desayuno: ${error.message}`));

    return () => {
      unsubscribeTable();
      unsubscribeBreakfast();
    };
  }, [setError]);

  // Cargar adiciones para modo rápido
  useEffect(() => {
    const unsubscribeAdditions = onSnapshot(collection(db, 'additions'), (snapshot) => {
      const additions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuickAdditions(additions);
    }, (error) => console.error('Error cargando adiciones:', error));

    const unsubscribeBreakfastAdditions = onSnapshot(collection(db, 'breakfastAdditions'), (snapshot) => {
      const additions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setQuickBreakfastAdditions(additions);
    }, (error) => console.error('Error cargando adiciones de desayuno:', error));

    return () => {
      unsubscribeAdditions();
      unsubscribeBreakfastAdditions();
    };
  }, []);

  // Actualizar hora cada segundo
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Combinar todas las órdenes y organizarlas
  const allOrders = useMemo(() => {
    const combined = [...tableOrders, ...breakfastOrders];
    return combined
      .filter(order => !order.isPaid && order.status !== 'Completada')
      .filter(order => {
        return (
          searchTerm === '' ||
          (order.tableNumber && order.tableNumber.toString().includes(searchTerm)) ||
          (order.customerName && order.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (order.customerPhone && order.customerPhone.includes(searchTerm)) ||
          (order.id && order.id.includes(searchTerm))
        );
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt?.seconds ? a.createdAt.seconds * 1000 : a.createdAt);
        const timeB = new Date(b.createdAt?.seconds ? b.createdAt.seconds * 1000 : b.createdAt);
        return timeA - timeB;
      });
  }, [tableOrders, breakfastOrders, searchTerm]);

  // Agrupar órdenes por mesa
  const ordersByTable = useMemo(() => {
    const grouped = {};
    allOrders.forEach(order => {
      const tableNum = order.tableNumber || 'Sin mesa';
      if (!grouped[tableNum]) grouped[tableNum] = [];
      grouped[tableNum].push(order);
    });
    return grouped;
  }, [allOrders]);

  // Órdenes pagadas (para sección de completadas)
  const paidOrdersByTable = useMemo(() => {
    const combined = [...tableOrders, ...breakfastOrders];
    const paid = combined.filter(o => o.isPaid);
    const grouped = {};
    paid.forEach(order => {
      const tableNum = order.tableNumber || 'Sin mesa';
      if (!grouped[tableNum]) grouped[tableNum] = [];
      grouped[tableNum].push(order);
    });
    return grouped;
  }, [tableOrders, breakfastOrders]);

  // Estadísticas del día
  const dayStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const paidToday = [...tableOrders, ...breakfastOrders].filter(order => {
      if (!order.isPaid || !order.paymentDate) return false;
      const orderDate = new Date(order.paymentDate.seconds * 1000 || order.paymentDate).toISOString().split('T')[0];
      return orderDate === today;
    });

    // Total general (suma de totales)
    const totalAmount = paidToday.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);

    // Sumar montos por método de pago (tener en cuenta paymentLines si existen)
    const paymentSums = paidToday.reduce((acc, order) => {
      // Si la orden tiene paymentLines, sumar cada línea por su método
      if (order.paymentLines && Array.isArray(order.paymentLines) && order.paymentLines.length > 0) {
        order.paymentLines.forEach(line => {
          const method = line.method || 'efectivo';
          const amt = parseFloat(line.amount) || 0;
          acc[method] = (acc[method] || 0) + amt;
        });
      } else {
        const method = order.paymentMethod || 'efectivo';
        const amt = parseFloat(order.paymentAmount || order.total) || 0;
        acc[method] = (acc[method] || 0) + amt;
      }
      return acc;
    }, {});

    return {
      totalOrders: paidToday.length,
      totalAmount,
      efectivo: paymentSums.efectivo || 0,
      nequi: paymentSums.nequi || 0,
      daviplata: paymentSums.daviplata || 0
    };
  }, [tableOrders, breakfastOrders]);

  // Formatear precio
  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  // Extrae una lista de items (id, name, unitPrice, quantity) a partir de la orden
  const extractDisplayedItems = (order) => {
    if (!order || typeof order !== 'object') return [];
    const mains = [];

    // Helper para empujar de forma consistente
    const pushItem = (id, name, unitPrice, quantity = 1) => {
      mains.push({ id: id || `${order.id || 'o'}-${mains.length}`, name: String(name || 'Item'), unitPrice: Math.round(Number(unitPrice || 0) || 0), quantity: Number(quantity || 1) });
    };

    // Preferir UNA sola fuente para evitar duplicados: meals > breakfasts > items > addedItems > additions > singular > candidate arrays
    if (Array.isArray(order.meals) && order.meals.length) {
      order.meals.forEach((m, idx) => {
        const nameParts = [];
        if (m.soup && m.soup.name) nameParts.push(m.soup.name);
        if (m.principle && Array.isArray(m.principle) && m.principle.length) nameParts.push(m.principle.map(p => p.name).join(', '));
        if (m.protein && m.protein.name) nameParts.push(m.protein.name);
        const name = nameParts.join(' - ') || m.name || `Almuerzo ${idx + 1}`;
        const unit = Number(m.price || m.unitPrice || m.total || 0) || calculateMealPrice(m) || 0;
        pushItem(m.id || `${order.id}-meal-${idx}`, name, unit, m.quantity || 1);
      });
      // Agrupar y devolver
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    if (Array.isArray(order.breakfasts) && order.breakfasts.length) {
      order.breakfasts.forEach((b, idx) => {
        const name = [b.type?.name, b.protein?.name, b.drink?.name].filter(Boolean).join(' - ') || b.name || `Desayuno ${idx + 1}`;
        const unit = Number(b.price || b.unitPrice || b.total || 0) || calculateBreakfastPrice(b, 3) || 0;
        pushItem(b.id || `${order.id}-breakfast-${idx}`, name, unit, b.quantity || 1);
      });
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    if (Array.isArray(order.items) && order.items.length) {
      order.items.forEach((it, idx) => {
        const name = it.name || it.title || it.product || `Item ${idx + 1}`;
        const qty = it.quantity || it.qty || it.count || 1;
        const unit = Number(it.price || it.unitPrice || it.amount || 0) || 0;
        pushItem(it.id || `${order.id}-item-${idx}`, name, unit, qty);
      });
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    if (Array.isArray(order.addedItems) && order.addedItems.length) {
      order.addedItems.forEach((a, idx) => {
        const name = a.name || a.description || `Adicional ${idx + 1}`;
        const unit = Number(a.amount || a.price || 0) || 0;
        pushItem(a.id || `${order.id}-added-${idx}`, name, unit, a.quantity || 1);
      });
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    if (Array.isArray(order.additions) && order.additions.length) {
      order.additions.forEach((a, idx) => {
        const name = a.name || a.description || `Adición ${idx + 1}`;
        const unit = Number(a.price || a.amount || 0) || 0;
        const qty = a.quantity || a.qty || 1;
        pushItem(a.id || `${order.id}-addition-${idx}`, name, unit, qty);
      });
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    // 5) Si hay un solo objeto breakfast o meal (no array), extraerlo igual
    if (order.breakfast && typeof order.breakfast === 'object' && !Array.isArray(order.breakfast)) {
      const b = order.breakfast;
      const name = b.type?.name || b.name || `Desayuno`;
      const unit = Number(b.price || b.unitPrice || b.total || 0) || calculateBreakfastPrice(b, 3) || 0;
      pushItem(b.id || `${order.id}-breakfast-0`, name, unit, b.quantity || 1);
    }
    if (order.meal && typeof order.meal === 'object' && !Array.isArray(order.meal)) {
      const m = order.meal;
      const name = m.soup?.name || m.name || `Almuerzo`;
      const unit = Number(m.price || m.unitPrice || m.total || 0) || calculateMealPrice(m) || 0;
      pushItem(m.id || `${order.id}-meal-0`, name, unit, m.quantity || 1);
    }
    // Si se agregó algún item, devolver agrupado
    if (mains.length > 0) {
      const grouped = {};
      mains.forEach(it => {
        const key = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
        if (!grouped[key]) grouped[key] = { ...it, quantity: Number(it.quantity || 1) };
        else grouped[key].quantity = Number(grouped[key].quantity || 0) + Number(it.quantity || 1);
      });
      return Object.values(grouped);
    }

    // Si no se encontró nada, intentar reconstruir el item principal desde los datos básicos de la orden
    if ((order.orderType === 'desayuno' || order.orderType === 'almuerzo') && (order.total || order.paymentAmount)) {
      // Si hay un nombre claro, úsalo, si no, fallback
      let name = '';
      if (order.orderType === 'desayuno') name = 'Solo Huevos';
      if (order.orderType === 'almuerzo') name = 'Almuerzo';
      if (order.name) name = order.name;
      // Determinar cantidad
      let quantity = Number(order.quantity || order.qty || 1);
      if (!quantity || quantity < 1) quantity = 1;
      // Calcular unitPrice
      const total = Number(order.paymentAmount || order.total || 0);
      const unit = quantity > 1 ? Math.round(total / quantity) : total;
      if (total > 0) {
        pushItem(`${order.id}-main-fallback`, name, unit, quantity);
        return mains;
      }
    }

    // 6) As a last resort, if there are any keys that look like line items (search for objects with name+price)
    const candidateArrays = Object.keys(order).filter(k => Array.isArray(order[k]));
    for (const key of candidateArrays) {
      const arr = order[key];
      if (!arr || !arr.length) continue;
      const first = arr[0];
      if (first && (first.name || first.title) && (first.price || first.amount || first.unitPrice)) {
        arr.forEach((it, idx) => {
          const name = it.name || it.title || `Item ${idx + 1}`;
          const qty = it.quantity || it.qty || 1;
          const unit = Number(it.price || it.amount || it.unitPrice || 0) || 0;
          pushItem(it.id || `${order.id}-${key}-${idx}`, name, unit, qty);
        });
        const grouped = {};
        mains.forEach(it => {
          const k = `${String(it.name).trim().toLowerCase()}|${Number(it.unitPrice || 0)}`;
          if (!grouped[k]) grouped[k] = { ...it, quantity: Number(it.quantity || 1) };
          else grouped[k].quantity = Number(grouped[k].quantity || 0) + Number(it.quantity || 1);
        });
        return Object.values(grouped);
      }
    }

    return [];
  };

  // Funciones para modo rápido
  const getQuickPrice = (type, subType, orderType) => {
    const prices = {
      almuerzo: {
        normal: { table: 12000, takeaway: 13000 },
        bandeja: { table: 11000, takeaway: 12000 },
        mojarra: { table: 16000, takeaway: 16000 }
      },
      desayuno: {
        solo_huevos: { table: 7000, takeaway: 8000 },
        solo_caldo_costilla: { table: 7000, takeaway: 8000 },
        solo_caldo_pescado: { table: 7000, takeaway: 8000 },
        solo_caldo_pata: { table: 8000, takeaway: 9000 },
        solo_caldo_pajarilla: { table: 9000, takeaway: 10000 },
        desayuno_completo_costilla: { table: 11000, takeaway: 12000 },
        desayuno_completo_pescado: { table: 11000, takeaway: 12000 },
        desayuno_completo_pata: { table: 12000, takeaway: 13000 },
        desayuno_completo_pajarilla: { table: 13000, takeaway: 14000 },
        monona: { table: 13000, takeaway: 14000 }
      }
    };
    return prices[type]?.[subType]?.[orderType] || 0;
  };

  const getQuickName = (type, subType) => {
    const names = {
      almuerzo: {
        normal: 'Almuerzo Normal',
        bandeja: 'Solo Bandeja',
        mojarra: 'Mojarra'
      },
      desayuno: {
        solo_huevos: 'Solo Huevos',
        solo_caldo_costilla: 'Solo Caldo Costilla',
        solo_caldo_pescado: 'Solo Caldo Pescado',
        solo_caldo_pata: 'Solo Caldo Pata',
        solo_caldo_pajarilla: 'Solo Caldo Pajarilla',
        desayuno_completo_costilla: 'Desayuno Completo Costilla',
        desayuno_completo_pescado: 'Desayuno Completo Pescado',
        desayuno_completo_pata: 'Desayuno Completo Pata',
        desayuno_completo_pajarilla: 'Desayuno Completo Pajarilla',
        monona: 'Mañona'
      }
    };
    return names[type]?.[subType] || subType;
  };

  const addQuickItem = (type, subType, orderType) => {
    const price = getQuickPrice(type, subType, orderType);
    const name = getQuickName(type, subType);
    const existing = quickItems.find(item => item.type === type && item.subType === subType && item.orderType === orderType);
    if (existing) {
      updateQuickItemQuantity(existing.id, existing.quantity + 1);
    } else {
      const newItem = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        subType,
        orderType,
        name,
        price,
        quantity: 1
      };
      setQuickItems(prev => [...prev, newItem]);
    }
  };

  const updateQuickItemQuantity = (id, newQuantity) => {
    if (newQuantity <= 0) {
      removeQuickItem(id);
    } else {
      setQuickItems(prev => prev.map(item => 
        item.id === id ? { ...item, quantity: newQuantity } : item
      ));
    }
  };

  const removeQuickItem = (id) => {
    setQuickItems(prev => prev.filter(item => item.id !== id));
  };

  const calculateQuickTotal = () => {
    return quickItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  // Adiciones según el tipo
  const currentQuickAdditions = quickOrderType === 'almuerzo' ? quickAdditions : quickBreakfastAdditions;

  const addQuickAddition = (addition) => {
    const existing = quickItems.find(item => item.type === 'addition' && item.subType === addition.name);
    if (existing) {
      updateQuickItemQuantity(existing.id, existing.quantity + 1);
    } else {
      const newItem = {
        id: `${Date.now()}-${Math.random()}`,
        type: 'addition',
        subType: addition.name,
        name: addition.name,
        price: addition.price || 0,
        quantity: 1
      };
      setQuickItems(prev => [...prev, newItem]);
    }
  };

  // Obtener etiqueta legible para una orden: preferir order.tableNumber, si no existe
  // usar order.meals[0]?.tableNumber (caso donde la mesa se guardó en la primera comida),
  // si no hay mesa, mostrar 'Para llevar' o un fallback con id.
  const getOrderLabel = (order) => {
    if (!order) return '';
    // Intentar obtener número de mesa desde order.tableNumber o desde la primera comida
    let tableNumRaw = order.tableNumber || (order.meals && order.meals[0] && order.meals[0].tableNumber) || null;
    if (tableNumRaw) {
      // Normalizar: eliminar la palabra 'Mesa' si ya está incluida y trim
      const cleaned = String(tableNumRaw).replace(/Mesa\s*/i, '').trim();
      return `Mesa ${cleaned}`;
    }
    if (order.takeaway || order.isTakeaway) return 'Para llevar';
    return `Orden #${String(order.id || '').substring(0,8)}`;
  };

  // Obtener color de estado por tiempo de espera
  const getUrgencyColor = (createdAt) => {
    const now = new Date();
    const orderTime = new Date(createdAt?.seconds * 1000 || createdAt);
    const minutesWaiting = (now - orderTime) / (1000 * 60);
    
    if (minutesWaiting > 30) return 'red';
    if (minutesWaiting > 15) return 'yellow';
    return 'green';
  };

  // Obtener ícono por método de pago
  const getPaymentIcon = (method) => {
    switch(method) {
      case 'efectivo': return <BanknotesIcon className="w-5 h-5" />;
      case 'nequi': return <DevicePhoneMobileIcon className="w-5 h-5" />;
      case 'daviplata': return <CreditCardIcon className="w-5 h-5" />;
      default: return <CurrencyDollarIcon className="w-5 h-5" />;
    }
  };

  // Abrir modal de pago (leer versión más reciente del documento para evitar datos obsoletos)
  const handleOpenPayment = async (order) => {
    const collection_name = order.orderType === 'mesa' ? 'tableOrders' : 'breakfastOrders';
    let freshOrder = order;
    try {
      const snap = await getDoc(doc(db, collection_name, order.id));
      if (snap && snap.exists()) {
        freshOrder = { id: snap.id, ...snap.data(), orderType: order.orderType };
      }
    } catch (err) {
      console.warn('No se pudo leer la orden antes de abrir modal, usando la versión local:', err.message || err);
    }

    // Al abrir el modal, solo mostrar los items y adicionales actuales (sin residuos)
    setSelectedOrder(freshOrder);
    const items = extractDisplayedItems(freshOrder).filter(it => it.quantity > 0); // solo los que existen
    setDisplayedMainItems(items);
    const initialAdded = Array.isArray(freshOrder.addedItems)
      ? freshOrder.addedItems.filter(it => Number(it.amount) > 0).map((it, idx) => ({ id: it.id || idx, name: it.name, amount: Number(it.amount || 0), quantity: Number(it.quantity || 1) }))
      : [];
    setAddedItems(initialAdded);
    setAddedItemsSource(initialAdded && initialAdded.length ? 'persisted' : 'new');
    const mainTotal = items.reduce((s, it) => s + (Number(it.unitPrice || 0) * Number(it.quantity || 1)), 0);
    const addedTotal = initialAdded.reduce((s, a) => s + (Number(a.amount || 0)), 0);
    if (freshOrder.paymentLines && Array.isArray(freshOrder.paymentLines) && freshOrder.paymentLines.length > 0) {
      setPaymentMode('split');
      setPaymentLines(freshOrder.paymentLines.map(l => ({ method: l.method || 'efectivo', amount: String(l.amount || 0) })));
      const linesTotal = freshOrder.paymentLines.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
      setPaymentData({ method: freshOrder.paymentMethod || 'efectivo', amount: Math.round(linesTotal), note: freshOrder.paymentNote || '' });
    } else {
      setPaymentMode('simple');
      setPaymentLines([]);
      setPaymentData({ method: freshOrder.paymentMethod || 'efectivo', amount: Math.round(mainTotal + addedTotal) || Math.round(parseFloat(freshOrder.total) || 0), note: freshOrder.paymentNote || '' });
    }

    setCashAmount(freshOrder.cashReceived ? String(freshOrder.cashReceived) : '');
    setCalculatedChange(freshOrder.changeGiven || 0);
    setShowChangeCalculator(!!freshOrder.cashReceived);
    setEditableOrderType(freshOrder.orderType || 'almuerzo');
    setNewAddedName('');
    setNewAddedAmount('');
    setShowPaymentModal(true);
  };

  // Calcular vueltos
  const calculateChange = (totalAmount, paidAmount) => {
    const change = paidAmount - totalAmount;
    // Si no hay cambio o pago insuficiente devolver estructura vacía con ceros
    const bills = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];
    const breakdown = {};
    if (change <= 0) {
      // inicializar todas las denominaciones en 0 y resto 0
      bills.forEach(b => { breakdown[b] = 0; });
      return { total: 0, breakdown, remaining: 0 };
    }

    let remaining = Math.round(change);

    // Greedy: siempre generar una entrada (incluso si es 0) para cada denominación
    bills.forEach(bill => {
      const count = Math.floor(remaining / bill);
      breakdown[bill] = count;
      remaining -= count * bill;
    });

    // 'remaining' ahora contiene el resto menor a la denominación más pequeña (500)
    return { total: change, breakdown, remaining };
  };

  // Procesar pago
  const handleProcessPayment = async () => {
      // ...código original...
      const updateData = {
        isPaid: true,
        status: 'Completada',
        paymentDate: serverTimestamp(),
        paymentMethod: paymentData.method,
        paymentAmount: paymentData.amount,
        updatedAt: serverTimestamp()
      };

      // Declarar filteredMainItems aquí para que esté disponible
      const filteredMainItems = (displayedMainItems || []).filter(it => it.quantity > 0);

      // Si no hay breakfasts/meals pero sí hay items principales filtrados, crear breakfasts/meals para persistirlos
      if ((!Array.isArray(updateData.breakfasts) || updateData.breakfasts.length === 0) && selectedOrder.orderType === 'desayuno' && filteredMainItems.length > 0) {
        // Crear breakfasts desde los items principales
        updateData.breakfasts = filteredMainItems.map(it => ({
          id: it.id,
          name: it.name,
          price: it.unitPrice,
          quantity: it.quantity
        }));
      }
      if ((!Array.isArray(updateData.meals) || updateData.meals.length === 0) && selectedOrder.orderType === 'almuerzo' && filteredMainItems.length > 0) {
        // Crear meals desde los items principales
        updateData.meals = filteredMainItems.map(it => ({
          id: it.id,
          name: it.name,
          price: it.unitPrice,
          quantity: it.quantity
        }));
      }
    if (!selectedOrder) return;

    try {
      // Solo guardar items principales y adicionales que existan (cantidad > 0 o monto > 0)
      const filteredMainItems = (displayedMainItems || []).filter(it => it.quantity > 0);
      const filteredAddedItems = (addedItems || []).filter(a => Number(a.amount) > 0);

      // Lógica original, pero usando los filtrados
      const updateData = {
        isPaid: true,
        status: 'Completada',
        paymentDate: serverTimestamp(),
        paymentMethod: paymentData.method,
        paymentAmount: paymentData.amount,
        updatedAt: serverTimestamp()
      };

      // Preparar lista final de adicionales
      // Incluir siempre las adiciones actualmente mostradas (persistidas o nuevas)
      const finalAddedItems = [];
      if (filteredAddedItems.length) {
        finalAddedItems.push(...filteredAddedItems.map(a => ({ id: a.id, name: a.name, amount: Number(a.amount || 0), quantity: Number(a.quantity || 1) })));
      }
      if (newAddedName && newAddedAmount) {
        const pendingAmount = Math.floor(Number(newAddedAmount || 0));
        if (String(newAddedName).trim() !== '' && pendingAmount > 0) {
          const pending = { id: `${Date.now()}-pending`, name: String(newAddedName).trim(), amount: pendingAmount, quantity: 1 };
          finalAddedItems.push(pending);
        }
      }

      // Calcular total principal desde los items filtrados
      const mainTotal = filteredMainItems.reduce((s, it) => s + (Number(it.unitPrice || 0) * Number(it.quantity || 1)), 0);

      // Persistir cambios en meals/breakfasts si aplica
      if (Array.isArray(filteredMainItems) && filteredMainItems.length) {
        const normalize = (s) => String(s || '').trim().toLowerCase();
        if (Array.isArray(selectedOrder.breakfasts) && selectedOrder.breakfasts.length) {
          const displayedMap = {};
          filteredMainItems.forEach(di => {
            const k = `${normalize(di.name)}|${Number(di.unitPrice || 0)}`;
            displayedMap[k] = (displayedMap[k] || 0) + Number(di.quantity || 0);
          });
          const groups = {};
          selectedOrder.breakfasts.forEach((b, idx) => {
            const bName = [b.type?.name, b.protein?.name, b.drink?.name, b.name].filter(Boolean).join(' - ') || b.name || '';
            const price = Number(b.price || b.unitPrice || b.total || 0) || 0;
            const key = `${normalize(bName)}|${price}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(idx);
          });
          const merged = selectedOrder.breakfasts.map((b, idx) => ({ ...b }));
          Object.keys(groups).forEach(key => {
            const idxs = groups[key];
            const totalQty = Math.round(displayedMap[key] || 0);
            if (idxs.length === 0) return;
            const base = Math.floor(totalQty / idxs.length);
            let remainder = totalQty % idxs.length;
            idxs.forEach((origIndex, i) => {
              const assign = base + (remainder > 0 ? 1 : 0);
              merged[origIndex].quantity = assign;
              if (assign > 0 && filteredMainItems.length) {
                const di = filteredMainItems.find(d => `${normalize(d.name)}|${Number(d.unitPrice||0)}` === key);
                if (di) merged[origIndex].price = di.unitPrice;
              }
              if (remainder > 0) remainder -= 1;
            });
          });
          updateData.breakfasts = merged;
        }
        if (Array.isArray(selectedOrder.meals) && selectedOrder.meals.length) {
          const displayedMapM = {};
          filteredMainItems.forEach(di => {
            const k = `${normalize(di.name)}|${Number(di.unitPrice || 0)}`;
            displayedMapM[k] = (displayedMapM[k] || 0) + Number(di.quantity || 0);
          });
          const groupsM = {};
          selectedOrder.meals.forEach((m, idx) => {
            const nameParts = [];
            if (m.soup && m.soup.name) nameParts.push(m.soup.name);
            if (m.principle && Array.isArray(m.principle) && m.principle.length) nameParts.push(m.principle.map(p => p.name).join(', '));
            if (m.protein && m.protein.name) nameParts.push(m.protein.name);
            const mName = nameParts.join(' - ') || m.name || '';
            const price = Number(m.price || m.unitPrice || m.total || 0) || 0;
            const key = `${normalize(mName)}|${price}`;
            if (!groupsM[key]) groupsM[key] = [];
            groupsM[key].push(idx);
          });
          const mergedMeals = selectedOrder.meals.map((m) => ({ ...m }));
          Object.keys(groupsM).forEach(key => {
            const idxs = groupsM[key];
            const totalQty = Math.round(displayedMapM[key] || 0);
            if (idxs.length === 0) return;
            const base = Math.floor(totalQty / idxs.length);
            let remainder = totalQty % idxs.length;
            idxs.forEach((origIndex, i) => {
              const assign = base + (remainder > 0 ? 1 : 0);
              mergedMeals[origIndex].quantity = assign;
              if (assign > 0 && filteredMainItems.length) {
                const di = filteredMainItems.find(d => `${normalize(d.name)}|${Number(d.unitPrice||0)}` === key);
                if (di) mergedMeals[origIndex].price = di.unitPrice;
              }
              if (remainder > 0) remainder -= 1;
            });
          });
          updateData.meals = mergedMeals;
        }
      }

      // Actualizar items si existen
      if (Array.isArray(selectedOrder.items) && selectedOrder.items.length) {
        updateData.items = filteredMainItems;
      }

      if (finalAddedItems.length) {
        const addedTotalFinal = finalAddedItems.reduce((s, a) => s + (Number(a.amount || 0) * Number(a.quantity || 1)), 0);
        updateData.addedItems = finalAddedItems;
        updateData.total = Math.round(mainTotal + addedTotalFinal);
      } else {
        updateData.addedItems = [];
        updateData.total = Math.round(mainTotal);
      }

      if (paymentData.note) updateData.paymentNote = paymentData.note;
      if (paymentData.method === 'efectivo' && cashAmount) {
        updateData.cashReceived = parseFloat(cashAmount);
        updateData.changeGiven = calculatedChange;
      }

      const collection_name = selectedOrder.orderType === 'mesa' ? 'tableOrders' : 'breakfastOrders';
      const addedTotal = finalAddedItems.reduce((s, a) => s + (Number(a.amount || 0) * Number(a.quantity || 1)), 0);
      if (paymentMode === 'split') {
        updateData.paymentLines = paymentLines.map(l => ({ method: l.method, amount: Number(l.amount) }));
        const linesTotal = paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
        updateData.paymentAmount = Math.round(linesTotal + (filteredMainItems.length ? 0 : addedTotal));
        updateData.paymentMethod = 'multiple';
      } else {
        updateData.paymentAmount = Math.round(mainTotal + addedTotal);
      }

      // Guardar en Firestore (transacción)
      try {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, collection_name, selectedOrder.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error('Documento no existe en Firestore al intentar procesar pago');
          const current = snap.data();
          // Actualizar meals/breakfasts eliminando los que tengan cantidad 0
          if (Array.isArray(updateData.breakfasts)) {
            updateData.breakfasts = updateData.breakfasts.filter(b => Number(b.quantity) > 0);
          }
          if (Array.isArray(updateData.meals)) {
            updateData.meals = updateData.meals.filter(m => Number(m.quantity) > 0);
          }
          if (Array.isArray(updateData.items)) {
            updateData.items = updateData.items.filter(it => Number(it.quantity) > 0);
          }
          if (Array.isArray(updateData.addedItems)) {
            updateData.addedItems = updateData.addedItems.filter(a => Number(a.quantity || 1) > 0 && Number(a.amount || 0) > 0);
          }
          tx.update(ref, updateData);
        });
      } catch (txErr) {
        setError(`Error al procesar pago en transacción: ${txErr.message}`);
        return;
      }

      // Actualización optimista local
      const optimisticFields = {
        isPaid: true,
        status: 'Completada',
        paymentMethod: updateData.paymentMethod,
        paymentAmount: updateData.paymentAmount,
        paymentDate: new Date(),
        total: updateData.total,
        addedItems: updateData.addedItems
      };
      if (updateData.paymentLines) optimisticFields.paymentLines = updateData.paymentLines;
      if (updateData.cashReceived) optimisticFields.cashReceived = updateData.cashReceived;
      if (updateData.changeGiven) optimisticFields.changeGiven = updateData.changeGiven;
      if (updateData.breakfasts) optimisticFields.breakfasts = updateData.breakfasts;
      if (updateData.items) optimisticFields.items = updateData.items;

      if (collection_name === 'tableOrders') {
        setTableOrders(prev => prev.map(o => o.id === selectedOrder.id ? ({ ...o, ...optimisticFields }) : o));
      } else {
        setBreakfastOrders(prev => prev.map(o => o.id === selectedOrder.id ? ({ ...o, ...optimisticFields }) : o));
      }

      setSuccess(`💰 Pago procesado exitosamente - ${paymentData.method.toUpperCase()}: ${formatPrice(paymentData.amount)}`);
      setShowPaymentModal(false);
      setSelectedOrder(null);
    } catch (error) {
      setError(`Error al procesar pago: ${error.message}`);
    }
  };

  // Gestión de adicionales (antes de confirmar)
  const addNewItem = () => {
    const name = String(newAddedName || '').trim();
    const amount = Math.floor(Number(newAddedAmount || 0));
    if (!name || !amount) return setError('Nombre y monto del adicional son obligatorios');
    const existing = addedItems.find(item => item.name === name && item.amount === amount);
    if (existing) {
      setAddedItems(prev => prev.map(item => 
        item.id === existing.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item
      ));
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const newItem = { id, name, amount, quantity: 1 };
      console.log('Añadiendo adicional:', newItem);
      setAddedItems(prev => ([...prev, newItem]));
      setAddedItemsSource('new');
    }
    setNewAddedName('');
    setNewAddedAmount('');
  };

  const removeAddedItem = (id) => setAddedItems(prev => prev.filter(i => i.id !== id));

  const editAddedItem = (id, patch) => setAddedItems(prev => prev.map(i => i.id === id ? ({ ...i, ...patch }) : i));

  const updateAddedItemQuantity = (id, newQty) => {
    if (newQty <= 0) {
      setAddedItems(prev => prev.filter(i => i.id !== id));
    } else {
      setAddedItems(prev => prev.map(i => i.id === id ? ({ ...i, quantity: Number(newQty) }) : i));
    }
  };

  // Añadidos: logs para depurar eliminación/edición
  const _removeAddedItem = (id) => { console.log('Eliminar adicional:', id); setAddedItems(prev => prev.filter(i => i.id !== id)); };
  const _editAddedItem = (id, patch) => { console.log('Editar adicional:', id, patch); setAddedItems(prev => prev.map(i => i.id === id ? ({ ...i, ...patch }) : i)); };

  // Agregar adición rápida a la orden en edición
  const addQuickAdditionToOrder = (addition) => {
    const existing = addedItems.find(item => item.name === addition.name);
    if (existing) {
      setAddedItems(prev => prev.map(item => 
        item.id === existing.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item
      ));
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const newItem = { 
        id, 
        name: addition.name, 
        amount: addition.price || addition.amount || 0,
        quantity: 1
      };
      console.log('Añadiendo adición rápida:', newItem);
      setAddedItems(prev => ([...prev, newItem]));
      setAddedItemsSource('new');
    }
  };

  // Agregar item principal a la orden en edición
  const addMainItemToOrder = (type, subType, orderType) => {
    const price = getQuickPrice(type, subType, orderType);
    const name = getQuickName(type, subType);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const newItem = { 
      id, 
      name: `${name} (Principal)`, 
      amount: price 
    };
    console.log('Añadiendo item principal:', newItem);
    setAddedItems(prev => ([...prev, newItem]));
    setAddedItemsSource('new');
  };

  // Funciones para manipular los items principales mostrados cuando se edita
  const updateMainItemQuantity = (id, newQty) => {
    if (newQty <= 0) {
      setDisplayedMainItems(prev => prev.filter(i => i.id !== id));
    } else {
      setDisplayedMainItems(prev => prev.map(i => i.id === id ? ({ ...i, quantity: Number(newQty) }) : i));
    }
  };

  const removeMainItem = (id) => setDisplayedMainItems(prev => prev.filter(i => i.id !== id));

  // Configurar pago dividido
  const handleSplitPayment = (type) => {
    if (!selectedOrder) return;
    
    const total = parseFloat(selectedOrder.total) || 0;
    let splitAmount = 0;
    
    switch(type) {
      case '50-50':
        splitAmount = total / 2;
        break;
      case '1-3':
        splitAmount = total / 3;
        break;
      default:
        splitAmount = total;
    }
    
    setPaymentData(prev => ({
      ...prev,
      amount: Math.round(splitAmount),
      splitType: type
    }));
    setPaymentMode('split');
    // inicializar paymentLines dependiendo del tipo
    if (type === '50-50') {
      setPaymentLines([{ method: 'efectivo', amount: Math.round(total/2) }, { method: 'efectivo', amount: Math.round(total/2) }]);
    } else if (type === '1-3') {
      const part = Math.round(total/3);
      setPaymentLines([{ method: 'efectivo', amount: part }, { method: 'efectivo', amount: part }, { method: 'efectivo', amount: total - part*2 }]);
    } else {
      setPaymentLines([]);
    }
  };

  const splitTotal = useMemo(() => paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), [paymentLines]);
  const splitIsExact = useMemo(() => {
    const total = parseFloat(selectedOrder?.total || 0);
    return Math.round(splitTotal) === Math.round(total);
  }, [splitTotal, selectedOrder]);

  const addSplitLine = () => setPaymentLines(prev => ([...prev, { method: 'efectivo', amount: 0 }]));
  const removeSplitLine = (idx) => setPaymentLines(prev => prev.filter((_, i) => i !== idx));
  const updateSplitLine = (idx, patch) => setPaymentLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const fillAllWith = (method) => setPaymentLines(prev => prev.map(l => ({ ...l, method })));

  // Recalcular automáticamente los vueltos cuando cambian las líneas, el monto en efectivo o el modo
  useEffect(() => {
    // Si no hay monto en efectivo ingresado, ocultar calculadora
    if (!cashAmount) {
      setCalculatedChange(0);
      setShowChangeCalculator(false);
      return;
    }

    // Determinar cuánto corresponde a efectivo: si está dividido, sumar sólo las líneas 'efectivo'
    const efectivoTotal = paymentMode === 'split'
      ? paymentLines.reduce((s, l) => s + (l.method === 'efectivo' ? (parseFloat(l.amount) || 0) : 0), 0)
      : (parseFloat(paymentData.amount) || 0);

    const changeInfo = calculateChange(efectivoTotal, parseFloat(cashAmount) || 0);
    setCalculatedChange(changeInfo.total);
    setShowChangeCalculator(Boolean(parseFloat(cashAmount)));
  }, [paymentLines, cashAmount, paymentMode, paymentData.amount]);

  // Botones rápidos para billetes
  const quickCashButtons = [10000, 20000, 50000, 100000];

  // Función para borrar todas las órdenes en las colecciones de mesero/desayuno
  const deleteAllOrders = async () => {
    // Only admins can perform destructive bulk deletes
    if (role !== 2) return setError('No tienes permiso para eliminar todas las órdenes');
    if (!window.confirm('¿Eliminar todas las órdenes (mesa y desayuno)? Esto no se puede deshacer.')) return;
    try {
      const { getDocs, collection: coll, deleteDoc, doc: docRef } = await import('firebase/firestore');
      const tableSnapshot = await getDocs(coll(db, 'tableOrders'));
      for (const d of tableSnapshot.docs) {
        await deleteDoc(docRef(db, 'tableOrders', d.id));
      }
      const breakfastSnapshot = await getDocs(coll(db, 'breakfastOrders'));
      for (const d of breakfastSnapshot.docs) {
        await deleteDoc(docRef(db, 'breakfastOrders', d.id));
      }
      setSuccess('✅ Todas las órdenes fueron eliminadas');
    } catch (error) {
      setError(`Error eliminando órdenes: ${error.message}`);
    }
  };

  // Función para borrar todas las órdenes completadas (pagadas)
  const deleteCompletedOrders = async () => {
    if (role !== 2) return setError('No tienes permiso para eliminar órdenes completadas');
    if (!window.confirm('¿Eliminar todas las órdenes completadas (pagadas)? Esto no se puede deshacer.')) return;
    try {
      const { getDocs, collection: coll, deleteDoc, doc: docRef, query, where } = await import('firebase/firestore');
      // tableOrders pagadas
      const q1 = query(coll(db, 'tableOrders'), where('isPaid', '==', true));
      const tableSnapshot = await getDocs(q1);
      for (const d of tableSnapshot.docs) {
        await deleteDoc(docRef(db, 'tableOrders', d.id));
      }
      // breakfastOrders pagadas
      const q2 = query(coll(db, 'breakfastOrders'), where('isPaid', '==', true));
      const breakfastSnapshot = await getDocs(q2);
      for (const d of breakfastSnapshot.docs) {
        await deleteDoc(docRef(db, 'breakfastOrders', d.id));
      }
      setSuccess('✅ Todas las órdenes completadas fueron eliminadas');
    } catch (error) {
      setError(`Error eliminando órdenes completadas: ${error.message}`);
    }
  };

  // Borrar pedidos pagados por mesa (tableNumber)
  const deletePaidByTable = async (tableNumber) => {
    if (role !== 2) return setError('No tienes permiso para eliminar órdenes pagadas por mesa');
    if (!window.confirm(`¿Eliminar las órdenes pagadas de ${tableNumber}? Esto no se puede deshacer.`)) return;
    try {
      const { getDocs, collection: coll, deleteDoc, doc: docRef, query, where } = await import('firebase/firestore');
      // Si la mesa es 'Sin mesa', buscamos documentos donde 'tableNumber' no exista o sea falsy
      if (tableNumber === 'Sin mesa') {
        const q1 = query(coll(db, 'tableOrders'), where('isPaid', '==', true));
        const tableSnapshot = await getDocs(q1);
        for (const d of tableSnapshot.docs) {
          const data = d.data();
          if (!data.tableNumber) await deleteDoc(docRef(db, 'tableOrders', d.id));
        }

        const q2 = query(coll(db, 'breakfastOrders'), where('isPaid', '==', true));
        const breakfastSnapshot = await getDocs(q2);
        for (const d of breakfastSnapshot.docs) {
          const data = d.data();
          if (!data.tableNumber) await deleteDoc(docRef(db, 'breakfastOrders', d.id));
        }

        // Actualizar estado local: remover órdenes sin tableNumber que estén pagadas
        setTableOrders(prev => prev.filter(o => !(o.isPaid && !o.tableNumber)));
        setBreakfastOrders(prev => prev.filter(o => !(o.isPaid && !o.tableNumber)));
        setSuccess(`✅ Órdenes pagadas de ${tableNumber} eliminadas`);
      } else {
        const q1 = query(coll(db, 'tableOrders'), where('tableNumber', '==', tableNumber), where('isPaid', '==', true));
        const tableSnapshot = await getDocs(q1);
        for (const d of tableSnapshot.docs) {
          await deleteDoc(docRef(db, 'tableOrders', d.id));
        }
        const q2 = query(coll(db, 'breakfastOrders'), where('tableNumber', '==', tableNumber), where('isPaid', '==', true));
        const breakfastSnapshot = await getDocs(q2);
        for (const d of breakfastSnapshot.docs) {
          await deleteDoc(docRef(db, 'breakfastOrders', d.id));
        }

        // Actualizar estado local: remover órdenes de la mesa específica
        setTableOrders(prev => prev.filter(o => !(o.isPaid && o.tableNumber === tableNumber)));
        setBreakfastOrders(prev => prev.filter(o => !(o.isPaid && o.tableNumber === tableNumber)));
        setSuccess(`✅ Órdenes pagadas de ${tableNumber} eliminadas`);
      }
    } catch (error) {
      setError(`Error eliminando órdenes pagadas de ${tableNumber}: ${error.message}`);
    }
  };

  // Borrar una orden individual por id (detecta collection por orderType)
  const deleteSingleOrder = async (order) => {
    // Only admins may delete individual orders
    if (role !== 2) return setError('No tienes permiso para eliminar esta orden');
    if (!window.confirm(`¿Eliminar la orden ${order.id.substring(0,8)}? Esto no se puede deshacer.`)) return;
    try {
      const { deleteDoc, doc: docRef } = await import('firebase/firestore');
      const collectionName = order.orderType === 'mesa' ? 'tableOrders' : 'breakfastOrders';
      await deleteDoc(docRef(db, collectionName, order.id));
      setSuccess(`✅ Orden ${order.id.substring(0,8)} eliminada`);
      // Actualizar estado local para remover la orden de la UI sin esperar al snapshot
      if (collectionName === 'tableOrders') {
        setTableOrders(prev => prev.filter(o => o.id !== order.id));
      } else {
        setBreakfastOrders(prev => prev.filter(o => o.id !== order.id));
      }
    } catch (error) {
      setError(`Error eliminando orden: ${error.message}`);
    }
  };

  return (
    <div className="w-full mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
      {/* Header con estadísticas */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-100 flex items-center">
            <CurrencyDollarIcon className="w-6 h-6 mr-2" />
            Caja Registradora
          </h2>
          <div className="flex items-center space-x-3">
            <div className="text-sm text-gray-400">{currentTime.toLocaleTimeString('es-CO')}</div>
            <button onClick={() => setPosMode(m => !m)} className={`px-3 py-1 ${posMode ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs rounded-lg`}>{posMode ? 'POS Activo' : 'Abrir POS'}</button>
            {!posMode && (
              <button onClick={() => {
                setShowCreateModal(true);
                setCreateMode('manual');
                setManualOrder({ orderType: 'almuerzo', tableNumber: '', takeaway: false, total: '', paymentMethod: 'efectivo', note: '' });
                setManualAddedItems([]); setManualNewAddedName(''); setManualNewAddedAmount('');
                setQuickOrderType('almuerzo'); setQuickTableNumber(''); setQuickPaymentMethod('efectivo'); setQuickNote(''); setQuickItems([]);
              }} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg">➕ Crear Pedido</button>
            )}
            {/* Botón global de eliminar todas removido: ahora se usa el icono por mesa */}
          </div>
        </div>

        {/* ===================== SECCIÓN POS RÁPIDO ===================== */}
        {posMode && (
          <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Catálogo */}
            <div className="lg:col-span-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <h3 className="text-lg font-semibold text-gray-100 flex items-center">Artículos</h3>
                <div className="flex flex-wrap gap-3 items-center">
                  <CategoryFilter posItems={posItems} onSelect={setCategoryFilter} current={categoryFilter} />
                  {role === 2 && (
                    <button onClick={openNewItemEditor} className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"><PlusCircleIcon className="w-5 h-5 mr-1"/>Nuevo</button>
                  )}
                </div>
              </div>
              <div className="space-y-6">
                {groupedItems.map(group => (
                  <div key={group.category || 'sin-cat'}>
                    <div className="flex items-center mb-2">
                      <span className="text-[10px] uppercase tracking-wide text-gray-400 bg-gray-700/40 px-2 py-1 rounded">{group.category || 'Sin Categoría'}</span>
                      <span className="ml-2 text-[10px] text-gray-500">{group.items.length}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                      {group.items.map(item => {
                        const shapeClass = item.shape === 'circle' ? 'rounded-full' : item.shape === 'square' ? 'rounded-lg' : item.shape === 'outline' ? 'rounded-full ring-2 ring-offset-2 ring-white' : '';
                        const hexStyle = item.shape === 'hex' ? { clipPath: 'polygon(25% 5%,75% 5%,95% 50%,75% 95%,25% 95%,5% 50%)' } : {};
                        const bg = item.imageData ? `url(${item.imageData})` : (item.color || '#374151');
                        const isInCart = cartItems.find(ci => ci.refId === item.id);
                        return (
                          <div key={item.id} className="relative group">
                            {role === 2 && (
                              <button onClick={() => openEditItem(item)} className="absolute -top-2 -right-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"><PencilIcon className="w-4 h-4"/></button>
                            )}
                            <button onClick={() => handleAddPosItem(item)} className={`w-24 h-24 mx-auto flex flex-col items-center justify-center text-center text-xs font-medium text-gray-900 dark:text-gray-100 shadow-md hover:shadow-lg transition relative overflow-hidden ${shapeClass}`} style={{ background: item.imageData ? bg : item.shape === 'outline' ? 'transparent' : bg, backgroundSize: 'cover', backgroundPosition: 'center', ...hexStyle }}>
                              {!item.imageData && item.shape === 'outline' && <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 3px ${item.color || '#ffffff'}` }} />}
                              <span className="z-10 px-1 drop-shadow">
                                {item.name}
                                {isInCart && <span className="block text-[10px] font-bold mt-1">x{isInCart.quantity}</span>}
                              </span>
                            </button>
                            <div className="mt-1 text-center text-[11px] text-gray-400">{formatPrice(item.price||0)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {groupedItems.length === 0 && (
                  <div className="text-sm text-gray-400">No hay artículos. {role===2 && 'Crea uno nuevo.'}</div>
                )}
              </div>
            </div>

            {/* Carrito / Resumen */}
            <div className={`${theme==='dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl p-4 shadow-lg flex flex-col`}>
              <h3 className="text-lg font-semibold text-gray-100 mb-3">{posStage==='select' ? 'Resumen' : 'Detalle del Pedido'}</h3>
              {posStage==='select' && (
                <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                  <div>
                    <label className="block text-gray-400 mb-1">Tipo Pedido</label>
                    <select value={posOrderType} onChange={e=>setPosOrderType(e.target.value)} className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs">
                      <option value="almuerzo">Almuerzo</option>
                      <option value="desayuno">Desayuno</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Mesa / vacío = Llevar</label>
                    <input value={posTableNumber} onChange={e=>setPosTableNumber(e.target.value)} className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs"/>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1">
                {cartItems.length === 0 && <div className="text-sm text-gray-400">Añade artículos con un click.</div>}
                {cartItems.map(ci => (
                  <div key={ci.id} className="flex items-center justify-between text-sm bg-gray-700 rounded p-2">
                    <div className="flex-1 mr-2">
                      <div className="font-medium text-gray-100 truncate">{ci.name}</div>
                      <div className="text-[11px] text-gray-400">{formatPrice(ci.price)} c/u</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity-1)} className="w-6 h-6 bg-red-600 text-white rounded text-xs">-</button>
                      <input type="number" value={ci.quantity} onChange={(e)=>updateCartItemQuantity(ci.id, Number(e.target.value||0))} className="w-10 px-1 py-0.5 text-center rounded bg-gray-800 text-white text-xs" />
                      <button onClick={()=>updateCartItemQuantity(ci.id, ci.quantity+1)} className="w-6 h-6 bg-green-600 text-white rounded text-xs">+</button>
                      <button onClick={()=>removeCartItem(ci.id)} className="w-6 h-6 bg-red-700 text-white rounded text-xs">x</button>
                    </div>
                  </div>
                ))}
              </div>
              {posStage==='pay' && (
                <>
                  <div className="mb-3 border-t border-gray-700 pt-3">
                    <label className="block text-gray-400 mb-1 text-xs">Nota</label>
                    <input value={posNote} onChange={e=>setPosNote(e.target.value)} className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs"/>
                  </div>
                  <div className="mb-3">
                    <label className="block text-gray-400 mb-1 text-xs">Método de Pago</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['efectivo','nequi','daviplata'].map(m => (
                        <button key={m} onClick={()=>setPosPaymentMethod(m)} className={`py-2 text-xs rounded border-2 ${posPaymentMethod===m ? 'border-blue-500 bg-blue-500/20 text-blue-300':'border-gray-600 text-gray-300 hover:bg-gray-700'}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  {posPaymentMethod==='efectivo' && (
                    <div className="mb-3">
                      <label className="block text-gray-400 mb-1 text-xs">Billetes Rápidos</label>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        {quickCashButtons.map(b => (
                          <button key={b} onClick={()=>setPosCashAmount(String(b))} className="py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">{formatPrice(b)}</button>
                        ))}
                      </div>
                      <input type="number" placeholder="Monto recibido" value={posCashAmount} onChange={(e)=>setPosCashAmount(e.target.value)} className="w-full px-2 py-1 rounded bg-gray-700 text-white text-xs"/>
                      {posCashAmount && <div className={`mt-1 text-xs ${posCalculatedChange>=0?'text-green-400':'text-red-400'}`}>Vueltos: {formatPrice(posCalculatedChange)}</div>}
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-300 font-medium">Total:</div>
                <div className="text-xl font-bold text-green-400">{formatPrice(cartTotal)}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={resetCart} className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm">{posStage==='select' ? 'Limpiar' : 'Cancelar'}</button>
                <button onClick={handleProcessPosSale} className={`flex-1 py-2 ${posStage==='select' ? 'bg-green-600 hover:bg-green-700':'bg-blue-600 hover:bg-blue-700'} text-white rounded text-sm font-semibold`} disabled={cartItems.length===0}>{posStage==='select' ? 'Cobrar' : 'Confirmar Pago'}</button>
              </div>
              {posStage==='pay' && (
                <button onClick={()=>setPosStage('select')} className="mt-2 w-full py-1.5 text-xs text-gray-400 hover:text-gray-200 transition">← Volver a editar items</button>
              )}
            </div>
          </div>
        )}
        {/* ===================== FIN SECCIÓN POS ===================== */}

        {/* ===================== RESUMEN DEL DÍA (Mejor separación visual) ===================== */}
        <div className="mt-10 mb-8">
          <div className="flex items-center gap-3 mb-4 select-none">
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-600/40 to-transparent" />
            <h3 className="text-xs tracking-[0.15em] font-semibold uppercase text-gray-400 flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4 text-blue-400" /> Resumen del Día
            </h3>
            <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-600/40 to-transparent" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {!canDeleteAll && (
              <div className={`group relative overflow-hidden rounded-xl p-4 flex flex-col justify-between shadow-sm ring-1 ${theme === 'dark' ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/70 ring-gray-700/60' : 'bg-white ring-gray-200'} border-l-4 border-green-500`}> 
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <CheckCircleIcon className="w-8 h-8 text-green-500 drop-shadow" />
                  </div>
                  <div className="flex flex-col">
                    <div className="text-2xl font-bold tracking-tight text-green-500 leading-none">{dayStats.totalOrders}</div>
                    <div className="mt-1 inline-flex items-center gap-1">
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Pagadas Hoy</span>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-green-500/5 to-transparent" />
              </div>
            )}

            {/* Nequi */}
            <div className={`group relative overflow-hidden rounded-xl p-4 flex flex-col justify-between shadow-sm ring-1 ${theme === 'dark' ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/70 ring-gray-700/60' : 'bg-white ring-gray-200'} border-l-4 border-purple-500`}>
              <div className="flex items-start gap-3">
                <DevicePhoneMobileIcon className="w-6 h-6 text-purple-500 mt-1" />
                <div>
                  <div className="text-lg font-semibold text-purple-400 leading-tight">{formatPrice(dayStats.nequi)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-purple-300/80 font-medium bg-purple-500/10 inline-block px-2 py-0.5 rounded-full border border-purple-500/20">Nequi</div>
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-purple-500/5 to-transparent" />
            </div>

            {/* Daviplata */}
            <div className={`group relative overflow-hidden rounded-xl p-4 flex flex-col justify-between shadow-sm ring-1 ${theme === 'dark' ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/70 ring-gray-700/60' : 'bg-white ring-gray-200'} border-l-4 border-orange-500`}>
              <div className="flex items-start gap-3">
                <CreditCardIcon className="w-6 h-6 text-orange-500 mt-1" />
                <div>
                  <div className="text-lg font-semibold text-orange-400 leading-tight">{formatPrice(dayStats.daviplata)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-orange-300/80 font-medium bg-orange-500/10 inline-block px-2 py-0.5 rounded-full border border-orange-500/20">Daviplata</div>
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-orange-500/5 to-transparent" />
            </div>

            {/* Efectivo */}
            <div className={`group relative overflow-hidden rounded-xl p-4 flex flex-col justify-between shadow-sm ring-1 ${theme === 'dark' ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/70 ring-gray-700/60' : 'bg-white ring-gray-200'} border-l-4 border-gray-500`}>
              <div className="flex items-start gap-3">
                <BanknotesIcon className="w-6 h-6 text-gray-400 mt-1" />
                <div>
                  <div className="text-lg font-semibold text-gray-300 leading-tight">{formatPrice(dayStats.efectivo)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-400/80 font-medium bg-gray-500/10 inline-block px-2 py-0.5 rounded-full border border-gray-500/20">Efectivo</div>
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-gray-400/10 to-transparent" />
            </div>

            {/* Total General */}
            <div className={`group relative overflow-hidden rounded-xl p-4 flex flex-col justify-between shadow-sm ring-1 ${theme === 'dark' ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/70 ring-gray-700/60' : 'bg-white ring-gray-200'} border-l-4 border-blue-500`}>
              <div className="flex items-start gap-3">
                <CurrencyDollarIcon className="w-6 h-6 text-blue-500 mt-1" />
                <div>
                  <div className="text-lg font-bold text-blue-400 leading-tight">{formatPrice(dayStats.totalAmount)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-blue-300/80 font-semibold bg-blue-500/10 inline-block px-2 py-0.5 rounded-full border border-blue-500/20">Total Día</div>
                </div>
              </div>
              <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-blue-500/5 to-transparent" />
            </div>
          </div>
        </div>
        {/* ===================== FIN RESUMEN DEL DÍA ===================== */}

        {/* Búsqueda: separada y con padding lateral */}
        <div className="px-4">
          <div className="relative mb-6">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por mesa, orden, cliente o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-3 rounded-lg border ${
                theme === 'dark' 
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
          </div>
        </div>
        {Object.entries(ordersByTable).map(([tableNumber, orders]) => {
          const unpaidOrders = orders.filter(order => !order.isPaid);
          const hasUnpaidOrders = unpaidOrders.length > 0;
          const totalAmount = unpaidOrders.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0);
          const oldestOrder = unpaidOrders.reduce((oldest, order) => {
            const orderTime = new Date(order.createdAt?.seconds * 1000 || order.createdAt);
            const oldestTime = new Date(oldest.createdAt?.seconds * 1000 || oldest.createdAt);
            return orderTime < oldestTime ? order : oldest;
          }, unpaidOrders[0]);
          
          const urgencyColor = oldestOrder ? getUrgencyColor(oldestOrder.createdAt) : 'gray';

          return (
            <div
              key={tableNumber}
              className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-6 border-l-4 ${
                urgencyColor === 'red' ? 'border-red-500' :
                urgencyColor === 'yellow' ? 'border-yellow-500' :
                urgencyColor === 'green' ? 'border-green-500' : 'border-gray-500'
              } hover:shadow-xl ${
                !hasUnpaidOrders ? 'opacity-50' : ''
              }`}
            >
              {/* Cabecera de mesa */}
              <div className="flex justify-between items-center mb-3">
                {canDeleteAll ? (
                  <h3 className="text-2xl font-bold text-gray-100">Pedidos <span className="text-sm text-gray-400 ml-2">{unpaidOrders.length}</span></h3>
                ) : (
                  <h3 className="text-2xl font-bold text-gray-100">🍽️ Mesa {tableNumber}</h3>
                )}
                <div className="text-right flex items-center space-x-2">
                  <div className="text-xs text-gray-400">{unpaidOrders.length} orden(es)</div>
                  {canDeleteAll && (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`¿Eliminar ${unpaidOrders.length} orden(es) sin pagar de la mesa ${tableNumber}? Esto no se puede deshacer.`)) return;
                        try {
                          const { getDocs, collection: coll, deleteDoc, doc: docRef, query, where } = await import('firebase/firestore');
                          // Determinar colección a filtrar (tableOrders o breakfastOrders)
                          const tableSnapshot = await getDocs(coll(db, 'tableOrders'));
                          // Filtrar por tableNumber y isPaid=false
                          const q = query(coll(db, 'tableOrders'), where('tableNumber', '==', tableNumber), where('isPaid', '==', false));
                          const snapshot = await getDocs(q);
                          for (const d of snapshot.docs) {
                            await deleteDoc(docRef(db, 'tableOrders', d.id));
                          }
                          // También eliminar de breakfastOrders si aplica (en caso de 'Sin mesa' o mixes)
                          const q2 = query(coll(db, 'breakfastOrders'), where('tableNumber', '==', tableNumber), where('isPaid', '==', false));
                          const snapshot2 = await getDocs(q2);
                          for (const d of snapshot2.docs) {
                            await deleteDoc(docRef(db, 'breakfastOrders', d.id));
                          }
                          setSuccess(`✅ ${unpaidOrders.length} orden(es) eliminadas de la mesa ${tableNumber}`);
                        } catch (err) {
                          setError(`Error eliminando órdenes de la mesa ${tableNumber}: ${err.message}`);
                        }
                      }}
                      className="p-1 rounded-md text-red-400 hover:text-white hover:bg-red-600"
                      title={`Eliminar ${unpaidOrders.length} orden(es)`}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Órdenes de la mesa */}
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {unpaidOrders.map((order) => {
                  const orderTime = new Date(order.createdAt?.seconds * 1000 || order.createdAt);
                  const minutesAgo = Math.floor((new Date() - orderTime) / (1000 * 60));
                  
                  return (
                    <div
                      key={order.id}
                      className={`p-3 rounded-lg border ${
                        theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="text-sm font-medium text-gray-100">
                            {order.orderType === 'desayuno' ? '🌅 Desayuno' : '🍽️ Almuerzo'}
                          </div>
                          <div className="text-xs text-gray-400">{getOrderLabel(order)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-green-400">
                            {formatPrice(order.total)}
                          </div>
                          <div className={`text-xs ${minutesAgo > 30 ? 'text-red-400' : minutesAgo > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {minutesAgo}min
                          </div>
                        </div>
                        {order.isPaid && order.paymentMethod && (
                          <div className="flex items-center justify-end space-x-1">
                            {getPaymentIcon(order.paymentMethod)}
                            <span className="text-xs text-green-600 capitalize">
                              {order.paymentMethod}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {!order.isPaid && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleOpenPayment(order)}
                            className="flex-1 mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                          >
                            💰 Procesar Pago
                          </button>
                          {(canDeleteAll && role === 2) && (
                            <button onClick={() => deleteSingleOrder(order)} className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg flex items-center" title={`Eliminar orden ${order.id.substring(0,8)}`}>
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                
              </div>

              {/* Estado de la mesa */}
              {!hasUnpaidOrders && (
                <div className="text-center py-4">
                  <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <div className="text-sm text-gray-400">Mesa libre</div>
                </div>
              )}
            </div>
          );
        })}
        {/* Sección: Pedidos Completados */}
        {/* Modal: Crear Pedido Manual (desde Caja) */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto`}> 
              <div className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>➕ Crear Pedido Manual</h3>
                    <button onClick={() => setShowCreateModal(false)} className={`text-gray-400 hover:text-gray-200`}><XCircleIcon className="w-6 h-6" /></button>
                  </div>

                  {/* Pestañas */}
                  <div className="flex mb-4 border-b border-gray-600">
                    <button 
                      onClick={() => setCreateMode('manual')} 
                      className={`px-4 py-2 ${createMode === 'manual' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
                    >
                      Manual
                    </button>
                    <button 
                      onClick={() => setCreateMode('quick')} 
                      className={`px-4 py-2 ${createMode === 'quick' ? 'border-b-2 border-blue-500 text-blue-400' : 'text-gray-400'}`}
                    >
                      Rápido
                    </button>
                  </div>

                  {createMode === 'manual' && (
                    <>
                <div className="mb-3">
                  <label className="text-sm text-gray-300">Tipo</label>
                  <select value={manualOrder.orderType} onChange={(e) => setManualOrder(prev => ({ ...prev, orderType: e.target.value }))} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                    <option value="almuerzo">Almuerzo</option>
                    <option value="desayuno">Desayuno</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="text-sm text-gray-300">Mesa (dejar vacío para Para llevar)</label>
                          <input value={manualOrder.tableNumber} onChange={(e) => setManualOrder(prev => ({ ...prev, tableNumber: e.target.value }))} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>

                <div className="mb-3">
                  <label className="text-sm text-gray-300">Total (COP)</label>
                          <input type="number" value={manualOrder.total} onChange={(e) => setManualOrder(prev => ({ ...prev, total: e.target.value }))} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                </div>

                <div className="mb-3">
                  <label className="text-sm text-gray-300">Método de pago</label>
                  <select value={manualOrder.paymentMethod} onChange={(e) => setManualOrder(prev => ({ ...prev, paymentMethod: e.target.value }))} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                    <option value="efectivo">Efectivo</option>
                    <option value="nequi">Nequi</option>
                    <option value="daviplata">Daviplata</option>
                  </select>
                </div>

                <div className="mb-3">
                  <label className="text-sm text-gray-300">Nota (opcional)</label>
                  <input value={manualOrder.note} onChange={(e) => setManualOrder(prev => ({ ...prev, note: e.target.value }))} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                </div>

                {/* Adicionales manuales */}
                <div className="mb-3">
                  <div className="flex gap-2 mb-2">
                    <input placeholder="Descripción" value={manualNewAddedName} onChange={(e) => setManualNewAddedName(e.target.value)} className={`flex-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                    <input placeholder="Monto" type="number" value={manualNewAddedAmount} onChange={(e) => setManualNewAddedAmount(e.target.value)} className={`w-28 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                    <button onClick={() => {
                      const name = String(manualNewAddedName || '').trim();
                      const amount = Math.floor(Number(manualNewAddedAmount || 0));
                      if (!name || !amount) return setError('Nombre y monto del adicional son obligatorios');
                      setManualAddedItems(prev => ([...prev, { id: `${Date.now()}`, name, amount }]));
                      setManualNewAddedName(''); setManualNewAddedAmount('');
                    }} className="px-3 py-1 bg-blue-600 text-white rounded">+Añadir</button>
                  </div>
                  <div className="space-y-1">
                    {manualAddedItems.map(it => (
                      <div key={it.id} className="flex justify-between items-center p-2 border rounded">
                        <div>
                  <div className="text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}">{it.name}</div>
                  <div className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{formatPrice(it.amount)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input type="number" value={it.amount} onChange={(e) => setManualAddedItems(prev => prev.map(x => x.id === it.id ? ({ ...x, amount: Number(e.target.value || 0) }) : x))} className={`w-20 p-1 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                          <button onClick={() => setManualAddedItems(prev => prev.filter(x => x.id !== it.id))} className="px-2 py-1 bg-red-600 text-white rounded">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                    </>
                  )}

                  {createMode === 'quick' && (
                    <div>
                      {/* Tipo de pedido */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">Tipo de Pedido</label>
                        <div className="flex gap-2 mt-1">
                          <button 
                            onClick={() => setQuickOrderType('almuerzo')} 
                            className={`px-4 py-2 rounded ${quickOrderType === 'almuerzo' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                          >
                            🍽️ Almuerzo
                          </button>
                          <button 
                            onClick={() => setQuickOrderType('desayuno')} 
                            className={`px-4 py-2 rounded ${quickOrderType === 'desayuno' ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                          >
                            🌅 Desayuno
                          </button>
                        </div>
                      </div>

                      {/* Mesa o Llevar */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">Tipo de Servicio</label>
                        <div className="flex gap-2 mt-1">
                          <button 
                            onClick={() => setQuickTableNumber('')} 
                            className={`px-4 py-2 rounded ${quickTableNumber === '' ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'}`}
                          >
                            🏃 Para Llevar
                          </button>
                          <input 
                            placeholder="Número de Mesa" 
                            value={quickTableNumber} 
                            onChange={(e) => setQuickTableNumber(e.target.value)} 
                            className={`px-4 py-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`}
                          />
                        </div>
                      </div>

                      {/* Opciones según tipo */}
                      {quickOrderType === 'almuerzo' && (
                        <div className="mb-3">
                          <label className="text-sm text-gray-300">Selecciona tu Almuerzo</label>
                          <div className="grid grid-cols-1 gap-2 mt-1">
                            <button 
                              onClick={() => addQuickItem('almuerzo', 'normal', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Normal</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 12000 : 13000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('almuerzo', 'bandeja', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Bandeja</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 11000 : 12000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('almuerzo', 'mojarra', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Mojarra</div>
                              <div className="text-sm">{formatPrice(16000)}</div>
                            </button>
                          </div>
                        </div>
                      )}

                      {quickOrderType === 'desayuno' && (
                        <div className="mb-3">
                          <label className="text-sm text-gray-300">Selecciona tu Desayuno</label>
                          <div className="grid grid-cols-1 gap-2 mt-1">
                            <button 
                              onClick={() => addQuickItem('desayuno', 'solo_huevos', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Huevos</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 7000 : 8000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'solo_caldo_costilla', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Caldo Costilla</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 7000 : 8000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'solo_caldo_pescado', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Caldo Pescado</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 7000 : 8000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'solo_caldo_pata', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Caldo Pata</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 8000 : 9000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'solo_caldo_pajarilla', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Solo Caldo Pajarilla</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 9000 : 10000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'desayuno_completo_costilla', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Desayuno Completo Costilla</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 11000 : 12000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'desayuno_completo_pescado', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Desayuno Completo Pescado</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 11000 : 12000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'desayuno_completo_pata', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Desayuno Completo Pata</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 12000 : 13000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'desayuno_completo_pajarilla', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Desayuno Completo Pajarilla</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 13000 : 14000)}</div>
                            </button>
                            <button 
                              onClick={() => addQuickItem('desayuno', 'monona', quickTableNumber ? 'table' : 'takeaway')}
                              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left"
                            >
                              <div className="font-medium">Mañona</div>
                              <div className="text-sm">{formatPrice(quickTableNumber ? 13000 : 14000)}</div>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Adiciones - mover arriba para acceso rápido */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">🍴 Adiciones Rápidas</label>
                        <div className="grid grid-cols-2 gap-2 mt-1 max-h-32 overflow-y-auto">
                          {currentQuickAdditions.map(addition => (
                            <button
                              key={addition.id}
                              onClick={() => addQuickAddition(addition)}
                              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                            >
                              <div className="font-medium">{addition.name}</div>
                              <div className="text-xs opacity-90">+{formatPrice(addition.price)}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Items principales seleccionados */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">🍽️ Items Principales</label>
                        <div className="space-y-2 mt-1">
                          {quickItems.filter(item => item.type !== 'addition').map(item => (
                            <div key={item.id} className="flex justify-between items-center p-2 border rounded">
                              <div>
                                <div className="text-sm font-medium">{item.name}</div>
                                <div className="text-xs text-gray-400">{formatPrice(item.price)} x {item.quantity}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateQuickItemQuantity(item.id, item.quantity - 1)} className="px-2 py-1 bg-red-600 text-white rounded">-</button>
                                <span className="text-sm font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuickItemQuantity(item.id, item.quantity + 1)} className="px-2 py-1 bg-green-600 text-white rounded">+</button>
                                <button onClick={() => removeQuickItem(item.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">X</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Adiciones seleccionadas */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">➕ Adiciones Seleccionadas</label>
                        <div className="space-y-2 mt-1">
                          {quickItems.filter(item => item.type === 'addition').map(item => (
                            <div key={item.id} className="flex justify-between items-center p-2 border rounded bg-blue-50 dark:bg-blue-900/20">
                              <div>
                                <div className="text-sm font-medium">{item.name}</div>
                                <div className="text-xs text-gray-400">{formatPrice(item.price)} x {item.quantity}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateQuickItemQuantity(item.id, item.quantity - 1)} className="px-2 py-1 bg-red-600 text-white rounded">-</button>
                                <span className="text-sm font-medium">{item.quantity}</span>
                                <button onClick={() => updateQuickItemQuantity(item.id, item.quantity + 1)} className="px-2 py-1 bg-green-600 text-white rounded">+</button>
                                <button onClick={() => removeQuickItem(item.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">X</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Método de pago */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">Método de pago</label>
                        <select value={quickPaymentMethod} onChange={(e) => setQuickPaymentMethod(e.target.value)} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="efectivo">Efectivo</option>
                          <option value="nequi">Nequi</option>
                          <option value="daviplata">Daviplata</option>
                        </select>
                      </div>

                      {/* Nota */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">Nota (opcional)</label>
                        <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)} className={`w-full mt-1 p-2 rounded border ${theme === 'dark' ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'}`} />
                      </div>

                      {/* Total */}
                      <div className="mb-3">
                        <label className="text-sm text-gray-300">Total</label>
                        <div className="text-lg font-bold text-green-400">{formatPrice(calculateQuickTotal())}</div>
                      </div>
                    </div>
                  )}

                <div className="flex space-x-3">
                  <button onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2 bg-gray-600 text-white rounded">Cancelar</button>
                  <button onClick={async () => {
                    try {
                      let payload;
                      let collectionName;

                      if (createMode === 'manual') {
                        // Calcular el total de adiciones
                        const additionsTotal = manualAddedItems.reduce((s,a)=>s+(Number(a.amount||0)),0);
                        const mainTotal = Number(manualOrder.total || 0) - additionsTotal;
                        // Guardar ítem principal
                        const mainItems = mainTotal > 0 ? [{
                          id: 'main-1',
                          name: manualOrder.orderType === 'desayuno' ? 'Solo Huevos' : 'Almuerzo',
                          unitPrice: Math.round(mainTotal),
                          quantity: 1
                        }] : [];
                        payload = {
                          orderType: manualOrder.orderType,
                          tableNumber: manualOrder.tableNumber ? String(manualOrder.tableNumber).trim() : undefined,
                          takeaway: !manualOrder.tableNumber,
                          total: Math.round(Number(manualOrder.total) || additionsTotal),
                          items: mainItems,
                          addedItems: manualAddedItems.map(a => ({ id: a.id, name: a.name, amount: Number(a.amount || 0), quantity: 1 })),
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                          paymentNote: manualOrder.note || ''
                        };
                        collectionName = manualOrder.orderType === 'almuerzo' ? 'tableOrders' : 'breakfastOrders';
                      } else if (createMode === 'quick') {
                        const total = calculateQuickTotal();
                        // Guardar items principales y adiciones separados
                        const mainItems = quickItems.filter(item => item.type !== 'addition').map(item => ({
                          id: item.id,
                          name: item.name,
                          unitPrice: item.price,
                          quantity: item.quantity
                        }));
                        const additions = quickItems.filter(item => item.type === 'addition').map(item => ({
                          id: item.id,
                          name: item.name,
                          amount: item.price,
                          quantity: item.quantity
                        }));
                        payload = {
                          orderType: quickOrderType,
                          takeaway: !quickTableNumber.trim(),
                          total: Math.round(total),
                          items: mainItems,
                          addedItems: additions,
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                          paymentNote: quickNote || ''
                        };
                        if (quickTableNumber.trim()) payload.tableNumber = quickTableNumber.trim();
                        collectionName = quickOrderType === 'almuerzo' ? 'tableOrders' : 'breakfastOrders';
                      }

                      const ref = await addDoc(collection(db, collectionName), payload);
                      setSuccess('✅ Pedido creado exitosamente');
                      setShowCreateModal(false);
                      // Resetear estados
                      setManualOrder({ orderType: 'almuerzo', tableNumber: '', takeaway: false, total: '', paymentMethod: 'efectivo', note: '' });
                      setManualAddedItems([]);
                      setManualNewAddedName('');
                      setManualNewAddedAmount('');
                      setQuickOrderType('almuerzo');
                      setQuickTableNumber('');
                      setQuickPaymentMethod('efectivo');
                      setQuickNote('');
                      setQuickItems([]);
                    } catch (err) {
                      setError(`Error creando pedido: ${err.message}`);
                    }
                  }} className="flex-1 px-4 py-2 bg-green-600 text-white rounded">Crear y Marcar Pagado</button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-gray-200 mb-3">✅ Pedidos Completados</h3>
          {/* Botón global eliminado a petición del usuario; ahora se permite eliminación por mesa y por orden */}
          {Object.entries(paidOrdersByTable).length === 0 && (
            <div className="text-sm text-gray-400">No hay pedidos completados aún.</div>
          )}
          <div className="space-y-3">
            {Object.entries(paidOrdersByTable).map(([tableNumber, orders]) => (
              <div key={`paid-${tableNumber}`} className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-lg p-4 border-l-4 border-blue-500`}>
                <div className="flex justify-between items-center mb-2">
                  <div className="text-sm text-gray-300 flex items-center space-x-2">
                    <div>{canDeleteAll ? `Pedidos ${tableNumber}` : `Mesa ${tableNumber}`}</div>
                  </div>
                    <div className="text-xs text-gray-400 flex items-center space-x-2">
                      <div>{orders.length} orden(es)</div>
                      {(canDeleteAll && role === 2) && (
                        <button onClick={() => deletePaidByTable(tableNumber)} className="p-1 rounded-md text-red-400 hover:text-white hover:bg-red-600" title={`Eliminar ${orders.length} orden(es) pagadas`}>
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                </div>
                <div className="space-y-2">
                  {orders.map((order) => (
                    <div key={`paid-order-${order.id}`} className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-100">{order.orderType === 'desayuno' ? '🌅 Desayuno' : '🍽️ Almuerzo'}</div>
                          <div className="text-xs text-gray-400">{getOrderLabel(order)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-green-400">{formatPrice(order.paymentAmount || order.total)}</div>
                          {order.paymentMethod && <div className="text-xs text-gray-300 capitalize">{order.paymentMethod}</div>}
                        </div>
                      </div>
                      <div className="mt-3 flex space-x-2">
                        <button
                          onClick={() => handleOpenPayment(order)}
                          className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg"
                        >
                          ✏️ Editar Pago
                        </button>
                          {(canDeleteAll && role === 2) && (
                            <button onClick={() => deleteSingleOrder(order)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg flex items-center" title={`Eliminar orden ${order.id.substring(0,8)}`}>
                              <TrashIcon className="w-4 h-4 mr-2" />Eliminar
                            </button>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal de pago */}
      {showPaymentModal && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto`}>
            <div className="p-6">
              {/* Header del modal */}
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-100">
                  💰 Procesar Pago - Mesa {selectedOrder.tableNumber}
                </h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="text-gray-400 hover:text-gray-200"
                >
                  <XCircleIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Información de la orden */}
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'} mb-6`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">{getOrderLabel(selectedOrder)}</span>
                  <span className="text-sm text-gray-400">
                    {selectedOrder.orderType === 'desayuno' ? '🌅 Desayuno' : '🍽️ Almuerzo'}
                  </span>
                </div>
                <div className="text-2xl font-bold text-green-400">
                  Total: {formatPrice(Number(paymentData?.amount) || Number(selectedOrder?.paymentAmount) || Number(selectedOrder?.total) || 0)}
                </div>
              </div>

              {/* Selector de tipo de pedido para adiciones */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-100 mb-3">Tipo de Pedido para Adiciones</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setEditableOrderType('almuerzo')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      editableOrderType === 'almuerzo'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : theme === 'dark'
                          ? 'border-gray-600 bg-gray-700 text-gray-300'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">🍽️</div>
                      <div className="text-sm font-medium">Almuerzo</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setEditableOrderType('desayuno')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      editableOrderType === 'desayuno'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : theme === 'dark'
                          ? 'border-gray-600 bg-gray-700 text-gray-300'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">🌅</div>
                      <div className="text-sm font-medium">Desayuno</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Selección de items principales según tipo */}
              <div className="mb-6">
                {editableOrderType === 'almuerzo' && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-100 mb-2">🍽️ Agregar Items Principales - Almuerzo</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        onClick={() => addMainItemToOrder('almuerzo', 'normal', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Normal</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 12000 : 13000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('almuerzo', 'bandeja', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Bandeja</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 11000 : 12000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('almuerzo', 'mojarra', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-orange-600 hover:bg-orange-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Mojarra</div>
                        <div className="text-sm">{formatPrice(16000)}</div>
                      </button>
                    </div>
                  </div>
                )}

                {editableOrderType === 'desayuno' && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-100 mb-2">🌅 Agregar Items Principales - Desayuno</h4>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'solo_huevos', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Huevos</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 7000 : 8000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'solo_caldo_costilla', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Caldo Costilla</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 7000 : 8000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'solo_caldo_pescado', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Caldo Pescado</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 7000 : 8000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'solo_caldo_pata', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Caldo Pata</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 8000 : 9000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'solo_caldo_pajarilla', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Solo Caldo Pajarilla</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 9000 : 10000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'desayuno_completo_costilla', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Desayuno Completo Costilla</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 11000 : 12000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'desayuno_completo_pescado', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Desayuno Completo Pescado</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 11000 : 12000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'desayuno_completo_pata', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Desayuno Completo Pata</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 12000 : 13000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'desayuno_completo_pajarilla', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Desayuno Completo Pajarilla</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 13000 : 14000)}</div>
                      </button>
                      <button
                        onClick={() => addMainItemToOrder('desayuno', 'monona', selectedOrder?.tableNumber ? 'table' : 'takeaway')}
                        className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-left transition-colors"
                      >
                        <div className="font-medium">Mañona</div>
                        <div className="text-sm">{formatPrice(selectedOrder?.tableNumber ? 13000 : 14000)}</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Opciones de división de pago */}
              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-100 mb-3">Opciones de Pago</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPaymentMode('simple')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      paymentMode === 'simple'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : theme === 'dark'
                          ? 'border-gray-600 bg-gray-700 text-gray-300'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="text-center">
                      <CurrencyDollarIcon className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm font-medium">Pago Completo</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setPaymentMode('split')}
                    className={`p-3 rounded-lg border-2 transition-colors ${
                      paymentMode === 'split'
                        ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                        : theme === 'dark'
                          ? 'border-gray-600 bg-gray-700 text-gray-300'
                          : 'border-gray-300 bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="text-center">
                      <CurrencyDollarIcon className="w-6 h-6 mx-auto mb-1" />
                      <div className="text-sm font-medium">Dividir Pago</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Opciones de división */}
              {paymentMode === 'split' && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Dividir en:</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleSplitPayment('50-50')}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors"
                    >
                      50/50
                    </button>
                    <button
                      onClick={() => handleSplitPayment('1-3')}
                      className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors"
                    >
                      1/3 cada uno
                    </button>
                    <button
                      onClick={() => handleSplitPayment('custom')}
                      className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Personalizado
                    </button>
                  </div>
                </div>
              )}

                {/* Editor de líneas para pago dividido */}
                {paymentMode === 'split' && (
                  <div className="mb-6 p-4 rounded-lg border border-gray-600 bg-gray-800/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-gray-200">Líneas de Pago</div>
                      <div className="flex items-center space-x-2">
                        <button onClick={() => fillAllWith('efectivo')} className="px-2 py-1 bg-green-600 text-white rounded text-xs">Todo Efectivo</button>
                        <button onClick={() => fillAllWith('nequi')} className="px-2 py-1 bg-purple-600 text-white rounded text-xs">Todo Nequi</button>
                        <button onClick={() => fillAllWith('daviplata')} className="px-2 py-1 bg-orange-600 text-white rounded text-xs">Todo Daviplata</button>
                        <button onClick={addSplitLine} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">+ Añadir línea</button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {paymentLines.map((line, idx) => (
                        <div key={`line-${idx}`} className="flex items-center space-x-2">
                          <select value={line.method} onChange={(e) => updateSplitLine(idx, { method: e.target.value })} className="px-2 py-1 rounded bg-gray-700 text-white text-sm">
                            <option value="efectivo">Efectivo</option>
                            <option value="nequi">Nequi</option>
                            <option value="daviplata">Daviplata</option>
                          </select>
                          <input type="number" value={line.amount} onChange={(e) => updateSplitLine(idx, { amount: e.target.value })} className="w-32 px-2 py-1 rounded text-sm bg-white text-black" />
                          <button onClick={() => removeSplitLine(idx)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">✕</button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-sm text-gray-300">Total pedido: <span className="font-bold">{formatPrice(selectedOrder?.total || 0)}</span></div>
                      <div className="text-sm">
                        <span className="mr-3">Suma líneas: <span className="font-bold">{formatPrice(splitTotal)}</span></span>
                        {splitIsExact ? (
                          <span className="text-green-400 font-semibold">✔ Suma exacta</span>
                        ) : (
                          <span className="text-yellow-400">Suma no coincide</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              {/* Método de pago */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Método de Pago</h4>
                <div className="grid grid-cols-3 gap-2">
                  {['efectivo', 'nequi', 'daviplata'].map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentData(prev => ({ ...prev, method }))}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        paymentData.method === method
                          ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                          : theme === 'dark'
                            ? 'border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600'
                            : 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <div className="text-center">
                        {getPaymentIcon(method)}
                        <div className="text-xs font-medium mt-1 capitalize">{method}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Botones rápidos para efectivo */}
              {paymentData.method === 'efectivo' && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">Billetes Recibidos</h4>
                    {/* Mostrar cuánto corresponde a efectivo (cuando hay split) */}
                    {paymentMode === 'split' && (
                      <div className="text-sm text-gray-200 mb-2">Efectivo a cobrar: <span className="font-bold">{formatPrice(paymentLines.reduce((s, l) => s + (l.method === 'efectivo' ? (parseFloat(l.amount) || 0) : 0), 0))}</span></div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                    {quickCashButtons.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => {
                          setCashAmount(amount.toString());
                          const efectivoTotal = paymentMode === 'split' ? paymentLines.reduce((s, l) => s + (l.method === 'efectivo' ? (parseFloat(l.amount) || 0) : 0), 0) : (parseFloat(paymentData.amount) || 0);
                          const change = calculateChange(efectivoTotal, amount);
                          setCalculatedChange(change.total);
                          setShowChangeCalculator(true);
                        }}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                      >
                        {formatPrice(amount)}
                      </button>
                    ))}
                  </div>
                  
                  {/* Input manual para efectivo */}
                  <div className="mt-3">
                    <input
                      type="number"
                      placeholder="Otro monto recibido..."
                      value={cashAmount}
                      onChange={(e) => {
                        setCashAmount(e.target.value);
                        if (e.target.value) {
                          const efectivoTotal = paymentMode === 'split' ? paymentLines.reduce((s, l) => s + (l.method === 'efectivo' ? (parseFloat(l.amount) || 0) : 0), 0) : (parseFloat(paymentData.amount) || 0);
                          const change = calculateChange(efectivoTotal, parseFloat(e.target.value));
                          setCalculatedChange(change.total);
                          setShowChangeCalculator(true);
                        } else {
                          setShowChangeCalculator(false);
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-lg border ${
                        theme === 'dark' 
                          ? 'bg-gray-700 border-gray-600 text-white' 
                          : 'bg-white border-gray-300 text-gray-900'
                      } focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                </div>
              )}

              {/* Adiciones rápidas basadas en el tipo de orden */}
              {selectedOrder && (editableOrderType === 'desayuno' ? quickBreakfastAdditions : quickAdditions).length > 0 && (
                <div className="mb-6">
                  <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                    🍴 Adiciones Rápidas ({editableOrderType === 'desayuno' ? 'Desayuno' : 'Almuerzo'})
                  </h4>
                  <div className="grid grid-cols-2 gap-2 mb-3 max-h-32 overflow-y-auto">
                    {(editableOrderType === 'desayuno' ? quickBreakfastAdditions : quickAdditions).map(addition => (
                      <button
                        key={addition.id}
                        onClick={() => addQuickAdditionToOrder(addition)}
                        className={`p-2 rounded-lg border text-xs transition-colors ${
                          theme === 'dark'
                            ? 'bg-gray-700 border-gray-600 text-white hover:bg-gray-600'
                            : 'bg-gray-50 border-gray-300 text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <div className="font-medium">{addition.name}</div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>
                          {formatPrice(addition.price)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Adicionales: permitir agregar platos/añadidos antes de confirmar el pago */}
              {/* Items principales recuperados del pedido (mostrar cantidad y controles) */}
              <div className="mb-6">
                <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Items del Pedido</h4>
                <div className="space-y-2">
                  {displayedMainItems.length === 0 && (
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>No se encontraron items detallados de este pedido.</div>
                  )}
                  {displayedMainItems.map(item => (
                    <div key={item.id} className={`flex items-center justify-between p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <div>
                        <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{item.name}</div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{formatPrice(item.unitPrice)} x {item.quantity}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateMainItemQuantity(item.id, item.quantity - 1)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">-</button>
                        <input type="number" value={item.quantity} onChange={(e) => updateMainItemQuantity(item.id, Number(e.target.value || 0))} className={`w-12 px-2 py-1 rounded text-sm ${theme === 'dark' ? 'bg-gray-700 text-white border border-gray-600' : 'bg-white text-gray-900 border border-gray-300'}`} />
                        <button onClick={() => updateMainItemQuantity(item.id, item.quantity + 1)} className="px-2 py-1 bg-green-600 text-white rounded text-sm">+</button>
                        <button onClick={() => removeMainItem(item.id)} className="px-2 py-1 bg-red-700 text-white rounded text-sm">X</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Adiciones seleccionadas */}
              <div className="mb-6">
                <h4 className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>➕ Adiciones Seleccionadas</h4>
                <div className="space-y-2">
                  {addedItems.length === 0 && (
                    <div className={`text-sm ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>No hay adiciones seleccionadas.</div>
                  )}
                  {addedItems.map(item => (
                    <div key={item.id} className={`flex items-center justify-between p-2 rounded ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <div>
                        <div className={`text-sm font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{item.name}</div>
                        <div className={`text-xs ${theme === 'dark' ? 'text-gray-300' : 'text-gray-500'}`}>{formatPrice(item.amount)} x {item.quantity || 1}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateAddedItemQuantity(item.id, (item.quantity || 1) - 1)} className="px-2 py-1 bg-red-600 text-white rounded text-sm">-</button>
                        <input type="number" value={item.quantity || 1} onChange={(e) => updateAddedItemQuantity(item.id, Number(e.target.value || 0))} className={`w-12 px-2 py-1 rounded text-sm ${theme === 'dark' ? 'bg-gray-700 text-white border border-gray-600' : 'bg-white text-gray-900 border border-gray-300'}`} />
                        <button onClick={() => updateAddedItemQuantity(item.id, (item.quantity || 1) + 1)} className="px-2 py-1 bg-green-600 text-white rounded text-sm">+</button>
                        <button onClick={() => removeAddedItem(item.id)} className="px-2 py-1 bg-red-700 text-white rounded text-sm">X</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {showChangeCalculator && calculatedChange > 0 && (
                <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-green-900/30' : 'bg-green-100'} border border-green-500 mb-6`}>
                  <h4 className="text-lg font-semibold text-green-400 mb-2">
                    💰 Vueltos: {formatPrice(calculatedChange)}
                  </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {(() => {
                          const changeInfo = calculateChange(paymentData.amount, parseFloat(cashAmount) || 0) || { breakdown: {}, remaining: 0 };
                          const breakdown = changeInfo.breakdown || {};
                          const remainingCoins = changeInfo.remaining || 0;
                          // Mostrar solo las denominaciones necesarias (count > 0), ordenadas descendente
                          const entries = Object.entries(breakdown)
                            .map(([bill, count]) => [parseInt(bill, 10), count])
                            .filter(([, count]) => count > 0)
                            .sort((a, b) => b[0] - a[0]);

                          const rows = entries.map(([bill, count]) => (
                            <div key={bill} className="flex justify-between opacity-100">
                              <span className="text-gray-300">{formatPrice(bill)}:</span>
                              <span className="text-green-400 font-bold">{count}</span>
                            </div>
                          ));

                          // Agregar fila de resto si aplica
                          if (remainingCoins > 0) {
                            rows.push(
                              <div key="remaining" className="flex justify-between border-t pt-2 mt-2">
                                <span className="text-gray-300">Monedas/Restante:</span>
                                <span className="text-green-400 font-bold">{formatPrice(remainingCoins)}</span>
                              </div>
                            );
                          }

                          // Si no hay billetes/monedas a devolver y no hay resto, mostrar un texto sutil
                          if (rows.length === 0) {
                            return (
                              <div className="text-sm text-gray-400">No hay vueltos</div>
                            );
                          }

                          return rows;
                        })()}
                      </div>
                </div>
              )}

              {/* Nota opcional */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Nota (opcional)
                </label>
                <textarea
                  value={paymentData.note || ''}
                  onChange={(e) => setPaymentData(prev => ({ ...prev, note: e.target.value }))}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    theme === 'dark' 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:ring-2 focus:ring-blue-500`}
                  placeholder="Notas adicionales del pago..."
                />
              </div>

              {/* Resumen del pago */}
              <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-blue-900/30' : 'bg-blue-100'} border border-blue-500 mb-6`}>
                <div className="flex justify-between items-center">
                  <span className="text-blue-400 font-medium">
                    {paymentData.method.toUpperCase()}: {formatPrice(paymentData.amount)}
                  </span>
                  {paymentData.amount === parseFloat(selectedOrder.total) ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <span className="text-xs text-yellow-400">Pago parcial</span>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleProcessPayment}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-semibold"
                >
                  ✅ Confirmar Pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editor Artículo POS */}
      {showItemEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`${theme==='dark'?'bg-gray-800':'bg-white'} w-full max-w-md rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto p-6`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-100">{editingItem ? 'Editar Artículo' : 'Nuevo Artículo'}</h3>
              <button onClick={()=>setShowItemEditor(false)} className="text-gray-400 hover:text-gray-200"><XCircleIcon className="w-6 h-6"/></button>
            </div>
            <div className="mb-4 flex gap-4 text-xs">
              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={itemEditorMode==='color'} onChange={()=>setItemEditorMode('color')} /> Color y forma</label>
              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={itemEditorMode==='image'} onChange={()=>setItemEditorMode('image')} /> Imagen</label>
            </div>
            {itemEditorMode==='color' ? (
              <div className="mb-4">
                <div className="grid grid-cols-9 gap-2 mb-4">
                  {colorPalette.map(c => (
                    <button key={c} onClick={()=>setItemColor(c)} style={{ background:c }} className={`h-10 rounded ${itemColor===c? 'ring-2 ring-white':''}`}></button>
                  ))}
                </div>
                <div className="flex gap-2 justify-center mb-2">
                  {shapeOptions.map(opt => (
                    <button key={opt.id} onClick={()=>setItemShape(opt.id)} className={`w-10 h-10 flex items-center justify-center text-[10px] uppercase tracking-wide border ${itemShape===opt.id? 'bg-blue-600 text-white border-blue-400':'bg-transparent text-gray-400 border-gray-500'}`}>{opt.id==='circle'?'○':opt.id==='square'?'▢':opt.id==='hex'?'⬢':'◌'}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-4 space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer text-gray-400 hover:border-blue-500 hover:text-white transition relative overflow-hidden">
                    {itemImageData ? (
                      <img src={itemImageData} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <PhotoIcon className="w-10 h-10" />
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
                  </label>
                  {itemImageData && (
                    <button onClick={()=>setItemImageData(null)} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs">Quitar</button>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-300 mb-1">Nombre</label>
                <input value={itemName} onChange={e=>setItemName(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white"/>
              </div>
              <div>
                <label className="block text-gray-300 mb-1 flex items-center justify-between">Categoría <span className="text-[10px] text-gray-500 font-normal">(ej: Bebidas, Proteína, Postres)</span></label>
                <input value={itemCategory} onChange={e=>setItemCategory(e.target.value)} placeholder="Opcional" className="w-full px-3 py-2 rounded bg-gray-700 text-white placeholder-gray-500"/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 mb-1">Precio</label>
                  <input type="number" value={itemPrice} onChange={e=>setItemPrice(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white"/>
                </div>
                <div>
                  <label className="block text-gray-300 mb-1">Tipo</label>
                  <select value={itemType} onChange={e=>setItemType(e.target.value)} className="w-full px-3 py-2 rounded bg-gray-700 text-white">
                    <option value="almuerzo">Almuerzo</option>
                    <option value="desayuno">Desayuno</option>
                    <option value="addition">Adición</option>
                    <option value="other">Otro</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={itemActive} onChange={e=>setItemActive(e.target.checked)} />
                <span className="text-gray-300 text-xs">Activo</span>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button onClick={()=>setShowItemEditor(false)} className="flex-1 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded">Cancelar</button>
              {editingItem && <button onClick={handleDeleteItem} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Desactivar</button>}
              <button onClick={handleSaveItem} className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WaiterCashier;