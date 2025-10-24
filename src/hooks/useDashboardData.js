// src/hooks/useDashboardData.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  Timestamp,
  getDocs,
  addDoc,
  orderBy,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  ORDER_STATUS,
  ORDER_STATUS_DISPLAY,
  PIE_COLORS,
  INGRESOS_COLLECTION,
  PEDIDOS_DIARIOS_GUARDADOS_COLLECTION,
} from '../components/Admin/dashboardConstants';
import { calcMethodTotalsAll } from '../utils/payments';

/* ============================
   Helpers de fechas / formato
   ============================ */

const getDateRange = (rangeType, start, end) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let startDate = new Date(today);
  let endDate = new Date(today);
  endDate.setHours(23, 59, 59, 999);

  switch (rangeType) {
    case '7_days':
      startDate.setDate(today.getDate() - 6);
      break;
    case '30_days':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'year':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      startDate = start ? new Date(start) : null;
      if (startDate) startDate.setHours(0, 0, 0, 0);
      endDate = end ? new Date(end) : null;
      if (endDate) endDate.setHours(23, 59, 59, 999);
      break;
    default:
      startDate.setDate(today.getDate() - 6);
      break;
  }
  return { startDate, endDate };
};

// Normaliza fecha de docs con createdAt / timestamp / date → "YYYY-MM-DD"
const getDocDateISO = (doc) => {
  const ts = doc?.createdAt || doc?.timestamp || doc?.date;
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? d.toISOString().split('T')[0] : null;
};

/* ======================================
   Normalización de servicio y de comida
   ====================================== */

const _asStr = (val) => {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') {
    return String(val.name ?? val.value ?? val.label ?? '').trim();
  }
  return '';
};

// ¿Es un pedido de desayuno?
const isBreakfastOrder = (o) => {
  // Señales directas
  if (o?.isBreakfast) return true;
  if (_asStr(o?.meal).toLowerCase() === 'breakfast') return true;
  if (Array.isArray(o?.breakfasts) && o.breakfasts.length > 0) return true;

  // Señales derivadas (por si la estructura varía)
  const maybeBreakfastStrs = [
    _asStr(o?.type),
    _asStr(o?.category),
    _asStr(o?.group),
    _asStr(o?.tag),
  ]
    .concat(
      Array.isArray(o?.items)
        ? o.items.map((it) => _asStr(it?.category ?? it?.type))
        : []
    )
    .join(' ')
    .toLowerCase();

  if (maybeBreakfastStrs.includes('desayun') || maybeBreakfastStrs.includes('breakfast')) return true;

  return false;
};

// Devuelve 'mesa' | 'llevar' | 'domicilio' | null
const normalizeServiceFromOrder = (o) => {
  // Si la colección indica delivery (incluye desayuno delivery), forzamos 'domicilio'
  if (o?.__collection && o.__collection.toLowerCase().includes('delivery')) {
    return 'domicilio';
  }
  const candidates = [
    o?.orderTypeNormalized,
    o?.serviceType,
    o?.orderType,
    o?.channel,
    o?.tipoPedido,
    o?.typeOfOrder,
    // anidados frecuentes
    o?.meals?.[0]?.orderType,
    o?.breakfasts?.[0]?.orderType,
  ];

  for (const c of candidates) {
    const v = _asStr(c).toLowerCase();
    if (!v) continue;
    if (/mesa|table|sal[oó]n|dine/.test(v)) return 'mesa';
    if (/llevar|para\s*llevar|take(?:-|\s)?away|to-?go|takeout/.test(v)) return 'llevar';
    if (/domicil|deliver|env[ií]o/.test(v)) return 'domicilio';
  }

  // Heurísticas
  if (o?.tableNumber || o?.mesa || o?.table) return 'mesa';
  if (o?.address?.address || o?.deliveryAddress) return 'domicilio';

  return null;
};

// Agregador genérico por tipo de venta (usa normalizadores)
const buildSaleTypeBreakdown = (orders = []) => {
  const acc = {
    domicilio_almuerzo: 0,
    domicilio_desayuno: 0,
    mesa_almuerzo: 0,
    llevar_almuerzo: 0,
    mesa_desayuno: 0,
    llevar_desayuno: 0,
  };

  for (const o of orders) {
    const total = Number(o?.total) || 0;
    if (total <= 0) continue;

    const kind = isBreakfastOrder(o) ? 'desayuno' : 'almuerzo';
    const service = normalizeServiceFromOrder(o);
    if (!service) continue;

    if (service === 'domicilio') acc[`domicilio_${kind}`] += total;
    else if (service === 'mesa') acc[`mesa_${kind}`] += total;
    else if (service === 'llevar') acc[`llevar_${kind}`] += total;
  }

  return acc;
};

/* ============================
   Hook principal
   ============================ */

export const useDashboardData = (
  db,
  userId,
  isAuthReady,
  p4, // notify ó setError
  p5, // startOfDay ó setSuccess
  p6, // endOfDay ó salesFilterRange
  p7, // selectedDate ó salesCustomStartDate
  p8, // ordersFilterRange
  p9, // ordersCustomStartDate
  p10, // ordersCustomEndDate
  p11, // selectedMonth
) => {
  // Compatibilidad con ambas firmas:
  let notify = null;
  let setError = null;
  let setSuccess = null;
  let startOfDay = null;
  let endOfDay = null;
  let selectedDate = null;

  // Parámetros “viejos” de gráficos (si los usas):
  let salesFilterRange = '7_days';
  let salesCustomStartDate = null;
  let salesCustomEndDate = null;
  let ordersFilterRange = '7_days';
  let ordersCustomStartDate = null;
  let ordersCustomEndDate = null;
  let selectedMonth = null;

  if (typeof p4 === 'function') {
    // NUEVA firma: (db, userId, isAuthReady, notify, startOfDay, endOfDay, selectedDate)
    notify = p4;
    setError = (m) => notify?.('error', m);
    setSuccess = (m) => notify?.('success', m);
    startOfDay = p5 || null;
    endOfDay = p6 || null;
    selectedDate = p7 || null;
  } else {
    // FIRMA ANTIGUA
    setError = p4;
    setSuccess = p5;
    salesFilterRange = p6 ?? salesFilterRange;
    salesCustomStartDate = p7 ?? null;
    salesCustomEndDate = p8 ?? null;
    ordersFilterRange = p9 ?? ordersFilterRange;
    ordersCustomStartDate = p10 ?? null;
    ordersCustomEndDate = p11 ?? null;
    selectedMonth = arguments.length >= 12 ? arguments[11] : null;
    notify = null;
    startOfDay = null;
    endOfDay = null;
    selectedDate = null;
  }

  const [loadingData, setLoadingData] = useState(true);
  const [orders, setOrders] = useState([]);            // Domicilios almuerzo
  const [tableOrders, setTableOrders] = useState([]);  // Salón (mesa/llevar) — puede haber desayuno/almuerzo
  const [waiterOrders, setWaiterOrders] = useState([]); // Salón (mesa/llevar) creados por mesero
  const [breakfastOrders, setBreakfastOrders] = useState([]); // deliveryBreakfastOrders
  const [breakfastSalonOrders, setBreakfastSalonOrders] = useState([]); // ⬅️ desayunos de salón (colección 'breakfastOrders')
  const [users, setUsers] = useState([]);

  const [totals, setTotals] = useState({
    cash: 0,
    cashCaja: 0,
    cashPendiente: 0,
    daviplata: 0,
    nequi: 0,
    expenses: 0,
    expensesByProvider: { total: 0, byProvider: {}, counts: {} },
    byCategory: {
      domiciliosAlmuerzo: 0,
      mesasAlmuerzo: 0,
      llevarAlmuerzo: 0,
      domiciliosDesayuno: 0,
      mesasDesayuno: 0,
      llevarDesayuno: 0,
    },
    grossIncome: 0,
    net: 0,
  });

  const [saleTypeBreakdown, setSaleTypeBreakdown] = useState({
    domicilio_almuerzo: 0,
    domicilio_desayuno: 0,
    mesa_almuerzo: 0,
    llevar_almuerzo: 0,
    mesa_desayuno: 0,
    llevar_desayuno: 0,
  });

  const [statusCounts, setStatusCounts] = useState({ Pending: 0, Delivered: 0, Cancelled: 0 });
  const [userActivity, setUserActivity] = useState([]);
  const [ingresosData, setIngresosData] = useState([]);
  const [pedidosDiariosGuardadosData, setPedidosDiariosGuardadosData] = useState([]);
  const [dailySalesChartData, setDailySalesChartData] = useState([]);
  const [dailyOrdersChartData, setDailyOrdersChartData] = useState([]);
  const [statusPieChartData, setStatusPieChartData] = useState([]);

  /* =====================================================
     Agregaciones estructuradas para vistas: Hoy / 7d / Mes / Año
     ===================================================== */
  const sevenCategoryKeys = ['domiciliosAlmuerzo','domiciliosDesayuno','mesasAlmuerzo','llevarAlmuerzo','mesasDesayuno','llevarDesayuno','gastos'];

  // Mapa de gastos por día (a partir de payments listener más abajo). Añadimos listener aquí ligero.
  const [paymentsRaw, setPaymentsRaw] = useState([]);
  // Todos los pagos (sin filtrar por selectedDate) para gráficos de rangos amplios
  const [paymentsAllRaw, setPaymentsAllRaw] = useState([]);

  // Cálculo de gastos por día
  const expensesByDay = useMemo(()=>{
    const map = {};
    paymentsRaw.forEach(p => {
      const ts = p.timestamp;
      if(!ts) return;
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if(!d) return;
      d.setHours(0,0,0,0);
      const iso = d.toISOString().split('T')[0];
      const amt = Number(p.amount||0);
      map[iso] = (map[iso]||0) + (amt>0?amt:0);
    });
    return map;
  },[paymentsRaw]);

  // Helper: sumar categorías de un registro histórico
  const sumHistCategories = (c={}) => (
    Number(c.domiciliosAlmuerzo||0)+Number(c.domiciliosDesayuno||0)+Number(c.mesasAlmuerzo||0)+Number(c.mesasDesayuno||0)+Number(c.llevarAlmuerzo||0)+Number(c.llevarDesayuno||0)
  );

  // Construir índice de históricos por día actual (solo fecha -> categorías)
  const historicIndex = useMemo(()=>{
    const idx = {};
    ingresosData.forEach(r => {
      if(!r?.date) return;
      const d = new Date(r.date);
      if(isNaN(d)) return;
      const iso = d.toISOString().split('T')[0];
      idx[iso] = { ...(r.categories||{}) };
    });
    return idx;
  },[ingresosData]);

  // Realtime builder para un día (si no hay histórico o es hoy abierto)
  const buildRealtimeDay = useCallback((isoDate) => {
    const dateObj = new Date(isoDate);
    if(isNaN(dateObj)) return null;
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const day = dateObj.getDate();
    const isCancelled = (o) => (o?.status||'').toLowerCase().includes('cancel');
    const sameDay = (o) => {
      const ts = o?.createdAt || o?.timestamp || o?.date;
      const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
      if(!d) return false;
      return d.getFullYear()===year && d.getMonth()===month && d.getDate()===day;
    };
    const cat = { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
    // orders -> domicilios almuerzo
    orders.filter(o=>!isCancelled(o) && sameDay(o)).forEach(o=> { cat.domiciliosAlmuerzo += Number(o.total||0); });
    // salón (table + waiter)
    const combinedSalon = [...tableOrders, ...waiterOrders];
    combinedSalon.filter(o=>!isCancelled(o) && sameDay(o)).forEach(o => {
      const amount = Number(o.total||0); if(amount<=0) return;
      const esDes = isBreakfastOrder(o);
      const serv = normalizeServiceFromOrder(o) || 'mesa';
      if(esDes){
        if(serv==='mesa') cat.mesasDesayuno += amount; else if(serv==='llevar') cat.llevarDesayuno += amount; else if(serv==='domicilio') cat.domiciliosDesayuno += amount;
      } else {
        if(serv==='mesa') cat.mesasAlmuerzo += amount; else if(serv==='llevar') cat.llevarAlmuerzo += amount; else if(serv==='domicilio') cat.domiciliosAlmuerzo += amount;
      }
    });
    // desayunos salón específicos (colección breakfastOrders) -> CLASIFICAR por servicio (antes siempre como mesa)
    breakfastSalonOrders.filter(o=>!isCancelled(o) && sameDay(o)).forEach(o => {
      const amount = Number(o.total||0); if(amount<=0) return;
      const serv = normalizeServiceFromOrder(o) || 'mesa';
      if(serv==='mesa') cat.mesasDesayuno += amount; else if(serv==='llevar') cat.llevarDesayuno += amount; else if(serv==='domicilio') cat.domiciliosDesayuno += amount; else cat.mesasDesayuno += amount;
    });
    // desayunos delivery (deliveryBreakfastOrders)
    breakfastOrders.filter(o=>!isCancelled(o) && sameDay(o)).forEach(o => {
      const amount = Number(o.total||0); if(amount<=0) return;
      const serv = normalizeServiceFromOrder(o);
      const hasAddr = !!(o.address?.address || o.breakfasts?.[0]?.address?.address);
      if(serv==='mesa') cat.mesasDesayuno += amount; else if(serv==='llevar') cat.llevarDesayuno += amount; else if(serv==='domicilio' || (!serv && hasAddr)) cat.domiciliosDesayuno += amount; else cat.domiciliosDesayuno += amount;
    });
    return cat;
  }, [orders, tableOrders, waiterOrders, breakfastOrders, breakfastSalonOrders]);

  const todayISO = useMemo(()=>{ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString().split('T')[0]; },[]);

  // Día de hoy (histórico si existe; si no realtime)
  const todayCategories = useMemo(()=>{
    if(historicIndex[todayISO]) return historicIndex[todayISO];
    return buildRealtimeDay(todayISO) || { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
  }, [historicIndex, todayISO, buildRealtimeDay]);

  // Últimos 7 días (cada día: histórico o realtime si no cerrado)
  const last7DaysData = useMemo(()=>{
    const arr = [];
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
      const iso = d.toISOString().split('T')[0];
      const cat = historicIndex[iso] || buildRealtimeDay(iso) || { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
      const totalIncome = sumHistCategories(cat);
      const gastos = expensesByDay[iso]||0;
      arr.push({ date: iso, categories: cat, totalIncome, gastos });
    }
    return arr;
  }, [historicIndex, buildRealtimeDay, expensesByDay]);

  // Mes actual completo
  const currentMonthDaily = useMemo(()=>{
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysIn = new Date(year, month+1, 0).getDate();
    const arr = [];
    for(let day=1; day<=daysIn; day++){
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const hasHist = !!historicIndex[iso];
      // Solo día actual se reconstruye en vivo si no hay histórico; días pasados sin histórico quedan 0 para no repetir hoy.
      let cat;
      if (hasHist) {
        cat = historicIndex[iso];
      } else if (iso === todayISO) {
        cat = buildRealtimeDay(iso) || { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
      } else {
        // Pasado o futuro sin histórico: valores en cero para evidenciar que falta cierre.
        cat = { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
      }
      const totalIncome = sumHistCategories(cat);
      const gastos = expensesByDay[iso]||0;
      arr.push({ date: iso, categories: cat, totalIncome, gastos, closed: hasHist });
    }
    return arr;
  }, [historicIndex, buildRealtimeDay, expensesByDay]);

  // Año: agregación mensual usando históricos + realtime de días abiertos del mes actual
  const currentYearMonthly = useMemo(()=>{
    const now = new Date();
    const year = now.getFullYear();
    const months = [];
    for(let m=0; m<12; m++){
      const daysIn = new Date(year, m+1, 0).getDate();
      let sumCat = { domiciliosAlmuerzo:0, domiciliosDesayuno:0, mesasAlmuerzo:0, llevarAlmuerzo:0, mesasDesayuno:0, llevarDesayuno:0 };
      let gastosMes = 0;
      for(let d=1; d<=daysIn; d++){
        const iso = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cat = historicIndex[iso] || (m===now.getMonth() ? buildRealtimeDay(iso) : null);
        if(cat){
          Object.keys(sumCat).forEach(k => { sumCat[k] += Number(cat[k]||0); });
          gastosMes += expensesByDay[iso]||0;
        }
      }
      const totalIncome = sumHistCategories(sumCat);
      months.push({ monthIndex:m, monthKey:`${year}-${String(m+1).padStart(2,'0')}`, categories: sumCat, totalIncome, gastos: gastosMes });
    }
    return months;
  }, [historicIndex, buildRealtimeDay, expensesByDay]);

  // Exposición estructurada para gráficos/drill-down
  const periodStructures = {
    today: { date: todayISO, categories: todayCategories, totalIncome: sumHistCategories(todayCategories), gastos: expensesByDay[todayISO]||0 },
    last7Days: last7DaysData,
    thisMonth: currentMonthDaily,
    thisYear: currentYearMonthly,
  };

  const initialLoadRefs = useRef({
    orders: false,
    tableOrders: false,
    waiterOrders: false,
    breakfastOrders: false,          // delivery
    breakfastSalonOrders: false,     // salón
    users: false,
    activity: false,
    ingresos: false,
    pedidosDiariosGuardados: false,
    payments: false,
  paymentsAll: false,
  });

  // Unificar todos los pedidos de salón (excepto desayunos de salón que tratamos aparte para prorrateo)
  const salonOrders = useMemo(
    () => [...tableOrders, ...waiterOrders],
    [tableOrders, waiterOrders]
  );

  const checkIfAllLoaded = () => {
    if (
      initialLoadRefs.current.orders &&
      initialLoadRefs.current.tableOrders &&
      initialLoadRefs.current.waiterOrders &&
      initialLoadRefs.current.breakfastOrders &&
      initialLoadRefs.current.breakfastSalonOrders &&
      initialLoadRefs.current.users &&
      initialLoadRefs.current.activity &&
      initialLoadRefs.current.ingresos &&
      initialLoadRefs.current.pedidosDiariosGuardados &&
      initialLoadRefs.current.payments
    ) {
      setLoadingData(false);
    }
  };

  /* ==========================================================
     Sumas por categoría (usa normalización + detección robusta)
     ========================================================== */
  useEffect(() => {
    const todayISO = new Date().toISOString().split('T')[0];
    if(selectedDate && selectedDate !== todayISO){
      // Buscar registro histórico de ingresos para esa fecha
      const rec = ingresosData.find(r=> new Date(r.date).toISOString().split('T')[0] === selectedDate);
      if(rec){
        const c = rec.categories || {};
        const effective = {
          domiciliosAlmuerzo: Number(c.domiciliosAlmuerzo)||0,
          mesasAlmuerzo: Number(c.mesasAlmuerzo)||0,
          llevarAlmuerzo: 0, // no almacenado históricamente
          domiciliosDesayuno: Number(c.domiciliosDesayuno)||0,
          mesasDesayuno: Number(c.mesasDesayuno)||0,
          llevarDesayuno: 0 // no almacenado
        };
        const ingresosSalon = effective.mesasAlmuerzo + effective.llevarAlmuerzo + effective.mesasDesayuno + effective.llevarDesayuno;
        const totalDomicilios = effective.domiciliosAlmuerzo + effective.domiciliosDesayuno; // aproximado
        const gross = ingresosSalon + totalDomicilios;
        setTotals(prev=>({
          ...prev,
          byCategory:{...effective,totalDomicilios, ingresosSalon},
          grossIncome:gross,
          net: Math.max(gross - (prev.expenses||0),0)
        }));
      } else {
        // Sin histórico: forzar ceros
        setTotals(prev=>({
          ...prev,
          byCategory:{
            domiciliosAlmuerzo:0, mesasAlmuerzo:0, llevarAlmuerzo:0,
            domiciliosDesayuno:0, mesasDesayuno:0, llevarDesayuno:0,
            totalDomicilios:0, ingresosSalon:0
          },
          grossIncome:0,
          net:0
        }));
      }
      return; // saltar cálculo en vivo
    }
    const sum = {
      domiciliosAlmuerzo: 0,
      mesasAlmuerzo: 0,
      llevarAlmuerzo: 0,
      domiciliosDesayuno: 0,
      mesasDesayuno: 0,
      llevarDesayuno: 0,
    };

    // 1) Almuerzo — Domicilios: colección 'orders'
    sum.domiciliosAlmuerzo = orders.reduce((acc, o) => acc + Number(o.total || 0), 0);

    // 2) Salón (mesa / llevar) en 'tableOrders' + 'waiterOrders' — puede haber desayuno/almuerzo
    for (const t of salonOrders) {
      const amount = Number(t.total || 0);
      if (amount <= 0) continue;

      const esDesayuno = isBreakfastOrder(t);
      const service = normalizeServiceFromOrder(t) || 'mesa'; // por defecto, salón

      if (!esDesayuno) {
        if (service === 'mesa') sum.mesasAlmuerzo += amount;
        else if (service === 'llevar') sum.llevarAlmuerzo += amount;
        else if (service === 'domicilio') sum.domiciliosAlmuerzo += amount; // por si se guardó raro
        else sum.mesasAlmuerzo += amount; // fallback
      } else {
        // NOTA: aquí NO sumamos desayunos de salón que vienen en colección 'breakfastOrders'
        // porque los tratamos abajo con prorrateo por ítem.
        if (t.__collection !== 'breakfastOrders') {
          if (service === 'mesa') sum.mesasDesayuno += amount;
          else if (service === 'llevar') sum.llevarDesayuno += amount;
          else if (service === 'domicilio') sum.domiciliosDesayuno += amount;
          else sum.mesasDesayuno += amount;
        }
      }
    }

    // 2.5) Desayunos de salón (colección 'breakfastOrders'): prorratear por ítems
    const sumBreakfastSalon = (ordersArr = []) => {
      let mesa = 0;
      let llevar = 0;
      for (const o of ordersArr) {
        const amount = Number(o.total || 0);
        if (amount <= 0) continue;

        const items = Array.isArray(o.breakfasts) ? o.breakfasts : [];
        if (items.length === 0) {
          // Fallback: usa el servicio al nivel de orden
          const s = normalizeServiceFromOrder(o) || 'mesa';
          if (s === 'mesa') mesa += amount;
          else if (s === 'llevar') llevar += amount;
          continue;
        }

        const isMesa = (v) => {
          const s = _asStr(v).toLowerCase();
          return /mesa|table|sal[oó]n|dine/.test(s);
        };
        const isLlevar = (v) => {
          const s = _asStr(v).toLowerCase();
          return /llevar|take(?:-|\s)?away|to-?go|takeout/.test(s);
        };

        const n = items.length;
        const nMesa = items.filter(b => isMesa(b?.orderType)).length;
        const nLlevar = items.filter(b => isLlevar(b?.orderType)).length;

        // Reparte el total en proporción a cuántos ítems son mesa/llevar
        if (n > 0) {
          mesa += amount * (nMesa / n);
          llevar += amount * (nLlevar / n);
        }
      }
      return { mesa: Math.round(mesa), llevar: Math.round(llevar) };
    };

    const bSalon = sumBreakfastSalon(breakfastSalonOrders || []);
    sum.mesasDesayuno += bSalon.mesa;
    sum.llevarDesayuno += bSalon.llevar;

    // 3) Desayunos delivery (deliveryBreakfastOrders) — normalizar por si hay mesa/llevar
    for (const b of breakfastOrders) {
      const amount = Number(b.total || 0);
      if (amount <= 0) continue;

      const service = normalizeServiceFromOrder(b);
      const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);

      if (service === 'mesa') sum.mesasDesayuno += amount;
      else if (service === 'llevar') sum.llevarDesayuno += amount;
      else if (service === 'domicilio' || (!service && hasAddr)) sum.domiciliosDesayuno += amount;
      else sum.domiciliosDesayuno += amount; // conservador
    }

    // Separar ingresos de salón y domicilios (EXCLUYENDO cancelados)
    const isNotCancelled = (o) => {
      const s = (o?.status || '').toString().toLowerCase();
      return !s.includes('cancel');
    };

    // Limpiar sum para cancelar: reconstruiremos sólo con órdenes no canceladas
    const cleanSum = { ...sum };
    // Recalcular desde cero usando arrays fuente filtrados si detectamos cancelados presentes
    const rebuildIfCancelled = () => {
      // Detectar si había cancelados entre arrays base
      const anyCancelled = [...tableOrders, ...waiterOrders, ...breakfastSalonOrders, ...breakfastOrders, ...orders].some(o => !isNotCancelled(o));
      if (!anyCancelled) return; // nada que rehacer
      const fresh = {
        domiciliosAlmuerzo: 0,
        mesasAlmuerzo: 0,
        llevarAlmuerzo: 0,
        domiciliosDesayuno: 0,
        mesasDesayuno: 0,
        llevarDesayuno: 0,
      };
      // Salón almuerzo (table+waiter)
      [...tableOrders, ...waiterOrders].filter(isNotCancelled).forEach(o => {
        const total = Number(o.total || 0); if (total<=0) return;
        const service = normalizeServiceFromOrder(o) || 'mesa';
        if (service === 'mesa') fresh.mesasAlmuerzo += total; else if (service === 'llevar') fresh.llevarAlmuerzo += total;
      });
      // Desayunos salón
      const bSal = sumBreakfastSalon(breakfastSalonOrders.filter(isNotCancelled));
      fresh.mesasDesayuno += bSal.mesa;
      fresh.llevarDesayuno += bSal.llevar;
      // Desayunos delivery
      breakfastOrders.filter(isNotCancelled).forEach(b => {
        const amount = Number(b.total || 0); if (amount<=0) return;
        const service = normalizeServiceFromOrder(b);
        const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
        if (service === 'mesa') fresh.mesasDesayuno += amount;
        else if (service === 'llevar') fresh.llevarDesayuno += amount;
        else if (service === 'domicilio' || (!service && hasAddr)) fresh.domiciliosDesayuno += amount;
        else fresh.domiciliosDesayuno += amount;
      });
      // Domicilios almuerzo
      orders.filter(isNotCancelled).forEach(o => { const t=Number(o.total||0); if(t>0) fresh.domiciliosAlmuerzo += t; });
      return fresh;
    };
    const rebuilt = rebuildIfCancelled();
    const effective = rebuilt || cleanSum;

    // Recalcular ingresosSalon y totalDomicilios en base a effective
    const ingresosSalon = 
      effective.mesasAlmuerzo +
      effective.llevarAlmuerzo +
      effective.mesasDesayuno +
      effective.llevarDesayuno;

  // Para domicilios: solo sumar los LIQUIDADOS (almuerzo + desayuno)
  const isLiquidated = (o) => {
    if(!o) return false;
    if(o.settled === true) return true;
    // soportar estructura paymentSettled { cash: true, nequi: true, daviplata: true }
    if(o.paymentSettled && typeof o.paymentSettled === 'object') {
      return Object.values(o.paymentSettled).some(v => v === true);
    }
    return false;
  };
  // Sumar únicamente montos de pedidos domicilios almuerzo liquidados
  let domiciliosAlmuerzoLiquidado = 0;
  orders.forEach(o => {
    const t = Number(o.total||0); if(t>0 && isLiquidated(o)) domiciliosAlmuerzoLiquidado += t;
  });
  // Desayunos delivery (domicilios desayuno) liquidados
  let domiciliosDesayunoLiquidado = 0;
  breakfastOrders.forEach(b => {
    const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
    if(!hasAddr) return; // solo domicilio
    const t = Number(b.total||0); if(t>0 && isLiquidated(b)) domiciliosDesayunoLiquidado += t;
  });
  const totalDomiciliosLiquidado = domiciliosAlmuerzoLiquidado + domiciliosDesayunoLiquidado;
  // El ingreso bruto mostrado ahora respeta liquidación para domicilios
  const gross = ingresosSalon + totalDomiciliosLiquidado;

    setTotals((prev) => ({
      ...prev,
      byCategory: {
        ...effective,
        // Mantener categorías originales para desglose, pero añadir campos de liquidados
        totalDomicilios: effective.domiciliosAlmuerzo + effective.domiciliosDesayuno,
        ingresosSalon,
        domiciliosAlmuerzoLiquidado,
        domiciliosDesayunoLiquidado,
        totalDomiciliosLiquidado,
      },
      grossIncome: gross,
      net: Math.max(gross - (prev.expenses || 0), 0),
    }));

    // Desglose adicional (si lo usas en UI)
    const mixed = [...orders, ...salonOrders, ...breakfastOrders, ...breakfastSalonOrders];
    setSaleTypeBreakdown(buildSaleTypeBreakdown(mixed));
  }, [orders, salonOrders, breakfastOrders, breakfastSalonOrders, waiterOrders, tableOrders, selectedDate, ingresosData]);

  /* =========================
     Suscripciones a Firestore
     ========================= */
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    setLoadingData(true);
    
    // Reset all loading flags when date changes
    initialLoadRefs.current = {
      orders: false,
      tableOrders: false,
      waiterOrders: false,
      breakfastOrders: false,
      breakfastSalonOrders: false,
      users: false,
      activity: false,
      ingresos: false,
      pedidosDiariosGuardados: false,
      payments: false,
      paymentsAll: false,
    };
    
    const unsubscribes = [];

    // Orders (domicilios almuerzo)
    const ordersCollectionRef = collection(db, 'orders');
    const ordersQuery = (startOfDay && endOfDay)
      ? query(
          ordersCollectionRef,
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
        )
      : ordersCollectionRef;
      
    const unsubscribeOrders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const ordersData = snapshot.docs.map((doc) => ({ id: doc.id, __collection: 'orders', ...doc.data() }));
        setOrders(ordersData);

        const newTotals = { cash: 0, daviplata: 0, nequi: 0 };

        ordersData.forEach((order) => {
          const paymentSummary = order.paymentSummary || {};
          newTotals.cash += Number(paymentSummary['Efectivo'] || 0);
          newTotals.daviplata += Number(paymentSummary['Daviplata'] || 0);
          newTotals.nequi += Number(paymentSummary['Nequi'] || 0);
        });

        if (!initialLoadRefs.current.orders) {
          initialLoadRefs.current.orders = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar pedidos: ${error.message}`);
        if (!initialLoadRefs.current.orders) {
          initialLoadRefs.current.orders = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeOrders);

    // Table orders (salón)
    const tableOrdersCollectionRef = collection(db, 'tableOrders');
    const tableOrdersQuery = (startOfDay && endOfDay)
      ? query(
          tableOrdersCollectionRef,
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
        )
      : tableOrdersCollectionRef;
        
    const unsubscribeTableOrders = onSnapshot(
      tableOrdersQuery,
      (snapshot) => {
        const tableOrdersData = snapshot.docs.map((doc) => ({ id: doc.id, __collection: 'tableOrders', ...doc.data() }));
        setTableOrders(tableOrdersData);

        if (!initialLoadRefs.current.tableOrders) {
          initialLoadRefs.current.tableOrders = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar pedidos de mesa: ${error.message}`);
        if (!initialLoadRefs.current.tableOrders) {
          initialLoadRefs.current.tableOrders = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeTableOrders);

    // Waiter orders (salón creados en alguna vista de mesero)
    const waiterOrdersCollectionRef = collection(db, 'waiterOrders');
    const waiterOrdersQuery = (startOfDay && endOfDay)
      ? query(
          waiterOrdersCollectionRef,
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
        )
      : waiterOrdersCollectionRef;
        
    const unsubscribeWaiterOrders = onSnapshot(
      waiterOrdersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, __collection: 'waiterOrders', ...doc.data() }));
        setWaiterOrders(data);
        if (!initialLoadRefs.current.waiterOrders) {
          initialLoadRefs.current.waiterOrders = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar pedidos del mesero: ${error.message}`);
        if (!initialLoadRefs.current.waiterOrders) {
          initialLoadRefs.current.waiterOrders = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeWaiterOrders);

    // Breakfast orders DELIVERY (deliveryBreakfastOrders)
    const deliveryBreakfastOrdersRef = collection(db, 'deliveryBreakfastOrders');
    const deliveryBreakfastOrdersQuery = (startOfDay && endOfDay)
      ? query(
          deliveryBreakfastOrdersRef,
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
        )
      : deliveryBreakfastOrdersRef;
        
    const unsubscribeBreakfastOrders = onSnapshot(
      deliveryBreakfastOrdersQuery,
      (snapshot) => {
        const breakfastOrdersData = snapshot.docs.map((doc) => ({ id: doc.id, __collection: 'deliveryBreakfastOrders', ...doc.data() }));
        setBreakfastOrders(breakfastOrdersData);
        if (!initialLoadRefs.current.breakfastOrders) {
          initialLoadRefs.current.breakfastOrders = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar desayunos (delivery): ${error.message}`);
        if (!initialLoadRefs.current.breakfastOrders) {
          initialLoadRefs.current.breakfastOrders = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeBreakfastOrders);

    // Breakfast orders de SALÓN (colección 'breakfastOrders' creada en WaiterDashboard)
    const breakfastSalonOrdersRef = collection(db, 'breakfastOrders');
    const breakfastSalonOrdersQuery = (startOfDay && endOfDay)
      ? query(
          breakfastSalonOrdersRef,
          where('createdAt', '>=', startOfDay),
          where('createdAt', '<=', endOfDay),
        )
      : breakfastSalonOrdersRef;
        
    const unsubscribeBreakfastSalonOrders = onSnapshot(
      breakfastSalonOrdersQuery,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, __collection: 'breakfastOrders', ...doc.data() }));
        setBreakfastSalonOrders(data);
        if (!initialLoadRefs.current.breakfastSalonOrders) {
          initialLoadRefs.current.breakfastSalonOrders = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar desayunos de salón: ${error.message}`);
        if (!initialLoadRefs.current.breakfastSalonOrders) {
          initialLoadRefs.current.breakfastSalonOrders = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeBreakfastSalonOrders);

    // Users
    const usersCollectionRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(
      usersCollectionRef,
      (snapshot) => {
        const usersData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setUsers(usersData);
        if (!initialLoadRefs.current.users) {
          initialLoadRefs.current.users = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar usuarios: ${error.message}`);
        if (!initialLoadRefs.current.users) {
          initialLoadRefs.current.users = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeUsers);

    // User activity
    const userActivityCollectionRef = collection(db, 'userActivity');
    const unsubscribeActivity = onSnapshot(
      userActivityCollectionRef,
      (snapshot) => {
        const activity = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            const timestampDate = data.timestamp instanceof Timestamp ? data.timestamp.toDate() : null;
            return { id: doc.id, ...data, timestamp: timestampDate };
          })
          .sort((a, b) => (b.timestamp ? b.timestamp.getTime() : 0) - (a.timestamp ? a.timestamp.getTime() : 0));
        setUserActivity(activity);
        if (!initialLoadRefs.current.activity) {
          initialLoadRefs.current.activity = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar actividad: ${error.message}`);
        if (!initialLoadRefs.current.activity) {
          initialLoadRefs.current.activity = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeActivity);

    // Ingresos (históricos guardados)
    const ingresosColRef = collection(db, INGRESOS_COLLECTION);
    const unsubscribeIngresos = onSnapshot(
      ingresosColRef,
      (snapshot) => {
        const ingresosData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setIngresosData(ingresosData);
        if (!initialLoadRefs.current.ingresos) {
          initialLoadRefs.current.ingresos = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar ingresos: ${error.message}`);
        if (!initialLoadRefs.current.ingresos) {
          initialLoadRefs.current.ingresos = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribeIngresos);

    // Pedidos diarios guardados (conteos)
    const pedidosDiariosGuardadosColRef = collection(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION);
    const unsubscribePedidosDiariosGuardados = onSnapshot(
      pedidosDiariosGuardadosColRef,
      (snapshot) => {
        const pedidosData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setPedidosDiariosGuardadosData(pedidosData);
        if (!initialLoadRefs.current.pedidosDiariosGuardados) {
          initialLoadRefs.current.pedidosDiariosGuardados = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar pedidos diarios guardados: ${error.message}`);
        if (!initialLoadRefs.current.pedidosDiariosGuardados) {
          initialLoadRefs.current.pedidosDiariosGuardados = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribePedidosDiariosGuardados);

    // Payments (gastos) — opcionalmente filtrados por día seleccionado
    const paymentsQuery = (startOfDay && endOfDay)
      ? query(
          collection(db, 'payments'),
          where('timestamp', '>=', startOfDay),
          where('timestamp', '<=', endOfDay),
          orderBy('timestamp', 'asc'),
        )
      : collection(db, 'payments');

    const unsubscribePayments = onSnapshot(
      paymentsQuery,
      (snapshot) => {
        const items = snapshot.docs.map(d => {
          const data = d.data();
          // Fallback de fecha: timestamp || createdAt || date (string YYYY-MM-DD)
          let ts = data.timestamp || data.createdAt;
          if (!ts && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
            // Crear Date fijo medio día para evitar corrimientos huso horario
            ts = new Date(data.date + 'T12:00:00-05:00');
          }
          return { id: d.id, ...data, timestamp: ts || data.timestamp }; // normalizamos en timestamp
        });

        // Guardar lista cruda (incluye ahora registros antiguos sin serverTimestamp original)
        setPaymentsRaw(items);

        let totalExpenses = 0;
        const byProvider = {};
        const counts = {};

        const parseAmount = (val) => {
          if (typeof val === 'number') return isNaN(val)?0:val;
          if (typeof val === 'string') {
            // Eliminar símbolos de moneda, espacios y separadores de miles comunes
            let cleaned = val.trim()
              .replace(/COP/gi,'')
              .replace(/\$/g,'')
              .replace(/,/g,'')
              .replace(/\s+/g,'');
            // Si hay más de un punto, asume que son separadores de miles y quita todos
            const points = (cleaned.match(/\./g)||[]).length;
            if(points>1) cleaned = cleaned.replace(/\./g,'');
            const num = Number(cleaned);
            return isNaN(num)?0:num;
          }
          return 0;
        };

        for (const p of items) {
          const amount = parseAmount(p.amount || 0);
          const provider = (p.provider || p.store || '—').toString().trim() || '—';
          totalExpenses += amount;
          byProvider[provider] = (byProvider[provider] || 0) + amount;
          counts[provider] = (counts[provider] || 0) + 1;
        }

        setTotals(prev => {
          const net = Math.max((prev.grossIncome || 0) - totalExpenses, 0);
          return {
            ...prev,
            expenses: totalExpenses,
            expensesByProvider: { total: totalExpenses, byProvider, counts },
            net,
          };
        });

        if (!initialLoadRefs.current.payments) {
          initialLoadRefs.current.payments = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar pagos: ${error.message}`);
        if (!initialLoadRefs.current.payments) {
          initialLoadRefs.current.payments = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubscribePayments);

    // Payments ALL (sin filtro para gráficos de mes/año/7d)
    const unsubAllPayments = onSnapshot(
      collection(db, 'payments'),
      (snapshot) => {
        const items = snapshot.docs.map(d => {
          const data = d.data();
            let ts = data.timestamp || data.createdAt;
            if (!ts && typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
              ts = new Date(data.date + 'T12:00:00-05:00');
            }
            return { id: d.id, ...data, timestamp: ts || data.timestamp };
          });
        setPaymentsAllRaw(items);
        if(!initialLoadRefs.current.paymentsAll){
          initialLoadRefs.current.paymentsAll = true;
          checkIfAllLoaded();
        }
      },
      (error) => {
        setError?.(`Error al cargar todos los pagos: ${error.message}`);
        if(!initialLoadRefs.current.paymentsAll){
          initialLoadRefs.current.paymentsAll = true;
          checkIfAllLoaded();
        }
      }
    );
    unsubscribes.push(unsubAllPayments);

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [db, userId, isAuthReady, startOfDay, endOfDay]); // evita bucles

  /* ===========================================
     Recalcular métodos de pago (orders + salón + desayunos)
     =========================================== */
  useEffect(() => {
    const m = calcMethodTotalsAll(orders, salonOrders, [...breakfastOrders, ...breakfastSalonOrders]);
    setTotals((prev) => ({
      ...prev,
      cash: m.cashCaja, // compat: cash == caja real
      cashCaja: m.cashCaja,
      cashPendiente: m.cashClientesPendiente,
      daviplata: m.daviplataTotal,
      nequi: m.nequiTotal,
  // Mantener grossIncome basado en categorías (ya incluye pedidos no liquidados)
  // Exponemos adicionalmente totalLiquidado si se requiere (sin alterar UI actual)
  totalLiquidado: m.totalLiquidado,
  grossIncome: prev.byCategory ? (prev.byCategory.totalDomicilios || 0) + (prev.byCategory.ingresosSalon || 0) : prev.grossIncome,
  net: Math.max(((prev.byCategory ? (prev.byCategory.totalDomicilios || 0) + (prev.byCategory.ingresosSalon || 0) : prev.grossIncome) - (prev.expenses || 0)), 0)
    }));
  }, [orders, salonOrders, breakfastOrders, breakfastSalonOrders]);

  /* ===========================================
     Recalcular conteos de estado incluyendo todas las colecciones
     =========================================== */
  useEffect(() => {
    const allOrders = [
      ...(orders || []),
      ...(tableOrders || []),
      ...(waiterOrders || []),
      ...(breakfastOrders || []),
      ...(breakfastSalonOrders || [])
    ];

    const newStatusCounts = { Pending: 0, Delivered: 0, Cancelled: 0 };

    allOrders.forEach((order) => {
      const orderStatus = order.status?.toLowerCase() || '';
      if (orderStatus === ORDER_STATUS.PENDING) newStatusCounts.Pending += 1;
      else if (orderStatus === ORDER_STATUS.DELIVERED) newStatusCounts.Delivered += 1;
      else if (orderStatus === ORDER_STATUS.CANCELLED) newStatusCounts.Cancelled += 1;
    });

    setStatusCounts(newStatusCounts);

    const pieChartData = [
      { name: ORDER_STATUS_DISPLAY[ORDER_STATUS.PENDING], value: newStatusCounts.Pending, color: PIE_COLORS[0] },
      { name: ORDER_STATUS_DISPLAY[ORDER_STATUS.DELIVERED], value: newStatusCounts.Delivered, color: PIE_COLORS[1] },
      { name: ORDER_STATUS_DISPLAY[ORDER_STATUS.CANCELLED], value: newStatusCounts.Cancelled, color: PIE_COLORS[2] },
    ];
    setStatusPieChartData(pieChartData);
  }, [orders, tableOrders, waiterOrders, breakfastOrders, breakfastSalonOrders]);

  /* ==========================
     Daily Sales Chart (categorías)
     ========================== */
  useEffect(() => {
    if (!isAuthReady) return;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const { startDate: salesStartDate, endDate: salesEndDate } = getDateRange(
      salesFilterRange,
      salesCustomStartDate,
      salesCustomEndDate
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];
    let chartData;

    if (salesFilterRange === 'year' && !selectedMonth) {
      const monthlySales = {};
      const currentYear = today.getFullYear();

      for (let month = 0; month < 12; month++) {
        const monthKey = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
        monthlySales[monthKey] = {
          'Domicilios Almuerzo': 0,
          'Domicilios Desayuno': 0,
          'Mesas/Llevar Almuerzo': 0,
          'Mesas/Llevar Desayuno': 0,
        };
      }

      // Históricos guardados
      ingresosData.forEach((summary) => {
        const date = new Date(summary.date);
        if (date.getFullYear() === currentYear) {
          const mKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const c = summary.categories || {};
          monthlySales[mKey]['Domicilios Almuerzo'] += Number(c.domiciliosAlmuerzo || 0);
          monthlySales[mKey]['Domicilios Desayuno'] += Number(c.domiciliosDesayuno || 0);
          monthlySales[mKey]['Mesas/Llevar Almuerzo'] += Number(c.mesasAlmuerzo || 0);
          monthlySales[mKey]['Mesas/Llevar Desayuno'] += Number(c.mesasDesayuno || 0);
        }
      });

      // Realtime del mes actual (simple: mesa+llevar juntos)
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      let rt = { da: 0, dd: 0, ma: 0, md: 0 };

      orders.forEach((o) => {
        const d = o.createdAt?.toDate ? new Date(o.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth())
          rt.da += Number(o.total || 0);
      });
      salonOrders.forEach((t) => {
        const d = t.createdAt?.toDate ? new Date(t.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth()) {
          const esDesayuno = isBreakfastOrder(t);
          if (esDesayuno) rt.md += Number(t.total || 0);
          else rt.ma += Number(t.total || 0);
        }
      });
      // ⬇️ desayunos de salón (colección 'breakfastOrders') suman al bucket de "Mesas/Llevar Desayuno"
      breakfastSalonOrders.forEach((b) => {
        const d = b.createdAt?.toDate ? new Date(b.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth()) {
          rt.md += Number(b.total || 0);
        }
      });
      breakfastOrders.forEach((b) => {
        const dISO = getDocDateISO(b);
        if (!dISO) return;
        const d = new Date(dISO);
        if (d.getFullYear() !== currentYear || d.getMonth() !== today.getMonth()) return;

        const amount = Number(b.total || 0);
        const service = normalizeServiceFromOrder(b);
        const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
        if (service === 'mesa' || service === 'llevar') rt.md += amount;
        else if (service === 'domicilio' || (!service && hasAddr)) rt.dd += amount;
        else rt.dd += amount;
      });

      monthlySales[currentMonthKey]['Domicilios Almuerzo'] += rt.da;
      monthlySales[currentMonthKey]['Mesas/Llevar Almuerzo'] += rt.ma;
      monthlySales[currentMonthKey]['Domicilios Desayuno'] += rt.dd;
      monthlySales[currentMonthKey]['Mesas/Llevar Desayuno'] += rt.md;

      chartData = Object.keys(monthlySales).map((monthKey) => ({
        name: monthNames[parseInt(monthKey.split('-')[1]) - 1],
        monthKey,
        'Domicilios Almuerzo': monthlySales[monthKey]['Domicilios Almuerzo'],
        'Domicilios Desayuno': monthlySales[monthKey]['Domicilios Desayuno'],
        'Mesas/Llevar Almuerzo': monthlySales[monthKey]['Mesas/Llevar Almuerzo'],
        'Mesas/Llevar Desayuno': monthlySales[monthKey]['Mesas/Llevar Desayuno'],
      }));
    } else {
      const filteredDailySales = {};

      // Históricos por día
      ingresosData.forEach((summary) => {
        const summaryDateISO = new Date(summary.date).toISOString().split('T')[0];
        if (
          summaryDateISO >= salesStartDate.toISOString().split('T')[0] &&
          summaryDateISO <= salesEndDate.toISOString().split('T')[0]
        ) {
          const c = summary.categories || {};
          filteredDailySales[summaryDateISO] = {
            'Domicilios Almuerzo':
              (filteredDailySales[summaryDateISO]?.['Domicilios Almuerzo'] || 0) +
              Number(c.domiciliosAlmuerzo || 0),
            'Domicilios Desayuno':
              (filteredDailySales[summaryDateISO]?.['Domicilios Desayuno'] || 0) +
              Number(c.domiciliosDesayuno || 0),
            'Mesas/Llevar Almuerzo':
              (filteredDailySales[summaryDateISO]?.['Mesas/Llevar Almuerzo'] || 0) +
              Number(c.mesasAlmuerzo || 0),
            'Mesas/Llevar Desayuno':
              (filteredDailySales[summaryDateISO]?.['Mesas/Llevar Desayuno'] || 0) +
              Number(c.mesasDesayuno || 0),
          };
        }
      });

      // Realtime del rango (simple: mesa+llevar juntos)
      if (today >= salesStartDate && today <= salesEndDate) {
        let da = 0, dd = 0, ma = 0, md = 0;

        orders.forEach((o) => {
          const dISO = o.createdAt?.toDate ? new Date(o.createdAt.toDate()).toISOString().split('T')[0] : null;
          if (dISO && dISO >= salesStartDate.toISOString().split('T')[0] && dISO <= salesEndDate.toISOString().split('T')[0]) {
            da += Number(o.total || 0);
          }
        });

        salonOrders.forEach((t) => {
          const dISO = t.createdAt?.toDate ? new Date(t.createdAt.toDate()).toISOString().split('T')[0] : null;
          if (dISO && dISO >= salesStartDate.toISOString().split('T')[0] && dISO <= salesEndDate.toISOString().split('T')[0]) {
            const esDesayuno = isBreakfastOrder(t);
            if (esDesayuno) md += Number(t.total || 0);
            else ma += Number(t.total || 0);
          }
        });

        // ⬇️ desayunos de salón de 'breakfastOrders'
        breakfastSalonOrders.forEach((b) => {
          const dISO = b.createdAt?.toDate ? new Date(b.createdAt.toDate()).toISOString().split('T')[0] : getDocDateISO(b);
          if (dISO && dISO >= salesStartDate.toISOString().split('T')[0] && dISO <= salesEndDate.toISOString().split('T')[0]) {
            md += Number(b.total || 0);
          }
        });

        breakfastOrders.forEach((b) => {
          const dISO = getDocDateISO(b);
          if (dISO && dISO >= salesStartDate.toISOString().split('T')[0] && dISO <= salesEndDate.toISOString().split('T')[0]) {
            const amount = Number(b.total || 0);
            const service = normalizeServiceFromOrder(b);
            const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
            if (service === 'mesa' || service === 'llevar') md += amount;
            else if (service === 'domicilio' || (!service && hasAddr)) dd += amount;
            else dd += amount;
          }
        });

        const k = todayISO;
        filteredDailySales[k] = {
          'Domicilios Almuerzo': (filteredDailySales[k]?.['Domicilios Almuerzo'] || 0) + da,
          'Domicilios Desayuno': (filteredDailySales[k]?.['Domicilios Desayuno'] || 0) + dd,
          'Mesas/Llevar Almuerzo': (filteredDailySales[k]?.['Mesas/Llevar Almuerzo'] || 0) + ma,
          'Mesas/Llevar Desayuno': (filteredDailySales[k]?.['Mesas/Llevar Desayuno'] || 0) + md,
        };
      }

      const sortedDates = Object.keys(filteredDailySales).sort((a, b) => new Date(a) - new Date(b));
      chartData = sortedDates.map((date) => ({
        name: date,
        'Domicilios Almuerzo': filteredDailySales[date]['Domicilios Almuerzo'] || 0,
        'Domicilios Desayuno': filteredDailySales[date]['Domicilios Desayuno'] || 0,
        'Mesas/Llevar Almuerzo': filteredDailySales[date]['Mesas/Llevar Almuerzo'] || 0,
        'Mesas/Llevar Desayuno': filteredDailySales[date]['Mesas/Llevar Desayuno'] || 0,
      }));
    }

    setDailySalesChartData(chartData);
  }, [
    orders,
    salonOrders,
    breakfastOrders,
    breakfastSalonOrders,
    ingresosData,
    salesFilterRange,
    salesCustomStartDate,
    salesCustomEndDate,
    isAuthReady,
    selectedMonth,
  ]);

  /* ==========================
     Daily Orders Chart (conteos)
     ========================== */
  useEffect(() => {
    if (!isAuthReady) return;

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const { startDate: ordersStartDate, endDate: ordersEndDate } = getDateRange(
      ordersFilterRange,
      ordersCustomStartDate,
      ordersCustomEndDate
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString().split('T')[0];
    let chartData;

    if (ordersFilterRange === 'year' && !selectedMonth) {
      const monthlyOrders = {};
      const currentYear = today.getFullYear();

      for (let month = 0; month < 12; month++) {
        const monthKey = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
        monthlyOrders[monthKey] = { domicilios: 0, mesas: 0 };
      }

      pedidosDiariosGuardadosData.forEach((summary) => {
        const date = new Date(summary.date);
        if (date.getFullYear() === currentYear) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyOrders[monthKey].domicilios += summary.domicilios || 0;
          monthlyOrders[monthKey].mesas += summary.mesas || 0;
        }
      });

      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      let currentMonthRealtimeDomicilios = 0;
      let currentMonthRealtimeMesas = 0;

      orders.forEach((order) => {
        const d = order.createdAt?.toDate ? new Date(order.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth()) {
          currentMonthRealtimeDomicilios++;
        }
      });

      salonOrders.forEach((tableOrder) => {
        const d = tableOrder.createdAt?.toDate ? new Date(tableOrder.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth()) {
          currentMonthRealtimeMesas++;
        }
      });

      // ⬇️ contar órdenes de desayunos de salón como "Mesas"
      breakfastSalonOrders.forEach((bo) => {
        const d = bo.createdAt?.toDate ? new Date(bo.createdAt.toDate()) : null;
        if (d && d.getFullYear() === currentYear && d.getMonth() === today.getMonth()) {
          currentMonthRealtimeMesas++;
        }
      });

      monthlyOrders[currentMonthKey].domicilios += currentMonthRealtimeDomicilios;
      monthlyOrders[currentMonthKey].mesas += currentMonthRealtimeMesas;

      chartData = Object.keys(monthlyOrders).map((monthKey) => ({
        name: monthNames[parseInt(monthKey.split('-')[1]) - 1],
        monthKey: monthKey,
        Domicilios: monthlyOrders[monthKey].domicilios,
        Mesas: monthlyOrders[monthKey].mesas,
      }));
    } else {
      const filteredDailyOrders = {};

      pedidosDiariosGuardadosData.forEach((summary) => {
        const summaryDate = new Date(summary.date).toISOString().split('T')[0];
        if (
          summaryDate >= ordersStartDate.toISOString().split('T')[0] &&
          summaryDate <= ordersEndDate.toISOString().split('T')[0]
        ) {
          if (ordersFilterRange === 'year' && selectedMonth) {
            const monthKey = `${new Date(summary.date).getFullYear()}-${String(
              new Date(summary.date).getMonth() + 1
            ).padStart(2, '0')}`;
            if (monthKey === selectedMonth) {
              filteredDailyOrders[summaryDate] = {
                Domicilios: summary.domicilios || 0,
                Mesas: summary.mesas || 0,
              };
            }
          } else {
            filteredDailyOrders[summaryDate] = {
              Domicilios: summary.domicilios || 0,
              Mesas: summary.mesas || 0,
            };
          }
        }
      });

      if (today >= ordersStartDate && today <= ordersEndDate) {
  let currentDayRealtimeDomicilios = 0;
  let currentDayRealtimeMesas = 0;
  // Nuevos contadores detallados por (servicio, comida)
  let c_domiciliosDesayuno = 0, c_domiciliosAlmuerzo = 0;
  let c_mesasDesayuno = 0, c_mesasAlmuerzo = 0;
  let c_llevarDesayuno = 0, c_llevarAlmuerzo = 0;

        orders.forEach((order) => {
          const orderDate = order.createdAt?.toDate
            ? new Date(order.createdAt.toDate()).toISOString().split('T')[0]
            : null;
          if (orderDate === todayISO) {
            currentDayRealtimeDomicilios++;
            const esDes = isBreakfastOrder(order);
            const serv = (normalizeServiceFromOrder(order) || 'domicilio').toLowerCase();
            if (serv === 'domicilio') {
              if (esDes) c_domiciliosDesayuno++; else c_domiciliosAlmuerzo++;
            } else if (serv === 'mesa') {
              if (esDes) c_mesasDesayuno++; else c_mesasAlmuerzo++;
            } else if (serv === 'llevar') {
              if (esDes) c_llevarDesayuno++; else c_llevarAlmuerzo++;
            } else { // fallback tratar como domicilio
              if (esDes) c_domiciliosDesayuno++; else c_domiciliosAlmuerzo++;
            }
          }
        });

        salonOrders.forEach((tableOrder) => {
          const tableOrderDate = tableOrder.createdAt?.toDate
            ? new Date(tableOrder.createdAt.toDate()).toISOString().split('T')[0]
            : null;
          if (tableOrderDate === todayISO) {
            currentDayRealtimeMesas++;
            const esDes = isBreakfastOrder(tableOrder);
            const serv = (normalizeServiceFromOrder(tableOrder) || 'mesa').toLowerCase();
            if (serv === 'mesa') {
              if (esDes) c_mesasDesayuno++; else c_mesasAlmuerzo++;
            } else if (serv === 'llevar') {
              if (esDes) c_llevarDesayuno++; else c_llevarAlmuerzo++;
            } else if (serv === 'domicilio') {
              if (esDes) c_domiciliosDesayuno++; else c_domiciliosAlmuerzo++;
            }
          }
        });

        // Desayunos delivery (domicilios desayuno) deben contar como domicilios desayuno
        breakfastOrders.forEach((b) => {
          const dISO = getDocDateISO(b);
            if (dISO === todayISO) {
              const esDes = true; // por definición en esta colección
              const serv = (normalizeServiceFromOrder(b) || 'domicilio').toLowerCase();
              if (serv === 'domicilio') c_domiciliosDesayuno++;
              else if (serv === 'llevar') c_llevarDesayuno++; // fallback si llega como llevar
              else if (serv === 'mesa') c_mesasDesayuno++; // improbable
              else c_domiciliosDesayuno++;
              currentDayRealtimeDomicilios++; // contar pedido como domicilio
            }
        });

        // ⬇️ incluir desayunos de salón clasificando por servicio (mesa / llevar / domicilio)
        breakfastSalonOrders.forEach((bo) => {
          const dISO = bo.createdAt?.toDate
            ? new Date(bo.createdAt.toDate()).toISOString().split('T')[0]
            : getDocDateISO(bo);
          if (dISO === todayISO) {
            const serv = (normalizeServiceFromOrder(bo) || 'mesa').toLowerCase();
            if (serv === 'mesa') {
              currentDayRealtimeMesas++;
              c_mesasDesayuno++;
            } else if (serv === 'llevar') {
              // Llevar desayuno: NO incrementa mesas totales, pero sí conteo granular llevar
              c_llevarDesayuno++;
            } else if (serv === 'domicilio') {
              // Caso raro: desayuno salón marcado domicilio
              currentDayRealtimeDomicilios++;
              c_domiciliosDesayuno++;
            } else {
              currentDayRealtimeMesas++;
              c_mesasDesayuno++;
            }
          }
        });

        if (ordersFilterRange === 'year' && selectedMonth) {
          const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
          if (currentMonth === selectedMonth) {
            filteredDailyOrders[todayISO] = {
              Domicilios: (filteredDailyOrders[todayISO]?.Domicilios || 0) + currentDayRealtimeDomicilios,
              Mesas: (filteredDailyOrders[todayISO]?.Mesas || 0) + currentDayRealtimeMesas,
              domiciliosDesayuno: (filteredDailyOrders[todayISO]?.domiciliosDesayuno || 0) + c_domiciliosDesayuno,
              domiciliosAlmuerzo: (filteredDailyOrders[todayISO]?.domiciliosAlmuerzo || 0) + c_domiciliosAlmuerzo,
              mesasDesayuno: (filteredDailyOrders[todayISO]?.mesasDesayuno || 0) + c_mesasDesayuno,
              mesasAlmuerzo: (filteredDailyOrders[todayISO]?.mesasAlmuerzo || 0) + c_mesasAlmuerzo,
              llevarDesayuno: (filteredDailyOrders[todayISO]?.llevarDesayuno || 0) + c_llevarDesayuno,
              llevarAlmuerzo: (filteredDailyOrders[todayISO]?.llevarAlmuerzo || 0) + c_llevarAlmuerzo,
            };
          }
        } else {
          filteredDailyOrders[todayISO] = {
            Domicilios: (filteredDailyOrders[todayISO]?.Domicilios || 0) + currentDayRealtimeDomicilios,
            Mesas: (filteredDailyOrders[todayISO]?.Mesas || 0) + currentDayRealtimeMesas,
            domiciliosDesayuno: (filteredDailyOrders[todayISO]?.domiciliosDesayuno || 0) + c_domiciliosDesayuno,
            domiciliosAlmuerzo: (filteredDailyOrders[todayISO]?.domiciliosAlmuerzo || 0) + c_domiciliosAlmuerzo,
            mesasDesayuno: (filteredDailyOrders[todayISO]?.mesasDesayuno || 0) + c_mesasDesayuno,
            mesasAlmuerzo: (filteredDailyOrders[todayISO]?.mesasAlmuerzo || 0) + c_mesasAlmuerzo,
            llevarDesayuno: (filteredDailyOrders[todayISO]?.llevarDesayuno || 0) + c_llevarDesayuno,
            llevarAlmuerzo: (filteredDailyOrders[todayISO]?.llevarAlmuerzo || 0) + c_llevarAlmuerzo,
          };
        }
      }

      const sortedDates = Object.keys(filteredDailyOrders).sort((a, b) => new Date(a) - new Date(b));
      chartData = sortedDates.map((date) => ({
        name: date,
        Domicilios: filteredDailyOrders[date].Domicilios,
        Mesas: filteredDailyOrders[date].Mesas,
        domiciliosDesayuno: filteredDailyOrders[date].domiciliosDesayuno || 0,
        domiciliosAlmuerzo: filteredDailyOrders[date].domiciliosAlmuerzo || 0,
        mesasDesayuno: filteredDailyOrders[date].mesasDesayuno || 0,
        mesasAlmuerzo: filteredDailyOrders[date].mesasAlmuerzo || 0,
        llevarDesayuno: filteredDailyOrders[date].llevarDesayuno || 0,
        llevarAlmuerzo: filteredDailyOrders[date].llevarAlmuerzo || 0,
      }));
    }

    setDailyOrdersChartData(chartData);
  }, [
    orders,
    salonOrders,
    breakfastSalonOrders,
  pedidosDiariosGuardadosData,
  breakfastOrders,
    ordersFilterRange,
    ordersCustomStartDate,
    ordersCustomEndDate,
    isAuthReady,
    selectedMonth,
  ]);

  /* ==========================================
     Guardar ingresos diarios (HOY) — coherente
     ========================================== */
  const handleSaveDailyIngresos = useCallback(async () => {
    setLoadingData(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      let da = 0, dd = 0, ma = 0, md = 0;

      // Domicilios almuerzo (orders)
      orders.forEach((o) => {
        const dISO = o.createdAt?.toDate ? new Date(o.createdAt.toDate()).toISOString().split('T')[0] : null;
        if (dISO === today) da += Number(o.total || 0);
      });

      // Salón (tableOrders + waiterOrders) — separar desayuno/almuerzo
      salonOrders.forEach((t) => {
        const dISO = t.createdAt?.toDate ? new Date(t.createdAt.toDate()).toISOString().split('T')[0] : null;
        if (dISO !== today) return;
        const amount = Number(t.total || 0);
        if (amount <= 0) return;
        const esDesayuno = isBreakfastOrder(t);
        if (esDesayuno) md += amount;
        else ma += amount;
      });

      // Desayunos de salón (colección 'breakfastOrders'): van al bucket de "Mesas/Llevar Desayuno"
      breakfastSalonOrders.forEach((b) => {
        const dISO = b.createdAt?.toDate ? new Date(b.createdAt.toDate()).toISOString().split('T')[0] : getDocDateISO(b);
        if (dISO === today) md += Number(b.total || 0);
      });

      // Desayunos delivery
      breakfastOrders.forEach((b) => {
        if (getDocDateISO(b) === today) {
          const amount = Number(b.total || 0);
          const service = normalizeServiceFromOrder(b);
          const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
          if (service === 'mesa' || service === 'llevar') md += amount;
          else if (service === 'domicilio' || (!service && hasAddr)) dd += amount;
          else dd += amount;
        }
      });

      const totalIncome = da + dd + ma + md;

      const qY = query(collection(db, INGRESOS_COLLECTION), where('date', '==', today));
      const snap = await getDocs(qY);
      const payload = {
        date: today,
        categories: {
          domiciliosAlmuerzo: da,
          domiciliosDesayuno: dd,
          mesasAlmuerzo: ma,
          mesasDesayuno: md,
        },
        totalIncome,
        updatedAt: serverTimestamp(),
      };

      if (snap.empty) {
        await addDoc(collection(db, INGRESOS_COLLECTION), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSuccess?.(`Resumen de ingresos para ${today} guardado correctamente.`);
      } else {
        await updateDoc(doc(db, INGRESOS_COLLECTION, snap.docs[0].id), payload);
        setSuccess?.(`Resumen de ingresos para ${today} actualizado correctamente.`);
      }
    } catch (error) {
      setError?.(`Error al guardar/actualizar resumen de ingresos: ${error.message}`);
      console.error('Error al guardar ingresos diarios:', error);
    } finally {
      setLoadingData(false);
    }
  }, [db, orders, salonOrders, breakfastOrders, breakfastSalonOrders, setSuccess, setError]);

  /* ===================================
     Cierre automático diario (para AYER)
     =================================== */
  useEffect(() => {
    if (!isAuthReady) return;

    const saveDay = async () => {
      try {
        const now = new Date();
        const todayISO = now.toISOString().split('T')[0];
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        y.setHours(0, 0, 0, 0);
        const yesterdayISO = y.toISOString().split('T')[0];

        const inDayISO = (ts, targetISO) => {
          const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
          if (!d) return false;
          return d.toISOString().split('T')[0] === targetISO;
        };

        let da = 0, dd = 0, ma = 0, md = 0;

        orders.forEach((o) => {
          if (inDayISO(o.createdAt, yesterdayISO)) da += Number(o.total || 0);
        });

        salonOrders.forEach((t) => {
          if (!inDayISO(t.createdAt, yesterdayISO)) return;
          const amount = Number(t.total || 0);
          if (amount <= 0) return;
          const esDesayuno = isBreakfastOrder(t);
          if (esDesayuno) md += amount;
          else ma += amount;
        });

        // Desayunos de salón (ayer)
        breakfastSalonOrders.forEach((b) => {
          const bISO = getDocDateISO(b);
          if (bISO !== yesterdayISO) return;
          md += Number(b.total || 0);
        });

        // Desayunos delivery (ayer)
        breakfastOrders.forEach((b) => {
          const bISO = getDocDateISO(b);
          if (bISO !== yesterdayISO) return;
          const amount = Number(b.total || 0);
          const service = normalizeServiceFromOrder(b);
          const hasAddr = !!(b.address?.address || b.breakfasts?.[0]?.address?.address);
          if (service === 'mesa' || service === 'llevar') md += amount;
          else if (service === 'domicilio' || (!service && hasAddr)) dd += amount;
          else dd += amount;
        });

        const payloadY = {
          date: yesterdayISO,
          categories: {
            domiciliosAlmuerzo: da,
            domiciliosDesayuno: dd,
            mesasAlmuerzo: ma,
            mesasDesayuno: md,
          },
          totalIncome: da + dd + ma + md,
          updatedAt: serverTimestamp(),
        };

        // Upsert AYER
        const qY = query(collection(db, INGRESOS_COLLECTION), where('date', '==', yesterdayISO));
        const snapY = await getDocs(qY);
        if (snapY.empty) {
          await addDoc(collection(db, INGRESOS_COLLECTION), { ...payloadY, createdAt: serverTimestamp() });
        } else {
          await updateDoc(doc(db, INGRESOS_COLLECTION, snapY.docs[0].id), payloadY);
        }

        // Sembrar HOY vacío si no existe
        const qToday = query(collection(db, INGRESOS_COLLECTION), where('date', '==', todayISO));
        const snapToday = await getDocs(qToday);
        if (snapToday.empty) {
          await addDoc(collection(db, INGRESOS_COLLECTION), {
            date: todayISO,
            categories: { domiciliosAlmuerzo: 0, domiciliosDesayuno: 0, mesasAlmuerzo: 0, mesasDesayuno: 0 },
            totalIncome: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        setError?.(`Cierre automático: ${e.message}`);
        console.error('Cierre automático diario', e);
      }
    };

    // Programar a las 00:00:05
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      next.setDate(now.getDate() + 1);
      next.setHours(0, 0, 5, 0);
      const ms = next.getTime() - now.getTime();
      return setTimeout(async () => {
        await saveDay();
        schedule();
      }, ms);
    };

    const timer = schedule();
    return () => clearTimeout(timer);
  }, [isAuthReady, orders, salonOrders, breakfastOrders, breakfastSalonOrders, setError]);

  /* ==========================================
     Guardar / borrar conteo de pedidos diarios
     ========================================== */
  const handleDeleteDailyIngresos = useCallback(async () => {
    setLoadingData(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const q = query(collection(db, INGRESOS_COLLECTION), where('date', '==', today));
      const existingSummarySnapshot = await getDocs(q);

      if (!existingSummarySnapshot.empty) {
        const docToDelete = existingSummarySnapshot.docs[0];
        await deleteDoc(doc(db, INGRESOS_COLLECTION, docToDelete.id));
        setSuccess?.(`Resumen de ingresos para ${today} eliminado correctamente.`);
      } else {
        setSuccess?.(`No se encontró un resumen de ingresos para ${today} para eliminar.`);
      }
    } catch (error) {
      setError?.(`Error al eliminar resumen de ingresos: ${error.message}`);
      console.error('Error al eliminar ingresos diarios:', error);
    } finally {
      setLoadingData(false);
    }
  }, [db, setSuccess, setError]);

  const handleSaveDailyOrders = useCallback(async () => {
    setLoadingData(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      let currentDayDomicilios = 0;
      let currentDayMesas = 0;

      orders.forEach((order) => {
        const orderDate = order.createdAt?.toDate
          ? new Date(order.createdAt.toDate()).toISOString().split('T')[0]
          : null;
        if (orderDate === today) currentDayDomicilios++;
      });

      salonOrders.forEach((tableOrder) => {
        const tableOrderDate = tableOrder.createdAt?.toDate
          ? new Date(tableOrder.createdAt.toDate()).toISOString().split('T')[0]
          : null;
        if (tableOrderDate === today) currentDayMesas++;
      });

      // ⬇️ contar también las órdenes de desayunos de salón
      breakfastSalonOrders.forEach((bo) => {
        const dISO = bo.createdAt?.toDate
          ? new Date(bo.createdAt.toDate()).toISOString().split('T')[0]
          : getDocDateISO(bo);
        if (dISO === today) currentDayMesas++;
      });

      const q = query(collection(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION), where('date', '==', today));
      const existingSummarySnapshot = await getDocs(q);

      if (existingSummarySnapshot.empty) {
        await addDoc(collection(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION), {
          date: today,
          domicilios: currentDayDomicilios,
          mesas: currentDayMesas,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSuccess?.(`Conteo de pedidos diarios para ${today} guardado correctamente.`);
      } else {
        const docToUpdate = existingSummarySnapshot.docs[0];
        await updateDoc(doc(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION, docToUpdate.id), {
          domicilios: currentDayDomicilios,
          mesas: currentDayMesas,
          updatedAt: serverTimestamp(),
        });
        setSuccess?.(`Conteo de pedidos diarios para ${today} actualizado correctamente.`);
      }
    } catch (error) {
      setError?.(`Error al guardar/actualizar conteo de pedidos diarios: ${error.message}`);
      console.error('Error al guardar conteo de pedidos diarios:', error);
    } finally {
      setLoadingData(false);
    }
  }, [db, orders, salonOrders, breakfastSalonOrders, setSuccess, setError]);

  const handleDeleteDailyOrders = useCallback(async () => {
    setLoadingData(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const q = query(collection(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION), where('date', '==', today));
      const existingSummarySnapshot = await getDocs(q);

      if (!existingSummarySnapshot.empty) {
        const docToDelete = existingSummarySnapshot.docs[0];
        await deleteDoc(doc(db, PEDIDOS_DIARIOS_GUARDADOS_COLLECTION, docToDelete.id));
        setSuccess?.(`Conteo de pedidos diarios para ${today} eliminado correctamente.`);
      } else {
        setSuccess?.(`No se encontró un conteo de pedidos diarios para ${today} para eliminar.`);
      }
    } catch (error) {
      setError?.(`Error al eliminar conteo de pedidos diarios: ${error.message}`);
      console.error('Error al eliminar conteo de pedidos diarios:', error);
    } finally {
      setLoadingData(false);
    }
  }, [db, setSuccess, setError]);

  /* ============
     Retorno hook
     ============ */
  return {
    loadingData,
    orders,
    tableOrders,
    waiterOrders,
    breakfastOrders,        // delivery
    breakfastSalonOrders,   // salón
    users,
    totals,
    statusCounts,
    userActivity,
  // Datos históricos crudos necesarios para nuevos rangos simplificados en gráficos
  ingresosData,                 // registros diarios guardados de ingresos
  pedidosDiariosGuardadosData,  // registros diarios guardados de pedidos
  paymentsRaw,                  // gastos crudos para gráficos avanzados
  paymentsAllRaw,               // gastos globales para rangos

    // ALIAS para DashboardCharts:
    ingresosCategoriasData: dailySalesChartData,
    gastosPorTiendaData: Object.entries(totals?.expensesByProvider?.byProvider || {})
      .map(([name, value]) => ({ name, value })),
    pedidosDiariosChartData: dailyOrdersChartData,
    statusPieChartData,
  // Estructuras para vistas de ingresos (Hoy / 7d / Mes / Año)
  periodStructures,

    // Desglose robusto por Tipo de Venta
    saleTypeBreakdown,

    // Handlers:
    handleSaveDailyIngresos,
    handleDeleteDailyIngresos,
    handleSaveDailyOrders,
    handleDeleteDailyOrders,
  };
};
