// src/components/Admin/utils.js
export const cleanText = (text) => {
  if (text == null) return '';
  if (typeof text === 'string') return text.replace(' NUEVO', '').trim();
  if (typeof text === 'boolean') return text.toString();
  if (typeof text === 'object' && text?.name) return text.name.replace(' NUEVO', '').trim();
  return String(text).replace(' NUEVO', '').trim();
};

export const getNestedProperty = (obj, path) => {
  if (!obj || !path) return '';
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : ''), obj);
};

export const getAddressDisplay = (address) => {
  if (!address?.address) return 'Sin dirección';
  let display = address.address;
  
  // Incluir instrucciones de entrega entre paréntesis si existen - prioridad alta
  if (address.details && address.details.trim()) {
    display += ` (${cleanText(address.details)})`;
    return display; // Retornar inmediatamente para priorizar instrucciones de entrega
  }
  
  // Añadir información adicional según el tipo de dirección
  switch (address.addressType) {
    case 'school': if (address.recipientName) display += ` (Recibe: ${cleanText(address.recipientName)})`; break;
    case 'complex': if (address.unitDetails) display += ` (${cleanText(address.unitDetails)})`; break;
    case 'shop': if (address.localName) display += ` (${cleanText(address.localName)})`; break;
    default: break;
  }
  
  return display;
};

export const getMealDetailsDisplay = (meal) => {
  const components = [];
  const soupDisplay = meal.soupReplacement?.name || meal.soupReplacement ? `${cleanText(meal.soupReplacement?.name || meal.soupReplacement)} (por sopa)` : meal.soup?.name || meal.soup ? cleanText(meal.soup?.name || meal.soup) : 'Sin sopa';
  components.push(`Sopa: ${soupDisplay}`);
  let principleDisplay;
  if (meal.principleReplacement?.name || meal.principleReplacement) {
    principleDisplay = `${cleanText(meal.principleReplacement?.name || meal.principleReplacement)} (por principio)`;
  } else if (Array.isArray(meal.principle) && meal.principle.length > 0) {
    const principleNames = meal.principle.map(p => cleanText(p.name || p)).filter(Boolean);
    principleDisplay = principleNames.length > 0 ? principleNames.join(', ') : 'Sin principio';
  } else if (meal.principle?.name || meal.principle) {
    principleDisplay = cleanText(meal.principle?.name || meal.principle);
  } else {
    principleDisplay = 'Sin principio';
  }
  components.push(`Principio: ${principleDisplay}`);
  components.push(`Proteína: ${meal.protein?.name || meal.protein ? cleanText(meal.protein?.name || meal.protein) : 'Sin proteína'}`);
  const drinkName = meal.drink?.name || meal.drink || '';
  components.push(`Bebida: ${drinkName === 'Juego de mango' ? 'Jugo de mango' : cleanText(drinkName) || 'Sin bebida'}`);
  components.push(`Cubiertos: ${meal.cutlery?.name === 'Sí' || meal.cutlery === true || meal.cutlery === 'true' ? 'Sí' : 'No'}`);
  const sides = meal.sides?.length > 0 ? meal.sides.map(s => cleanText(s.name || s)).filter(Boolean).join(', ') : 'Ninguno';
  components.push(`Acompañamientos: ${sides}`);
  const additions = meal.additions?.length > 0 ? meal.additions.map(a => `${cleanText(a.name || a)}${a.protein || a.replacement ? ` (${cleanText(a.protein || a.replacement)})` : ''} (${a.quantity || 1})`).join(', ') : 'Ninguna';
  components.push(`Adiciones: ${additions}`);
  components.push(`Notas: ${meal.notes ? cleanText(meal.notes) : 'Ninguna'}`);
  components.push(`Hora de Entrega: ${meal.time?.name || meal.time ? cleanText(meal.time?.name || meal.time) : 'No especificada'}`);
  // Dirección con instrucciones de entrega incluidas si existen
  const addressDisplay = meal.address?.address ? 
    `${meal.address.address}${meal.address?.details && meal.address.details.trim() ? ` (${cleanText(meal.address.details)})` : ''}` : 
    'No especificada';
  
  components.push(`Dirección: ${addressDisplay}`);
  
  // Instrucciones de entrega como campo separado para referencia adicional
  if (meal.address?.details && meal.address.details.trim()) {
    components.push(`Instrucciones de entrega: ${cleanText(meal.address.details)}`);
  }
  
  let addressTypeDisplay = '';
  switch (meal.address?.addressType) {
    case 'house': addressTypeDisplay = 'Casa/Apto'; break;
    case 'school': addressTypeDisplay = 'Colegio/Oficina'; break;
    case 'complex': addressTypeDisplay = 'Conjunto'; break;
    case 'shop': addressTypeDisplay = 'Tienda/Local'; break;
    default: addressTypeDisplay = 'No especificado'; break;
  }
  components.push(`Tipo de Lugar: ${addressTypeDisplay}`);
  components.push(`Teléfono: ${meal.address?.phoneNumber ? cleanText(meal.address.phoneNumber) : 'No especificado'}`);
  if (meal.address?.addressType === 'shop' && meal.address?.localName) components.push(`Nombre del Local: ${cleanText(meal.address.localName)}`);
  if (meal.address?.addressType === 'school' && meal.address?.recipientName) components.push(`Recibe: ${cleanText(meal.address.recipientName)}`);
  if (meal.address?.addressType === 'complex' && meal.address?.unitDetails) components.push(`Unidad: ${cleanText(meal.address.unitDetails)}`);
  components.push(`Pago: ${meal.payment?.name || meal.payment ? cleanText(meal.payment?.name || meal.payment) : 'Efectivo'}`);
  return components.join('\n');
};

export const areMealsIdentical = (meals) => {
  if (!meals || meals.length <= 1) return { areIdentical: false, count: 1 };
  const fieldsToCompare = [
    'soup', 'soupReplacement', 'principle', 'principleReplacement', 'protein', 'drink', 'cutlery', 'notes', 'time', 'payment',
    'address.address', 'address.addressType', 'address.phoneNumber', 'address.localName', 'address.recipientName', 'address.unitDetails', 'sides', 'additions'
  ];
  const getMealSignature = (meal) => {
    return fieldsToCompare.map(field => {
      const value = getNestedProperty(meal, field);
      if (field === 'sides' && Array.isArray(value)) return value.map(s => cleanText(s.name || s)).sort().join(',');
      if (field === 'additions' && Array.isArray(value)) return value.map(a => `${cleanText(a.name || a)}${a.protein || a.replacement ? `:${cleanText(a.protein || a.replacement)}` : ''}:${a.quantity || 1}`).sort().join(';');
      if (field === 'principle' && Array.isArray(value)) return value.map(p => cleanText(p.name || p)).sort().join(',');
      return cleanText(value);
    }).join('|');
  };
  const firstSignature = getMealSignature(meals[0]);
  const areIdentical = meals.every(meal => getMealSignature(meal) === firstSignature);
  return { areIdentical, count: meals.length };
};