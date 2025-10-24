//src/components/Admin/DashboardCharts.js
import React, { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import { ymdInBogota } from '../../utils/bogotaTime';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Label, LabelList
} from 'recharts';
import { DollarSign, MoreVertical, Save, Trash2, TrendingUp, Package, ArrowLeft } from 'lucide-react';
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { classNames } from '../../utils/classNames';
import { BAR_COLORS, PIE_COLORS } from './dashboardConstants';
import { isMobile as checkIsMobile } from '../../utils/Helpers';

// Custom scrollbar styles
const scrollbarStyles = `
  .custom-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: var(--scrollbar-track-color, #2d3748);
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb-color, #4a5568);
    border-radius: 10px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover-color, #64748b);
  }
  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb-color, #4a5568) var(--scrollbar-track-color, #2d3748);
  }
`;

const SkeletonLoader = ({ type, theme, isMobile }) => {
  if (type === 'bar') {
    const numBars = isMobile ? 5 : 7;
    return (
      <div className="flex h-full items-end justify-around p-4 animate-pulse">
        {Array.from({ length: numBars }).map((_, i) => (
          <div
            key={i}
            className={classNames(
              'rounded-t-md',
              theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200',
              'mx-1'
            )}
            style={{ width: `${100 / numBars - 5}%`, height: `${Math.random() * 70 + 30}%` }}
          ></div>
        ))}
      </div>
    );
  } else if (type === 'pie') {
    return (
      <div className="flex justify-center items-center h-full animate-pulse">
        <div className={classNames(
          isMobile ? 'w-32 h-32' : 'w-40 h-40',
          'rounded-full',
          theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
        )}></div>
      </div>
    );
  }
  return null;
};

// Colombian Peso formatter
const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
});

// Helper para obtener Date desde diferentes campos posibles del pago
const getPaymentDate = (p) => {
  if(!p) return null;
  const ts = p.timestamp || p.createdAt || p.date;
  if(!ts) return null;
  // Si es instancia Date directa
  if(ts instanceof Date){
    if(isNaN(ts)) return null; return ts;
  }
  if(typeof ts === 'string') {
    // Si es formato YYYY-MM-DD lo interpretamos como día en Bogotá para evitar corrimiento a día anterior por UTC
    if(/^\d{4}-\d{2}-\d{2}$/.test(ts)) {
      const d = new Date(`${ts}T00:00:00-05:00`); // fija zona -05:00
      return isNaN(d) ? null : d;
    }
    const d=new Date(ts);
    return isNaN(d)? null : d;
  }
  if(ts.toDate) { try { return ts.toDate(); } catch{ return null; } }
  return null;
};

// Parser robusto de montos (sincronizado con hook)
const parseAmountSafe = (val) => {
  if (typeof val === 'number') return isNaN(val)?0:val;
  if (typeof val === 'string') {
    // Quitar todo lo que no sea dígito (asumimos COP sin decimales relevantes)
    const digits = val.replace(/[^0-9]/g,'');
    if(!digits) return 0;
    const num = Number(digits);
    return isNaN(num)?0:num;
  }
  return 0;
};

// Intenta múltiples campos posibles para montos antiguos
const extractAnyAmount = (p) => {
  const candidates = [p.amount, p.valor, p.value, p.monto, p.total, p.totalAmount, p.price];
  for(const c of candidates){
    const v = parseAmountSafe(c);
    if(v>0) return v;
  }
  // último recurso: units * price
  if(p.units && p.price) return parseAmountSafe(p.units) * parseAmountSafe(p.price);
  return 0;
};

// Custom Tooltip for Bar Charts
const CustomBarTooltip = ({ active, payload, label, theme, chartTextColor, copFormatter, isOrderChart = false }) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((sum, entry) => sum + entry.value, 0);
    const formatValue = isOrderChart ? (value) => value.toLocaleString() : (value) => typeof copFormatter === 'function' ? copFormatter(value) : copFormatter.format(value);
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="custom-tooltip p-3 rounded-xl shadow-lg border"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.7)' : 'rgba(229, 231, 235, 0.7)',
          backdropFilter: 'blur(8px)',
          color: chartTextColor,
          fontSize: '14px',
        }}
      >
        <p className="font-bold mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color || chartTextColor }}>
            {entry.name}: <span className="font-semibold">{formatValue(entry.value)}</span>
          </p>
        ))}
        <p className="font-bold mt-2 border-t pt-2" style={{ borderColor: theme === 'dark' ? '#4b5563' : '#e5e7eb' }}>
          Total: {formatValue(total)}
        </p>
      </motion.div>
    );
  }
  return null;
};

// Tooltip para gráfico de gastos (modo días o modo proveedores)
const ExpensesDayTooltip = ({ active, payload, theme, chartTextColor, copFormatter, providersByDay, providerBreakdown, expenseDrillDay }) => {
  if(!active || !payload || !payload.length) return null;
  const row = payload[0].payload || {};
  const isProviderMode = Array.isArray(providerBreakdown) && providerBreakdown.length>0 && expenseDrillDay;
  const bg = theme==='dark' ? '#1f2937' : '#ffffff';
  const border = theme==='dark'? '#374151' : '#e5e7eb';

  if(isProviderMode){
    const provEntry = providerBreakdown.find(p=>p.name===row.name) || row;
    const shown = (provEntry.value && provEntry.value>0)? provEntry.value : (provEntry.original && provEntry.original>0 ? provEntry.original : 0);
    const total = providerBreakdown.reduce((s,i)=>{
      const v = (i.value && i.value>0)? i.value : (i.original && i.original>0 ? i.original : 0);
      return s+v;
    },0);
    const pct = total? (shown/total*100):0;
    return (
      <div style={{background:bg, border:`1px solid ${border}`, borderRadius:6, padding:10, maxWidth:240, color:chartTextColor}}>
        <div style={{fontWeight:600, fontSize:12, marginBottom:2}}>{expenseDrillDay}</div>
        <div style={{fontSize:11, opacity:.7, marginBottom:6}}>Desglose por proveedor</div>
        <div style={{display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4}}>
          <span style={{fontWeight:600}}>{provEntry.name}</span>
          <span style={{fontWeight:600}}>{copFormatter.format(shown)}</span>
        </div>
        <div style={{fontSize:11, marginBottom:8}}>{pct.toFixed(0)}% del día</div>
        <div style={{borderTop:`1px solid ${border}`, paddingTop:6, fontSize:11, display:'flex', justifyContent:'space-between'}}>
          <span>Total día</span>
          <strong>{copFormatter.format(total)}</strong>
        </div>
      </div>
    );
  }

  // Modo días (barra representa un día) -> lista proveedores dentro del tooltip usando providersByDay
  const day = row.day || row.name;
  const entry = providersByDay?.[day];
  return (
    <div style={{background:bg, border:`1px solid ${border}`, borderRadius:6, padding:8, maxWidth:260, color:chartTextColor}}>
      <div style={{fontWeight:600, fontSize:12, marginBottom:4}}>{day}</div>
      <div style={{fontSize:12, marginBottom: entry?4:0}}>Total: <strong>{copFormatter.format(row.Total||0)}</strong></div>
      {row.monthIndex!=null && (
        <div style={{fontSize:11, opacity:.7}}>Click para ver días</div>
      )}
      {row.day && !entry && (
        <div style={{fontSize:11, opacity:.6}}>Sin proveedores</div>
      )}
      {row.day && entry && (
        <div style={{maxHeight:140, overflowY:'auto'}}>
          {Object.entries(entry.providers).sort((a,b)=>b[1]-a[1]).map(([prov, amt])=>{
            const pct = entry.total? (amt/entry.total*100):0;
            return (
              <div key={prov} style={{display:'flex', gap:6, fontSize:11, padding:'2px 0', lineHeight:1.25}}>
                <span style={{flex:1, overflow:'hidden', textOverflow:'ellipsis'}} title={prov}>{prov}</span>
                <span style={{opacity:.6, minWidth:34, textAlign:'right'}}>{pct.toFixed(0)}%</span>
                <span style={{fontWeight:600, minWidth:70, textAlign:'right'}}>{copFormatter.format(amt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Custom Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload, theme, chartTextColor }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 5 }}
        className="custom-tooltip p-3 rounded-xl shadow-lg border"
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: theme === 'dark' ? 'rgba(75, 85, 99, 0.7)' : 'rgba(229, 231, 235, 0.7)',
          backdropFilter: 'blur(8px)',
          color: chartTextColor,
          fontSize: '14px',
        }}
      >
        <p className="font-bold mb-1" style={{ color: data.color || chartTextColor }}>{data.name}</p>
        <p>
          Valor: <span className="font-semibold">{data.value}</span>
        </p>
        <p>
          Porcentaje: <span className="font-semibold">{`${(data.percent * 100).toFixed(1)}%`}</span>
        </p>
      </motion.div>
    );
  }
  return null;
};

const DashboardCharts = React.memo(({
  dailySalesChartData,
  dailyOrdersChartData,
  statusPieChartData,
  totalGrossToday = 0,
  selectedDate = null,
  categoryTotals = null,
  periodStructures = null,
  paymentsRaw = [],
  paymentsAllRaw = [],
  // Nuevos props para barra de gastos del día
  totalExpensesTodayProp = 0,
  expensesByProvider = { total:0, byProvider:{}, counts:{} },
  settledDomiciliosAlmuerzo = 0,
  settledDomiciliosDesayuno = 0,
  ingresosData = [],
  pedidosDiariosGuardadosData = [],
  theme = 'dark',
  chartTextColor = '#ffffff',
  // Rango simplificado (aplica a los tres gráficos principales): 'today' | '7d' | 'month' | 'year'
  // Se maneja localmente dentro del componente para no introducir cambios globales.
  handleSaveDailyIngresos = () => {},
  handleDeleteDailyIngresos = () => {},
  handleSaveDailyOrders = () => {},
  handleDeleteDailyOrders = () => {},
  handleSaveDailyExpenses = () => {},
  handleDeleteDailyExpenses = () => {},
  loading,
  selectedMonth,
  setSelectedMonth = () => {}
}) => {
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  // Eliminamos estado local duplicado de payments: usamos paymentsRaw / paymentsAllRaw y expensesByProvider del hook
  // Estado del rango activo (por defecto últimos 7 días)
  const [range, setRange] = useState('7d'); // 'today' | '7d' | 'month' | 'year'
  // Drilldowns
  const [drillMonth, setDrillMonth] = useState(null); // YYYY-MM cuando estamos en vista de año y clickeamos un mes
  const [drillDayIncome, setDrillDayIncome] = useState(null); // YYYY-MM-DD cuando se selecciona un día (desde año->mes o mes)
  const [drillMonthOrders, setDrillMonthOrders] = useState(null);
  const [drillDayOrders, setDrillDayOrders] = useState(null);
  const [expenseFilterRange, setExpenseFilterRange] = useState('7d'); // reutilizamos para gastos pero usando mismos botones
  const [selectedRecipient, setSelectedRecipient] = useState(null);


  useEffect(() => {
    const handleResize = () => {
      setIsMobileDevice(checkIsMobile());
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cuando cambia selectedDate (desde Totales Generales) forzamos rango 'today' y limpiamos drilldowns.
  useEffect(()=>{
    if(selectedDate){
      setRange('today');
      setDrillMonth(null);
  // reset breakdown al cambiar fecha
  setShowIncomeBreakdown(false);
      setDrillMonthOrders(null);
      setDrillDayOrders(null);
  // reset drilldowns de gastos también
  setExpenseDrillMonth(null);
  setExpenseDrillDay(null);
    }
  },[selectedDate]);

  // Utilidades de rango
  const today = useMemo(()=>{ const d=new Date(); d.setHours(0,0,0,0); return d; },[]);
  const startEndForRange = useCallback(()=>{
    const base = (range==='today' && selectedDate) ? new Date(selectedDate+'T00:00:00') : today;
    const start = new Date(base);
    const end = new Date(base); end.setHours(23,59,59,999);
    if(range==='today') return {start,end};
    if(range==='7d'){ start.setDate(start.getDate()-6); return {start,end}; }
    if(range==='month'){ start.setDate(1); return {start,end}; }
    if(range==='year'){ start.setMonth(0,1); return {start,end}; }
    return {start,end};
  },[range,today,selectedDate]);

  // (dailyExpensesChartData se define más abajo tras declarar estados de drill de gastos)

  const totalExpenses = useMemo(() => {
    // Preferir total de expensesByProvider si viene calculado (ya está filtrado por fecha)
    if(typeof expensesByProvider?.total === 'number' && expensesByProvider.total>0) return expensesByProvider.total;
    // Para rangos de fecha usar paymentsRaw que está filtrado por la fecha seleccionada
    return paymentsRaw.reduce((s,p)=> s + Number(p.amount||0), 0);
  }, [expensesByProvider, paymentsRaw]);
  const totalOrders = useMemo(() => statusPieChartData.reduce((sum, entry) => sum + entry.value, 0), [statusPieChartData]);

  const aggregatedPaymentsByRecipient = useMemo(() => {
    // Usar paymentsRaw que está filtrado por fecha seleccionada
    const src = paymentsRaw;
    const map = expensesByProvider?.byProvider;
    const counts = expensesByProvider?.counts || {};
    if(map && Object.keys(map).length){
      // reconstruir lista de pagos por proveedor desde src para mostrar movimientos
      const byProv = src.reduce((acc,p)=>{ const k=p.provider||p.store||'Desconocido'; (acc[k]=acc[k]||[]).push(p); return acc; },{});
      return Object.entries(map).map(([store,totalAmount])=>({
        store,
        totalAmount: Number(totalAmount)||0,
        payments: (byProv[store]||[]).sort((a,b)=> b.timestamp.toDate() - a.timestamp.toDate()),
        count: counts[store] || (byProv[store]?.length||0)
      })).sort((a,b)=>b.totalAmount-a.totalAmount);
    }
    // fallback si no viene estructura agregada
    const grouped = src.reduce((acc,p)=>{ const storeName = p.provider||p.store||'Desconocido'; if(!acc[storeName]) acc[storeName]={ totalAmount:0, payments:[] }; acc[storeName].totalAmount+=Number(p.amount||0); acc[storeName].payments.push(p); return acc; },{});
    return Object.entries(grouped).map(([store,data])=>({store, ...data, count: data.payments.length})).sort((a,b)=>b.totalAmount-a.totalAmount);
  }, [expensesByProvider, paymentsRaw]);

  const paymentsForSelectedRecipient = useMemo(() => {
    if (!selectedRecipient) return [];
    // Usar paymentsRaw que está filtrado por fecha seleccionada
    const src = paymentsRaw;
    return src.filter(p=> (p.provider||p.store)===(selectedRecipient)).sort((a,b)=> b.timestamp.toDate() - a.timestamp.toDate());
  }, [paymentsRaw, selectedRecipient]);

  const chartVariants = {
    hidden: { opacity: 0, scale: 0.98, y: 10 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.98, y: 10, transition: { duration: 0.4, ease: "easeIn" } },
  };

  const pieChartVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.7, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.9, transition: { duration: 0.5, ease: "easeIn" } },
  };

  const chartMinWidth = isMobileDevice ? "min-w-[700px]" : "min-w-0";
  const chartHeight = isMobileDevice ? "h-[250px]" : "h-[300px]";

  // Dataset para gráfico horizontal (total por día sumando todas las categorías)
  // totalGrossToday se muestra en el encabezado del primer gráfico; se eliminó la segunda tarjeta duplicada.

  // Si dailySalesChartData llega como un solo objeto (totales actuales) lo transformamos a lista para gráfico horizontal
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);
  const [showExpensesBreakdownTop, setShowExpensesBreakdownTop] = useState(false);
  // Drilldown específico para gastos (independiente de ingresos)
  const [expenseDrillMonth, setExpenseDrillMonth] = useState(null); // índice de mes (0-11) cuando se profundiza desde vista año
  const [expenseDrillDay, setExpenseDrillDay] = useState(null); // YYYY-MM-DD cuando se selecciona un día dentro de un mes de gastos
  // Proveedor seleccionado dentro del panel diario de gastos
  const [expenseDayProviderSelected, setExpenseDayProviderSelected] = useState(null);
  useEffect(()=>{ setExpenseDayProviderSelected(null); }, [expenseDrillDay]);
  useEffect(()=>{ if(!expenseDrillDay) setShowExpensesBreakdownTop(false); }, [expenseDrillDay]);
  // Auto seleccionar el día en rango 'today' para mostrar de inmediato el panel
  useEffect(()=>{
    if(range==='today'){
      const day = selectedDate || ymdInBogota(new Date());
      if(expenseDrillDay!==day) setExpenseDrillDay(day);
    }
  }, [range, selectedDate, expenseDrillDay]);

  // Ahora sí: dailyExpensesChartData (después de definir expenseDrillMonth)
  const dailyExpensesChartData = useMemo(() => {
    const source = (range==='today') ? paymentsRaw : (paymentsAllRaw && paymentsAllRaw.length>0 ? paymentsAllRaw : paymentsRaw);
    if(!source || source.length===0) return [];
  const norm = source.map(p=>{ const d=getPaymentDate(p); if(!d) return null; return { amount: parseAmountSafe(p.amount||0), date: ymdInBogota(d) }; }).filter(Boolean);
    const byDay = {}; norm.forEach(r=>{ byDay[r.date]=(byDay[r.date]||0)+ (isNaN(r.amount)?0:r.amount); });
    const todayISO = selectedDate ? selectedDate : ymdInBogota(new Date());
    if(range==='today') return [{ name: todayISO, Total: Number(byDay[todayISO]||0) || 0, day: todayISO }];
    if(range==='7d'){
      const arr=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); const iso= ymdInBogota(d); arr.push({ name: iso, Total: Number(byDay[iso]||0) || 0, day: iso }); } return arr;
    }
    if(range==='month'){
      const base = selectedDate ? new Date(selectedDate) : new Date(); const year=base.getFullYear(); const month=base.getMonth(); const daysIn=new Date(year, month+1,0).getDate();
      const arr=[]; for(let d=1; d<=daysIn; d++){ const dateObj=new Date(year, month, d); const iso= ymdInBogota(dateObj); arr.push({ name: iso, Total: Number(byDay[iso]||0) || 0, day: iso }); } return arr;
    }
    if(range==='year'){
      const base = selectedDate ? new Date(selectedDate) : new Date(); const year=base.getFullYear();
      if(expenseDrillMonth==null){
        return Array.from({length:12},(_,m)=>{ let sum=0; for(const iso in byDay){ if(iso.startsWith(year+'-')){ const mm=Number(iso.split('-')[1]); if(mm===m+1) sum+=byDay[iso]; } } return { name:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m], Total: Number(sum)||0, monthIndex:m }; });
      }
      const daysIn=new Date(year, expenseDrillMonth+1,0).getDate();
      const arr=[]; for(let d=1; d<=daysIn; d++){ const dateObj=new Date(year, expenseDrillMonth, d); const iso= ymdInBogota(dateObj); arr.push({ name: iso, Total: Number(byDay[iso]||0) || 0, day: iso }); } return arr;
    }
    return [];
  }, [paymentsRaw, paymentsAllRaw, range, selectedDate, expenseDrillMonth]);

  // Dataset saneado para evitar NaN en YAxis
  const safeDailyExpensesChartData = useMemo(()=>{
    if (!Array.isArray(dailyExpensesChartData)) return [];
    return dailyExpensesChartData
      .filter(d => d && typeof d === 'object')
      .map(d => ({
        ...d, 
        Total: Number.isFinite(Number(d.Total)) ? Number(d.Total) : 0,
        value: Number.isFinite(Number(d.value)) ? Number(d.value) : 0
      }))
      .filter(d => d.Total >= 0); // Solo incluir valores válidos no negativos
  }, [dailyExpensesChartData]);

  // Mapa de proveedores por día para tooltip de gastos
  const expensesProvidersByDay = useMemo(()=>{
    const src = paymentsAllRaw && paymentsAllRaw.length? paymentsAllRaw : paymentsRaw;
    const map={};
    if(!src) return map;
  src.forEach(p=>{ const d=getPaymentDate(p); if(!d) return; const iso= ymdInBogota(d); const prov=p.provider||p.store||p.recipient||'—'; const amt=parseAmountSafe(p.amount||0); if(!map[iso]) map[iso]={total:0, providers:{}}; map[iso].total+=amt; map[iso].providers[prov]=(map[iso].providers[prov]||0)+amt; });
    return map;
  }, [paymentsAllRaw, paymentsRaw]);

  // Cálculo temprano de gastos y neto para reutilizar
  // Ajuste para fecha seleccionada distinta a hoy: buscar registro histórico
  const todayISOString = new Date().toISOString().split('T')[0];
  let adjustedGross = totalGrossToday;
  let adjustedExpenses = totalExpensesTodayProp;
  if(selectedDate && selectedDate !== todayISOString){
    const rec = ingresosData.find(r=> new Date(r.date).toISOString().split('T')[0] === selectedDate);
    if(rec){
      adjustedGross = Number(rec.totalIncome) || Number(rec.total) || Number(rec.gross) || Number(rec.neto) || 0;
      adjustedExpenses = Number(rec.expenses)||0; // si guardas gastos en el documento
    } else {
      // No hay registro histórico -> forzar cero para no mostrar datos de hoy
      adjustedGross = 0;
      adjustedExpenses = 0;
    }
  }
  const totalExpensesToday = Number(adjustedExpenses) || 0;
  const netToday = (Number(adjustedGross)||0) - totalExpensesToday;

  const categoryColor = useCallback((name) => {
    switch(name){
      case 'Domicilios Almuerzo': return '#34D399';
      case 'Domicilios Desayuno': return '#60A5FA';
      case 'Almuerzo Mesa': return '#F59E0B';
      case 'Almuerzo llevar': return '#FBBF24';
      case 'Desayuno Mesa': return '#EC4899';
      case 'Desayuno llevar': return '#F472B6';
      case 'Gastos': return '#EF4444';
      default: return '#10B981';
    }
  }, []);

  const incomeCategoriesData = useMemo(() => {
    // Si la fecha seleccionada es hoy (o no hay selectedDate) usamos categoryTotals actuales.
    const isTodaySelected = !selectedDate || selectedDate === new Date().toISOString().split('T')[0];
    if (isTodaySelected) {
      const ct = categoryTotals || {};
      return [
        { name: 'Domicilios Almuerzo', value: Number(ct.domiciliosAlmuerzo)||0 },
        { name: 'Domicilios Desayuno', value: Number(ct.domiciliosDesayuno)||0 },
        { name: 'Almuerzo Mesa', value: Number(ct.mesasAlmuerzo)||0 },
        { name: 'Almuerzo llevar', value: Number(ct.llevarAlmuerzo)||0 },
        { name: 'Desayuno Mesa', value: Number(ct.mesasDesayuno)||0 },
        { name: 'Desayuno llevar', value: Number(ct.llevarDesayuno)||0 },
      ];
    }
    // Buscar en ingresosData el registro de la fecha seleccionada
    const record = ingresosData.find(r => {
      const d = new Date(r.date);
      return d.toISOString().split('T')[0] === selectedDate;
    });
    const c = record?.categories || {};
    return [
      { name: 'Domicilios Almuerzo', value: Number(c.domiciliosAlmuerzo)||0 },
      { name: 'Domicilios Desayuno', value: Number(c.domiciliosDesayuno)||0 },
      { name: 'Almuerzo Mesa', value: Number(c.mesasAlmuerzo)||0 },
      { name: 'Almuerzo llevar', value: 0 }, // histórico no distingue, queda 0
      { name: 'Desayuno Mesa', value: Number(c.mesasDesayuno)||0 },
      { name: 'Desayuno llevar', value: 0 }, // histórico no distingue, queda 0
    ];
  }, [categoryTotals, settledDomiciliosAlmuerzo, settledDomiciliosDesayuno, ingresosData, selectedDate]);

  // Añadimos gastos como séptima barra negativa cuando se expande
  const breakdownData = useMemo(() => {
    // Si estamos en drilldown de mes en vista año, sumar totales de cada categoría y gastos del mes
    if (range === 'year' && drillMonth != null && !drillDayIncome) {
      const base = selectedDate ? new Date(selectedDate) : new Date();
      const targetYear = base.getFullYear();
      const targetMonth = drillMonth; // 0-index
      const records = (Array.isArray(ingresosData) ? ingresosData : []).filter(r => {
        if (!r?.date) return false;
        const d = new Date(r.date);
        return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      });
      let sumDAlm = 0, sumDDes = 0, sumMAlm = 0, sumMLle = 0, sumMDes = 0, sumDLle = 0, sumGastos = 0;
      records.forEach(r => {
        const c = r.categories || {};
        sumDAlm += Number(c.domiciliosAlmuerzo)||0;
        sumDDes += Number(c.domiciliosDesayuno)||0;
        sumMAlm += Number(c.mesasAlmuerzo)||0;
        sumMLle += Number(c.llevarAlmuerzo)||0;
        sumMDes += Number(c.mesasDesayuno)||0;
        sumDLle += Number(c.llevarDesayuno)||0;
        sumGastos += Number(r.expenses)||0;
      });
      return [
        { name: 'Domicilios Almuerzo', value: sumDAlm },
        { name: 'Domicilios Desayuno', value: sumDDes },
        { name: 'Almuerzo Mesa', value: sumMAlm },
        { name: 'Almuerzo llevar', value: sumMLle },
        { name: 'Desayuno Mesa', value: sumMDes },
        { name: 'Desayuno llevar', value: sumDLle },
        { name: 'Gastos', value: sumGastos }
      ];
    }
    // Si estamos en drilldown de día (día seleccionado en el mes), mostrar breakdown real de ese día
    if (range === 'year' && drillMonth != null && drillDayIncome) {
      const d = new Date(drillDayIncome);
      const record = (Array.isArray(ingresosData) ? ingresosData : []).find(r => {
        if (!r?.date) return false;
        const rDate = new Date(r.date);
        return rDate.getFullYear() === d.getFullYear() && rDate.getMonth() === d.getMonth() && rDate.getDate() === d.getDate();
      });
      const c = record?.categories || {};
      return [
        { name: 'Domicilios Almuerzo', value: Number(c.domiciliosAlmuerzo)||0 },
        { name: 'Domicilios Desayuno', value: Number(c.domiciliosDesayuno)||0 },
        { name: 'Almuerzo Mesa', value: Number(c.mesasAlmuerzo)||0 },
        { name: 'Almuerzo llevar', value: Number(c.llevarAlmuerzo)||0 },
        { name: 'Desayuno Mesa', value: Number(c.mesasDesayuno)||0 },
        { name: 'Desayuno llevar', value: Number(c.llevarDesayuno)||0 },
        { name: 'Gastos', value: Number(record?.expenses)||0 }
      ];
    }
    // Drill de día en rangos 'month' o '7d'
    if (drillDayIncome && (range==='month' || range==='7d')) {
      const sourceArr = range==='month' ? (periodStructures?.thisMonth || []) : (periodStructures?.last7Days || []);
      const entry = sourceArr.find(d => d.date === drillDayIncome);
      const c = entry?.categories || {};
      const gastos = Number(entry?.gastos)||0;
      return [
        { name: 'Domicilios Almuerzo', value: Number(c.domiciliosAlmuerzo)||0 },
        { name: 'Domicilios Desayuno', value: Number(c.domiciliosDesayuno)||0 },
        { name: 'Almuerzo Mesa', value: Number(c.mesasAlmuerzo)||0 },
        { name: 'Almuerzo llevar', value: Number(c.llevarAlmuerzo)||0 },
        { name: 'Desayuno Mesa', value: Number(c.mesasDesayuno)||0 },
        { name: 'Desayuno llevar', value: Number(c.llevarDesayuno)||0 },
        { name: 'Gastos', value: gastos }
      ];
    }
    // 6 categorías + Gastos como séptima barra
    return [
      ...incomeCategoriesData,
      { name: 'Gastos', value: Number(totalExpensesToday)||0 }
    ];
  }, [incomeCategoriesData, totalExpensesToday, ingresosData, range, drillMonth, drillDayIncome, selectedDate, periodStructures]);

  // Breakdown de gastos por proveedor para día seleccionado
  const expensesDayBreakdown = useMemo(()=>{
    if(!expenseDrillDay) return [];
    const source = paymentsAllRaw && paymentsAllRaw.length>0 ? paymentsAllRaw : paymentsRaw;
  const filtered = source.filter(p=>{ const d=getPaymentDate(p); if(!d) return false; const isoBog= ymdInBogota(d); const isoUTC = d.toISOString().split('T')[0]; return isoBog===expenseDrillDay || isoUTC===expenseDrillDay; });
    const byProv={};
    const counts={};
    const originalMap={};
    filtered.forEach(p=>{ const prov = (p.provider || p.store || p.recipient || '—'); const parsed=parseAmountSafe(p.amount); byProv[prov]=(byProv[prov]||0)+parsed; counts[prov]=(counts[prov]||0)+1; originalMap[prov]=(originalMap[prov]||0)+parsed; });
    let result = Object.entries(byProv).map(([name,value])=>({name, value, original: originalMap[name], movimientos: counts[name]})).sort((a,b)=>b.value-a.value);
    const rawSumPrimary = result.reduce((s,r)=>s+r.value,0);
    // Fallback si todos quedaron 0 pero sí hay pagos
    if(rawSumPrimary===0 && filtered.length>0){
      const altByProv={}; const altCounts={}; const altOriginal={};
      filtered.forEach(p=>{ const prov=(p.provider||p.store||p.recipient||'—'); const amt=extractAnyAmount(p); altByProv[prov]=(altByProv[prov]||0)+amt; altCounts[prov]=(altCounts[prov]||0)+1; altOriginal[prov]=(altOriginal[prov]||0)+amt; });
      const altRes = Object.entries(altByProv).map(([name,value])=>({name,value, original: altOriginal[name], movimientos: altCounts[name]})).sort((a,b)=>b.value-a.value);
      const altSum = altRes.reduce((s,r)=>s+r.value,0);
      if(altSum>0){
        result = altRes.map(r=>({...r, _fallback:true}));
      }
    }
    // Tercer fallback: usar mapa de providers ya calculado (expensesProvidersByDay) por si arriba no funcionó
    if(result.every(r=>r.value===0) && expensesProvidersByDay && expensesProvidersByDay[expenseDrillDay]){
      const provEntry = expensesProvidersByDay[expenseDrillDay];
      const fromMap = Object.entries(provEntry.providers).map(([name,value])=>({name, value, original:value, movimientos: counts[name]||0, _fromProviders:true})).sort((a,b)=>b.value-a.value);
      if(fromMap.some(r=>r.value>0)) result = fromMap;
    }
    // Sanitizar NaN
    result = result.map(r=>({...r, value: Number.isFinite(r.value)? r.value:0, original: Number.isFinite(r.original)? r.original:0 }));
  // Debug (descomentar si se requiere)
    if(process.env.NODE_ENV!=='production'){
    const rawSum = filtered.reduce((s,p)=> s + parseAmountSafe(p.amount), 0);
    const resSum = result.reduce((s,r)=> s + r.value, 0);
    if(rawSum>0 && resSum===0){
      console.warn('[WARN breakdown sum 0 pero raw >0]', {expenseDrillDay, rawSum, resSum, sample: filtered.slice(0,5)});
    }
    console.log('[DBG expensesDayBreakdown]', {expenseDrillDay, rawSum, resSum, filtered: filtered.map(p=>({id:p.id, prov:p.provider||p.store, amount:p.amount, parsed:getPaymentDate(p)})), result});
    }
  return result;
  }, [expenseDrillDay, paymentsAllRaw, paymentsRaw]);

  // Lista completa de pagos del día seleccionado (para detalle por remitente)
  const expensesDayPayments = useMemo(()=>{
    if(!expenseDrillDay) return [];
    const source = paymentsAllRaw && paymentsAllRaw.length>0 ? paymentsAllRaw : paymentsRaw;
    return source.filter(p=>{ const d=getPaymentDate(p); if(!d) return false; const isoBog= ymdInBogota(d); const isoUTC=d.toISOString().split('T')[0]; return isoBog===expenseDrillDay || isoUTC===expenseDrillDay; })
      .sort((a,b)=> { const da=getPaymentDate(a); const db=getPaymentDate(b); return (db?db.getTime():0)-(da?da.getTime():0); });
  }, [expenseDrillDay, paymentsAllRaw, paymentsRaw]);

  const expensesDaySelectedProviderPayments = useMemo(()=>{
    if(!expenseDayProviderSelected) return [];
    return expensesDayPayments.filter(p=> (p.provider||p.store||p.recipient||'—')===expenseDayProviderSelected);
  }, [expensesDayPayments, expenseDayProviderSelected]);

  // En modo colapsado se muestra el NETO (Ingresos - Gastos)
  // Rango de ingresos / drilldowns
  const incomeChartData = useMemo(() => {
    // 1. Helper sumar ingresos brutos de un registro
    const sumRecord = (rec)=>{
      const c = rec?.categories||{};
      return (
        Number(c.domiciliosAlmuerzo||0)+
        Number(c.domiciliosDesayuno||0)+
        Number(c.mesasAlmuerzo||0)+
        Number(c.mesasDesayuno||0)
      );
    };
    const records = Array.isArray(ingresosData)? ingresosData : [];

    // 2. Mapa fecha -> total (deduplicado y agregado)
    const dateMap = {};
    records.forEach(r=>{
      if(!r?.date) return;
      const d = new Date(r.date);
      if(isNaN(d)) return;
      d.setHours(0,0,0,0);
      const iso = d.toISOString().split('T')[0];
      dateMap[iso] = (dateMap[iso]||0) + sumRecord(r);
    });

  // 3. Breakdown se procesa dentro de cada rango más abajo para mantener consistencia al cambiar de rango.

    // 4. Hoy (usar siempre adjustedGross para asegurar barra visible inmediatamente)
    if(range==='today'){
      if(showIncomeBreakdown){
        return breakdownData.map(d=>({...d}));
      }
      return [{ name: selectedDate || 'Hoy', value: Number(adjustedGross)||0 }];
    }

    // Año
    if(range==='year'){
      const base = selectedDate ? new Date(selectedDate) : new Date();
      const targetYear = base.getFullYear();
      if(!drillMonth){
        const monthAbbr = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const months = monthAbbr.map((abbr, idx)=>{
          // sumar todos los días del mes idx del año targetYear
          let total = 0;
          for(const iso in dateMap){
            if(iso.startsWith(targetYear+'-')){
              const d = new Date(iso);
              if(d.getMonth()===idx) total += dateMap[iso];
            }
          }
            return { name: abbr, monthIndex: idx, value: total };
        });
        return months; // incluye ceros explícitamente
      }
      // Drill: días del mes seleccionado (relleno con ceros)
      if(drillMonth!=null && !drillDayIncome){
        const days = [];
        const daysInMonth = new Date(targetYear, drillMonth+1, 0).getDate();
        for(let day=1; day<=daysInMonth; day++){
          const iso = `${targetYear}-${String(drillMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          days.push({ name: iso, value: dateMap[iso]||0, day: iso });
        }
        return days;
      }
      // Drill: día específico dentro de año->mes mostrando breakdown de categorías
      if(drillMonth!=null && drillDayIncome && showIncomeBreakdown){
        return breakdownData.map(d=>({...d}));
      }
    }

    // Mes actual (o del selectedDate)
    if(range==='month' && periodStructures){
      const monthArr = periodStructures.thisMonth || [];
      if(!drillDayIncome && !showIncomeBreakdown){
  return monthArr.map(d=> ({ name: d.date, value: d.totalIncome, day: d.date }));
      }
      if(drillDayIncome && showIncomeBreakdown){
        return breakdownData.map(d=>({...d}));
      }
    }

    // Últimos 7 días (basado en selectedDate o hoy)
    if(range==='7d' && periodStructures){
      const arr = periodStructures.last7Days || [];
      if(drillDayIncome && showIncomeBreakdown){
        return breakdownData.map(d=>({...d}));
      }
  return arr.map(d=> ({ name: d.date, value: d.totalIncome, day: d.date }));
    }

    // Fallback
    return [{ name:'Total', value: netToday }];
  }, [showIncomeBreakdown, drillDayIncome, breakdownData, netToday, adjustedGross, range, drillMonth, ingresosData, selectedDate, periodStructures]);

  // Validar y sanear datos de ingresos para evitar NaN
  const safeIncomeChartData = useMemo(() => {
    if (!Array.isArray(incomeChartData)) return [];
    return incomeChartData.map(item => ({
      ...item,
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0
    }));
  }, [incomeChartData]);

  // Altura dinámica para evitar barras apretadas cuando listamos muchos días / meses
  const incomeChartDynamicHeight = useMemo(()=>{
    const rows = safeIncomeChartData.length;
    const isYearRoot = range==='year' && !drillMonth && !showIncomeBreakdown;
    const isDaysList = (
      (range==='year' && drillMonth && !drillDayIncome && !showIncomeBreakdown) ||
      (range==='month' && !drillDayIncome && !showIncomeBreakdown)
    );
    const is7d = range==='7d' && !drillDayIncome && !showIncomeBreakdown;
    const isToday = range==='today' && !drillDayIncome && !showIncomeBreakdown;
    const isCategoryBreakdown = showIncomeBreakdown;
    if(isYearRoot){
      // ya se maneja más abajo con lógica específica (12 filas)
      return rows * (isMobileDevice?50:38);
    }
    if(isDaysList){
      // Cada día una fila con altura base
      const perRow = isMobileDevice?40:30;
      return Math.min(rows * perRow + 40, 1400);
    }
    if(is7d){
      // Altura proporcional a la cantidad de días (máximo 7)
      const perRow = isMobileDevice?50:38;
      return Math.max(rows * perRow + 40, 220);
    }
    if(isToday){
      // Altura máxima para un solo día, ocupando casi toda la tarjeta sin salirse
      return isMobileDevice ? 340 : 300;
    }
    if(isCategoryBreakdown){
      // Siempre mostrar todas las categorías en una sola columna horizontal
      const perRow = isMobileDevice?50:38;
      return rows * perRow + 40;
    }
    return null;
  }, [safeIncomeChartData, range, drillMonth, drillDayIncome, showIncomeBreakdown, isMobileDevice]);

  // Etiqueta legible del rango seleccionado (compartida por los tres gráficos mientras usemos un único estado 'range')
  const currentRangeLabel = useMemo(()=>{
    switch(range){
      case 'today': return selectedDate || 'Hoy';
      case '7d': return 'Últimos 7 días';
      case 'month': return 'Este mes';
      case 'year': return 'Este año';
      default: return '';
    }
  },[range, selectedDate]);

  // (totalExpensesToday ya calculado arriba)
  const expensesBreakdownDataTop = useMemo(() => {
    const map = expensesByProvider?.byProvider || {};
    return Object.entries(map)
      .map(([name,value])=>({ name, value: Number(value)||0 }))
      .filter(e=>e.value>0)
      .sort((a,b)=>b.value-a.value);
  }, [expensesByProvider]);
  const expensesChartDataTop = useMemo(() => {
    if (showExpensesBreakdownTop) return expensesBreakdownDataTop;
    const label = range==='today' ? (selectedDate || 'Hoy') : (range==='7d' ? 'Últimos 7 días' : (range==='month' ? 'Este mes' : 'Este año'));
    return [{ name: label, value: totalExpensesToday }];
  }, [showExpensesBreakdownTop, expensesBreakdownDataTop, totalExpensesToday, range, selectedDate]);

  // Adaptación pedidos para selectedDate
  const dailyOrdersChartDataAdapted = useMemo(()=>{
    if(range!=='today') return dailyOrdersChartData;
    if(!selectedDate) return dailyOrdersChartData;
    const match = dailyOrdersChartData.find(d=>d.name===selectedDate);
    if(match) return [match];
    return [{ name: selectedDate, Domicilios: 0, Mesas: 0 }];
  },[dailyOrdersChartData, range, selectedDate]);

  // Drill reset para pedidos cuando cambia el rango
  useEffect(()=>{ setDrillMonthOrders(null); setDrillDayOrders(null); }, [range]);

  // Construcción avanzada de datos para gráfico de Pedidos según especificación
  const ordersChartData = useMemo(()=>{
    const monthAbbr = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const records = Array.isArray(ingresosData)? ingresosData : [];
    const todayBase = selectedDate ? new Date(selectedDate) : new Date();
    const targetYear = todayBase.getFullYear();

    const extractCounts = (rec)=>{
      const c = rec.categories||{};
      const desDom = Number(c.domiciliosDesayuno)||0;
      const desMesa = Number(c.mesasDesayuno)||0;
      const desLle = Number(c.llevarDesayuno)||0;
      const almDom = Number(c.domiciliosAlmuerzo)||0;
      const almMesa = Number(c.mesasAlmuerzo)||0;
      const almLle = Number(c.llevarAlmuerzo)||0;
      const desTotal = desDom+desMesa+desLle;
      const almTotal = almDom+almMesa+almLle;
      const total = desTotal+almTotal;
      return {desDom,desMesa,desLle,almDom,almMesa,almLle,desTotal,almTotal,total};
    };

    if(range==='year'){
      if(drillMonthOrders!=null){
        // Mostrar días del mes seleccionado
        const monthIndex = drillMonthOrders;
        const perDay = {};
        records.forEach(r=>{
          if(!r.date) return; const d=new Date(r.date); if(d.getFullYear()!==targetYear|| d.getMonth()!==monthIndex) return;
          const ymd = d.toISOString().split('T')[0];
          const counts = extractCounts(r);
            if(!perDay[ymd]) perDay[ymd] = {...counts}; else {
              Object.keys(counts).forEach(k=> perDay[ymd][k]+=counts[k]);
            }
        });
        return Object.entries(perDay)
          .sort((a,b)=> a[0]<b[0]? -1:1)
          .map(([day,vals])=>({ name: day, ...vals }));
      }
      // 12 meses
      const perMonth = Array.from({length:12}, (_,i)=>({month:i, desDom:0,desMesa:0,desLle:0,almDom:0,almMesa:0,almLle:0,desTotal:0,almTotal:0,total:0}));
      records.forEach(r=>{ if(!r.date)return; const d=new Date(r.date); if(d.getFullYear()!==targetYear) return; const m=d.getMonth(); const c=extractCounts(r); Object.keys(c).forEach(k=> perMonth[m][k]+=c[k]); });
      perMonth.forEach(pm=>{ pm.desTotal = pm.desDom+pm.desMesa+pm.desLle; pm.almTotal = pm.almDom+pm.almMesa+pm.almLle; pm.total = pm.desTotal+pm.almTotal; });
      return perMonth.map(pm=>({ name: monthAbbr[pm.month], monthIndex: pm.month, ...pm }));
    }
    if(range==='month'){
      // Mostrar todos los días del mes actual (selectedDate o hoy)
      const monthIndex = todayBase.getMonth();
      const perDay = {};
      records.forEach(r=>{ if(!r.date)return; const d=new Date(r.date); if(d.getFullYear()!==targetYear|| d.getMonth()!==monthIndex) return; const ymd=d.toISOString().split('T')[0]; const c=extractCounts(r); if(!perDay[ymd]) perDay[ymd]={...c}; else Object.keys(c).forEach(k=> perDay[ymd][k]+=c[k]); });
      return Object.entries(perDay).sort((a,b)=> a[0]<b[0]? -1:1).map(([day,vals])=>({ name: day, ...vals }));
    }
    if(range==='7d' || range==='today'){
      // Mapear datos existentes por fecha
  const map = {};
  dailyOrdersChartDataAdapted.forEach(d=>{ map[d.name]=d; });
      // Construir lista de días (hoy hacia atrás 6) manteniendo orden cronológico
      const days=[]; for(let i=6;i>=0;i--){ const dt=new Date(); dt.setDate(dt.getDate()-i); const iso= ymdInBogota(dt); days.push(iso); }
      const filled = days.map(day=>{
        const d = map[day] || { name: day };
        const dd = d.domiciliosDesayuno||0, md = d.mesasDesayuno||0, ld = d.llevarDesayuno||0, da = d.domiciliosAlmuerzo||0, ma = d.mesasAlmuerzo||0, la = d.llevarAlmuerzo||0;
        return {
          name: day,
          desDom: dd,
          desMesa: md,
          desLle: ld,
          almDom: da,
          almMesa: ma,
          almLle: la,
          desTotal: dd+md+ld,
          almTotal: da+ma+la,
          total: dd+md+ld+da+ma+la
        };
      });
      // En modo 'today' si solo se requiere el día específico mantener compatibilidad (mostrar un solo día)
      if(range==='today') return filled.slice(-1);
      return filled;
    }
    return [];
  }, [range, drillMonthOrders, ingresosData, dailyOrdersChartDataAdapted, selectedDate]);

  // Tooltip personalizado de pedidos
  const OrdersTooltip = ({active, payload}) => {
    if(!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const lineCls = 'flex justify-between text-[11px]';
    return (
      <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'? 'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'? '#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:230}}>
        <p className="font-semibold mb-2">📅 {d.name}</p>
        <div className="space-y-1">
          <p className="font-semibold text-[12px]">🍳 Desayuno <span className="float-right">{d.desTotal}</span></p>
          <p className={lineCls}>🛵 Domicilio:<span className="font-semibold">{d.desDom}</span></p>
          <p className={lineCls}>🪑 Mesa:<span className="font-semibold">{d.desMesa}</span></p>
            <p className={lineCls}>📦 Llevar:<span className="font-semibold">{d.desLle}</span></p>
          <hr className="border-t my-1" style={{borderColor: theme==='dark'? '#374151':'#e5e7eb'}} />
          <p className="font-semibold text-[12px]">🍽️ Almuerzo <span className="float-right">{d.almTotal}</span></p>
          <p className={lineCls}>🛵 Domicilio:<span className="font-semibold">{d.almDom}</span></p>
          <p className={lineCls}>🪑 Mesa:<span className="font-semibold">{d.almMesa}</span></p>
          <p className={lineCls}>📦 Llevar:<span className="font-semibold">{d.almLle}</span></p>
          <p className="mt-2 font-bold flex justify-between text-[12px]">📊 Total pedidos <span>{d.total}</span></p>
        </div>
      </div>
    );
  };
  const expenseColor = '#EF4444';
  const expenseColorFor = (n,idx)=> showExpensesBreakdownTop ? BAR_COLORS[idx % BAR_COLORS.length] : expenseColor;
  // netToday ya calculado arriba

  const ExpensesTooltip = ({ active, payload }) => {
    if(!active) return null;
    const single = !showExpensesBreakdownTop && payload && payload.length===1;
    if(single){
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Gastos</p>
          <p className="text-lg font-bold mb-2">{copFormatter.format(totalExpensesToday)}</p>
          <ul className="space-y-1 mb-2">
            {expensesBreakdownDataTop.map(e => (
              <li key={e.name} className="flex justify-between gap-2">
                <span className="truncate">{e.name}</span>
                <span className="font-semibold">{copFormatter.format(e.value)}</span>
              </li>
            ))}
            {expensesBreakdownDataTop.length===0 && <li className="italic opacity-70">Sin gastos</li>}
          </ul>
          <p className="mt-1 italic opacity-70">Click para ver barras</p>
        </div>
      );
    }
    return <CustomBarTooltip active={active} payload={payload} theme={theme} chartTextColor={chartTextColor} copFormatter={copFormatter.format} />;
  };

  // Tooltip personalizado para el gráfico de ingresos (muestra desglose siempre cuando es barra única)
  const IncomeTooltip = ({ active, payload, label }) => {
    if (!active) return null;
    const single = !showIncomeBreakdown && payload && payload.length === 1;
    const formatCOP = (v) => copFormatter.format(v || 0);
    // Si estamos en año y no hay breakdown, mostrar desglose mensual real
    if (single && range === 'year' && !drillMonth) {
      // ...código existente para año...
      // (sin cambios aquí)
      const monthAbbr = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const idx = monthAbbr.findIndex(m => m === label);
      const base = selectedDate ? new Date(selectedDate) : new Date();
      const targetYear = base.getFullYear();
      const targetMonth = idx;
      const records = (Array.isArray(ingresosData) ? ingresosData : []).filter(r => {
        if (!r?.date) return false;
        const d = new Date(r.date);
        return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
      });
      let sumDAlm = 0, sumDDes = 0, sumMAlm = 0, sumMLle = 0, sumMDes = 0, sumDLle = 0, sumGastos = 0;
      records.forEach(r => {
        const c = r.categories || {};
        sumDAlm += Number(c.domiciliosAlmuerzo)||0;
        sumDDes += Number(c.domiciliosDesayuno)||0;
        sumMAlm += Number(c.mesasAlmuerzo)||0;
        sumMLle += Number(c.llevarAlmuerzo)||0;
        sumMDes += Number(c.mesasDesayuno)||0;
        sumDLle += Number(c.llevarDesayuno)||0;
        sumGastos += Number(r.expenses)||0;
      });
      const neto = sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle - sumGastos;
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Total ingresos</p>
          <p className="text-lg font-bold mb-2">{formatCOP(sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle)}</p>
          <ul className="space-y-1 mb-2">
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Almuerzo')}}>Domicilios Almuerzo</span><span className="font-semibold">{formatCOP(sumDAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Desayuno')}}>Domicilios Desayuno</span><span className="font-semibold">{formatCOP(sumDDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo Mesa')}}>Almuerzo Mesa</span><span className="font-semibold">{formatCOP(sumMAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo llevar')}}>Almuerzo llevar</span><span className="font-semibold">{formatCOP(sumMLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno Mesa')}}>Desayuno Mesa</span><span className="font-semibold">{formatCOP(sumMDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno llevar')}}>Desayuno llevar</span><span className="font-semibold">{formatCOP(sumDLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Gastos')}}>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></li>
          </ul>
          <div className="pt-2 mt-1 border-t space-y-1" style={{borderColor: theme==='dark'?'#374151':'#e5e7eb'}}>
            <p className="flex justify-between text-xs"><span>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></p>
            <p className="flex justify-between text-sm font-bold"><span>Neto</span><span>{formatCOP(neto)}</span></p>
          </div>
          <p className="mt-1 italic opacity-70">Click para ver barras</p>
        </div>
      );
    }

    // Si estamos en drilldown de mes (viendo los días) y no breakdown, mostrar desglose diario real
    if (single && range === 'year' && drillMonth != null && !showIncomeBreakdown) {
      // label es el día (YYYY-MM-DD)
      const day = label;
      const d = new Date(day);
      const record = (Array.isArray(ingresosData) ? ingresosData : []).find(r => {
        if (!r?.date) return false;
        const rDate = new Date(r.date);
        return rDate.getFullYear() === d.getFullYear() && rDate.getMonth() === d.getMonth() && rDate.getDate() === d.getDate();
      });
      const c = record?.categories || {};
      const sumDAlm = Number(c.domiciliosAlmuerzo)||0;
      const sumDDes = Number(c.domiciliosDesayuno)||0;
      const sumMAlm = Number(c.mesasAlmuerzo)||0;
      const sumMLle = Number(c.llevarAlmuerzo)||0;
      const sumMDes = Number(c.mesasDesayuno)||0;
      const sumDLle = Number(c.llevarDesayuno)||0;
      const sumGastos = Number(record?.expenses)||0;
      const neto = sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle - sumGastos;
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Total ingresos</p>
          <p className="text-lg font-bold mb-2">{formatCOP(sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle)}</p>
          <ul className="space-y-1 mb-2">
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Almuerzo')}}>Domicilios Almuerzo</span><span className="font-semibold">{formatCOP(sumDAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Desayuno')}}>Domicilios Desayuno</span><span className="font-semibold">{formatCOP(sumDDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo Mesa')}}>Almuerzo Mesa</span><span className="font-semibold">{formatCOP(sumMAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo llevar')}}>Almuerzo llevar</span><span className="font-semibold">{formatCOP(sumMLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno Mesa')}}>Desayuno Mesa</span><span className="font-semibold">{formatCOP(sumMDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno llevar')}}>Desayuno llevar</span><span className="font-semibold">{formatCOP(sumDLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Gastos')}}>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></li>
          </ul>
          <div className="pt-2 mt-1 border-t space-y-1" style={{borderColor: theme==='dark'?'#374151':'#e5e7eb'}}>
            <p className="flex justify-between text-xs"><span>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></p>
            <p className="flex justify-between text-sm font-bold"><span>Neto</span><span>{formatCOP(neto)}</span></p>
          </div>
          <p className="mt-1 italic opacity-70">Click para ver barras</p>
        </div>
      );
    }
    // Vista 'month': mostrar desglose específico del día (usando periodStructures.thisMonth)
    if (single && range === 'month' && !showIncomeBreakdown) {
      const day = label; // YYYY-MM-DD
      const dayEntry = periodStructures?.thisMonth?.find(d => d.date === day);
      const c = dayEntry?.categories || {};
      const sumDAlm = Number(c.domiciliosAlmuerzo)||0;
      const sumDDes = Number(c.domiciliosDesayuno)||0;
      const sumMAlm = Number(c.mesasAlmuerzo)||0;
      const sumMLle = Number(c.llevarAlmuerzo)||0;
      const sumMDes = Number(c.mesasDesayuno)||0;
      const sumDLle = Number(c.llevarDesayuno)||0;
      const sumGastos = Number(dayEntry?.gastos)||0;
      const bruto = sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle;
      const neto = bruto - sumGastos;
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Total ingresos</p>
          <p className="text-lg font-bold mb-2">{formatCOP(bruto)}</p>
          <ul className="space-y-1 mb-2">
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Almuerzo')}}>Domicilios Almuerzo</span><span className="font-semibold">{formatCOP(sumDAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Desayuno')}}>Domicilios Desayuno</span><span className="font-semibold">{formatCOP(sumDDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo Mesa')}}>Almuerzo Mesa</span><span className="font-semibold">{formatCOP(sumMAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo llevar')}}>Almuerzo llevar</span><span className="font-semibold">{formatCOP(sumMLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno Mesa')}}>Desayuno Mesa</span><span className="font-semibold">{formatCOP(sumMDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno llevar')}}>Desayuno llevar</span><span className="font-semibold">{formatCOP(sumDLle)}</span></li>
            {sumGastos>0 && <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Gastos')}}>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></li>}
          </ul>
          <div className="pt-2 mt-1 border-t space-y-1" style={{borderColor: theme==='dark'?'#374151':'#e5e7eb'}}>
            {sumGastos>0 && <p className="flex justify-between text-xs"><span>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></p>}
            <p className="flex justify-between text-sm font-bold"><span>Neto</span><span>{formatCOP(neto)}</span></p>
          </div>
        </div>
      );
    }
    // Vista '7d': desglose del día específico
    if (single && range === '7d' && !showIncomeBreakdown) {
      const day = label;
      const dayEntry = periodStructures?.last7Days?.find(d => d.date === day);
      const c = dayEntry?.categories || {};
      const sumDAlm = Number(c.domiciliosAlmuerzo)||0;
      const sumDDes = Number(c.domiciliosDesayuno)||0;
      const sumMAlm = Number(c.mesasAlmuerzo)||0;
      const sumMLle = Number(c.llevarAlmuerzo)||0;
      const sumMDes = Number(c.mesasDesayuno)||0;
      const sumDLle = Number(c.llevarDesayuno)||0;
      const sumGastos = Number(dayEntry?.gastos)||0;
      const bruto = sumDAlm + sumDDes + sumMAlm + sumMLle + sumMDes + sumDLle;
      const neto = bruto - sumGastos;
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Total ingresos</p>
          <p className="text-lg font-bold mb-2">{formatCOP(bruto)}</p>
          <ul className="space-y-1 mb-2">
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Almuerzo')}}>Domicilios Almuerzo</span><span className="font-semibold">{formatCOP(sumDAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Domicilios Desayuno')}}>Domicilios Desayuno</span><span className="font-semibold">{formatCOP(sumDDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo Mesa')}}>Almuerzo Mesa</span><span className="font-semibold">{formatCOP(sumMAlm)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Almuerzo llevar')}}>Almuerzo llevar</span><span className="font-semibold">{formatCOP(sumMLle)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno Mesa')}}>Desayuno Mesa</span><span className="font-semibold">{formatCOP(sumMDes)}</span></li>
            <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Desayuno llevar')}}>Desayuno llevar</span><span className="font-semibold">{formatCOP(sumDLle)}</span></li>
            {sumGastos>0 && <li className="flex justify-between gap-2"><span className="truncate" style={{color: categoryColor('Gastos')}}>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></li>}
          </ul>
          <div className="pt-2 mt-1 border-t space-y-1" style={{borderColor: theme==='dark'?'#374151':'#e5e7eb'}}>
            {sumGastos>0 && <p className="flex justify-between text-xs"><span>Gastos</span><span className="font-semibold">{formatCOP(sumGastos)}</span></p>}
            <p className="flex justify-between text-sm font-bold"><span>Neto</span><span>{formatCOP(neto)}</span></p>
          </div>
        </div>
      );
    }
    // Comportamiento normal para otros casos
    if (single) {
      const gross = Number(adjustedGross)||0; // usar bruto ajustado (histórico o actual)
      return (
        <div className="p-3 rounded-xl shadow-lg border text-xs" style={{backgroundColor: theme==='dark'?'rgba(31,41,55,0.95)':'rgba(255,255,255,0.95)', borderColor: theme==='dark'?'#4b5563':'#e5e7eb', color: chartTextColor, maxWidth:240}}>
          <p className="text-sm font-semibold mb-1">Total ingresos</p>
          <p className="text-lg font-bold mb-2">{formatCOP(gross)}</p>
          <ul className="space-y-1 mb-2">
            {incomeCategoriesData.map(b => (
              <li key={b.name} className="flex justify-between gap-2">
                <span className="truncate" style={{color: categoryColor(b.name)}}>{b.name}</span>
                <span className="font-semibold">{formatCOP(b.value)}</span>
              </li>
            ))}
            {totalExpensesToday > 0 && (
              <li className="flex justify-between gap-2">
                <span className="truncate" style={{color: categoryColor('Gastos')}}>Gastos</span>
                <span className="font-semibold">{formatCOP(totalExpensesToday)}</span>
              </li>
            )}
          </ul>
          <div className="pt-2 mt-1 border-t space-y-1" style={{borderColor: theme==='dark'?'#374151':'#e5e7eb'}}>
            {totalExpensesToday>0 && <p className="flex justify-between text-xs"><span>Gastos</span><span className="font-semibold">{formatCOP(totalExpensesToday)}</span></p>}
            <p className="flex justify-between text-sm font-bold"><span>Neto</span><span>{formatCOP(netToday)}</span></p>
          </div>
          <p className="mt-1 italic opacity-70">Click para ver barras</p>
        </div>
      );
    }
    return <CustomBarTooltip active={active} payload={payload} label={label} theme={theme} chartTextColor={chartTextColor} copFormatter={copFormatter.format} />;
  };

  return (
  <div className="flex flex-col gap-12 mb-8 px-4 sm:px-6 lg:px-8 pb-12 max-w-[1400px] mx-auto w-full">
      <style dangerouslySetInnerHTML={{ __html: scrollbarStyles }} />
      {/* Daily Sales Chart */}
      <div className={classNames(
          theme === 'dark' ? 'bg-gray-800' : 'bg-white',
          isMobileDevice ? 'p-4' : 'p-6',
          'rounded-2xl shadow-xl border',
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
          'relative min-h-[450px] flex flex-col'
        )}>
  <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold mb-4 text-gray-200 dark:text-gray-100 flex items-center gap-3">
            <span className="flex items-center"><DollarSign className={classNames(isMobileDevice ? "w-4 h-4 mr-2" : "w-5 h-5 mr-2", "text-green-400")} />Ingresos Diarios</span>
            <span className="text-xs font-normal text-gray-400">Neto: {copFormatter.format(netToday || 0)}</span>
          </h3>
          <div className="flex items-center">
            <span className="mr-2 px-2 py-1 rounded-md text-[11px] font-medium tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 select-none">{currentRangeLabel}</span>
            <Popover className="relative">
              {({ open }) => (
                <>
                  <PopoverButton className={classNames('p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500', open ? 'bg-gray-700 text-emerald-400' : 'bg-gray-700/60 hover:bg-gray-600 text-gray-300')}>
                    <MoreVertical className="w-5 h-5" />
                  </PopoverButton>
                  <Transition
                    enter="transition ease-out duration-150"
                    enterFrom="opacity-0 translate-y-1"
                    enterTo="opacity-100 translate-y-0"
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100 translate-y-0"
                    leaveTo="opacity-0 translate-y-1"
                  >
                    <PopoverPanel className="absolute right-0 z-20 mt-2 w-48 rounded-xl border shadow-lg p-2 backdrop-blur-xl"
                      style={{ background: 'rgba(31,41,55,0.95)', borderColor: '#374151' }}>
            {['today','7d','month','year'].map(opt=>{
                        const label = opt==='today'?'Hoy': opt==='7d'?'Últimos 7 días': opt==='month'?'Este mes':'Este año';
                        const active = range===opt;
                        return (
              <button key={opt} onClick={()=>{ setRange(opt); setDrillMonth(null); setDrillDayIncome(null); setShowIncomeBreakdown(false); }}
                            className={classNames('w-full text-left px-3 py-2 rounded-md text-sm mb-1 last:mb-0', active ? 'bg-emerald-500 text-white' : 'text-gray-300 hover:bg-gray-600/60')}>{label}</button>
                        );
                      })}
                    </PopoverPanel>
                  </Transition>
                </>
              )}
            </Popover>
          </div>
        </div>
        <motion.div
          className={classNames(
            isMobileDevice ? 'overflow-x-auto overflow-y-hidden custom-scrollbar' : 'overflow-x-hidden overflow-y-hidden',
            'relative flex flex-col flex-grow'
          )}
          variants={chartVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {range === 'year' && selectedMonth && (
            <motion.button
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onClick={() => setSelectedMonth(null)}
              className="mb-4 text-blue-500 hover:underline text-sm self-start transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 inline-block mr-2" />Volver al resumen anual
            </motion.button>
          )}
          {loading ? (
            <SkeletonLoader type="bar" theme={theme} isMobile={isMobileDevice} />
          ) : (
            <div
              className={classNames("w-full", chartMinWidth, (range==='year' && !drillMonth) || incomeChartDynamicHeight ? '' : chartHeight, showIncomeBreakdown && 'pb-8')}
              style={{
                ...( (range==='year' && !drillMonth)
                  ? { height: (isMobileDevice ? 12*50 : 12*38)+'px'}
                  : (incomeChartDynamicHeight ? { height: incomeChartDynamicHeight+40+"px" } : undefined)
                ),
                overflow: 'visible'
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={safeIncomeChartData}
                  margin={{ top: 10, right: 40, left: 0, bottom: 10 }}
                  barCategoryGap={showIncomeBreakdown ? (isMobileDevice ? "25%" : "30%") : "40%"}
                >
                  <CartesianGrid strokeDasharray={isMobileDevice ? "2 2" : "3 3"} stroke={theme === 'dark' ? '#4b5563' : '#e5e7eb'} horizontal={false} />
                  <XAxis type="number" stroke={chartTextColor} tick={{ fill: chartTextColor, fontSize: isMobileDevice ? 9 : 11 }} tickFormatter={(v) => copFormatter.format(v)} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={chartTextColor}
                    tick={{ fill: chartTextColor, fontSize: showIncomeBreakdown ? (isMobileDevice ? 11 : 14) : (isMobileDevice ? 9 : 11) }}
                    interval={0}
                    width={showIncomeBreakdown ? (isMobileDevice ? 120 : 160) : (isMobileDevice ? 55 : 65)}
                    angle={0}
                    textAnchor="end"
                  />
                  <Tooltip cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} content={<IncomeTooltip />} />
                  <Bar
                    dataKey="value"
                    name={showIncomeBreakdown ? 'Ingresos' : 'Total'}
                    radius={[0,4,4,0]}
                    onClick={(data)=>{
                      // data.activePayload no disponible aquí directamente, usamos closure via event handler del Bar: mejor usar onClick en cada Cell
                    }}
                    cursor="pointer"
                    barSize={showIncomeBreakdown ? undefined : 38}
                  >
                    {safeIncomeChartData.map((entry, idx) => {
                      const isYearRoot = range==='year' && !drillMonth && !showIncomeBreakdown;
                      const baseFill = showIncomeBreakdown ? categoryColor(entry.name) : (netToday>=0 ? '#10B981' : '#EF4444');
                      const fill = isYearRoot && entry.value===0 ? (theme==='dark' ? '#1f2937' : '#e5e7eb') : baseFill;
                      return (
                        <Cell
                          key={`cell-income-${idx}`}
                          fill={fill}
                          stroke={fill}
                          cursor="pointer"
                          onClick={() => {
                            if(range==='year' && !drillMonth){ setDrillMonth(entry.monthIndex); return; }
                            if(range==='year' && drillMonth && !drillDayIncome && entry.day){ setDrillDayIncome(entry.day); setShowIncomeBreakdown(true); return; }
                            if(range==='month' && !drillDayIncome && entry.day){ setDrillDayIncome(entry.day); setShowIncomeBreakdown(true); return; }
                            if(range==='7d' && !drillDayIncome && entry.day){ setDrillDayIncome(entry.day); setShowIncomeBreakdown(true); return; }
                            if(showIncomeBreakdown){ // volver atrás a la lista de días del nivel actual
                              setShowIncomeBreakdown(false);
                              if(drillDayIncome) setDrillDayIncome(null);
                            } else {
                              setShowIncomeBreakdown(true);
                            }
                          }}
                        />
                      );
                    })}
                    {/* LabelList eliminado para no mostrar valores sobre las barras */}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Botón central para regresar en desglose por categorías, debajo del gráfico */}
              {/* Botón Regresar (versión grande) */}
              {showIncomeBreakdown && (
                <div className="flex justify-center items-center my-8 min-h-[60px]">
                  <button
                    onClick={() => { setShowIncomeBreakdown(false); setDrillDayIncome(null); }}
                    className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-6 rounded-lg text-sm shadow transition-all duration-200 flex items-center gap-2"
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' /></svg>
                    Regresar
                  </button>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-400 select-none">
                {/* Mensajes de ayuda eliminados, solo se usa el botón Regresar */}
              </div>
              {/* Botón central para regresar en desglose por categorías */}
              {/* Fin botón Regresar */}
              {/* Botones de texto 'Volver' eliminados, solo queda el botón visual 'Regresar' */}
              {/* Barra de Gastos del Día eliminada, solo debe haber un gráfico de gastos en la sección independiente */}
            </div>
          )}
        </motion.div>
        {showIncomeBreakdown && (
          <div className="flex justify-center items-center py-4">
            <button
              onClick={() => { setShowIncomeBreakdown(false); setDrillDayIncome(null); }}
              className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-5 rounded-lg text-sm shadow transition-all duration-200 flex items-center gap-2"
            >
              <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' /></svg>
              Regresar
            </button>
          </div>
        )}
      </div>


      {/* New 2x2 Grid for Expenses Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Daily Expenses Chart */}
        <div className={classNames(
            theme === 'dark' ? 'bg-gray-800' : 'bg-white',
            isMobileDevice ? 'p-4' : 'p-6',
            'rounded-2xl shadow-xl border',
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
            'relative min-h-[380px] flex flex-col'
          )}>
            <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-200 dark:text-gray-100 flex items-center">
              <DollarSign className={classNames(isMobileDevice ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2', 'text-red-400')} />
              Gastos Diarios
            </h3>
            <div className="flex items-center">
              <span className="mr-2 px-2 py-1 rounded-md text-[11px] font-medium tracking-wide bg-red-500/10 text-red-400 border border-red-500/30 select-none">{currentRangeLabel}</span>
              <Popover className="relative">
                {({ open }) => (
                  <>
                    <PopoverButton className={classNames('p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500', open ? 'bg-gray-700 text-red-400' : 'bg-gray-700/60 hover:bg-gray-600 text-gray-300')}>
                      <MoreVertical className="w-5 h-5" />
                    </PopoverButton>
                    <Transition
                      enter="transition ease-out duration-150"
                      enterFrom="opacity-0 translate-y-1"
                      enterTo="opacity-100 translate-y-0"
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100 translate-y-0"
                      leaveTo="opacity-0 translate-y-1"
                    >
                      <PopoverPanel className="absolute right-0 z-20 mt-2 w-48 rounded-xl border shadow-lg p-2 backdrop-blur-xl" style={{ background: 'rgba(31,41,55,0.95)', borderColor: '#374151' }}>
            {['today','7d','month','year'].map(opt=>{
                          const label = opt==='today'?'Hoy': opt==='7d'?'Últimos 7 días': opt==='month'?'Este mes':'Este año';
                          const active = range===opt;
                          return (
              <button key={opt} onClick={()=>{ setRange(opt); setExpenseDrillMonth(null); setExpenseDrillDay(null); }}
                              className={classNames('w-full text-left px-3 py-2 rounded-md text-sm mb-1 last:mb-0', active ? 'bg-red-500 text-white' : 'text-gray-300 hover:bg-gray-600/60')}>{label}</button>
                          );
                        })}
                      </PopoverPanel>
                    </Transition>
                  </>
                )}
              </Popover>
            </div>
          </div>
          <motion.div
            className={classNames(
              isMobileDevice ? 'overflow-x-auto overflow-y-hidden custom-scrollbar' : 'overflow-x-hidden overflow-y-hidden',
              'relative flex flex-col flex-grow'
            )}
            variants={chartVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {loading ? (
              <SkeletonLoader type="bar" theme={theme} isMobile={isMobileDevice} />
            ) : (
              <div className={classNames("w-full", chartHeight, chartMinWidth, "flex flex-col overflow-visible") }>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ (showExpensesBreakdownTop && expenseDrillDay) ? expensesDayBreakdown.map(b=>({
                      ...b,
                      // mantener value original para cálculos internos y agregar displayValue con fallback
                      displayValue: (b.value && b.value>0)? b.value : (b.original && b.original>0 ? b.original : 0)
                    })) : safeDailyExpensesChartData }
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    barCategoryGap={isMobileDevice ? "0%" : "40%"}
                    barGap={1}
                  >
                    <CartesianGrid
                      strokeDasharray={isMobileDevice ? "2 2" : "3 3"}
                      stroke={theme === 'dark' ? '#4b5563' : '#e5e7eb'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      stroke={chartTextColor}
                      tick={{ fill: chartTextColor, fontSize: isMobileDevice ? 9 : 11 }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis
                      stroke={chartTextColor}
                      tick={{ fill: chartTextColor, fontSize: isMobileDevice ? 9 : 11 }}
                      tickFormatter={(value) => copFormatter.format(value)}
                      width={isMobileDevice ? 50 : 80}
                    />
                    <Tooltip
                      cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', rx: 4 }}
                      content={<ExpensesDayTooltip theme={theme} chartTextColor={chartTextColor} copFormatter={copFormatter} providersByDay={expensesProvidersByDay} providerBreakdown={(showExpensesBreakdownTop && expenseDrillDay)? expensesDayBreakdown: null} expenseDrillDay={expenseDrillDay} />}
                    />
                    {!(showExpensesBreakdownTop && expenseDrillDay) && (
                      <Legend
                        wrapperStyle={{ color: chartTextColor, paddingTop: '15px', fontSize: isMobileDevice ? 10 : 13 }}
                        align="center"
                        verticalAlign="top"
                        iconType="circle"
                      />
                    )}
                    {(showExpensesBreakdownTop && expenseDrillDay) ? (
                      <Bar dataKey="displayValue" name="Gastos" radius={[8,8,0,0]} maxBarSize={isMobileDevice?24:40} animationDuration={600}>
                        {expensesDayBreakdown.map((b,idx)=>(
                          <Cell key={`prov-${idx}`}
                            fill={['#EF4444','#F59E0B','#10B981','#3B82F6','#6366F1','#8B5CF6','#EC4899','#14B8A6'][idx % 8]}
                          />
                        ))}
                      </Bar>
                    ) : (
                      <Bar
                        dataKey="Total"
                        fill="#EF4444"
                        stroke="#EF4444"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={isMobileDevice ? 12 : 25}
                        animationDuration={800}
                        cursor={ (range==='year' || range==='month' || range==='7d' || range==='today') ? 'pointer' : 'default'}
                      >
                        {dailyExpensesChartData.map((e,i)=>{
                          const clickableMonth = range==='year' && e.monthIndex!=null;
                          const clickableDay = (range==='year' && expenseDrillMonth!=null && e.day) || (range==='month' && e.day) || (range==='7d' && e.day) || (range==='today' && e.day);
                          return (
                            <Cell key={`exp-${i}`}
                              cursor={(clickableMonth||clickableDay)?'pointer':'default'}
                              fill={expenseDrillDay===e.day? '#DC2626' : '#EF4444'}
                              onClick={()=>{
                                if(clickableMonth){ setExpenseDrillMonth(e.monthIndex); setExpenseDrillDay(null); return; }
                                if(clickableDay){
                                  // Caso especial rango 'today': primer click abre desglose aunque ya esté seleccionado el día
                                  if(range==='today' && expenseDrillDay===e.day && !showExpensesBreakdownTop){
                                    setShowExpensesBreakdownTop(true); return;
                                  }
                                  if(expenseDrillDay===e.day){ setExpenseDrillDay(null); setShowExpensesBreakdownTop(false); return; }
                                  setExpenseDrillDay(e.day);
                                  // activar desglose proveedores siempre
                                  setShowExpensesBreakdownTop(true);
                                }
                              }}
                            />
                          );
                        })}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {/* Botones de texto de control removidos para simplificar (Cerrar día / Ver totales) */}
                {/* Panel detallado de lista / porcentajes eliminado para dejar solo el gráfico */}
                {expenseDrillDay && (
                  <div className="mt-2 flex justify-center">
                    <button
                      onClick={()=>{ setExpenseDrillDay(null); setShowExpensesBreakdownTop(false); setExpenseDayProviderSelected(null); }}
                      className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-6 rounded-lg text-sm shadow transition-all duration-200 flex items-center gap-1"
                    >
                      <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15 19l-7-7 7-7' /></svg>
                      Regresar
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* Expenses Summary Card */}
        <motion.div
          className={classNames(
            theme === 'dark' ? 'bg-gray-800' : 'bg-white',
            'p-6 rounded-2xl shadow-xl transform transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl',
            theme === 'dark' ? 'border border-gray-700' : 'border border-gray-200'
          )}
          variants={chartVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-2xl font-bold text-gray-100">Gastos</h3>
            <DollarSign className="text-red-400 w-10 h-10 animate-pulse" />
          </div>
          <div className="space-y-4 text-base text-gray-300">
            <div className="flex justify-between items-center text-xl font-semibold">
              <span className="text-gray-200">Total de Gastos:</span>
              <span className="font-extrabold text-red-400">
                {copFormatter.format(totalExpenses)}
              </span>
            </div>
            <div
              className="border-t border-dashed my-4"
              style={{ borderColor: theme === 'dark' ? '#4b5563' : '#d1d5db' }}
            ></div>
            {!selectedRecipient ? (
              <>
                <p className="text-gray-400 text-sm mb-2">Gastos por Remitente:</p>
                <div className="text-sm max-h-52 overflow-y-auto custom-scrollbar pr-2">
                  {aggregatedPaymentsByRecipient.length === 0 ? (
                    <p className="text-gray-500 text-center py-6">
                      Aún no hay gastos registrados. ¡Empieza a añadir algunos! 📝
                    </p>
                  ) : (
                    aggregatedPaymentsByRecipient.map((entry, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedRecipient(entry.store)}
                        className="flex justify-between items-center w-full py-3 border-b last:border-b-0 transition-colors duration-200 hover:bg-gray-700 dark:hover:bg-gray-800 rounded-md px-2 -mx-2 cursor-pointer"
                        style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
                      >
                        <span className="text-gray-300 flex-1 pr-3 truncate text-left font-medium">
                          {entry.store}
                        </span>
                        <div className="flex flex-col items-end">
                          <span className="text-red-300 font-semibold">
                            {copFormatter.format(entry.totalAmount)}
                          </span>
                          <span className="text-gray-500 text-xs mt-1">
                            ({entry.payments.length} movimientos)
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSelectedRecipient(null)}
                  className="flex items-center text-blue-400 hover:underline text-sm mb-4 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Gastos por Remitente
                </button>
                <h4 className="text-lg font-semibold text-gray-200 mb-3">{selectedRecipient}</h4>
                <div className={classNames("text-sm max-h-52 overflow-y-auto custom-scrollbar pr-2", isMobileDevice ? "overflow-x-auto" : "overflow-x-hidden")}>
                    <div className="min-w-full inline-block align-middle">
                        {paymentsForSelectedRecipient.length === 0 ? (
                            <p className="text-gray-500 text-center py-6">
                                No hay movimientos para este remitente en el rango de fechas seleccionado.
                            </p>
                        ) : (
                            paymentsForSelectedRecipient.map((payment, idx) => (
                                <div
                                    key={idx}
                                    className="flex items-center py-3 border-b last:border-b-0 transition-colors duration-200 hover:bg-gray-700 dark:hover:bg-gray-800 rounded-md px-2 -mx-2"
                                    style={{ borderColor: theme === 'dark' ? '#374151' : '#e5e7eb' }}
                                >
                  <span className="text-gray-400 font-normal mr-3 min-w-[120px] truncate">
                    {payment.name || 'N/A'} {payment.units ? `(${payment.units})` : ''}
                  </span>
                  <span className="text-gray-300 font-light text-nowrap mr-3 min-w-[150px]">
                    {payment?.timestamp?.toDate ? payment.timestamp.toDate().toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </span>
                  <span className="text-red-300 font-semibold text-right flex-grow">
                    {copFormatter.format(payment.amount || 0)}
                  </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Existing Daily Orders and Status Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Daily Orders Chart */}
        <div className={classNames(
            theme === 'dark' ? 'bg-gray-800' : 'bg-white',
            isMobileDevice ? 'p-4' : 'p-6',
            'rounded-2xl shadow-xl border',
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
            'relative min-h-[350px] flex flex-col'
          )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-gray-200 dark:text-gray-100 flex items-center">
              <Package className={classNames(isMobileDevice ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-2', 'text-purple-400')} />
              Pedidos Diarios
            </h3>
            <div className="flex items-center">
              <span className="mr-2 px-2 py-1 rounded-md text-[11px] font-medium tracking-wide bg-purple-500/10 text-purple-400 border border-purple-500/30 select-none">{currentRangeLabel}</span>
              <Popover className="relative">
                {({ open }) => (
                  <>
                    <PopoverButton className={classNames('p-2 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500', open ? 'bg-gray-700 text-purple-400' : 'bg-gray-700/60 hover:bg-gray-600 text-gray-300')}>
                      <MoreVertical className="w-5 h-5" />
                    </PopoverButton>
                    <Transition
                      enter="transition ease-out duration-150"
                      enterFrom="opacity-0 translate-y-1"
                      enterTo="opacity-100 translate-y-0"
                      leave="transition ease-in duration-100"
                      leaveFrom="opacity-100 translate-y-0"
                      leaveTo="opacity-0 translate-y-1"
                    >
                      <PopoverPanel className="absolute right-0 z-20 mt-2 w-48 rounded-xl border shadow-lg p-2 backdrop-blur-xl" style={{ background: 'rgba(31,41,55,0.95)', borderColor: '#374151' }}>
                        {['today','7d','month','year'].map(opt=>{
                          const label = opt==='today'?'Hoy': opt==='7d'?'Últimos 7 días': opt==='month'?'Este mes':'Este año';
                          const active = range===opt;
                          return (
                            <button key={opt} onClick={()=>{ setRange(opt); }}
                              className={classNames('w-full text-left px-3 py-2 rounded-md text-sm mb-1 last:mb-0', active ? 'bg-purple-500 text-white' : 'text-gray-300 hover:bg-gray-600/60')}>{label}</button>
                          );
                        })}
                      </PopoverPanel>
                    </Transition>
                  </>
                )}
              </Popover>
            </div>
          </div>
          <motion.div
            className={classNames(
              isMobileDevice ? 'overflow-x-auto overflow-y-hidden custom-scrollbar' : 'overflow-x-hidden overflow-y-hidden',
              'relative flex flex-col flex-grow'
            )}
            variants={chartVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {loading ? (
              <SkeletonLoader type="bar" theme={theme} isMobile={isMobileDevice} />
            ) : (
              <div className={classNames('w-full', chartHeight, chartMinWidth)}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ordersChartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    barCategoryGap={isMobileDevice ? '0%' : '40%'}
                    barGap={1}
                  >
                    <CartesianGrid
                      strokeDasharray={isMobileDevice ? '2 2' : '3 3'}
                      stroke={theme === 'dark' ? '#4b5563' : '#e5e7eb'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      stroke={chartTextColor}
                      tick={{ fill: chartTextColor, fontSize: isMobileDevice ? 9 : 11 }}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      height={60}
                    />
                    <YAxis
                      stroke={chartTextColor}
                      tick={{ fill: chartTextColor, fontSize: isMobileDevice ? 9 : 11 }}
                      width={isMobileDevice ? 30 : 50}
                    />
                    <Tooltip cursor={{ fill: theme==='dark'? 'rgba(255,255,255,0.1)':'rgba(0,0,0,0.05)', rx:4 }} content={<OrdersTooltip />} />
                    <Bar
                      dataKey="total"
                      fill="#8B5CF6"
                      stroke="#8B5CF6"
                      radius={[10,10,0,0]}
                      maxBarSize={isMobileDevice?20:32}
                    >
                      {ordersChartData.map((o,i)=>(
                        <Cell key={`ord-${i}`}
                          cursor={(range==='year' && drillMonthOrders==null && o.monthIndex!=null)?'pointer':'default'}
                          onClick={()=>{
                            if(range==='year' && drillMonthOrders==null && o.monthIndex!=null){ setDrillMonthOrders(o.monthIndex); return; }
                            if(range==='year' && drillMonthOrders!=null){ /* futuro: drill día */ return; }
                          }}
                          fill={(range==='year' && drillMonthOrders!=null && o.monthIndex===drillMonthOrders)? '#7C3AED':'#8B5CF6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </motion.div>
        </div>

        {/* Order Status Pie Chart */}
        <motion.div
          className={classNames(
            theme === 'dark' ? 'bg-gray-800' : 'bg-white',
            isMobileDevice ? 'p-4' : 'p-6',
            'rounded-2xl shadow-xl border',
            theme === 'dark' ? 'border-gray-700' : 'border-gray-200',
            'relative min-h-[350px] flex flex-col justify-center items-center'
          )}
          variants={pieChartVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <h3 className="text-xl font-semibold mb-4 text-gray-200 dark:text-gray-100 flex items-center">
            <TrendingUp className={classNames(isMobileDevice ? "w-4 h-4 mr-2" : "w-5 h-5 mr-2", "text-blue-400")} />
            Estado de Pedidos
          </h3>
          {loading ? (
            <SkeletonLoader type="pie" theme={theme} isMobile={isMobileDevice} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusPieChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={isMobileDevice ? 80 : 120}
                  fill="#8884d8"
                  dataKey="value"
                  animationDuration={800}
                  innerRadius={isMobileDevice ? 40 : 60}
                >
                  {statusPieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke={theme === 'dark' ? '#1f2937' : '#ffffff'} strokeWidth={2} />
                  ))}
                  <Label
                    value={`${totalOrders} Pedidos`}
                    position="center"
                    fill={chartTextColor}
                    fontSize={isMobileDevice ? 14 : 18}
                    fontWeight="bold"
                    dy={isMobileDevice ? 0 : -10}
                  />
                  <Label
                    value="Total"
                    position="center"
                    fill={chartTextColor}
                    fontSize={isMobileDevice ? 10 : 12}
                    dy={isMobileDevice ? 15 : 15}
                  />
                </Pie>
                <Tooltip content={<CustomPieTooltip theme={theme} chartTextColor={chartTextColor} />} />
                <Legend
                  wrapperStyle={{ color: chartTextColor, fontSize: isMobileDevice ? 10 : 13, paddingTop: '15px' }}
                  align="center"
                  verticalAlign="bottom"
                  iconType="circle"
                  layout="horizontal"
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>
    </div>
  );
});

export default DashboardCharts;