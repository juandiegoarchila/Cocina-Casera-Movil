// src/components/Admin/TablaPedidos.js
// Componente para mostrar dirección con cronómetro
function DireccionConCronometro({ order }) {
  const rawAddress = order.meals?.[0]?.address || order.breakfasts?.[0]?.address;
  const migratedAddress = migrateOldAddressForDisplay(rawAddress);
  // Construir URL de Google Maps (solo usar la dirección principal, no las instrucciones)
  const mapsUrl = migratedAddress?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(migratedAddress.address)}` : null;
  const getMinutesElapsed = () => {
    if (!order.createdAt) return 0;
    const created = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
    
    // Si el pedido está finalizado, usar updatedAt (momento de finalización) en lugar de la fecha actual
    const isFinal = ["Entregado", "Cancelado"].includes(order.status);
    let endTime;
    
    if (isFinal && order.updatedAt) {
      // Usar el momento en que se marcó como entregado/cancelado
      endTime = typeof order.updatedAt.toDate === 'function' ? order.updatedAt.toDate() : (order.updatedAt instanceof Date ? order.updatedAt : new Date(order.updatedAt));
    } else {
      // Para pedidos en progreso, usar la fecha actual
      endTime = new Date();
    }
    
    return Math.floor((endTime - created) / 60000);
  };
  
  const isFinal = ["Entregado", "Cancelado"].includes(order.status);
  const [minutesElapsed, setMinutesElapsed] = React.useState(getMinutesElapsed());
  
  React.useEffect(() => {
    if (!order.createdAt) return;
    
    // Si está finalizado, calcular una vez usando updatedAt y no actualizar más
    if (isFinal) {
      setMinutesElapsed(getMinutesElapsed());
      return;
    }
    
    // Si no está finalizado, actualizar cada minuto usando la fecha actual
    const interval = setInterval(() => {
      setMinutesElapsed(getMinutesElapsed());
    }, 60000);
    
    return () => clearInterval(interval);
  }, [order.createdAt, order.status, order.updatedAt]);
  return (
    <div>
      <div className="whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2">
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
            title="Abrir en Google Maps"
          >
            {migratedAddress?.address || 'Sin dirección'}
          </a>
        ) : (
          migratedAddress?.address || 'Sin dirección'
        )}
        <span className={`ml-2 font-bold ${isFinal ? 'text-gray-500' : 'text-green-500'}`}>{minutesElapsed}min</span>
      </div>
      {migratedAddress?.details && (
        <div className="whitespace-nowrap overflow-hidden text-ellipsis text-gray-400 text-xs">
          ({migratedAddress.details})
        </div>
      )}
    </div>
  );
}
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { classNames } from '../../utils/classNames.js';
import { cleanText, getAddressDisplay } from './utils.js';
import { calculateMealPrice } from '../../utils/MealCalculations';
import { calculateBreakfastPrice } from '../../utils/BreakfastLogic';
import PaymentSplitEditor from '../common/PaymentSplitEditor';
import { summarizePayments, sumPaymentsByMethod, defaultPaymentsForOrder } from '../../utils/payments';
import QRCode from 'qrcode';
import { db } from '../../config/firebase';
import { collection, onSnapshot, updateDoc, doc, getDoc, query, where, getDocs, addDoc, serverTimestamp, increment } from 'firebase/firestore';
import PrinterPlugin from '../../plugins/PrinterPlugin.ts';
import {
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon,
  PencilIcon,
  TrashIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';
// Función para determinar si dos comidas son idénticas
const areMealsIdentical = (meal1, meal2) => {
  // Comparar propiedades principales de las comidas
  if (meal1.soup?.name !== meal2.soup?.name) return false;
  if (meal1.soupReplacement?.name !== meal2.soupReplacement?.name) return false;
  if (meal1.principleReplacement?.name !== meal2.principleReplacement?.name) return false;
  if (meal1.protein?.name !== meal2.protein?.name) return false;
  if (meal1.drink?.name !== meal2.drink?.name) return false;
  if (meal1.cutlery !== meal2.cutlery) return false;
  if (meal1.notes !== meal2.notes) return false;
  
  // Comparar arreglos (principle, sides, additions)
  // Comparar principios
  if (Array.isArray(meal1.principle) && Array.isArray(meal2.principle)) {
    if (meal1.principle.length !== meal2.principle.length) return false;
    // Crear arrays de nombres y ordenarlos para comparación
    const principles1 = meal1.principle.map(p => p.name).sort();
    const principles2 = meal2.principle.map(p => p.name).sort();
    for (let i = 0; i < principles1.length; i++) {
      if (principles1[i] !== principles2[i]) return false;
    }
  } else if (meal1.principle || meal2.principle) {
    return false;
  }
  
  // Comparar acompañamientos
  if (Array.isArray(meal1.sides) && Array.isArray(meal2.sides)) {
    if (meal1.sides.length !== meal2.sides.length) return false;
    // Crear arrays de nombres y ordenarlos para comparación
    const sides1 = meal1.sides.map(s => s.name).sort();
    const sides2 = meal2.sides.map(s => s.name).sort();
    for (let i = 0; i < sides1.length; i++) {
      if (sides1[i] !== sides2[i]) return false;
    }
  } else if (meal1.sides || meal2.sides) {
    return false;
  }
  
  // Comparar adiciones (más complejo debido a quantity y protein)
  if (Array.isArray(meal1.additions) && Array.isArray(meal2.additions)) {
    if (meal1.additions.length !== meal2.additions.length) return false;
    
    // Crear copias ordenadas por nombre para comparar
    const additions1 = [...meal1.additions].sort((a, b) => a.name.localeCompare(b.name));
    const additions2 = [...meal2.additions].sort((a, b) => a.name.localeCompare(b.name));
    
    for (let i = 0; i < additions1.length; i++) {
      if (additions1[i].name !== additions2[i].name) return false;
      if (additions1[i].protein !== additions2[i].protein) return false;
      if (additions1[i].quantity !== additions2[i].quantity) return false;
    }
  } else if (meal1.additions || meal2.additions) {
    return false;
  }
  
  // Si pasa todas las comparaciones, son idénticas
  return true;
};

// Función para recalcular el total correcto para desayunos
const calculateCorrectBreakfastTotal = (order) => {
  if (order.type !== 'breakfast' || !Array.isArray(order.breakfasts) || order.breakfasts.length === 0) {
    return order.total || 0;
  }
  
  // Determinar el orderType correcto basándose en el contexto del pedido
  // Si tiene address (dirección) es domicilio, entonces orderType='takeaway'
  // Si no tiene address o es para mesa, entonces orderType='table'
  const isDeliveryOrder = order.breakfasts.some(b => b.address && (b.address.address || b.address.phoneNumber));
  const correctOrderType = isDeliveryOrder ? 'takeaway' : 'table';
  
  // Crear copias de los desayunos con el orderType correcto
  const breakfastsWithCorrectType = order.breakfasts.map(b => ({
    ...b,
    orderType: b.orderType || correctOrderType
  }));
  
  // Calcular el total usando la función correcta
  return breakfastsWithCorrectType.reduce((sum, breakfast) => {
    return sum + calculateBreakfastPrice(breakfast, 3);
  }, 0);
};

// Exportar la función al objeto window para poder usarla desde otros archivos
if (typeof window !== 'undefined') {
  window.calculateCorrectBreakfastTotal = calculateCorrectBreakfastTotal;
}

// Función para calcular acompañamientos excluidos ("No Incluir")
const getExcludedSides = (meal, allSides) => {
  if (!Array.isArray(meal.sides) || !Array.isArray(allSides)) return [];
  
  const selectedSides = meal.sides.map(s => s?.name).filter(Boolean);
  const hasNinguno = selectedSides.includes('Ninguno');
  
  if (selectedSides.length > 0 && !hasNinguno) {
    const allAvailableSides = allSides.map(s => s.name).filter(n => n && n !== 'Ninguno' && n !== 'Todo incluído' && n !== 'Todo incluido');
    const excludedSides = allAvailableSides.filter(n => !selectedSides.includes(n));
    return excludedSides;
  }
  
  return [];
};

// Función para imprimir recibo de domicilio (con soporte para impresora térmica + fallback web)
const handlePrintDeliveryReceipt = async (order, allSides = []) => {
  const isBreakfast = order.type === 'breakfast';
  const pago = order.payment || order.paymentMethod || 'N/A';
  
  // Calcular el total correcto para desayunos
  const totalValue = isBreakfast ? calculateCorrectBreakfastTotal(order) : order.total || 0;
  const total = totalValue.toLocaleString('es-CO') || 'N/A';
  
  const tipo = isBreakfast ? 'Desayuno' : 'Almuerzo';
  const address = (isBreakfast ? order.breakfasts?.[0]?.address : order.meals?.[0]?.address) || order.address || {};
  const direccion = address.address || '';
  const telefono = address.phoneNumber || '';
  const barrio = address.neighborhood || '';
  const detalles = address.details || '';
  const now = new Date();
  const fecha = now.toLocaleDateString('es-CO') + ' ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  
  // Obtener la hora de entrega usando la misma lógica que en la tabla
  const timeValue = order.meals?.[0]?.time || order.breakfasts?.[0]?.time || order.time || null;
  let deliveryTime = '';
  
  // timeValue puede ser: string, {name}, Firestore Timestamp, Date, o null
  if (typeof timeValue === 'string' && timeValue.trim()) {
    deliveryTime = timeValue;
  } else if (timeValue instanceof Date) {
    deliveryTime = timeValue.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  } else if (timeValue && typeof timeValue === 'object') {
    // Firestore Timestamp tiene toDate(); también aceptamos { name }
    if (typeof timeValue.toDate === 'function') {
      try {
        const d = timeValue.toDate();
        deliveryTime = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        deliveryTime = timeValue.name || '';
      }
    } else if (timeValue.name && typeof timeValue.name === 'string') {
      deliveryTime = timeValue.name;
    }
  }

  let resumen = '';
  if (!isBreakfast && Array.isArray(order.meals)) {
    resumen += `<div style='font-weight:bold;margin-bottom:4px;'>✅ Resumen del Pedido</div>`;
    resumen += `<div>🍽 ${order.meals.length} almuerzos en total</div>`;
    
    // Nueva lógica de agrupación mejorada
    // 1. Agrupar comidas idénticas
    const groupedMeals = [];
    order.meals.forEach(meal => {
      // Buscar si ya existe un grupo con comidas idénticas
      const existingGroup = groupedMeals.find(group => areMealsIdentical(group.meal, meal));
      
      if (existingGroup) {
        // Si existe, incrementar el contador e identificar el índice
        existingGroup.count++;
        existingGroup.indices.push(order.meals.indexOf(meal) + 1);
      } else {
        // Si no existe, crear un nuevo grupo
        groupedMeals.push({ 
          meal, 
          count: 1,
          indices: [order.meals.indexOf(meal) + 1]
        });
      }
    });
    
    // 2. Verificar si todos los almuerzos tienen elementos comunes
    if (groupedMeals.length > 1) {
      // Buscar propiedades comunes entre todos los grupos
      const commonProperties = {};
      const allMeals = groupedMeals.map(g => g.meal);
      
      // Verificar principio común - pero excluir indicadores de reemplazo
      if (allMeals.every(m => 
          Array.isArray(m.principle) && 
          allMeals[0].principle.some(p1 => 
            m.principle.some(p2 => p1.name === p2.name)
          )
      )) {
        const commonPrinciple = allMeals[0].principle.find(p1 => 
          allMeals.every(m => m.principle.some(p2 => p1.name === p2.name))
        );
        // Debug: ver qué principios están llegando
        console.log('DEBUG - commonPrinciple encontrado:', commonPrinciple?.name);
        console.log('DEBUG - todos los principios del primer almuerzo:', allMeals[0].principle.map(p => p.name));
        
        // Solo asignar si no es un indicador de reemplazo
        if (commonPrinciple && 
            !commonPrinciple.name.includes('Remplazo') && 
            !commonPrinciple.name.includes('remplazo')) {
          commonProperties.principle = commonPrinciple.name;
          console.log('DEBUG - principio común asignado:', commonPrinciple.name);
        } else {
          console.log('DEBUG - principio común filtrado:', commonPrinciple?.name);
        }
      }
      
      // Verificar sopa común
      if (allMeals.every(m => m.soup?.name === allMeals[0].soup?.name && m.soup?.name !== 'Sin sopa')) {
        commonProperties.soup = allMeals[0].soup?.name;
      }
      
      // Verificar soupReplacement común
      if (allMeals.every(m => m.soupReplacement?.name === allMeals[0].soupReplacement?.name && m.soupReplacement?.name)) {
        commonProperties.soupReplacement = allMeals[0].soupReplacement?.name;
      }
      
      // Verificar principleReplacement común
      if (allMeals.every(m => m.principleReplacement?.name === allMeals[0].principleReplacement?.name && m.principleReplacement?.name)) {
        commonProperties.principleReplacement = allMeals[0].principleReplacement?.name;
      }
      
      // Verificar proteína común
      if (allMeals.every(m => m.protein?.name === allMeals[0].protein?.name)) {
        commonProperties.protein = allMeals[0].protein?.name;
      }
      
      // Verificar bebida común
      if (allMeals.every(m => m.drink?.name === allMeals[0].drink?.name)) {
        commonProperties.drink = allMeals[0].drink?.name;
      }
      
      // Verificar cubiertos
      if (allMeals.every(m => m.cutlery === allMeals[0].cutlery)) {
        commonProperties.cutlery = allMeals[0].cutlery;
      }
      
      // Verificar acompañamientos comunes
      if (allMeals.every(m => Array.isArray(m.sides))) {
        const commonSides = allMeals[0].sides.filter(side1 => 
          allMeals.every(m => m.sides.some(side2 => side1.name === side2.name))
        );
        if (commonSides.length > 0) {
          commonProperties.sides = commonSides.map(s => s.name);
        }
      }
      
      // Calcular precio total de todos los almuerzos
      const totalPrice = order.total || groupedMeals.reduce((sum, g) => {
        const unitPrice = g.meal.price || 0;
        return sum + (unitPrice * g.count);
      }, 0);
      
      // Mostrar la parte común primero
      resumen += `<div style='margin-top:10px;'><b>🍽 ${order.meals.length} Almuerzos – $${totalPrice.toLocaleString('es-CO')} (${pago})</b></div>`;
      
      // Mostrar propiedades comunes
      if (commonProperties.soup) {
        resumen += `<div>${commonProperties.soup}</div>`;
      }
      
      if (commonProperties.soupReplacement) {
        resumen += `<div>${commonProperties.soupReplacement} (por sopa)</div>`;
      }
      
      // Mostrar principio común si existe y no es un indicador de reemplazo
      console.log('DEBUG - commonProperties.principle antes de mostrar:', commonProperties.principle);
      if (commonProperties.principle && 
          !commonProperties.principle.includes('Remplazo') && 
          !commonProperties.principle.includes('remplazo')) {
        console.log('DEBUG - Mostrando principio común:', commonProperties.principle);
        resumen += `<div>${commonProperties.principle}</div>`;
      } else if (commonProperties.principle) {
        console.log('DEBUG - Principio común filtrado en visualización:', commonProperties.principle);
      }
      
      if (commonProperties.principleReplacement) {
        resumen += `<div>${commonProperties.principleReplacement} (por principio)</div>`;
      }
      
      if (commonProperties.protein) {
        resumen += `<div>${commonProperties.protein}</div>`;
      }
      
      if (commonProperties.drink) {
        const drinkName = commonProperties.drink === 'Juego de mango' ? 'Jugo de mango' : commonProperties.drink;
        resumen += `<div>${drinkName}</div>`;
      }
      
      resumen += `<div>Cubiertos: ${commonProperties.cutlery ? 'Sí' : 'No'}</div>`;
      
      if (commonProperties.sides && commonProperties.sides.length > 0) {
        resumen += `<div>Acompañamientos: ${commonProperties.sides.join(', ')}</div>`;
      }
      
      // Mostrar las diferencias - solo elementos que varían entre almuerzos
      resumen += `<div style='margin-top:10px;'><b>🔄 Diferencias:</b></div>`;
      
      // Función para determinar si un elemento es común a todos los almuerzos
      const isCommonElement = (element, property, allMeals) => {
        if (!element) return false;
        return allMeals.every(meal => {
          if (property === 'soup') {
            return meal.soup?.name === element;
          } else if (property === 'protein') {
            return meal.protein?.name === element;
          } else if (property === 'principle') {
            return Array.isArray(meal.principle) && meal.principle.some(p => p.name === element);
          } else if (property === 'soupReplacement') {
            return meal.soupReplacement?.name === element;
          } else if (property === 'principleReplacement') {
            return meal.principleReplacement?.name === element;
          }
          return false;
        });
      };
      
      groupedMeals.forEach(group => {
        const m = group.meal;
        const differences = [];
        
        // Verificar sopa - solo si no es común a todos
        if (m.soup?.name === 'Solo bandeja') {
          differences.push('solo bandeja');
        } else if (m.soupReplacement?.name && !isCommonElement(m.soupReplacement.name, 'soupReplacement', allMeals)) {
          differences.push(`${m.soupReplacement.name} (por sopa)`);
        } else if (m.soup?.name && m.soup.name !== 'Sin sopa' && !isCommonElement(m.soup.name, 'soup', allMeals)) {
          differences.push(m.soup.name);
        }
        
        // Verificar principleReplacement - solo si no es común
        if (m.principleReplacement?.name && !isCommonElement(m.principleReplacement.name, 'principleReplacement', allMeals)) {
          differences.push(`${m.principleReplacement.name} (por principio)`);
        }
        
        // Verificar principios - solo mostrar si son diferentes a otros almuerzos
        if (Array.isArray(m.principle) && m.principle.length > 0) {
          // Verificar si los principios de este almuerzo son diferentes a otros
          const otherMeals = allMeals.filter(meal => meal !== m);
          const arePrinciplesDifferent = otherMeals.some(otherMeal => {
            if (!Array.isArray(otherMeal.principle)) return true;
            if (otherMeal.principle.length !== m.principle.length) return true;
            
            const thisPrinciples = m.principle.map(p => p.name).sort();
            const otherPrinciples = otherMeal.principle.map(p => p.name).sort();
            
            for (let i = 0; i < thisPrinciples.length; i++) {
              if (thisPrinciples[i] !== otherPrinciples[i]) return true;
            }
            return false;
          });
          
          if (arePrinciplesDifferent) {
            const principles = m.principle.map(p => p.name).join(', ');
            const mixtoLabel = m.principle.length > 1 ? ' (mixto)' : '';
            differences.push(`${principles}${mixtoLabel}`);
          }
        }
        
        // Verificar proteína - solo si no es común
        const specialRice = Array.isArray(m.principle) && m.principle.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));
        if (!specialRice && m.protein?.name && !isCommonElement(m.protein.name, 'protein', allMeals)) {
          differences.push(m.protein.name);
        }
        
        // Verificar acompañamientos - mostrar solo si son diferentes a otros almuerzos
        if (Array.isArray(m.sides) && m.sides.length > 0) {
          // Verificar si los acompañamientos de este almuerzo son diferentes a otros
          const otherMeals = allMeals.filter(meal => meal !== m);
          const areSidesDifferent = otherMeals.some(otherMeal => {
            if (!Array.isArray(otherMeal.sides)) return true;
            if (otherMeal.sides.length !== m.sides.length) return true;
            
            const thisSides = m.sides.map(s => s.name).sort();
            const otherSides = otherMeal.sides.map(s => s.name).sort();
            
            for (let i = 0; i < thisSides.length; i++) {
              if (thisSides[i] !== otherSides[i]) return true;
            }
            return false;
          });
          
          if (areSidesDifferent) {
            const sides = m.sides.map(s => s.name).join(', ');
            differences.push(`Acompañamientos: ${sides}`);
            
            // Agregar "No Incluir" si hay acompañamientos excluidos
            const excludedSides = getExcludedSides(m, allSides);
            if (excludedSides.length > 0) {
              differences.push(`No Incluir: ${excludedSides.join(', ')}`);
            }
          }
        }
        
        // Verificar adiciones - mostrar solo si tiene adiciones diferentes a otros almuerzos
        if (Array.isArray(m.additions) && m.additions.length > 0) {
          // Verificar si las adiciones de este almuerzo son diferentes a otros
          const otherMeals = allMeals.filter(meal => meal !== m);
          const areAdditionsDifferent = otherMeals.some(otherMeal => {
            if (!Array.isArray(otherMeal.additions)) return true;
            if (otherMeal.additions.length !== m.additions.length) return true;
            
            const thisAdditions = m.additions.map(a => `${a.name} (${a.quantity || 1})`).sort();
            const otherAdditions = otherMeal.additions.map(a => `${a.name} (${a.quantity || 1})`).sort();
            
            for (let i = 0; i < thisAdditions.length; i++) {
              if (thisAdditions[i] !== otherAdditions[i]) return true;
            }
            return false;
          });
          
          if (areAdditionsDifferent) {
            m.additions.forEach(addition => {
              differences.push(`+ ${addition.name} (${addition.quantity || 1})`);
            });
          }
        }
        
        // Solo mostrar si hay diferencias reales
        if (differences.length > 0) {
          resumen += `<div style='margin-top:5px;'><b>* Almuerzo ${group.indices.join(', ')}:</b></div>`;
          differences.forEach(diff => {
            resumen += `<div>${diff}</div>`;
          });
        }
      });
    } else {
      // Si solo hay un grupo, mostrar como antes
      groupedMeals.forEach((group, idx) => {
        const m = group.meal;
        const countText = group.count > 1 ? `${group.count} Almuerzos iguales` : '1 Almuerzo';
        
        // Mostrar precio total del grupo (precio unitario * cantidad)
        const unitPrice = m.price || (order.total / order.meals.length) || 0;
        const groupTotal = (unitPrice * group.count).toLocaleString('es-CO');
        
        resumen += `<div style='margin-top:10px;'><b>🍽 ${countText} – $${groupTotal} (${pago})</b></div>`;
        
        if (m.soup?.name === 'Solo bandeja') resumen += '<div>solo bandeja</div>';
        else if (m.soupReplacement?.name) resumen += `<div>${m.soupReplacement.name} (por sopa)</div>`;
        else if (m.soup?.name && m.soup.name !== 'Sin sopa') resumen += `<div>${m.soup.name}</div>`;
        
        if (m.principleReplacement?.name) resumen += `<div>${m.principleReplacement.name} (por principio)</div>`;
        else if (Array.isArray(m.principle) && m.principle.length > 0) {
          // Filtrar principios que sean indicadores de reemplazo
          const filteredPrinciples = m.principle.filter(p => 
            !p.name.includes('Remplazo') && !p.name.includes('remplazo')
          );
          if (filteredPrinciples.length > 0) {
            const principles = filteredPrinciples.map(p => p.name).join(', ');
            // Agregar (mixto) si hay más de un principio
            const mixtoLabel = filteredPrinciples.length > 1 ? ' (mixto)' : '';
            resumen += `<div>${principles}${mixtoLabel}</div>`;
          }
        }
        
        const specialRice = Array.isArray(m.principle) && m.principle.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));
        if (specialRice) resumen += `<div>Ya incluida en el arroz</div>`;
        else if (m.protein?.name) resumen += `<div>${m.protein.name}</div>`;
        
        if (m.drink?.name) resumen += `<div>${m.drink.name === 'Juego de mango' ? 'Jugo de mango' : m.drink.name}</div>`;
        
        resumen += `<div>Cubiertos: ${m.cutlery ? 'Sí' : 'No'}</div>`;
        
        if (specialRice) resumen += `<div>Acompañamientos: Ya incluidos</div>`;
        else if (Array.isArray(m.sides) && m.sides.length > 0) {
          // Mostrar los acompañamientos seleccionados sin etiqueta mixto
          const sides = m.sides.map(s => s.name).join(', ');
          resumen += `<div>Acompañamientos: ${sides}</div>`;
          
          // Agregar "No Incluir" si hay acompañamientos excluidos
          const excludedSides = getExcludedSides(m, allSides);
          if (excludedSides.length > 0) {
            resumen += `<div>No Incluir: ${excludedSides.join(', ')}</div>`;
          }
        }
        else resumen += `<div>Acompañamientos: Ninguno</div>`;
        
        // No incluimos la dirección aquí porque ya se muestra arriba en el recibo
        
        if (Array.isArray(m.additions) && m.additions.length > 0) {
          resumen += `<div>Adiciones:</div>`;
          m.additions.forEach(a => {
            resumen += `<div style='margin-left:10px;'>- ${a.name}${a.protein ? ' (' + a.protein + ')' : ''} (${a.quantity || 1})</div>`;
          });
        }
        resumen += `<div>Notas: ${m.notes || 'Ninguna'}</div>`;
      });
    }
  } else if (isBreakfast && Array.isArray(order.breakfasts)) {
    // Calcular el total general de desayunos (con orderType='table')
    const totalBreakfast = calculateCorrectBreakfastTotal(order);
    
    resumen += `<div style='font-weight:bold;margin-bottom:4px;'>✅ Resumen del Pedido</div>`;
    resumen += `<div>🍽 ${order.breakfasts.length} desayunos en total</div>`;
    resumen += `<div style='font-weight:bold;'>Total: $${totalBreakfast.toLocaleString('es-CO')}</div>`;
    
    // Función para determinar si dos desayunos son idénticos
    const areBreakfastsIdentical = (b1, b2) => {
      if (typeof b1.type !== typeof b2.type) return false;
      if (typeof b1.type === 'string' && b1.type !== b2.type) return false;
      if (typeof b1.type === 'object' && b1.type?.name !== b2.type?.name) return false;
      
      if (typeof b1.protein !== typeof b2.protein) return false;
      if (typeof b1.protein === 'string' && b1.protein !== b2.protein) return false;
      if (typeof b1.protein === 'object' && b1.protein?.name !== b2.protein?.name) return false;
      
      if (typeof b1.drink !== typeof b2.drink) return false;
      if (typeof b1.drink === 'string' && b1.drink !== b2.drink) return false;
      if (typeof b1.drink === 'object' && b1.drink?.name !== b2.drink?.name) return false;
      
      if (b1.notes !== b2.notes) return false;
      
      // Comparar adiciones
      if (Array.isArray(b1.additions) && Array.isArray(b2.additions)) {
        if (b1.additions.length !== b2.additions.length) return false;
        
        const additions1 = [...b1.additions].sort((a, b) => a.name.localeCompare(b.name));
        const additions2 = [...b2.additions].sort((a, b) => a.name.localeCompare(b.name));
        
        for (let i = 0; i < additions1.length; i++) {
          if (additions1[i].name !== additions2[i].name) return false;
          if (additions1[i].quantity !== additions2[i].quantity) return false;
        }
      } else if (b1.additions || b2.additions) {
        return false;
      }
      
      return true;
    };
    
    // Agrupar desayunos idénticos
    const groupedBreakfasts = [];
    order.breakfasts.forEach(breakfast => {
      // Buscar si ya existe un grupo con desayunos idénticos
      const existingGroup = groupedBreakfasts.find(group => areBreakfastsIdentical(group.breakfast, breakfast));
      
      if (existingGroup) {
        // Si existe, incrementar el contador
        existingGroup.count++;
      } else {
        // Si no existe, crear un nuevo grupo
        groupedBreakfasts.push({ breakfast, count: 1 });
      }
    });
    
    // Mostrar los desayunos agrupados
    groupedBreakfasts.forEach((group, idx) => {
      const b = group.breakfast;
      const countText = group.count > 1 ? `${group.count} Desayunos iguales` : '1 Desayuno';
      
      // Forzar orderType='table' para calcular el precio correcto
      const breakfastForPricing = { ...b, orderType: 'table' };
      
      // Calcular precio usando la función correcta
      const unitPrice = calculateBreakfastPrice(breakfastForPricing, 3);
      const groupTotal = (unitPrice * group.count).toLocaleString('es-CO');
      
      resumen += `<div style='margin-top:10px;'><b>🍽 ${countText} – $${groupTotal} (${pago})</b></div>`;
      
      if (b.type) resumen += `<div>${typeof b.type === 'string' ? b.type : b.type?.name || ''}</div>`;
      if (b.broth) resumen += `<div>Caldo: ${typeof b.broth === 'string' ? b.broth : b.broth?.name || ''}</div>`;
      if (b.eggs) resumen += `<div>Huevos: ${typeof b.eggs === 'string' ? b.eggs : b.eggs?.name || ''}</div>`;
      if (b.riceBread) resumen += `<div>Arroz/Pan: ${typeof b.riceBread === 'string' ? b.riceBread : b.riceBread?.name || ''}</div>`;
      if (b.protein) resumen += `<div>${typeof b.protein === 'string' ? b.protein : b.protein?.name || ''}</div>`;
      if (b.drink) resumen += `<div>${typeof b.drink === 'string' ? b.drink : b.drink?.name || ''}</div>`;
      if (b.additions && b.additions.length > 0) {
        resumen += `<div>Adiciones:</div>`;
        b.additions.forEach(a => {
          resumen += `<div style='margin-left:10px;'>- ${a.name} (${a.quantity || 1})</div>`;
        });
      }
      resumen += `<div>Cubiertos: ${b.cutlery === true ? 'Sí' : 'No'}</div>`;
      resumen += `<div>Notas: ${b.notes || 'Ninguna'}</div>`;
      
      // No incluimos la dirección aquí porque ya se muestra arriba en el recibo
    });
  }
  // Generar código QR para el canal de WhatsApp
  const whatsappChannelUrl = 'https://whatsapp.com/channel/0029VafyYdVAe5VskWujmK0C';
  let qrCodeDataUrl = '';

  // Crear el código QR para incluirlo en el recibo
  const generateQRCode = () => {
    return new Promise((resolve) => {
      QRCode.toDataURL(whatsappChannelUrl, { 
        width: 150,
        margin: 1,
        errorCorrectionLevel: 'M'
      }, (err, url) => {
        if (err) {
          console.error('Error al generar código QR:', err);
          resolve(''); // Devolver cadena vacía en caso de error
        } else {
          resolve(url);
        }
      });
    });
  };

  // Config IP/puerto accesible para try/catch
  const currentPrinterIp = (typeof localStorage !== 'undefined' && localStorage.getItem('printerIp')) || '192.168.1.100';
  const currentPrinterPort = (typeof localStorage !== 'undefined' && parseInt(localStorage.getItem('printerPort'))) || 9100;

  // Intentar impresión térmica primero
  try {
    
    // ===============================
    // FORMATO MEJORADO DEL TICKET DE DOMICILIO
    // ===============================
    
    // Helper para dividir la dirección en dos líneas legibles en 58mm
    const formatAddressForTicket = (addr) => {
      const text = (addr || '').toString().trim();
      if (!text) return { line1: '', line2: '' };
      const lower = text.toLowerCase();
      if (lower.includes(' bis ')) {
        const idx = lower.indexOf(' bis ');
        return { line1: text.slice(0, idx).trim(), line2: text.slice(idx + 1).trim() };
      }
      if (text.includes(' # ')) {
        const idx = text.indexOf(' # ');
        return { line1: text.slice(0, idx).trim(), line2: text.slice(idx + 1).trim() };
      }
      if (text.includes(' No. ')) {
        const idx = text.indexOf(' No. ');
        return { line1: text.slice(0, idx).trim(), line2: text.slice(idx + 1).trim() };
      }
      if (text.includes(' N° ')) {
        const idx = text.indexOf(' N° ');
        return { line1: text.slice(0, idx).trim(), line2: text.slice(idx + 1).trim() };
      }
      if (text.length > 28) {
        const cut = text.lastIndexOf(' ', 28);
        if (cut > 10) return { line1: text.slice(0, cut).trim(), line2: text.slice(cut + 1).trim() };
      }
      return { line1: text, line2: '' };
    };

    // Construir LOGO como imagen ESC/POS raster (centrado) - desactivado por defecto.
    // Puedes activar el raster poniendo localStorage.setItem('useRasterLogo','1')
    let logoRaster = '';
    const enableRasterLogo = (typeof localStorage !== 'undefined' && localStorage.getItem('useRasterLogo') === '1');
    if (enableRasterLogo) {
      try {
        const toMonochromeRaster = async (url, targetWidth = 240) => {
          const resp = await fetch(url);
          const blob = await resp.blob();
          const bmp = await createImageBitmap(blob);
          const ratio = Math.min(targetWidth / bmp.width, targetWidth / bmp.height);
          const w = Math.max(8, Math.floor(bmp.width * ratio));
          const h = Math.max(8, Math.floor(bmp.height * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0,0,w,h);
          // Dibuja imagen centrada
          ctx.drawImage(bmp, 0, 0, w, h);
          const img = ctx.getImageData(0,0,w,h);
          const bytesPerRow = Math.ceil(w / 8);
          const data = new Uint8Array(bytesPerRow * h);
          const threshold = 180; // umbral para B/N
          for (let y=0; y<h; y++) {
            for (let x=0; x<w; x++) {
              const i = (y*w + x) * 4;
              const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
              const lum = 0.299*r + 0.587*g + 0.114*b;
              const byteIndex = y*bytesPerRow + (x >> 3);
              const bit = 7 - (x & 7);
              if (lum < threshold) data[byteIndex] |= (1 << bit);
            }
          }
          // ESC/POS raster: GS v 0 m xL xH yL yH + data
          const GS = '\x1D';
          const m = '\x00';
          const xL = String.fromCharCode(bytesPerRow & 0xFF);
          const xH = String.fromCharCode((bytesPerRow >> 8) & 0xFF);
          const yL = String.fromCharCode(h & 0xFF);
          const yH = String.fromCharCode((h >> 8) & 0xFF);
          let out = '';
          // centrar
          out += '\x1B' + 'a' + '\x01';
          out += GS + 'v' + '0' + m + xL + xH + yL + yH;
          // añadir bytes binarios
          out += Array.from(data).map(n => String.fromCharCode(n)).join('');
          out += '\n\n';
          // volver a izquierda
          out += '\x1B' + 'a' + '\x00';
          return out;
        };
        logoRaster = await toMonochromeRaster('/logo.png', 240);
      } catch (e) {
        console.warn('No se pudo preparar logo raster:', e);
        logoRaster = '';
      }
    }

    // Función para generar el recibo térmico con formato correcto
    const generateThermalReceipt = () => {
      const ESC = '\x1B';
      const GS = '\x1D';
      const SEP = '------------------------------------------------\n'; // 48 guiones

      // Sanitizador para evitar caracteres problemáticos en Android/ESC-POS
      const forceAsciiAccents = typeof localStorage !== 'undefined'
        ? (localStorage.getItem('forceAsciiTicket') === '1')
        : true; // activado por defecto

      const stripAccents = (s) => String(s || '')
        .replace(/[ÁÀÂÃÄ]/g, 'A')
        .replace(/[áàâãä]/g, 'a')
        .replace(/[ÉÈÊË]/g, 'E')
        .replace(/[éèêë]/g, 'e')
        .replace(/[ÍÌÎÏ]/g, 'I')
        .replace(/[íìîï]/g, 'i')
        .replace(/[ÓÒÔÕÖ]/g, 'O')
        .replace(/[óòôõö]/g, 'o')
        .replace(/[ÚÙÛÜ]/g, 'U')
        .replace(/[úùûü]/g, 'u')
        .replace(/Ñ/g, 'N')
        .replace(/ñ/g, 'n')
        .replace(/Ç/g, 'C')
        .replace(/ç/g, 'c');

      const sanitize = (s) => {
        let out = String(s || '')
          .replace(/[\u00A0\u202F]/g, ' ') // NBSP/espacios finos
          .replace(/[•]/g, '*')
          .replace(/[–—]/g, '-')
          .replace(/[“”]/g, '"')
          .replace(/[’']/g, "'");
        if (forceAsciiAccents) out = stripAccents(out);
        return out;
      };

      let receipt = '';
      
      // Inicializar impresora
      receipt += ESC + '@'; // Inicializar
  // Asegurar codepage español (Windows-1252) para tildes/ñ
  receipt += ESC + 't' + '\x10';
  // Resetear márgenes y ancho de área de impresión (80mm ~ 576 dots)
  receipt += '\x1D' + 'L' + '\x00' + '\x00'; // GS L nL nH -> margen izquierdo 0
  receipt += '\x1D' + 'W' + '\x40' + '\x02'; // GS W nL nH -> ancho 0x0240 = 576
      
      // ===============================
      // ENCABEZADO (después del logo)
      // ===============================
  receipt += ESC + 'a' + '\x01'; // Centrar texto
  // Si está habilitado, insertamos el logo raster aquí; por defecto queda desactivado
  if (logoRaster) receipt += logoRaster;
      receipt += ESC + '!' + '\x18'; // Texto doble altura y ancho
    receipt += sanitize('Cocina Casera') + '\n';
      receipt += ESC + '!' + '\x00'; // Texto normal
    receipt += sanitize('(Uso interno - No es factura DIAN)') + '\n';
      receipt += '\n';
      
  // ===============================
  // INFORMACIÓN DEL PEDIDO (formato similar al ticket ejemplo)
  // ===============================
  receipt += ESC + 'a' + '\x00'; // Alinear izquierda
  const fechaClean = sanitize(String(fecha || '')
    .replace(/a\.[\s\u00A0\u202F]*m\./ig, 'a. m.')
    .replace(/p\.[\s\u00A0\u202F]*m\./ig, 'p. m.'));
  const entregaClean = sanitize(deliveryTime || 'lo más pronto posible');
  receipt += sanitize(`Tipo: ${tipo}`) + '\n';
  receipt += sanitize(`Pago: ${pago}`) + '\n';
  receipt += sanitize(`Total: $${total}`) + '\n';
  receipt += `Fecha: ${fechaClean}\n`;
  receipt += `Entrega: ${entregaClean}\n`;
  receipt += '\n';
      
      // ===============================
      // INFORMACIÓN DE ENTREGA
      // ===============================
  receipt += ESC + '!' + '\x00'; // Normal
  const addrLines = formatAddressForTicket(direccion);
  receipt += sanitize(`Dirección: ${addrLines.line1 || 'N/A'}`) + '\n';
  if (addrLines.line2) receipt += sanitize(`           ${addrLines.line2}`) + '\n';
  if (barrio) receipt += sanitize(`Barrio: ${barrio}`) + '\n';
  receipt += sanitize(`Teléfono: ${telefono || 'N/A'}`) + '\n';
  receipt += sanitize(`Detalles: ${detalles || ''}`) + '\n';
  receipt += '\n';
      
  // ===============================
  // RESUMEN DEL PEDIDO
  // ===============================
  receipt += SEP;
  receipt += ESC + 'a' + '\x01';
  receipt += ESC + '!' + '\x08'; // Negrita
  receipt += sanitize('RESUMEN DEL PEDIDO') + '\n';
  receipt += ESC + '!' + '\x00'; // Normal
  receipt += ESC + 'a' + '\x00';
  receipt += SEP;
      
      if (!isBreakfast && Array.isArray(order.meals)) {
  receipt += sanitize(`${order.meals.length} almuerzos en total`) + '\n';
  receipt += SEP;
        
        // Crear agrupación simplificada para térmica
        const groupedMeals = [];
        order.meals.forEach((meal, index) => {
          const existingGroup = groupedMeals.find(group => 
            areMealsIdentical(group.meal, meal)
          );
          
          if (existingGroup) {
            existingGroup.count++;
            existingGroup.indices.push(index + 1);
          } else {
            groupedMeals.push({ 
              meal, 
              count: 1, 
              indices: [index + 1] 
            });
          }
        });

        // Determinar comunes
        const allMeals = groupedMeals.map(g => g.meal);
        const first = allMeals[0] || {};
        const every = (pred) => allMeals.every(pred);
        const intersection = (arrs) => {
          if (!arrs.length) return [];
          return arrs.reduce((acc, curr) => acc.filter(x => curr.includes(x)));
        };

        const common = {};
        if (every(m => (m.soup?.name || '') === (first.soup?.name || '') && m.soup?.name && m.soup.name !== 'Sin sopa')) common.soup = first.soup.name;
        if (every(m => (m.soupReplacement?.name || '') === (first.soupReplacement?.name || '')) && first.soupReplacement?.name) common.soupReplacement = first.soupReplacement.name;
        if (every(m => (m.principleReplacement?.name || '') === (first.principleReplacement?.name || '')) && first.principleReplacement?.name) common.principleReplacement = first.principleReplacement.name;
        if (every(m => (m.protein?.name || '') === (first.protein?.name || '')) && first.protein?.name) common.protein = first.protein.name;
        if (every(m => (m.drink?.name || '') === (first.drink?.name || '')) && first.drink?.name) common.drink = (first.drink.name === 'Juego de mango' ? 'Jugo de mango' : first.drink.name);
        if (every(m => m.cutlery === first.cutlery)) common.cutlery = !!first.cutlery;
        if (every(m => Array.isArray(m.principle))) {
          const sets = allMeals.map(m => (m.principle || []).map(p => p.name).filter(n => n && !/remplazo/i.test(n)));
          const inter = intersection(sets);
          if (inter.length) common.principle = inter;
        }
        if (every(m => Array.isArray(m.sides))) {
          const sets = allMeals.map(m => (m.sides || []).map(s => s.name).filter(Boolean));
          const inter = intersection(sets);
          if (inter.length) common.sides = inter;
        }

        // Precio total y encabezado
        const totalPrice = order.total || groupedMeals.reduce((sum, g) => sum + (Number(g.meal.price || 0) * g.count), 0);
  // Evitar caracteres Unicode problemáticos: usar ASCII puro
  receipt += sanitize(`${order.meals.length} Almuerzos - $${Number(totalPrice || 0).toLocaleString('es-CO')} (${pago})`) + '\n';

        // Imprimir comunes
  if (common.soup) receipt += sanitize(`* ${common.soup}`) + '\n';
  if (common.soupReplacement) receipt += sanitize(`* ${common.soupReplacement} (por sopa)`) + '\n';
        if (Array.isArray(common.principle) && common.principle.length) {
          const ptxt = common.principle.join(', ');
          const mixto = common.principle.length > 1 ? ' (mixto)' : '';
          receipt += sanitize(`* ${ptxt}${mixto}`) + '\n';
        }
  if (common.principleReplacement) receipt += sanitize(`* ${common.principleReplacement} (por principio)`) + '\n';
  if (common.protein) receipt += sanitize(`* ${common.protein}`) + '\n';
  if (common.drink) receipt += sanitize(`* ${common.drink}`) + '\n';
  receipt += sanitize(`Cubiertos: ${common.cutlery ? 'Si' : 'No'}`) + '\n';
  if (Array.isArray(common.sides) && common.sides.length) receipt += sanitize(`Acompanamientos: ${common.sides.join(', ')}`) + '\n';

        // Diferencias
        if (groupedMeals.length > 1) {
          receipt += '\n' + sanitize('DIFERENCIAS:') + '\n';
          groupedMeals.forEach(group => {
            const m = group.meal;
            const idxText = group.indices.join(', ');
            receipt += sanitize(`* Almuerzo ${idxText}:`) + '\n';
            const diffs = [];
            if ((m.soup?.name && m.soup.name !== common.soup && m.soup.name !== 'Sin sopa') || (m.soupReplacement?.name && m.soupReplacement.name !== common.soupReplacement)) {
              if (m.soupReplacement?.name) diffs.push(`${m.soupReplacement.name} (por sopa)`);
              else if (m.soup?.name && m.soup.name !== 'Sin sopa') diffs.push(m.soup.name);
            }
            const mPrinciples = (m.principle || []).map(p => p.name).filter(n => n && !/remplazo/i.test(n));
            if (Array.isArray(common.principle)) {
              const diffP = mPrinciples.filter(x => !common.principle.includes(x));
              if (diffP.length) diffs.push(`${diffP.join(', ')}${diffP.length > 1 ? ' (mixto)' : ''}`);
            } else if (mPrinciples.length) {
              diffs.push(`${mPrinciples.join(', ')}${mPrinciples.length > 1 ? ' (mixto)' : ''}`);
            }
            if (m.principleReplacement?.name && m.principleReplacement.name !== common.principleReplacement) diffs.push(`${m.principleReplacement.name} (por principio)`);
            const specialRice = Array.isArray(m.principle) && m.principle.some(p => ['Arroz con pollo','Arroz paisa','Arroz tres carnes'].includes(p.name));
            if (!specialRice) {
              if (m.protein?.name && m.protein.name !== common.protein) diffs.push(m.protein.name);
            }
            if (Array.isArray(m.sides)) {
              const sidesM = m.sides.map(s => sanitize(s.name)).filter(Boolean);
              if (!Array.isArray(common.sides) || sidesM.join('|') !== common.sides.join('|')) {
                if (sidesM.length) diffs.push(`Acompanamientos: ${sidesM.join(', ')}`);
                const excluded = getExcludedSides(m, allSides);
                if (excluded.length) diffs.push(`No incluir: ${excluded.join(', ')}`);
              }
            }
            if (Array.isArray(m.additions) && m.additions.length) {
              m.additions.forEach(a => diffs.push(`+ ${a.name}${a.protein ? ' (' + a.protein + ')' : ''} (${a.quantity || 1})`));
            }
            if (m.notes && m.notes.trim()) diffs.push(`Notas: ${sanitize(m.notes)}`);
            if (diffs.length === 0) diffs.push('Sin diferencias');
            diffs.forEach(d => { receipt += '  - ' + sanitize(d) + '\n'; });
          });
        }
        
      } else if (isBreakfast && Array.isArray(order.breakfasts)) {
  receipt += sanitize(`${order.breakfasts.length} desayunos en total`) + '\n';
  receipt += SEP;
        
  order.breakfasts.forEach((breakfast, index) => {
          // Encabezado del desayuno
          receipt += ESC + '!' + '\x01'; // Altura doble
          receipt += `DESAYUNO ${index + 1}:\n`;
          receipt += ESC + '!' + '\x00'; // Normal
          
          const bTotal = calculateBreakfastPrice({ ...breakfast, orderType: 'table' }, 3);
          receipt += `1 Desayuno - $${bTotal.toLocaleString('es-CO')} (${pago})\n`;
          receipt += '\n';
          
          if (breakfast.type) {
            const typeName = typeof breakfast.type === 'string' ? breakfast.type : breakfast.type?.name || '';
            receipt += sanitize(`* ${typeName}`) + '\n';
          }
          if (breakfast.broth) {
            const brothName = typeof breakfast.broth === 'string' ? breakfast.broth : breakfast.broth?.name || '';
            receipt += sanitize(`* ${brothName}`) + '\n';
          }
          if (breakfast.eggs) {
            const eggsName = typeof breakfast.eggs === 'string' ? breakfast.eggs : breakfast.eggs?.name || '';
            receipt += sanitize(`* ${eggsName}`) + '\n';
          }
          if (breakfast.riceBread) {
            const riceBreadName = typeof breakfast.riceBread === 'string' ? breakfast.riceBread : breakfast.riceBread?.name || '';
            receipt += sanitize(`* ${riceBreadName}`) + '\n';
          }
          if (breakfast.protein) {
            const proteinName = typeof breakfast.protein === 'string' ? breakfast.protein : breakfast.protein?.name || '';
            receipt += sanitize(`* ${proteinName}`) + '\n';
          }
          if (breakfast.drink) {
            const drinkName = typeof breakfast.drink === 'string' ? breakfast.drink : breakfast.drink?.name || '';
            receipt += sanitize(`* ${drinkName}`) + '\n';
          }
          
          if (breakfast.additions && breakfast.additions.length > 0) {
            receipt += sanitize('* Adiciones:') + '\n';
            breakfast.additions.forEach(a => {
              receipt += `  - ${a.name} (${a.quantity || 1})\n`;
            });
          }
          
          receipt += sanitize(`Cubiertos: ${breakfast.cutlery === true ? 'Si' : 'No'}`) + '\n';
          
          if (breakfast.notes && breakfast.notes.trim()) {
            receipt += sanitize(`Notas: ${breakfast.notes}`) + '\n';
          }
          
          // Separador entre desayunos si hay más de uno
          if (index < order.breakfasts.length - 1) {
            receipt += '................................\n';
          }
        });
      }
      
  receipt += SEP;
      
      // ===============================
      // MENSAJE FINAL
      // ===============================
  receipt += ESC + 'a' + '\x01'; // Centrar
  receipt += '\n';
  receipt += ESC + '!' + '\x08'; // Negrita
  receipt += sanitize('Gracias por pedir en Cocina Casera') + '\n';
  receipt += ESC + '!' + '\x00'; // Normal
  receipt += sanitize('Te esperamos mañana con un') + '\n';
  receipt += sanitize('nuevo menú.') + '\n';
  receipt += SEP;
  receipt += sanitize('Escríbenos al 301 6476916') + '\n';
  receipt += sanitize('Calle 133#126c-09') + '\n';
  receipt += SEP;
      
      // ===============================
      // CÓDIGO QR
      // ===============================
  receipt += sanitize('Escanea este código QR para') + '\n';
    receipt += sanitize('unirte a nuestro canal de') + '\n';
    receipt += sanitize('WhatsApp y recibir nuestro') + '\n';
  receipt += sanitize('menú diario:') + '\n';
    receipt += '\n\n';
      
  // Generar QR code nativo (ESC/POS) para WhatsApp (centrado)
  receipt += ESC + 'a' + '\x01'; // centrar
  // Seleccionar modo de QR y tamaño
  receipt += GS + '(k' + '\x04' + '\x00' + '\x31' + '\x41' + '\x32' + '\x00'; // Select model 2
  receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x43' + '\x08'; // Module size 8
  receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x45' + '\x30'; // Error correction L

  const qrData = 'https://whatsapp.com/channel/0029VafyYdVAe5VskWujmK0C';
  const qrLength = qrData.length + 3;
  const pL = String.fromCharCode(qrLength & 0xff);
  const pH = String.fromCharCode((qrLength >> 8) & 0xff);
  // Store data
  receipt += GS + '(k' + pL + pH + '\x31' + '\x50' + '\x30' + qrData;
  // Print the QR
  receipt += GS + '(k' + '\x03' + '\x00' + '\x31' + '\x51' + '\x30';
  receipt += ESC + 'a' + '\x00'; // volver a izquierda
      
      receipt += '\n\n\n';
      
      // Cortar papel
      receipt += GS + 'V' + '\x41' + '\x03'; // Corte parcial
      
      return sanitize(receipt);
    };

    // Función para convertir imagen a base64
    const getLogoBase64 = async () => {
      try {
        const response = await fetch('/logo.png');
        const blob = await response.blob();
        const imgBitmap = await createImageBitmap(blob);

        // Normalizar a lienzo cuadrado para que se vea circular correctamente
        const size = 256; // px
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Fondo blanco
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, size, size);

        // Recortar a círculo (máscara)
        ctx.save();
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Dibujar imagen centrada y contenida
        const ratio = Math.min(size / imgBitmap.width, size / imgBitmap.height);
        const w = imgBitmap.width * ratio;
        const h = imgBitmap.height * ratio;
        const x = (size - w) / 2;
        const y = (size - h) / 2;
        ctx.drawImage(imgBitmap, x, y, w, h);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        return base64;
      } catch (error) {
        console.warn('No se pudo cargar el logo:', error);
        return null;
      }
    };

    // Renderizar TODO el ticket como imagen (canvas) para evitar problemas de codificación y asegurar monoespaciado/alineación
    const renderTicketCanvas = async () => {
      const width = 576; // ancho típico 80mm
      const margin = 24;
      const inner = width - margin * 2;
      const line = (ctx, y) => { ctx.fillStyle = '#000'; ctx.fillRect(margin, y, inner, 2); };
      const makeCtx = (h) => {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFF';
        ctx.fillRect(0,0,width,h);
        ctx.fillStyle = '#000';
        return { canvas, ctx };
      };
      const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
        const words = (text || '').toString().split(/\s+/);
        let lineStr = '';
        const lines = [];
        for (let n = 0; n < words.length; n++) {
          const testLine = lineStr ? lineStr + ' ' + words[n] : words[n];
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            lines.push(lineStr);
            lineStr = words[n];
          } else {
            lineStr = testLine;
          }
        }
        if (lineStr) lines.push(lineStr);
        lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
        return y + lines.length * lineHeight;
      };
      // 1) medir altura aproximada (simple): usamos un buffer alto y luego recortamos con toDataURL
      const { canvas, ctx } = makeCtx(5000);
      let y = 20;
      // Fuentes
      const titleFont = 'bold 36px monospace';
      const subtitleFont = 'bold 20px monospace';
      const normalFont = '24px monospace';
      const smallFont = '20px monospace';

      // Logo (si existe)
      try {
        const resp = await fetch('/logo.png');
        const blob = await resp.blob();
        const img = await createImageBitmap(blob);
        const size = 140;
        const cx = width / 2, cy = y + size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, cx - size / 2, y, size, size);
        ctx.restore();
        y += size + 12;
      } catch {}

      // Encabezado
      ctx.textAlign = 'center';
      ctx.font = titleFont; y += 4; ctx.fillText('Cocina Casera', width/2, y); y += 10;
      ctx.font = smallFont; y += 20; ctx.fillText('(Uso interno - No es factura DIAN)', width/2, y); y += 14;
      // Separador
      y += 10; line(ctx, y); y += 16;

      // Info del pedido
      ctx.textAlign = 'left';
      ctx.font = normalFont;
      const entregaTexto = deliveryTime || 'lo más pronto posible';
      y = wrapText(ctx, `Tipo: ${tipo}`, margin, y, inner, 28) + 6;
      y = wrapText(ctx, `Pago: ${pago}`, margin, y, inner, 28) + 6;
      y = wrapText(ctx, `Total: $${total}`, margin, y, inner, 28) + 6;
      y = wrapText(ctx, `Fecha: ${fecha}`, margin, y, inner, 28) + 6;
      y = wrapText(ctx, `Entrega: ${entregaTexto}`, margin, y, inner, 28) + 12;

      // Separador
      line(ctx, y); y += 16;

      // Dirección
      const addrLines = formatAddressForTicket(direccion);
      y = wrapText(ctx, `Dirección: ${addrLines.line1 || 'N/A'}`, margin, y, inner, 28) + 6;
      if (addrLines.line2) { y = wrapText(ctx, `          ${addrLines.line2}`, margin, y, inner, 28) + 6; }
      if (barrio) y = wrapText(ctx, `Barrio: ${barrio}`, margin, y, inner, 28) + 6;
      y = wrapText(ctx, `Teléfono: ${telefono || 'N/A'}`, margin, y, inner, 28) + 6;
      if (detalles) y = wrapText(ctx, `Detalles: ${detalles}`, margin, y, inner, 28) + 10;

      // Separador
      line(ctx, y); y += 18;

      // Resumen
      ctx.font = subtitleFont;
      y = wrapText(ctx, 'Resumen del Pedido', margin, y, inner, 26) + 8;
      ctx.font = normalFont;
      y = wrapText(ctx, `${isBreakfast ? order.breakfasts.length : order.meals.length} ${isBreakfast ? 'desayunos' : 'almuerzos'} en total`, margin, y, inner, 28) + 10;

      if (!isBreakfast && Array.isArray(order.meals)) {
        // Duplicamos la lógica de comunes y diferencias simplificada
        const groupedMeals = [];
        order.meals.forEach((meal, index) => {
          const existing = groupedMeals.find(g => areMealsIdentical(g.meal, meal));
          if (existing) { existing.count++; existing.indices.push(index+1); }
          else groupedMeals.push({ meal, count:1, indices:[index+1] });
        });
        const allMeals = groupedMeals.map(g => g.meal);
        const first = allMeals[0] || {};
        const every = (pred) => allMeals.every(pred);
        const intersection = (arrs) => arrs.reduce((acc, cur) => acc.filter(x => cur.includes(x)), (arrs[0]||[]));
        const common = {};
        if (every(m => (m.soup?.name||'') === (first.soup?.name||'') && m.soup?.name && m.soup.name !== 'Sin sopa')) common.soup = first.soup.name;
        if (every(m => (m.soupReplacement?.name||'') === (first.soupReplacement?.name||'')) && first.soupReplacement?.name) common.soupReplacement = first.soupReplacement.name;
        if (every(m => (m.principleReplacement?.name||'') === (first.principleReplacement?.name||'')) && first.principleReplacement?.name) common.principleReplacement = first.principleReplacement.name;
        if (every(m => (m.protein?.name||'') === (first.protein?.name||'')) && first.protein?.name) common.protein = first.protein.name;
        if (every(m => (m.drink?.name||'') === (first.drink?.name||'')) && first.drink?.name) common.drink = (first.drink.name === 'Juego de mango' ? 'Jugo de mango' : first.drink.name);
        if (every(m => m.cutlery === first.cutlery)) common.cutlery = !!first.cutlery;
        if (every(m => Array.isArray(m.principle))) {
          const sets = allMeals.map(m => (m.principle||[]).map(p=>p.name).filter(n=>n && !/remplazo/i.test(n)));
          const inter = intersection(sets);
          if (inter && inter.length) common.principle = inter;
        }
        if (every(m => Array.isArray(m.sides))) {
          const sets = allMeals.map(m => (m.sides||[]).map(s=>s.name).filter(Boolean));
          const inter = intersection(sets);
          if (inter && inter.length) common.sides = inter;
        }
        const totalPrice = order.total || groupedMeals.reduce((sum, g) => sum + (Number(g.meal.price||0) * g.count), 0);
        y = wrapText(ctx, `🍽 ${order.meals.length} Almuerzos – $${Number(totalPrice||0).toLocaleString('es-CO')} (${pago})`, margin, y, inner, 28) + 6;
        if (common.soup) y = wrapText(ctx, `• ${common.soup}`, margin, y, inner, 28) + 4;
        if (common.soupReplacement) y = wrapText(ctx, `• ${common.soupReplacement} (por sopa)`, margin, y, inner, 28) + 4;
        if (Array.isArray(common.principle) && common.principle.length) {
          const ptxt = common.principle.join(', ');
          const mixto = common.principle.length > 1 ? ' (mixto)' : '';
          y = wrapText(ctx, `• ${ptxt}${mixto}`, margin, y, inner, 28) + 4;
        }
        if (common.principleReplacement) y = wrapText(ctx, `• ${common.principleReplacement} (por principio)`, margin, y, inner, 28) + 4;
        if (common.protein) y = wrapText(ctx, `• ${common.protein}`, margin, y, inner, 28) + 4;
        if (common.drink) y = wrapText(ctx, `• ${common.drink}`, margin, y, inner, 28) + 4;
        y = wrapText(ctx, `• Cubiertos: ${common.cutlery ? 'Sí' : 'No'}`, margin, y, inner, 28) + 4;
        if (Array.isArray(common.sides) && common.sides.length) y = wrapText(ctx, `• Acompañamientos: ${common.sides.join(', ')}`, margin, y, inner, 28) + 6;
        if (groupedMeals.length > 1) {
          y += 6; ctx.font = subtitleFont; y = wrapText(ctx, 'Diferencias:', margin, y, inner, 26) + 6; ctx.font = normalFont;
          groupedMeals.forEach(group => {
            const m = group.meal; const idxText = group.indices.join(', ');
            y = wrapText(ctx, `* Almuerzo ${idxText}:`, margin, y, inner, 28) + 4;
            const diffs = [];
            if ((m.soup?.name && m.soup.name !== common.soup && m.soup.name !== 'Sin sopa') || (m.soupReplacement?.name && m.soupReplacement.name !== common.soupReplacement)) {
              if (m.soupReplacement?.name) diffs.push(`${m.soupReplacement.name} (por sopa)`);
              else if (m.soup?.name && m.soup.name !== 'Sin sopa') diffs.push(m.soup.name);
            }
            const mPrinciples = (m.principle||[]).map(p=>p.name).filter(n=>n && !/remplazo/i.test(n));
            if (Array.isArray(common.principle)) {
              const diffP = mPrinciples.filter(x => !common.principle.includes(x));
              if (diffP.length) diffs.push(`${diffP.join(', ')}${diffP.length>1?' (mixto)':''}`);
            } else if (mPrinciples.length) diffs.push(`${mPrinciples.join(', ')}${mPrinciples.length>1?' (mixto)':''}`);
            if (m.principleReplacement?.name && m.principleReplacement.name !== common.principleReplacement) diffs.push(`${m.principleReplacement.name} (por principio)`);
            const specialRice = Array.isArray(m.principle) && m.principle.some(p => ['Arroz con pollo','Arroz paisa','Arroz tres carnes'].includes(p.name));
            if (!specialRice) {
              if (m.protein?.name && m.protein.name !== common.protein) diffs.push(m.protein.name);
            }
            if (Array.isArray(m.sides)) {
              const sidesM = m.sides.map(s=>s.name).filter(Boolean);
              if (!Array.isArray(common.sides) || sidesM.join('|') !== (common.sides||[]).join('|')) {
                if (sidesM.length) diffs.push(`Acompañamientos: ${sidesM.join(', ')}`);
                const excluded = getExcludedSides(m, allSides);
                if (excluded.length) diffs.push(`No incluir: ${excluded.join(', ')}`);
              }
            }
            if (Array.isArray(m.additions) && m.additions.length) m.additions.forEach(a => diffs.push(`+ ${a.name}${a.protein ? ' (' + a.protein + ')' : ''} (${a.quantity || 1})`));
            if (m.notes && m.notes.trim()) diffs.push(`Notas: ${m.notes}`);
            if (!diffs.length) diffs.push('Sin diferencias');
            diffs.forEach(d => { y = wrapText(ctx, `  - ${d}`, margin, y, inner, 28) + 2; });
            y += 4;
          });
        }
      } else if (isBreakfast && Array.isArray(order.breakfasts)) {
        order.breakfasts.forEach((b, idx) => {
          ctx.font = subtitleFont; y = wrapText(ctx, `DESAYUNO ${idx+1}:`, margin, y, inner, 26) + 4; ctx.font = normalFont;
          const bTotal = calculateBreakfastPrice({ ...b, orderType: 'table' }, 3);
          y = wrapText(ctx, `🍽 1 Desayuno – $${bTotal.toLocaleString('es-CO')} (${pago})`, margin, y, inner, 28) + 6;
          const pick = (v) => typeof v === 'string' ? v : (v?.name || '');
          if (b.type) y = wrapText(ctx, `• ${pick(b.type)}`, margin, y, inner, 28) + 2;
          if (b.broth) y = wrapText(ctx, `• ${pick(b.broth)}`, margin, y, inner, 28) + 2;
          if (b.eggs) y = wrapText(ctx, `• ${pick(b.eggs)}`, margin, y, inner, 28) + 2;
          if (b.riceBread) y = wrapText(ctx, `• ${pick(b.riceBread)}`, margin, y, inner, 28) + 2;
          if (b.protein) y = wrapText(ctx, `• ${pick(b.protein)}`, margin, y, inner, 28) + 2;
          if (b.drink) y = wrapText(ctx, `• ${pick(b.drink)}`, margin, y, inner, 28) + 2;
          if (Array.isArray(b.additions) && b.additions.length) {
            y = wrapText(ctx, '• Adiciones:', margin, y, inner, 28) + 2;
            b.additions.forEach(a => { y = wrapText(ctx, `  - ${a.name} (${a.quantity || 1})`, margin, y, inner, 28) + 2; });
          }
          y = wrapText(ctx, `• Cubiertos: ${b.cutlery === true ? 'Sí' : 'No'}`, margin, y, inner, 28) + 2;
          if (b.notes && b.notes.trim()) y = wrapText(ctx, `• Notas: ${b.notes}`, margin, y, inner, 28) + 2;
          if (idx < order.breakfasts.length - 1) { y += 6; ctx.fillRect(margin, y, inner, 2); y += 10; }
        });
      }

      // Separador
      y += 8; line(ctx, y); y += 22;

      // Mensaje final
      ctx.textAlign = 'center';
      ctx.font = subtitleFont; y = wrapText(ctx, 'Gracias por pedir en Cocina Casera', margin, y, inner, 26) + 4;
      ctx.font = normalFont; y = wrapText(ctx, 'Te esperamos mañana con un', margin, y, inner, 28) + 2;
      y = wrapText(ctx, 'nuevo menú.', margin, y, inner, 28) + 8;
      y = wrapText(ctx, 'Escríbenos al 301 6476916', margin, y, inner, 28) + 2;
      y = wrapText(ctx, 'Calle 133#126c-09', margin, y, inner, 28) + 12;

      // QR
      let qrUrl = '';
      try { qrUrl = await generateQRCode(); } catch {}
      if (qrUrl) {
        const img = new Image();
        await new Promise(res => { img.onload = res; img.onerror = res; img.src = qrUrl; });
        const size = 280;
        ctx.drawImage(img, (width - size)/2, y, size, size);
        y += size + 8;
      }

      // Recortar y entregar canvas
      const outCanvas = document.createElement('canvas');
      outCanvas.width = width; outCanvas.height = y + 40; // margen inferior
      const octx = outCanvas.getContext('2d');
      octx.drawImage(canvas, 0, 0, width, y + 40, 0, 0, width, y + 40);
      return outCanvas;
    };

    // Convertir canvas a ESC/POS raster (GS v 0) como string binario
    const canvasToEscPosRaster = (canvas, { threshold = 180, align = 'left' } = {}) => {
      const ESC = '\x1B';
      const GS = '\x1D';
      const ctx = canvas.getContext('2d');
      const w = canvas.width; const h = canvas.height;
      const img = ctx.getImageData(0, 0, w, h);
      const bytesPerRow = Math.ceil(w / 8);
      const data = new Uint8Array(bytesPerRow * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
          const lum = 0.299*r + 0.587*g + 0.114*b;
          const byteIndex = y * bytesPerRow + (x >> 3);
          const bit = 7 - (x & 7);
          if (lum < threshold) data[byteIndex] |= (1 << bit); // negro = 1
        }
      }
      const xL = String.fromCharCode(bytesPerRow & 0xff);
      const xH = String.fromCharCode((bytesPerRow >> 8) & 0xff);
      const yL = String.fromCharCode(h & 0xff);
      const yH = String.fromCharCode((h >> 8) & 0xff);
      let out = '';
      // Inicial y alineación
      out += ESC + '@';
      if (align === 'center') out += ESC + 'a' + '\x01';
      else if (align === 'right') out += ESC + 'a' + '\x02';
      else out += ESC + 'a' + '\x00';
      // Comando raster
      out += GS + 'v' + '0' + '\x00' + xL + xH + yL + yH;
      out += Array.from(data).map(n => String.fromCharCode(n)).join('');
      // Restaurar alineación
      out += ESC + 'a' + '\x00';
      return out;
    };

    // Imprimir con logo
  // Desactivar modo gráfico por defecto para evitar problemas de raster en algunos modelos.
  // Solo se activa si explícitamente se define localStorage.useGraphicTicket = '1'.
  const useGraphicTicket = (typeof localStorage !== 'undefined' && localStorage.getItem('useGraphicTicket') === '1');
    if (useGraphicTicket) {
      // Generar canvas del ticket y mandarlo como raster ESC/POS directo (sin usar printWithImage)
      const ticketCanvas = await renderTicketCanvas();
      const raster = canvasToEscPosRaster(ticketCanvas, { threshold: 180, align: 'left' });
      const cut = '\x1D' + 'V' + '\x41' + '\x03'; // corte parcial
      const feed = '\n\n\n';
      await PrinterPlugin.printTCP({
        ip: currentPrinterIp,
        port: currentPrinterPort,
        data: raster + feed + cut
      });
    } else {
      // Camino anterior: texto ESC/POS + logo circular en encabezado
      const thermalData = generateThermalReceipt();
      const logoBase64 = await getLogoBase64();
      if (logoBase64) {
        await PrinterPlugin.printWithImage({ ip: currentPrinterIp, port: currentPrinterPort, data: thermalData, imageBase64: logoBase64 });
      } else {
        await PrinterPlugin.printTCP({ ip: currentPrinterIp, port: currentPrinterPort, data: thermalData });
      }
    }
    
    console.log('✅ TablaPedidos: Recibo de domicilio impreso en impresora térmica');
    
    // Mostrar mensaje de éxito (opcional)
    if (typeof window !== 'undefined' && window.alert) {
      alert('✅ Recibo impreso correctamente');
    }
    
    return; // Salir aquí después de imprimir exitosamente
    
  } catch (error) {
    console.warn('⚠️ TablaPedidos: Fallo impresión térmica:', error);

    // Fallback: impresión web con formato bonito (similar a imagen)
    try {
      qrCodeDataUrl = await generateQRCode();
    } catch (e) {
      // ignorar
    }

  const win = window.open('', 'PRINT', 'height=900,width=480');
    const entregaTexto = deliveryTime || 'lo más pronto posible';
    const htmlResumen = resumen || '';
    const logoUrl = '/logo.png';
    win.document.write(`
      <html>
        <head>
          <title>Recibo</title>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, 'Noto Sans', 'Helvetica Neue', sans-serif; margin: 0; padding: 16px; color: #111; }
            .ticket { width: 360px; margin: 0 auto; }
            .center { text-align: center; }
            .muted { color: #555; font-size: 12px; }
            .title { font-weight: 800; font-size: 18px; margin: 4px 0; }
            .line { height: 1px; background:#e5e7eb; margin: 10px 0; }
            .row { margin: 4px 0; }
            .label { font-weight: 600; }
            .qr { margin-top: 12px; text-align: center; }
            .foot { margin-top: 10px; font-size: 12px; text-align: center; }
            img.logo { width: 96px; height: 96px; object-fit: cover; border-radius: 9999px; display:block; margin: 0 auto 4px; background:#fff; }
            img.qr { width: 140px; height: 140px; }
          </style>
        </head>
        <body>
          <div class="ticket">
            <div class="center">
              <img class="logo" src="${logoUrl}" onerror="this.style.display='none'" />
              <div class="title">Cocina Casera</div>
              <div class="muted">(Uso interno - No es factura DIAN)</div>
            </div>
            <div class="line"></div>
            <div class="row"><span class="label">Tipo:</span> ${tipo}</div>
            <div class="row"><span class="label">Pago:</span> ${pago}</div>
            <div class="row"><span class="label">Total:</span> $${total}</div>
            <div class="row"><span class="label">Fecha:</span> ${fecha}</div>
            <div class="row"><span class="label">Entrega:</span> ${entregaTexto}</div>
            <div class="line"></div>
            <div class="row"><span class="label">Dirección:</span> ${direccion || ''}</div>
            ${barrio ? `<div class="row"><span class="label">Barrio:</span> ${barrio}</div>` : ''}
            <div class="row"><span class="label">Teléfono:</span> ${telefono || ''}</div>
            ${detalles ? `<div class="row"><span class="label">Detalles:</span> ${detalles}</div>` : ''}
            <div class="line"></div>
            <div class="row" style="font-weight:700;">✅ Resumen del Pedido</div>
            ${htmlResumen}
            <div class="line"></div>
            <div class="center">
              <div>Gracias por pedir en Cocina Casera</div>
              <div>Te esperamos mañana con un nuevo menú.</div>
              <div>Escríbenos al 301 6476916</div>
              <div>Calle 133#126c-09</div>
            </div>
            <div class="qr">
              <div>Escanea este código QR para unirte</div>
              <div>a nuestro canal de WhatsApp</div>
              <div>y recibir nuestro menú diario:</div>
              ${qrCodeDataUrl ? `<img class="qr" src="${qrCodeDataUrl}" />` : ''}
            </div>
          </div>
          <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300); };</script>
        </body>
      </html>
    `);
    win.document.close();
    return;
  }
};

// Firestore para persistir pagos
import { INGRESOS_COLLECTION } from './dashboardConstants';

/* ===========================
   Helpers de resumen (in-file)
   =========================== */

const normKey = (s) => (s || '').toString().trim().toLowerCase();
const normalizePaymentMethodKey = (method) => {
  const raw = normKey(
    typeof method === 'string'
      ? method
      : method?.name || method?.label || method?.title || method?.method || method?.type || ''
  );
  if (raw.includes('efect')) return 'cash';
  if (raw.includes('cash')) return 'cash';
  if (raw.includes('nequi')) return 'nequi';
  if (raw.includes('davi')) return 'daviplata';
  return 'other';
};

const paymentsRowsFromOrder = (order, fallbackBuilder) => {
  // Verificar si es un pedido de desayuno para usar calculateCorrectBreakfastTotal
  const isBreakfast = order.type === 'breakfast' || Array.isArray(order?.breakfasts);
  
  // Usar calculateCorrectBreakfastTotal para pedidos de desayuno
  const total = isBreakfast 
    ? Math.floor(calculateCorrectBreakfastTotal(order)) 
    : Math.floor(Number(order?.total || 0)) || 0;

  console.log('🔍 DEBUG paymentsRowsFromOrder:', {
    orderId: order?.id?.slice(-4),
    hasPayments: Array.isArray(order?.payments),
    paymentsLength: order?.payments?.length,
    payments: order?.payments,
    total: total,
    isBreakfast: isBreakfast
  });

  // Prefer `paymentLines` (canonical) over `payments`
  const candidateLines = Array.isArray(order?.paymentLines) && order.paymentLines.length ? order.paymentLines : (Array.isArray(order?.payments) && order.payments.length ? order.payments : null);
  if (candidateLines && candidateLines.length) {
    const linesSource = candidateLines;
    if (isBreakfast) {
      const originalTotal = linesSource.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (originalTotal > 0 && originalTotal !== total) {
        const ratio = total / originalTotal;
        const result = linesSource.map((p) => ({ methodKey: normalizePaymentMethodKey(p.method), amount: Math.floor((Number(p.amount || 0) * ratio)) || 0 }));
        console.log('✅ Using adjusted payment lines for breakfast:', result);
        return result;
      }
    }
    const result = linesSource.map((p) => ({ methodKey: normalizePaymentMethodKey(p.method), amount: Math.floor(Number(p.amount || 0)) || 0 }));
    console.log('✅ Using payment lines/payments:', result);
    return result;
  }

  const fb = typeof fallbackBuilder === 'function' ? (fallbackBuilder(order) || []) : [];
  if (fb.length) {
    const result = fb.map((p) => ({
      methodKey: normalizePaymentMethodKey(p.method),
      amount: Math.floor(Number(p.amount || 0)) || 0,
    }));
    console.log('⚠️ Using fallback:', result);
    return result;
  }

  console.log('❌ Using default other:', [{ methodKey: 'other', amount: total }]);
  return [{ methodKey: 'other', amount: total }];
};

const sumPaymentsByDeliveryAndType = (orders, { fallbackBuilder, filter } = {}) => {
  const acc = {};
  const ensureBucket = (person, bucket) => {
    acc[person] = acc[person] || {};
    acc[person][bucket] = acc[person][bucket] || { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 };
    return acc[person][bucket];
  };
  const bump = (obj, methodKey, amount) => {
    if (!amount) return;
    obj[methodKey] = (obj[methodKey] || 0) + amount;
    obj.total += amount;
  };

  (orders || [])
    .filter(order => !filter || filter(order))
    .forEach((order) => {
    const person = String(order?.deliveryPerson || 'JUAN').trim(); // default "JUAN" si no hay asignado
    const isBreakfast = Array.isArray(order?.breakfasts) || order?.type === 'breakfast';
    const bucket = isBreakfast ? 'breakfast' : 'lunch';
    const rows = paymentsRowsFromOrder(order, fallbackBuilder);
    const byType = ensureBucket(person, bucket);
    const byTotal = ensureBucket(person, 'total');
    rows.forEach(({ methodKey, amount }) => {
      bump(byType, methodKey, amount);
      bump(byTotal, methodKey, amount);
    });
  });

  return acc;
};

const money = (n) => `$${Math.floor(n || 0).toLocaleString('es-CO')}`;
// === NUEVO: mostrar solo método(s) sin montos ===
const methodLabel = (k) =>
  k === 'cash' ? 'Efectivo' : k === 'nequi' ? 'Nequi' : k === 'daviplata' ? 'Daviplata' : '';

// Función para obtener las clases de color según el método de pago
const getPaymentMethodColorClass = (method) => {
  switch (method) {
    case 'cash':
      return 'text-green-600 dark:text-green-400'; // Verde para Efectivo
    case 'daviplata':
      return 'text-red-600 dark:text-red-400'; // Rojo para Daviplata
    case 'nequi':
      return 'text-blue-600 dark:text-blue-400'; // Azul para Nequi
    default:
      return 'text-gray-600 dark:text-gray-400'; // Color por defecto
  }
};

const paymentMethodsOnly = (order) => {
  const rows = paymentsRowsFromOrder(order, defaultPaymentsForOrder);
  console.log('🔍 DEBUG paymentMethodsOnly:', {
    orderId: order?.id?.slice(-4),
    order: order,
    payments: order?.payments,
    rows: rows,
    legacy: {
      payment: order?.payment,
      paymentMethod: order?.paymentMethod,
      mealPayment: order?.meals?.[0]?.payment,
      mealPaymentMethod: order?.meals?.[0]?.paymentMethod,
    }
  });
  
  const names = [...new Set(rows.map((r) => methodLabel(r.methodKey)).filter(Boolean))];
  if (names.length) return names.join(' + ');

  const legacy =
    order?.payment ||
    order?.paymentMethod ||
    order?.meals?.[0]?.payment?.name ||
    order?.meals?.[0]?.paymentMethod ||
    order?.breakfasts?.[0]?.payment?.name ||
    order?.breakfasts?.[0]?.paymentMethod || '';
  return String(legacy).trim() || 'Sin pago';
};

// Función para migrar direcciones del formato antiguo al nuevo (para visualización)
const migrateOldAddressForDisplay = (address) => {
  if (!address) return {};
  
  // Si ya tiene el formato nuevo (con campo details Y neighborhood), devolverlo tal como está
  if (address.details !== undefined && address.neighborhood !== undefined) {
    return address;
  }
  
  let migratedAddress = { ...address };
  let extractedDetails = '';
  
  // FORMATO ANTIGUO detectado - aplicar migración para display
  if (address.addressType !== undefined && !address.neighborhood) {
    console.log('📦 FORMATO ANTIGUO detectado para display, migrando...');
    
    // Estrategia 1: Buscar patrones de nombres en el campo address
    if (address.address && typeof address.address === 'string') {
      const addressText = address.address;
      
      // Buscar patrones como "(Gabriel maria)" o "- Gabriel maria" o "Gabriel maria" al final
      const patterns = [
        /\(([^)]+)\)\s*$/,  // (Gabriel maria) al final
        /-\s*([^-]+)\s*$/,  // - Gabriel maria al final  
        /,\s*([^,]+)\s*$/,   // , Gabriel maria al final
        /\s+([A-Za-z\s]{3,})\s*$/  // Palabras al final (nombres)
      ];
      
      for (const pattern of patterns) {
        const match = addressText.match(pattern);
        if (match && match[1] && match[1].trim().length > 2) {
          const potential = match[1].trim();
          // Verificar que no sea parte de la dirección (números, #, etc.)
          if (!/[0-9#-]/.test(potential) && potential.length > 2) {
            extractedDetails = potential;
            // Remover las instrucciones de la dirección principal para display
            migratedAddress.address = addressText.replace(pattern, '').trim();
            break;
          }
        }
      }
    }
    
    // Estrategia 2: Revisar campos de nombre que pueden contener instrucciones
    if (!extractedDetails) {
      const nameFields = ['recipientName', 'localName', 'unitDetails'];
      for (const field of nameFields) {
        if (address[field] && typeof address[field] === 'string' && address[field].trim()) {
          // Si parece ser una instrucción (no un tipo de dirección estándar)
          const value = address[field].trim();
          if (value.length > 2 && !['casa', 'apartamento', 'oficina', 'shop', 'house', 'school'].includes(value.toLowerCase())) {
            extractedDetails = value;
            break;
          }
        }
      }
    }
    
    // Agregar las instrucciones extraídas al campo details
    if (extractedDetails) {
      migratedAddress.details = extractedDetails;
      console.log('🔄 Migración de dirección para display:', {
        orderId: 'display',
        original: address,
        extractedDetails
      });
    }
  }
  
  return migratedAddress;
};

/* =======================
   Component principal
   ======================= */

const TablaPedidos = ({
  theme,
  orders: rawOrders,
  searchTerm,
  setSearchTerm,
  totals, // puede venir del padre; si no, calculamos localmente con split
  isLoading,
  currentPage,
  totalPages,
  setCurrentPage,
  itemsPerPage,
  setItemsPerPage,
  deliveryPersons,
  handleEditOrder,
  handleDeleteOrder,
  handleStatusChange,
  handleSort,
  getSortIcon,
  setShowMealDetails,
  editingDeliveryId,
  setEditingDeliveryId,
  editForm,
  setEditForm,
  handleDeliveryChange,
  sortOrder,
  totalOrders,
  showProteinModal,
  setShowProteinModal,
  isMenuOpen,
  setIsMenuOpen,
  handleOpenPreview,
  handleOpenExcelPreview,
  handleExport,
  handleDeleteAllOrders,
  setShowConfirmDeleteAll,
  exportToExcel,
  exportToPDF,
  exportToCSV,
  setShowAddOrderModal,
  orderTypeFilter,
  setOrderTypeFilter,
  uniqueDeliveryPersons,
  selectedDate,
  setSelectedDate,
  permissions,
}) => {
  const menuRef = useRef(null);
  const [deliveryDraft, setDeliveryDraft] = useState('');
  // Estado para cargar todos los acompañamientos disponibles
  const [allSides, setAllSides] = useState([]);
  // El filtro de fecha y su setter ahora vienen del padre
  const lastAssignedRef = useRef('');

    // Filtrado reactivo de órdenes por fecha y búsqueda
  // ...existing code...

  // El array de órdenes ya viene filtrado por fecha desde el padre
  const orders = rawOrders;
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return orders.slice(startIndex, endIndex);
  }, [orders, currentPage, itemsPerPage]);

  const currentDate = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const displayDate = selectedDate
    ? new Date(selectedDate.replace(/-/g, '/')).toLocaleDateString('es-CO', { weekday: 'long', month: 'long', day: 'numeric' })
    : currentDate;

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen, setIsMenuOpen]);

  // Cargar acompañamientos para poder derivar "No Incluir"
  useEffect(() => {
    const unsubSides = onSnapshot(collection(db, 'sides'), (snapshot) => {
      setAllSides(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubSides();
  }, []);

  /* ===== Toast flotante estilo “éxito” ===== */
  const [toast, setToast] = useState(null); // { type: 'success'|'warning'|'error', text: string }
  const toastTimer = useRef(null);
  const showToast = (type, text) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  // ====== Split de pagos: estado para modal local ======
  const [editingPaymentsOrder, setEditingPaymentsOrder] = useState(null);

  // Permisos (por defecto: vista admin completa)
  const perms = useMemo(() => ({
    canEditOrder: true,
    canDeleteOrder: true,
    canEditPayments: true,
    canPrint: true,
    canLiquidate: true,
    showProteinModalButton: true,
    showMenuGenerateOrder: true,
    showPreviews: true,
    showExport: true,
    showDeleteAll: true,
    showResumen: true,
    ...(permissions || {}),
  }), [permissions]);

  // ✅ Incluye tus colecciones reales
  const EXTRA_COLLECTIONS = [
    'orders',
    'deliveryOrders',
    'tableOrders',
    'deliveryBreakfastOrders', // <— importante para desayunos
    'breakfastOrders',
    'domicilioOrders'
  ];

  // ✅ Heurística afinada a tus nombres reales
  const resolveCollectionName = (order) => {
    if (order?.__collection) return order.__collection;
    if (order?.collectionName) return order.collectionName;

    const isBreakfast =
      order?.type === 'breakfast' ||
      Array.isArray(order?.breakfasts);

    if (isBreakfast) return 'deliveryBreakfastOrders';
    return 'orders'; // almuerzos
  };

  // ✅ Busca la orden probando todas las variantes conocidas
  const findExistingOrderRef = async (order) => {
    const id = order?.id;
    if (!id) throw new Error('Order sin id');

    const preferred = [];
    if (order?.__collection) preferred.push(order.__collection);
    if (order?.collectionName && order?.collectionName !== order?.__collection) {
      preferred.push(order.collectionName);
    }

    const guess = resolveCollectionName(order);
    const BASE = ['orders', 'deliveryOrders', 'tableOrders', 'deliveryBreakfastOrders', 'breakfastOrders'];
    const orderedBase = [guess, ...BASE.filter((c) => c !== guess)];

    const candidates = [
      ...preferred.filter(Boolean),
      ...orderedBase,
      ...EXTRA_COLLECTIONS,
    ].filter((v, i, a) => !!v && a.indexOf(v) === i); // únicos

    for (const col of candidates) {
      const ref = doc(db, col, id);
      const snap = await getDoc(ref);
      if (snap.exists()) return ref;
    }

    return null;
  };

  const savePaymentsForOrder = async (order, payments) => {
    console.log('🔍 [DEBUG] savePaymentsForOrder llamado con:', {
      orderId: order?.id,
      currentStatus: order?.status,
      isAdmin: window.location.pathname.includes('admin'),
      isDomiciliario: window.location.pathname.includes('domiciliario')
    });
    
    const sum = (payments || []).reduce(
      (a, b) => a + (Math.floor(Number(b.amount || 0)) || 0),
      0
    );
    const total = Math.floor(Number(order.total || 0)) || 0;

    if (sum !== total) {
      showToast(
        'warning',
        `La suma de pagos (${sum.toLocaleString('es-CO')}) no coincide con el total (${total.toLocaleString('es-CO')}).`
      );
      return false;
    }

    const ref = await findExistingOrderRef(order);
    if (!ref) {
      showToast(
        'error',
        'No se pudo guardar los pagos: la orden no existe en una colección conocida.'
      );
      return false;
    }

    const lines = (payments || []).map((p) => ({
      method: typeof p.method === 'string' ? p.method : p?.method?.name || '',
      amount: Math.floor(Number(p.amount || 0)) || 0,
      note: p.note || '',
    }));

    const totalAmount = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

    // Construir payload que refleje un pago completo (sin cambiar el estado)
    const payload = {
      payments: lines,
      paymentLines: lines,
      paymentAmount: totalAmount,
      isPaid: true,
      paymentDate: serverTimestamp ? serverTimestamp() : new Date(),
      updatedAt: new Date(),
    };

    // Si solo hay una línea y su método existe, setear paymentMethod
    if (lines.length === 1) payload.paymentMethod = lines[0].method;

    console.log('🔍 [DEBUG] Payload a enviar:', payload);

    try {
      await updateDoc(ref, payload);
      showToast('success', 'Pagos actualizados y orden marcada como pagada correctamente.');
      return true;
    } catch (e) {
      console.error('[Pagos] updateDoc error', e);
      const code = e?.code || '';
      if (code === 'permission-denied') {
        showToast('error', 'Permisos insuficientes para guardar pagos.');
      } else {
        showToast('error', 'No se pudo guardar los pagos.');
      }
      return false;
    }
  };

  // Totales superiores (tiles) - Muestra todos los totales
  const totalsDisplay = useMemo(() => {
    const acc = { cash: 0, nequi: 0, daviplata: 0, other: 0, total: 0 };
    const isActive = (o) => !/(cancel|canelad)/i.test((o?.status || '')); // ignora cancelados

    (orders || []).filter(isActive).forEach((order) => {
      // Detectar si es un pedido de desayuno
      const isBreakfast = order.type === 'breakfast' || Array.isArray(order?.breakfasts);
      
      // Para los métodos específicos
      if (order.payments && Array.isArray(order.payments)) {
        // Si es un pedido de desayuno, recalculamos el total usando la función correcta
        let totalAmount = 0;
        if (isBreakfast) {
          totalAmount = calculateCorrectBreakfastTotal(order);
          // Si el total actual es diferente del recalculado, ajustamos proporcionalmente
          const currentTotal = order.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          if (currentTotal > 0 && currentTotal !== totalAmount) {
            const ratio = totalAmount / currentTotal;
            order.payments.forEach(payment => {
              const methodKey = normalizePaymentMethodKey(payment.method);
              const amount = Math.floor((Number(payment.amount || 0) * ratio)) || 0;
              if (amount <= 0) return;
              
              acc[methodKey] = (acc[methodKey] || 0) + amount;
              acc.total += amount;
            });
          } else {
            // Si no hay diferencia, procesamos normalmente
            order.payments.forEach(payment => {
              const methodKey = normalizePaymentMethodKey(payment.method);
              const amount = Math.floor(Number(payment.amount || 0)) || 0;
              if (amount <= 0) return;
              
              acc[methodKey] = (acc[methodKey] || 0) + amount;
              acc.total += amount;
            });
          }
        } else {
          // No es desayuno, procesamos normalmente
          order.payments.forEach(payment => {
            const methodKey = normalizePaymentMethodKey(payment.method);
            const amount = Math.floor(Number(payment.amount || 0)) || 0;
            if (amount <= 0) return;
            
            acc[methodKey] = (acc[methodKey] || 0) + amount;
            acc.total += amount;
          });
        }
      } else {
        // Estructura antigua
        const methodKey = normalizePaymentMethodKey(order.payment || order.paymentMethod);
        // Si es desayuno, calculamos el total correcto
        const amount = isBreakfast 
          ? Math.floor(calculateCorrectBreakfastTotal(order)) || 0
          : Math.floor(Number(order.total || 0)) || 0;
        
        if (amount <= 0) return;
        
        acc[methodKey] = (acc[methodKey] || 0) + amount;
        acc.total += amount;
      }
    });
    
    return acc;
  }, [orders]);

  // ===== Resumen por Domiciliarios (exacto con split) =====
  const resumen = useMemo(
    () => sumPaymentsByDeliveryAndType(orders || [], { 
      fallbackBuilder: defaultPaymentsForOrder,
      // Solo incluir pedidos no liquidados y no cancelados en el resumen
      filter: order => !order.settled && order.status !== 'Cancelado'
    }),
    [orders]
  );
  const resumenPersons = useMemo(
    () => Object.keys(resumen).sort((a, b) => a.localeCompare(b, 'es')),
    [resumen]
  );

  const handleSettle = async (person, buckets) => {
    try {
      const personKey = String(person || '').trim();
      const toSettle = (orders || []).filter((o) => {
        const normalized = String(o?.deliveryPerson || 'JUAN').trim();
        return !o?.settled && normalized === personKey;
      });

      if (!toSettle.length) {
        showToast('warning', `No hay pedidos pendientes para liquidar de ${personKey}.`);
        return;
      }

      // Calcular totales por método de pago
      const totals = {
        cash: 0,
        nequi: 0,
        daviplata: 0
      };

      toSettle.forEach(order => {
        const payments = order.payments || [];
        payments.forEach(payment => {
          const methodKey = normalizePaymentMethodKey(payment.method);
          if (methodKey in totals) {
            totals[methodKey] += Math.floor(Number(payment.amount || 0));
          }
        });
      });

      let ok = 0, fail = 0;

      for (const order of toSettle) {
        const ref = await findExistingOrderRef(order);
        if (!ref) { fail++; continue; }

        try {
          // Determinar qué métodos de pago están presentes
          const payments = order.payments || [];
          const hasPaymentMethod = (method) => 
            payments.some(p => normalizePaymentMethodKey(p.method) === method);
          // Determinar qué métodos están presentes
          const hasNequi = hasPaymentMethod('nequi');
          const hasDaviplata = hasPaymentMethod('daviplata');
          const hasCash = hasPaymentMethod('cash');
          // Construir el objeto de actualización
          const updateData = {
            settledAt: new Date().toISOString(),
          };
          // Marcar como settled y actualizar el estado de liquidación de cada método
          updateData.settled = true;
          updateData.paymentSettled = {
            ...(order.paymentSettled || {}),
            nequi: hasNequi ? true : (order.paymentSettled?.nequi || false),
            daviplata: hasDaviplata ? true : (order.paymentSettled?.daviplata || false),
            cash: hasCash ? true : (order.paymentSettled?.cash || false)
          };
          await updateDoc(ref, updateData);
          // También actualizar el documento de Ingresos para la fecha de la orden
          (async function updateIngresosForOrder(o) {
            try {
              const getOrderISO = (ord) => {
                const ts = ord?.createdAt || ord?.timestamp || ord?.date;
                const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
                if (!d) return null;
                d.setHours(0,0,0,0);
                return d.toISOString().split('T')[0];
              };
              const iso = getOrderISO(o) || new Date().toISOString().split('T')[0];
              const amount = Math.floor(Number(o.total || 0)) || 0;
              if (!amount) return;
              const isBreakfast = (o?.type === 'breakfast') || Array.isArray(o?.breakfasts);
              const categoryKey = isBreakfast ? 'domiciliosDesayuno' : 'domiciliosAlmuerzo';

              const colRef = collection(db, INGRESOS_COLLECTION);
              const q = query(colRef, where('date', '==', iso));
              const snap = await getDocs(q);
              if (!snap.empty) {
                const docRef = doc(db, INGRESOS_COLLECTION, snap.docs[0].id);
                // Intentar incrementar campos existentes (si no existen, setearlos a amount)
                const updates = {
                  ['categories.' + categoryKey]: increment(amount),
                  totalIncome: increment(amount),
                  updatedAt: serverTimestamp(),
                };
                await updateDoc(docRef, updates);
              } else {
                // Crear nuevo registro para la fecha con la categoría adecuada
                const payload = {
                  date: iso,
                  categories: {
                    domiciliosAlmuerzo: isBreakfast ? 0 : amount,
                    domiciliosDesayuno: isBreakfast ? amount : 0,
                    mesasAlmuerzo: 0,
                    mesasDesayuno: 0,
                  },
                  totalIncome: amount,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                };
                await addDoc(colRef, payload);
              }
            } catch (e) {
              console.error('[Ingresos] error al actualizar ingresos por liquidación:', e);
            }
          })(order);
          ok++;
        } catch (e) {
          console.error('[Liquidar] updateDoc error', e);
          fail++;
        }
      }

      if (fail === 0) {
        showToast('success', `Domiciliario liquidado: ${personKey} (${ok} órdenes).`);
      } else {
        showToast('warning', `Liquidado con advertencias: ${personKey}. OK: ${ok}, errores: ${fail}.`);
      }
    } catch (e) {
      console.error('[Liquidar] error general', e);
      showToast('error', 'Ocurrió un error al liquidar.');
    }
  };



  // Reiniciar la página al cambiar la fecha seleccionada
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate]);

  return (
    <>
      {/* TOAST FLOTANTE */}
      {toast && (
        <div className="fixed right-4 top-4 z-[10002]">
          <div
            className={classNames(
              'rounded-xl px-4 py-3 shadow-lg border',
              toast.type === 'success' && 'bg-green-600 text-white border-green-500',
              toast.type === 'warning' && 'bg-yellow-400 text-black border-yellow-300',
              toast.type === 'error' && 'bg-red-600 text-white border-red-500'
            )}
          >
            <span className="font-semibold">{toast.text}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Gestión de Pedidos Domicilios
        </h2>

        {/* Totals Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 text-sm text-gray-700 dark:text-gray-300">
          <div className={classNames('p-3 sm:p-4 rounded-lg shadow-sm', theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
            <p className="font-semibold text-sm sm:text-base">Total Efectivo</p>
            <p className="text-lg sm:text-xl font-bold">${Math.floor(totalsDisplay.cash || 0).toLocaleString('es-CO')}</p>
          </div>
          <div className={classNames('p-3 sm:p-4 rounded-lg shadow-sm', theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
            <p className="font-semibold text-sm sm:text-base">Total Daviplata</p>
            <p className="text-lg sm:text-xl font-bold">${Math.floor(totalsDisplay.daviplata || 0).toLocaleString('es-CO')}</p>
          </div>
          <div className={classNames('p-3 sm:p-4 rounded-lg shadow-sm', theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
            <p className="font-semibold text-sm sm:text-base">Total Nequi</p>
            <p className="text-lg sm:text-xl font-bold">${Math.floor(totalsDisplay.nequi || 0).toLocaleString('es-CO')}</p>
          </div>
          <div className={classNames('p-3 sm:p-4 rounded-lg shadow-sm', theme === 'dark' ? 'bg-gray-700' : 'bg-gray-100')}>
            <p className="font-semibold text-sm sm:text-base">Total General</p>
            <p className="text-lg sm:text-xl font-bold">
              ${Math.floor((totalsDisplay.cash || 0) + (totalsDisplay.daviplata || 0) + (totalsDisplay.nequi || 0)).toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Search, Date Filter, and Menu */}
        <div className="flex flex-wrap justify-center sm:justify-between items-center mb-6 gap-3 sm:gap-4">
          <div className="flex flex-wrap gap-4 items-center flex-1 max-w-3xl">
            <div className="relative w-full">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar pedidos..."
                className={classNames(
                  'pl-10 pr-4 py-2 sm:py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 w-full shadow-sm text-sm sm:text-base transition-all duration-200',
                  theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                )}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2">
            {perms.showProteinModalButton && (
              <button
                onClick={() => setShowProteinModal(true)}
                className={classNames(
                  'flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-shrink-0',
                  theme === 'dark' ? 'bg-gray-600 hover:bg-gray-500 text-white border border-gray-500' : 'bg-gray-200 hover:bg-gray-300 text-gray-900 border border-gray-400'
                )}
              >
                <PlusIcon className="w-4 h-4" />
                <span className="hidden md:inline">Proteínas del Día</span>
              </button>
            )}
            
            <label
              className={classNames(
                'relative flex items-center justify-center gap-2 px-3 py-2 sm:px-5 sm:py-3 rounded-lg text-xs sm:text-sm font-semibold shadow-sm border transition-colors duration-200 flex-shrink-0 cursor-pointer',
                theme === 'dark' ? 'bg-gray-700 text-white border-gray-500' : 'bg-gray-200 text-gray-900 border-gray-400'
              )}
              onClick={(e) => {
                const input = e.currentTarget.querySelector('input[type=date]');
                if (input) input.showPicker();
              }}
            >
              {displayDate}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer bg-transparent"
              />
            </label>
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={classNames('flex items-center justify-center p-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200', 'focus:outline-none focus:ring-2 focus:ring-blue-500')}
                aria-label="Opciones de menú"
              >
                <EllipsisVerticalIcon className={classNames('w-6 h-6', theme === 'dark' ? 'text-gray-200 hover:text-white' : 'text-gray-700 hover:text-gray-900')} />
              </button>
              {isMenuOpen && (
                <div className={classNames('absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50', theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-white text-gray-900')}>
                  <div className="py-1">
                    <button onClick={() => { setOrderTypeFilter('breakfast'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Ver Desayunos</button>
                    <button onClick={() => { setOrderTypeFilter('lunch'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Ver Almuerzos</button>
                    <button onClick={() => { setOrderTypeFilter('all'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Ver Todos</button>
                    {perms.showMenuGenerateOrder && (
                      <button onClick={() => { setShowAddOrderModal(true); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Generar Orden</button>
                    )}
                    {perms.showPreviews && (
                      <>
                        <button onClick={() => { handleOpenPreview(); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Vista Previa PDF</button>
                        <button onClick={() => { handleOpenExcelPreview(); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200">Vista Previa Excel</button>
                      </>
                    )}
                    {perms.showExport && (
                      <>
                        <button onClick={() => { handleExport(exportToExcel, 'Excel'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                          <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Exportar Excel
                        </button>
                        <button onClick={() => { handleExport(exportToPDF, 'PDF'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                          <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Exportar PDF
                        </button>
                        <button onClick={() => { handleExport(exportToCSV, 'CSV'); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 flex items-center">
                          <ArrowDownTrayIcon className="w-4 h-4 mr-2" /> Exportar CSV
                        </button>
                      </>
                    )}
                    {perms.showDeleteAll && (
                      <button onClick={() => { setShowConfirmDeleteAll(true); setIsMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 text-red-500">Eliminar Todos</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className={classNames('p-3 sm:p-4 rounded-2xl shadow-xl max-h-[70vh] overflow-y-auto custom-scrollbar transition-all duration-300', theme === 'dark' ? 'bg-gray-800' : 'bg-white')}>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className={classNames('font-semibold sticky top-0 z-10 shadow-sm', theme === 'dark' ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('orderNumber')}>Nº {getSortIcon('orderNumber')}</th>
                      <th className="p-2 sm:p-3 border-b whitespace-nowrap">Detalles</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('address')}>Dirección {getSortIcon('address')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('phone')}>Teléfono {getSortIcon('phone')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('time')}>Hora {getSortIcon('time')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('payment')}>Pago {getSortIcon('payment')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('total')}>Total {getSortIcon('total')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('deliveryPerson')}>Domiciliario {getSortIcon('deliveryPerson')}</th>
                      <th className="p-2 sm:p-3 border-b cursor-pointer whitespace-nowrap" onClick={() => handleSort('status')}>Estado {getSortIcon('status')}</th>
                      <th className="p-2 sm:p-3 border-b whitespace-nowrap">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="p-6 text-center text-gray-500 dark:text-gray-400">No se encontraron pedidos. Intenta ajustar tu búsqueda o filtros.</td>
                      </tr>
                    ) : (
                      orders.map((order, index) => {
                        const displayNumber =
                          sortOrder === 'asc'
                            ? (currentPage - 1) * itemsPerPage + index + 1
                            : totalOrders - ((currentPage - 1) * itemsPerPage + index);

                        const addressDisplay = getAddressDisplay(order.meals?.[0]?.address || order.breakfasts?.[0]?.address);

                        const rawLegacy = cleanText(
                          order.payment ||
                          order.meals?.[0]?.payment?.name ||
                          order.breakfasts?.[0]?.payment?.name ||
                          'Sin pago'
                        );

                        const paymentDisplay = paymentMethodsOnly(order);

                        const statusClass =
                          order.status === 'Pendiente' ? 'bg-yellow-500 text-black'
                            : order.status === 'Entregado' ? 'bg-green-500 text-white'
                            : order.status === 'Cancelado' ? 'bg-red-500 text-white'
                            : '';

                        const timeValue = order.meals?.[0]?.time || order.breakfasts?.[0]?.time || order.time || null;
                        let displayTime = 'N/A';
                        // timeValue puede ser: string, {name}, Firestore Timestamp, Date, o null
                        if (typeof timeValue === 'string' && timeValue.trim()) {
                          displayTime = timeValue;
                        } else if (timeValue instanceof Date) {
                          displayTime = timeValue.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                        } else if (timeValue && typeof timeValue === 'object') {
                          // Firestore Timestamp tiene toDate(); también aceptamos { name }
                          if (typeof timeValue.toDate === 'function') {
                            try {
                              const d = timeValue.toDate();
                              displayTime = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                            } catch (e) {
                              displayTime = timeValue.name || 'N/A';
                            }
                          } else if (timeValue.name && typeof timeValue.name === 'string') {
                            displayTime = timeValue.name;
                          } else {
                            displayTime = 'N/A';
                          }
                        }
                        // Si no hay time explícito, usar createdAt como fallback (si existe)
                        if ((displayTime === 'N/A' || !displayTime) && order.createdAt) {
                          try {
                            const ca = order.createdAt && typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : (order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
                            displayTime = ca.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                          } catch (e) {
                            // mantener 'N/A' si falla
                          }
                        }

                        return (
                          <tr
                            key={order.id}
                            className={classNames(
                              'border-b transition-colors duration-150',
                              theme === 'dark' ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50',
                              index % 2 === 0 ? (theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50') : ''
                            )}
                          >
                            <td className="p-2 sm:p-3 text-gray-300">{displayNumber}</td>
                            <td className="p-2 sm:p-3 text-gray-300">
                              <button
                                onClick={() => setShowMealDetails(order)}
                                className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm flex items-center"
                                title="Ver detalles de la bandeja"
                              >
                                <InformationCircleIcon className="w-4 h-4 mr-1" />
                                Ver
                              </button>
                            </td>
                            <td className="p-2 sm:p-3 text-gray-300 max-w-[250px] sm:max-w-xs">
                              <DireccionConCronometro order={order} />
                            </td>
                            <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">
                              {order.meals?.[0]?.address?.phoneNumber ||
                                order.breakfasts?.[0]?.address?.phoneNumber ||
                                'N/A'}
                            </td>
                            <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">{displayTime}</td>
                            <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">{paymentDisplay}</td>
                            <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">
                              ${order.type === 'breakfast' 
                                ? calculateCorrectBreakfastTotal(order).toLocaleString('es-CO') 
                                : (order.total?.toLocaleString('es-CO') || '0')}
                            </td>
                            <td className="p-2 sm:p-3 text-gray-300 whitespace-nowrap">
                              {editingDeliveryId === order.id ? (
                                <>
                                  <input
                                    list={`delivery-list-${order.id}`}
                                    value={deliveryDraft}
                                    onChange={(e) => setDeliveryDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        const valueToSave = (deliveryDraft || '').trim() || 'Sin asignar';
                                        handleDeliveryChange(order.id, valueToSave);
                                        if (valueToSave !== 'Sin asignar') lastAssignedRef.current = valueToSave;
                                        setEditingDeliveryId(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingDeliveryId(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      const valueToSave = (deliveryDraft || '').trim() || 'Sin asignar';
                                      handleDeliveryChange(order.id, valueToSave);
                                      if (valueToSave !== 'Sin asignar') lastAssignedRef.current = valueToSave;
                                      setEditingDeliveryId(null);
                                    }}
                                    placeholder="Escribe y Enter…"
                                    className={classNames(
                                      'w-40 p-1 rounded-md border text-sm',
                                      theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-200 bg-white text-gray-900',
                                      'focus:outline-none focus:ring-1 focus:ring-blue-500'
                                    )}
                                    autoFocus
                                  />
                                  <datalist id={`delivery-list-${order.id}`}>
                                    <option value="Sin asignar" />
                                    {uniqueDeliveryPersons.map((person) => (
                                      <option key={person} value={person} />
                                    ))}
                                  </datalist>
                                </>
                              ) : (
                                <span
                                  onClick={() => {
                                    // Si no hay domiciliario asignado (Sin asignar), usar automáticamente el último
                                    const currentDeliveryPerson = order.deliveryPerson?.trim();
                                    const isUnassigned = !currentDeliveryPerson || currentDeliveryPerson === 'Sin asignar';
                                    
                                    if (isUnassigned && lastAssignedRef.current) {
                                      // Auto-asignar el último domiciliario directamente
                                      setDeliveryDraft(lastAssignedRef.current);
                                      setEditingDeliveryId(order.id);
                                      
                                      // Guardar automáticamente con el último domiciliario
                                      setTimeout(() => {
                                        const valueToSave = lastAssignedRef.current.trim();
                                        handleDeliveryChange(order.id, valueToSave);
                                        setEditingDeliveryId(null);
                                        setDeliveryDraft('');
                                      }, 100);
                                    } else {
                                      // Comportamiento normal para editar
                                      const initial = currentDeliveryPerson || lastAssignedRef.current || '';
                                      setDeliveryDraft(initial);
                                      setEditingDeliveryId(order.id);
                                    }
                                  }}
                                  className="cursor-pointer hover:text-blue-400"
                                  title={
                                    (!order.deliveryPerson?.trim() || order.deliveryPerson === 'Sin asignar') && lastAssignedRef.current
                                      ? `Click para auto-asignar: ${lastAssignedRef.current}`
                                      : "Click para editar; Enter para guardar"
                                  }
                                >
                                  {order.deliveryPerson || 'Sin asignar'}
                                </span>
                              )}
                            </td>
                            <td className="p-2 sm:p-3 whitespace-nowrap">
                              <select
                                value={order.status || 'Pendiente'}
                                onChange={async (e) => {
                                  const value = e.target.value;
                                  try {
                                    const maybePromise = handleStatusChange(order.id, value);
                                    if (maybePromise && typeof maybePromise.then === 'function') {
                                      await maybePromise;
                                    }
                                    showToast('success', 'Estado actualizado correctamente.');
                                  } catch (err) {
                                    console.error('[Estado] error al actualizar', err);
                                    showToast('error', 'No se pudo actualizar el estado.');
                                  }
                                }}
                                className={classNames(
                                  'px-2 py-1 rounded-full text-xs font-semibold appearance-none cursor-pointer',
                                  statusClass,
                                  theme === 'dark' ? 'bg-opacity-70' : 'bg-opacity-90',
                                  'focus:outline-none focus:ring-2 focus:ring-blue-500'
                                )}
                              >
                                <option value="Pendiente">Pendiente</option>
                                <option value="En Preparación">En Preparación</option>
                                <option value="En Camino">En Camino</option>
                                <option value="Entregado">Entregado</option>
                                <option value="Cancelado">Cancelado</option>
                              </select>
                            </td>
                            <td className="p-2 sm:p-3 whitespace-nowrap">
                              <div className="flex gap-2">
                                {perms.canEditOrder && (
                                  <button
                                    onClick={() => handleEditOrder(order)}
                                    className="text-blue-500 hover:text-blue-400 transition-colors duration-150 p-1 rounded-md"
                                    title="Editar pedido"
                                    aria-label={`Editar pedido ${displayNumber}`}
                                  >
                                    <PencilIcon className="w-5 h-5" />
                                  </button>
                                )}
                                {perms.canEditPayments && (
                                  <button
                                    onClick={() => setEditingPaymentsOrder(order)}
                                    className="text-indigo-500 hover:text-indigo-400 transition-colors duration-150 p-1 rounded-md border border-indigo-500"
                                    title="Editar pagos (split)"
                                    aria-label={`Editar pagos del pedido ${displayNumber}`}
                                  >
                                    <CreditCardIcon className="w-5 h-5" />
                                  </button>
                                )}
                                {perms.canPrint && (
                                  <button
                                    onClick={() => handlePrintDeliveryReceipt(order, allSides)}
                                    className="text-green-600 hover:text-green-500 transition-colors duration-150 p-1 rounded-md border border-green-600"
                                    title="Imprimir recibo domicilio"
                                    aria-label={`Imprimir recibo domicilio ${displayNumber}`}
                                  >
                                    <PrinterIcon className="w-5 h-5" />
                                  </button>
                                )}
                                {perms.canDeleteOrder && (
                                  <button
                                    onClick={() => handleDeleteOrder(order.id)}
                                    className="text-red-500 hover:text-red-400 transition-colors duration-150 p-1 rounded-md"
                                    title="Eliminar pedido"
                                    aria-label={`Eliminar pedido ${displayNumber}`}
                                  >
                                    <TrashIcon className="w-5 h-5" />
                                  </button>
                                )}
                              </div>
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
                  <span>Pedidos por página:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    className={classNames('p-2 rounded-md border text-sm', theme === 'dark' ? 'border-gray-600 bg-gray-700 text-white' : 'border-gray-300 bg-white text-gray-900')}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className={classNames(
                      'p-2 rounded-md transition-colors duration-200',
                      currentPage === 1 ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-gray-700 text-gray-200'
                    )}
                  >
                    <ChevronLeftIcon className="w-5 h-5" />
                  </button>
                  <span>Página {currentPage} de {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className={classNames(
                      'p-2 rounded-md transition-colors duration-200',
                      currentPage === totalPages ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed' : 'hover:bg-gray-700 text-gray-200'
                    )}
                  >
                    <ChevronRightIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* === Resumen por Domiciliarios (ÚNICO) === */}
        {perms.showResumen && (
        <div className="mt-8 space-y-6">
          <h2 className="text-xl sm:text-2xl font-bold">Resumen por Domiciliarios</h2>

          {resumenPersons.length === 0 ? (
            <div className={classNames(
              "rounded-2xl p-6 text-center",
              theme === 'dark' ? 'bg-gray-800 text-gray-300' : 'bg-white text-gray-700'
            )}>
              No hay datos para el resumen de domiciliarios.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {resumenPersons.map((person) => {
                const buckets = resumen[person] || {};
                const lunch = buckets.lunch || { cash:0, nequi:0, daviplata:0, other:0, total:0 };
                const breakfast = buckets.breakfast || { cash:0, nequi:0, daviplata:0, other:0, total:0 };
                const overall = buckets.total || { cash:0, nequi:0, daviplata:0, other:0, total:0 };

                return (
                  <div key={person} className={classNames(
                    "rounded-2xl p-4 sm:p-5 shadow-sm",
                    theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base sm:text-lg font-semibold">{person}</h3>
                      {perms.canLiquidate && (
                        <button
                          onClick={() => handleSettle(person, buckets)}
                          className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Liquidar ▸
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Almuerzo */}
                      <div>
                        <div className="text-sm font-medium mb-2">Almuerzo</div>
                        <div className={classNames(
                          "rounded-lg p-3 sm:p-4 border",
                          theme === 'dark' ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'
                        )}>
                          <div className="flex justify-between text-sm my-0.5"><span>Efectivo</span><span className={`font-semibold ${getPaymentMethodColorClass('cash')}`}>{money(lunch.cash)}</span></div>
                          <div className="flex justify-between text-sm my-0.5"><span>Daviplata</span><span className={`font-semibold ${getPaymentMethodColorClass('daviplata')}`}>{money(lunch.daviplata)}</span></div>
                          <div className="flex justify-between text-sm my-0.5"><span>Nequi</span><span className={`font-semibold ${getPaymentMethodColorClass('nequi')}`}>{money(lunch.nequi)}</span></div>
                          {lunch.other > 0 && (
                            <div className="flex justify-between text-sm my-0.5"><span>Otros</span><span className="font-semibold">{money(lunch.other)}</span></div>
                          )}
                          <div className="h-px my-2 bg-gray-200 dark:bg-gray-700" />
                          <div className="flex justify-between text-sm"><span className="font-medium">Total</span><span className="font-bold">{money(lunch.total)}</span></div>
                        </div>
                      </div>

                      {/* Desayuno */}
                      <div>
                        <div className="text-sm font-medium mb-2">Desayuno</div>
                        <div className={classNames(
                          "rounded-lg p-3 sm:p-4 border",
                          theme === 'dark' ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'
                        )}>
                          <div className="flex justify-between text-sm my-0.5"><span>Efectivo</span><span className={`font-semibold ${getPaymentMethodColorClass('cash')}`}>{money(breakfast.cash)}</span></div>
                          <div className="flex justify-between text-sm my-0.5"><span>Daviplata</span><span className={`font-semibold ${getPaymentMethodColorClass('daviplata')}`}>{money(breakfast.daviplata)}</span></div>
                          <div className="flex justify-between text-sm my-0.5"><span>Nequi</span><span className={`font-semibold ${getPaymentMethodColorClass('nequi')}`}>{money(breakfast.nequi)}</span></div>
                          {breakfast.other > 0 && (
                            <div className="flex justify-between text-sm my-0.5"><span>Otros</span><span className="font-semibold">{money(breakfast.other)}</span></div>
                          )}
                          <div className="h-px my-2 bg-gray-200 dark:bg-gray-700" />
                          <div className="flex justify-between text-sm"><span className="font-medium">Total</span><span className="font-bold">{money(breakfast.total)}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Total general</div>
                      <div className={classNames(
                        "rounded-lg p-3 sm:p-4 border",
                        theme === 'dark' ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'
                      )}>
                        <div className="flex justify-between text-sm my-0.5"><span>Efectivo</span><span className={`font-semibold ${getPaymentMethodColorClass('cash')}`}>{money(overall.cash)}</span></div>
                        <div className="flex justify-between text-sm my-0.5"><span>Daviplata</span><span className={`font-semibold ${getPaymentMethodColorClass('daviplata')}`}>{money(overall.daviplata)}</span></div>
                        <div className="flex justify-between text-sm my-0.5"><span>Nequi</span><span className={`font-semibold ${getPaymentMethodColorClass('nequi')}`}>{money(overall.nequi)}</span></div>
                        {overall.other > 0 && (
                          <div className="flex justify-between text-sm my-0.5"><span>Otros</span><span className="font-semibold">{money(overall.other)}</span></div>
                        )}
                        <div className="h-px my-2 bg-gray-200 dark:bg-gray-700" />
                        <div className="flex justify-between text-sm"><span className="font-medium">Total</span><span className="font-bold">{money(overall.total)}</span></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>

          {/* Modal de edición de pagos (split) */}
          {perms.canEditPayments && editingPaymentsOrder && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
              <div className={classNames('p-4 sm:p-6 rounded-lg max-w-xl w-full max-h-[80vh] overflow-y-auto', theme === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-900')}>
                <h3 className="text-lg font-semibold mb-4">
                  Editar pagos — Orden #{editingPaymentsOrder.id.slice(0, 8)}
                </h3>

                <PaymentSplitEditor
                  theme={theme}
                  total={editingPaymentsOrder.total || 0}
                  value={
                    Array.isArray(editingPaymentsOrder.payments) && editingPaymentsOrder.payments.length
                      ? editingPaymentsOrder.payments
                      : defaultPaymentsForOrder(editingPaymentsOrder)
                  }
                  onChange={(rows) => {
                    setEditingPaymentsOrder((prev) => ({ ...prev, payments: rows }));
                  }}
                />

                <div className="mt-4 flex gap-2 justify-end">
                  <button onClick={() => setEditingPaymentsOrder(null)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm">
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await savePaymentsForOrder(editingPaymentsOrder, editingPaymentsOrder.payments || []);
                      if (ok) setEditingPaymentsOrder(null);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

export default TablaPedidos;