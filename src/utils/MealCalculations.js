// src/utils/MealCalculations.js

// --------------------------------------
// Precios (ALMUERZO) según tipo de orden
// --------------------------------------
// Normal:
//   - Mesa:    $12.000
//   - Llevar:  $13.000
// Solo bandeja:
//   - Mesa:    $11.000
//   - Llevar:  $12.000
// Mojarra: $16.000 (fijo, sin importar Mesa/Llevar)
// Adiciones: se suman (respetando quantity)

const PRICE_MAP = {
  table:    { normal: 12000, bandeja: 11000 },
  takeaway: { normal: 13000, bandeja: 12000 },
};

// Normaliza 'orderType' a 'table' | 'takeaway'
// Acepta sinónimos y aplica una heurística:
// - 'delivery' / 'domicilio' => 'takeaway'
// - Si no viene orderType pero hay dirección (pedido de cliente), asumimos 'takeaway'
const normalizeOrderType = (val, meal) => {
  const raw = typeof val === 'string' ? val : (val?.name || val?.value || '');
  const lc = String(raw || '').toLowerCase().trim();

  // Mesa
  if (['table', 'mesa', 'para mesa', 'en mesa'].includes(lc)) return 'table';

  // Llevar / Delivery / Domicilio
  if ([
    'takeaway', 'para llevar', 'llevar', 'take away', 'take-away',
    'delivery', 'deliveri', 'deli', 'domicilio', 'domicilios', 'a domicilio'
  ].includes(lc)) return 'takeaway';

  // Heurística: si hay dirección (pedido de cliente) y no hay mesa, tratar como llevar
  const hasAddress =
    !!(meal?.address) ||
    !!(meal?.address?.street) ||
    !!(meal?.address?.phoneNumber) ||
    !!(meal?.address?.name);
  const hasTable = !!(meal?.tableNumber);

  if (hasAddress && !hasTable) return 'takeaway';

  // Por defecto conservador: mesa
  return 'table';
};

// ¿Seleccionó "Solo bandeja"?
const isSoloBandeja = (meal) => {
  const soup = (meal?.soup?.name || '').toLowerCase().trim();
  const replName = (meal?.soupReplacement?.name || '').toLowerCase().trim();
  const replacement = (meal?.soupReplacement?.replacement || '').toLowerCase().trim();

  if (soup === 'solo bandeja') return true;

  // Aceptar 'Remplazo' y 'Reemplazo'
  const includesReplace = replName.includes('remplazo') || replName.includes('reemplazo');
  if (includesReplace && replacement === 'solo bandeja') return true;

  return false;
};

// Suma adiciones respetando la cantidad
const additionsTotal = (meal) =>
  (Array.isArray(meal?.additions) ? meal.additions : [])
    .reduce((sum, it) => sum + Number(it?.price || 0) * Number(it?.quantity || 1), 0);

// Precio por almuerzo (usa orderType + solo bandeja + mojarra)
export const calculateMealPrice = (meal) => {
  if (!meal) {
    console.log('⚠️ calculateMealPrice: meal es null/undefined');
    return 0;
  }

  // Debug completo del meal
  console.log('🔍 DEBUG calculateMealPrice COMPLETO:', {
    mealId: meal?.id,
    protein: meal?.protein,
    proteinName: meal?.protein?.name,
    fullMeal: JSON.stringify(meal, null, 2)
  });

  // Mojarra tiene precio base fijo - verificación robusta
  const proteinName = meal?.protein?.name || '';
  const proteinNameClean = proteinName.toLowerCase().trim();
  const hasMojarra = proteinNameClean === 'mojarra' || proteinNameClean.includes('mojarra');
  
  if (hasMojarra) {
    const additions = additionsTotal(meal);
    const total = 16000 + additions;
    console.log('✅ Mojarra detectada:', total);
    return total;
  }

  const orderType = normalizeOrderType(meal?.orderType, meal);
  const kind = isSoloBandeja(meal) ? 'bandeja' : 'normal';
  const base = PRICE_MAP[orderType]?.[kind] ?? PRICE_MAP.table.normal;
  const additions = additionsTotal(meal);
  const total = base + additions;

  return total;
};

// Total de todos los almuerzos
export const calculateTotal = (meals, userRole = null) => {
  if (!Array.isArray(meals)) {
    console.error('Error: meals no es un arreglo:', meals);
    return 0;
  }
  
  const result = meals.reduce((sum, meal) => sum + calculateMealPrice(meal), 0);
  console.log('💰 Total calculado:', result);
  
  return result;
};

// Resumen por método de pago (acepta string u objeto {name})
export const paymentSummary = (meals) => {
  if (!Array.isArray(meals) || meals.length === 0) return {};
  return meals.reduce((acc, meal) => {
    const price = calculateMealPrice(meal);
    const pm = meal?.payment ?? meal?.paymentMethod ?? 'No especificado';
    const key = typeof pm === 'string' ? pm : (pm?.name || 'No especificado');
    acc[key] = (acc[key] || 0) + price;
    return acc;
  }, {});
};
