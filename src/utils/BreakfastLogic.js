//src/components/BreakfastTimeSelector.js
import { isMobile, encodeMessage } from '../utils/Helpers';

export const initializeBreakfastData = ({ address, phoneNumber, details, isWaitress = false }) => ({
  id: 0,
  type: null,
  eggs: null,
  broth: null,
  riceBread: null,
  drink: null,
  protein: null,
  additions: [],
  notes: '',
  tableNumber: isWaitress ? '' : null,
  paymentMethod: isWaitress ? null : null,
  orderType: isWaitress ? null : 'takeaway',
  ...(isWaitress ? {} : {
    time: null,
    address: {
      address: address || '',
      phoneNumber: phoneNumber || '',
      details: details || '',
    },
    cutlery: null,
  })
});

export const handleBreakfastChange = (setBreakfasts, id, field, value) => {
  setBreakfasts(prev => prev.map(breakfast => (breakfast.id === id ? { ...breakfast, [field]: value } : breakfast)));
};

export const addBreakfast = (setBreakfasts, setSuccessMessage, breakfasts, initialBreakfast) => {
  const newId = breakfasts.length > 0 ? Math.max(...breakfasts.map(breakfast => breakfast.id)) + 1 : 0;
  const newBreakfast = { ...initialBreakfast, id: newId };
  if (breakfasts.length > 0) {
    const firstBreakfast = breakfasts[0];
    setSuccessMessage("Tu dirección, hora y método de pago se han copiado del primer desayuno.");
    if (firstBreakfast.time) newBreakfast.time = firstBreakfast.time;
    if (firstBreakfast.address) newBreakfast.address = firstBreakfast.address;
    if (firstBreakfast.paymentMethod) newBreakfast.paymentMethod = firstBreakfast.paymentMethod;
  }
  setBreakfasts(prev => [...prev, newBreakfast]);
};

export const duplicateBreakfast = (setBreakfasts, setSuccessMessage, breakfastToDuplicate, breakfasts) => {
  setSuccessMessage("Se ha duplicado el desayuno.");
  setBreakfasts((prev) => {
    const newId = Math.max(...prev.map((breakfast) => breakfast.id), 0) + 1;
    const newBreakfast = JSON.parse(JSON.stringify({ ...breakfastToDuplicate, id: newId }));
    const originalIndex = prev.findIndex(breakfast => breakfast.id === breakfastToDuplicate.id);
    const newBreakfasts = [...prev];
    newBreakfasts.splice(originalIndex + 1, 0, newBreakfast);
    return newBreakfasts.map((breakfast, index) => ({ ...breakfast, id: index }));
  });
};

export const removeBreakfast = (setBreakfasts, setSuccessMessage, id, breakfasts) => {
  const updatedBreakfasts = breakfasts.filter(breakfast => breakfast.id !== id).map((breakfast, index) => ({ ...breakfast, id: index }));
  setBreakfasts(updatedBreakfasts);
  setSuccessMessage(updatedBreakfasts.length === 0 ? "Todos los desayunos han sido eliminados." : "Desayuno eliminado.");
};

export const calculateBreakfastPrice = (breakfast, userRole, breakfastTypes = []) => {


  if (!breakfast || !breakfast.type || !breakfast.type.name) {
    console.log('[BreakfastLogic] ❌ No breakfast or type defined:', breakfast);
    return 0;
  }

  const typeName = breakfast.type.name.toLowerCase().trim();
  const brothName = (breakfast.broth?.name || '').toLowerCase().trim();
  const orderType = breakfast.orderType || 'takeaway'; // Default to takeaway if not specified

  // Define prices for "Para Mesa" and "Para Llevar" as per the provided table
  const priceMap = {
    'solo huevos': {
      default: { mesa: 7000, llevar: 8000 },
    },
    'solo caldo': {
      'caldo de costilla': { mesa: 7000, llevar: 8000 },
      'caldo de pescado': { mesa: 7000, llevar: 8000 },
      'caldo de pata': { mesa: 8000, llevar: 9000 },
      'caldo de pajarilla': { mesa: 9000, llevar: 10000 },
      default: { mesa: 7000, llevar: 8000 }, // Default for unspecified broths
    },
    'desayuno completo': {
      'caldo de costilla': { mesa: 11000, llevar: 12000 },
      'caldo de pescado': { mesa: 11000, llevar: 12000 },
      'caldo de pata': { mesa: 12000, llevar: 13000 },
      'caldo de pajarilla': { mesa: 13000, llevar: 14000 },
      default: { mesa: 11000, llevar: 12000 }, // Default for unspecified broths
    },
    'moñona': {
      default: { mesa: 13000, llevar: 14000 },
    },
  };

  let basePrice = 0;
  if (priceMap[typeName]) {
    const priceCategory = priceMap[typeName];
    if (typeName === 'solo caldo' || typeName === 'desayuno completo') {
      const brothPrice = priceCategory[brothName] || priceCategory.default;
      basePrice = orderType === 'table' ? brothPrice.mesa : brothPrice.llevar;
    } else {
      const defaultPrice = priceCategory.default;
      basePrice = orderType === 'table' ? defaultPrice.mesa : defaultPrice.llevar;
    }
  } else {
    basePrice = orderType === 'table' ? 7000 : 8000; // Default price if type not found
  }

  console.log('🔍 [BreakfastLogic] Precio base calculado:', { 
    typeName, 
    brothName, 
    orderType, 
    basePrice,
    source: 'BreakfastLogic.js'
  });

  const additionsPrice = breakfast.additions?.reduce((sum, item) => {
    const itemPrice = (item.price || 0) * (item.quantity || 1);
    console.log('🔍 [BreakfastLogic] Adición individual:', { 
      name: item.name, 
      price: item.price, 
      quantity: item.quantity, 
      itemPrice,
      source: 'BreakfastLogic.js'
    });
    return sum + itemPrice;
  }, 0) || 0;

  console.log('🔍 [BreakfastLogic] Precio total adiciones:', additionsPrice);

  const totalPrice = basePrice + additionsPrice;

  console.log('🔍 [BreakfastLogic] Cálculo final:', {
    type: typeName,
    broth: brothName,
    orderType,
    basePrice,
    additionsPrice,
    totalPrice,
    additions: breakfast.additions,
    source: 'BreakfastLogic.js'
  });

  if (process.env.NODE_ENV === 'development') {
    console.log(`[BreakfastCalculations] Price for ${typeName}, broth: ${brothName}, orderType: ${orderType}, basePrice: ${basePrice}, totalPrice: ${totalPrice}`);
  }

  return totalPrice;
};

export const calculateTotalBreakfastPrice = (breakfasts, userRole, breakfastTypes = []) => {
  console.log('🔍 [BreakfastLogic] === calculateTotalBreakfastPrice llamado ===');
  console.log('🔍 [BreakfastLogic] Parámetros:', {
    breakfastsLength: breakfasts?.length || 0,
    userRole,
    breakfastTypesLength: breakfastTypes?.length || 0,
    breakfasts: breakfasts?.map(b => ({
      type: b.type?.name,
      broth: b.broth?.name,
      orderType: b.orderType,
      additions: b.additions
    }))
  });

  const total = breakfasts.reduce((sum, breakfast, index) => {
    console.log(`🔍 [BreakfastLogic] Calculando total para desayuno ${index + 1}:`, {
      breakfast: {
        type: breakfast.type?.name,
        broth: breakfast.broth?.name,
        orderType: breakfast.orderType,
        additions: breakfast.additions
      }
    });

    const itemPrice = calculateBreakfastPrice(breakfast, userRole, breakfastTypes);
    
    console.log(`🔍 [BreakfastLogic] Resultado total individual:`, {
      itemPrice,
      sumAnterior: sum,
      sumNuevo: sum + itemPrice,
      source: 'calculateTotalBreakfastPrice'
    });

    return sum + itemPrice;
  }, 0);

  console.log('🔍 [BreakfastLogic] === TOTAL FINAL calculateTotalBreakfastPrice ===', total);
  return total;
};

export const paymentSummaryBreakfast = (breakfasts, isWaitress = false) => {
  if (!breakfasts || breakfasts.length === 0) return {};
  return breakfasts.reduce((acc, breakfast) => {
    const price = calculateBreakfastPrice(breakfast, 3); // Assuming userRole 3 for waitress
    const paymentMethod = isWaitress ? (breakfast?.paymentMethod?.name || 'No especificado') : (breakfast?.payment?.name || 'No especificado');
    acc[paymentMethod] = (acc[paymentMethod] || 0) + price;
    return acc;
  }, {});
};

export const sendBreakfastToWhatsApp = (
  setIsLoading,
  setErrorMessage,
  setSuccessMessage,
  breakfasts,
  incompleteBreakfastIndex,
  setIncompleteBreakfastIndex,
  incompleteSlideIndex,
  setIncompleteBreakfastSlideIndex,
  calculateBreakfastPrice,
  total,
  breakfastTypes,
  isWaitress = false
) => {
  return new Promise((resolve) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const incompleteBreakfasts = breakfasts.map((breakfast, index) => {
      const typeData = Array.isArray(breakfastTypes) ? breakfastTypes.find(bt => bt.name === breakfast.type?.name) : null;
      const steps = typeData ? typeData.steps || [] : ['type', 'eggs', 'broth', 'riceBread', 'drink'];
      const missing = [];

      steps.forEach(step => {
        if (step !== 'cutlery' && step !== 'address' && !breakfast[step]) {
          missing.push(step);
        }
      });
      if (isWaitress) {
        if (!breakfast.tableNumber) missing.push('Número de mesa');
        if (!breakfast.paymentMethod) missing.push('Método de pago');
      } else {
        if (!breakfast.time) missing.push('Hora');
        if (!breakfast.address?.address) missing.push('Dirección');
        if (!breakfast.payment) missing.push('Método de pago');
        if (breakfast.cutlery === null) missing.push('Cubiertos');
        if (breakfast.address?.addressType === 'shop' && !breakfast.address?.localName) missing.push('Nombre del local');
      }

      if (missing.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Breakfast ${index + 1} is incomplete. Missing fields:`, missing);
          console.log(`Breakfast ${index + 1} data:`, breakfast);
        }
      }

      return { index, missing };
    }).filter(b => b.missing.length > 0);

    if (incompleteBreakfasts.length > 0) {
      const firstIncomplete = incompleteBreakfasts[0];
      const slideMap = isWaitress
        ? {
            'type': 0,
            'eggs': 1,
            'broth': 2,
            'riceBread': 3,
            'drink': 4,
            'Número de mesa': 5,
            'Método de pago': 6,
          }
        : {
            'type': 0,
            'eggs': 1,
            'broth': 2,
            'riceBread': 3,
            'drink': 4,
            'Cubiertos': 5,
            'Hora': 6,
            'Dirección': 7,
            'Método de pago': 8,
            'Nombre del local': 7,
          };
      const firstMissingField = firstIncomplete.missing[0];
      setIncompleteBreakfastIndex(firstIncomplete.index);
      setIncompleteBreakfastSlideIndex(slideMap[firstMissingField] || 0);
      setErrorMessage(
        `Por favor, completa el campo "${firstMissingField === 'Número de mesa' ? 'Mesa' : firstMissingField}" para el Desayuno #${firstIncomplete.index + 1}.`
      );
      setTimeout(() => {
        const element = document.getElementById(`breakfast-item-${firstIncomplete.index}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('highlight-incomplete');
          setTimeout(() => element.classList.remove('highlight-incomplete'), 3000);
          element.dispatchEvent(new CustomEvent('updateSlide', { detail: { slideIndex: slideMap[firstMissingField] } }));
        }
      }, 100);
      setIsLoading(false);
      resolve();
      return;
    }

    const message = generateMessageFromBreakfasts(breakfasts, calculateBreakfastPrice, total, breakfastTypes, isWaitress);
    const encodedMessage = encodeMessage(message);

    if (isMobile()) {
      const whatsappUrl = `whatsapp://send?phone=573016476916&text=${encodedMessage}`;
      const fallbackUrl = `https://wa.me/573016476916?text=${encodedMessage}`;
      const startTime = Date.now();
      window.location = whatsappUrl;
      setTimeout(() => {
        if (Date.now() - startTime < 2000) window.open(fallbackUrl, '_blank');
      }, 2000);
    } else {
      window.open(`https://web.whatsapp.com/send?phone=573016476916&text=${encodedMessage}`, '_blank');
    }

    setSuccessMessage('¡Pedido de desayuno enviado correctamente a WhatsApp!');
    setIsLoading(false);
    setTimeout(() => setSuccessMessage(null), 5000);
    resolve();
  });
};

export const cleanText = (text) => {
  if (typeof text !== 'string') {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[cleanText] Input no es una cadena, retornando "No seleccionado":', text);
    }
    return 'No seleccionado';
  }
  return text.replace(' NUEVO', '').trim();
};

const formatNotes = (notes) => {
  if (!notes) return '';
  return notes
    .split('. ')
    .map(sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join('. ');
};

const isValidTime = (time) => {
  if (!time || !time.name) return false;
  const n = time.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  if (n === 'lo mas pronto posible' || n === 'lo antes posible') return true;
  return true;
};

const fieldsToCheck = ['type', 'eggs', 'broth', 'riceBread', 'drink', 'Cubiertos', 'Hora', 'Dirección', 'Pago', 'Adiciones'];
const addressFields = ['address', 'phoneNumber', 'details'];

export const generateMessageFromBreakfasts = (breakfasts, calculateBreakfastPrice, total, breakfastTypes, isWaitress = false) => {
  let message = `👋 ¡Hola Cocina Casera! 🍴\nQuiero hacer mi pedido de desayunos:\n\n`;

  if (!breakfasts || breakfasts.length === 0) {
    message += `🍽 0 desayunos en total\n💰 Total: $0\n¡Gracias por tu pedido! 😊`;
    return message;
  }

  const getFieldValue = (breakfast, field) => {
    if (!breakfast) return '';
    if (field === 'type') {
      return cleanText(breakfast.type?.name);
    } else if (field === 'eggs') {
      return cleanText(breakfast.eggs?.name);
    } else if (field === 'broth') {
      return cleanText(breakfast.broth?.name);
    } else if (field === 'riceBread') {
      return cleanText(breakfast.riceBread?.name);
    } else if (field === 'drink') {
      return cleanText(breakfast.drink?.name);
    } else if (field === 'Cubiertos') {
      return breakfast.cutlery ? 'Sí' : 'No';
    } else if (field === 'Adiciones') {
      return JSON.stringify(
        breakfast.additions?.map(a => ({
          name: cleanText(a.name),
          quantity: a.quantity || 1,
        })).sort((a, b) => a.name.localeCompare(b.name)) || []
      );
    } else if (field === 'Hora') {
      return breakfast.time?.name || 'No especificada';
    } else if (field === 'Dirección') {
      return JSON.stringify(addressFields.map(f => breakfast.address?.[f] || ''));
    } else if (field === 'Pago') {
      return isWaitress ? (breakfast.paymentMethod?.name || 'No especificado') : (breakfast.payment?.name || 'No especificado');
    }
    return '';
  };

  const breakfastGroups = new Map();
  breakfasts.forEach((breakfast, index) => {
    let assigned = false;
    for (let [, groupData] of breakfastGroups) {
      const refBreakfast = groupData.breakfasts[0];
      let differences = 0;
      fieldsToCheck.forEach(field => {
        if (getFieldValue(breakfast, field) !== getFieldValue(refBreakfast, field)) {
          differences++;
        }
      });
      if (differences <= 3) {
        groupData.breakfasts.push(breakfast);
        groupData.indices.push(index);
        if (isWaitress ? breakfast.paymentMethod?.name : breakfast.payment?.name) {
          groupData.payments.add(isWaitress ? breakfast.paymentMethod?.name : breakfast.payment?.name);
        }
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      const key = `${index}|${fieldsToCheck.map(field => getFieldValue(breakfast, field)).join('|')}`;
      breakfastGroups.set(key, {
        breakfasts: [breakfast],
        indices: [index],
        payments: new Set((isWaitress ? breakfast.paymentMethod?.name : breakfast.payment?.name) ? [(isWaitress ? breakfast.paymentMethod?.name : breakfast.payment?.name)] : []),
      });
    }
  });

  const groupedBreakfasts = Array.from(breakfastGroups.values()).map(groupData => {
    const group = {
      breakfasts: groupData.breakfasts,
      payments: groupData.payments,
      originalIndices: groupData.indices,
    };
    group.commonFieldsInGroup = new Set(fieldsToCheck.filter(field => {
      const firstValue = getFieldValue(group.breakfasts[0], field);
      return group.breakfasts.every(breakfast => getFieldValue(breakfast, field) === firstValue);
    }));
    group.commonAddressFieldsInGroup = {};
    addressFields.forEach(field => {
      group.commonAddressFieldsInGroup[field] = group.breakfasts.every(breakfast => breakfast.address?.[field] === group.breakfasts[0].address?.[field])
        ? group.breakfasts[0].address?.[field]
        : null;
    });
    const identicalGroups = new Map();
    group.breakfasts.forEach((breakfast, idx) => {
      const key = fieldsToCheck.map(field => getFieldValue(breakfast, field)).join('|');
      if (!identicalGroups.has(key)) {
        identicalGroups.set(key, { breakfasts: [], indices: [] });
      }
      identicalGroups.get(key).breakfasts.push(breakfast);
      identicalGroups.get(key).indices.push(groupData.indices[idx]);
    });
    group.identicalGroups = Array.from(identicalGroups.values());
    return group;
  });

  const firstBreakfast = breakfasts[0];
  const commonDeliveryTime = breakfasts.every(breakfast => breakfast.time?.name === firstBreakfast?.time?.name) ? firstBreakfast?.time?.name : null;
  const commonAddressFields = {};
  addressFields.forEach(field => {
    const isCommon = breakfasts.every(breakfast => breakfast.address?.[field] === firstBreakfast?.address?.[field]);
    commonAddressFields[field] = isCommon ? firstBreakfast?.address?.[field] : null;
  });
  const relevantAddressFields = ['address', 'phoneNumber', 'details'];
  if (commonAddressFields.addressType === 'school') {
    relevantAddressFields.push('recipientName');
  } else if (commonAddressFields.addressType === 'complex') {
    relevantAddressFields.push('unitDetails');
  } else if (commonAddressFields.addressType === 'shop') {
    relevantAddressFields.push('localName');
  }
  const allDeliveryDetailsCommon = !isWaitress && commonDeliveryTime && relevantAddressFields.every(field => commonAddressFields[field] !== null || !firstBreakfast?.address?.[field]);

  const totalBreakfasts = breakfasts.length;
  message += `🍽 ${totalBreakfasts} desayunos en total\n`;
  groupedBreakfasts.forEach(group => {
    if (group.breakfasts.length > 1) {
      message += `* ${group.breakfasts.length} desayunos iguales\n`;
    }
  });
  message += `💰 Total: $${total.toLocaleString('es-CO')}\n`;
  message += isWaitress ? `📍 Pedido para mesa\n` : `📍 Pedido para entrega\n`;
  message += `───────────────\n`;

  groupedBreakfasts.forEach((group, index) => {
    const baseBreakfast = group.breakfasts[0];
    const count = group.breakfasts.length;
    const totalPrice = group.breakfasts.reduce((sum, b) => sum + calculateBreakfastPrice(b, 3, breakfastTypes), 0);
    const paymentNames = Array.from(group.payments).filter(name => name && name !== 'No especificado');
    const paymentText = paymentNames.length > 0 ? `(${paymentNames.join(' y ')})` : '(No especificado)';

    message += `🍽 ${count === 1 ? '1 Desayuno' : `${count} Desayunos iguales`} – $${totalPrice.toLocaleString('es-CO')} ${paymentText}\n`;

    if (count === 1) {
      // Formato limpio sin prefijos, igual que almuerzos
      const typeValue = cleanText(baseBreakfast.type?.name) || 'Sin tipo';
      message += `${typeValue}\n`;
      
      if (baseBreakfast.eggs?.name) {
        const eggsValue = cleanText(baseBreakfast.eggs.name);
        message += `${eggsValue}\n`;
      }
      
      if (baseBreakfast.broth?.name) {
        const brothValue = cleanText(baseBreakfast.broth.name);
        message += `${brothValue}\n`;
      }
      
      if (baseBreakfast.riceBread?.name) {
        const riceBreadValue = cleanText(baseBreakfast.riceBread.name);
        message += `${riceBreadValue}\n`;
      }
      
      if (baseBreakfast.drink?.name) {
        const drinkValue = cleanText(baseBreakfast.drink.name);
        message += `${drinkValue}\n`;
      }
      
      if (baseBreakfast.protein?.name) {
        const proteinValue = cleanText(baseBreakfast.protein.name);
        message += `${proteinValue}\n`;
      }
      
      if (!isWaitress) {
        message += `Cubiertos: ${baseBreakfast.cutlery ? 'Sí' : 'No'}\n`;
      }
      
      if (baseBreakfast.additions?.length > 0) {
        baseBreakfast.additions.forEach((addition) => {
          message += `- ${cleanText(addition.name)} (${addition.quantity || 1})\n`;
        });
      }
      if (isWaitress) {
        message += `📍 Mesa: ${baseBreakfast.tableNumber || 'No especificada'}\n`;
      }
      if (!isWaitress && !allDeliveryDetailsCommon) {
        const addressLines = [];
        addressFields.forEach((addrField) => {
          if (commonAddressFields[addrField]) return;
          const value = baseBreakfast.address?.[addrField];
          const addrType = baseBreakfast.address?.addressType || '';
          if (addrField === 'address' && value) {
            addressLines.push(`📍 Dirección: ${value}`);
          } else if (addrField === 'addressType' && value) {
            addressLines.push(`🏠 Lugar de entrega: ${
              value === 'house' ? 'Casa/Apartamento Individual' :
              value === 'school' ? 'Colegio/Oficina' :
              value === 'complex' ? 'Conjunto Residencial' :
              value === 'shop' ? 'Tienda/Local' : 'No especificado'
            }`);
          } else if (addrField === 'recipientName' && addrType === 'school' && value) {
            addressLines.push(`👤 Nombre del destinatario: ${value}`);
          } else if (addrField === 'phoneNumber' && value) {
            addressLines.push(`📞 Teléfono: ${value}`);
          } else if (addrField === 'details' && value) {
            addressLines.push(`📝 Instrucciones de entrega: ${value}`);
          } else if (addrField === 'unitDetails' && addrType === 'complex' && value) {
            addressLines.push(`🏢 Detalles: ${value}`);
          } else if (addrField === 'localName' && addrType === 'shop' && value) {
            addressLines.push(`🏬 Nombre del local: ${value}`);
          }
        });
        if (addressLines.length > 0) {
          message += `${addressLines.join('\n')}\n`;
        }
      }
    } else {
      // Para múltiples desayunos, formato limpio sin prefijos
      const typeValue = cleanText(baseBreakfast.type?.name) || 'Sin tipo';
      message += `${typeValue}\n`;
      
      if (baseBreakfast.eggs?.name) {
        const eggsValue = cleanText(baseBreakfast.eggs.name);
        message += `${eggsValue}\n`;
      }
      
      if (baseBreakfast.broth?.name) {
        const brothValue = cleanText(baseBreakfast.broth.name);
        message += `${brothValue}\n`;
      }
      
      if (baseBreakfast.riceBread?.name) {
        const riceBreadValue = cleanText(baseBreakfast.riceBread.name);
        message += `${riceBreadValue}\n`;
      }
      
      if (baseBreakfast.drink?.name) {
        const drinkValue = cleanText(baseBreakfast.drink.name);
        message += `${drinkValue}\n`;
      }
      
      if (baseBreakfast.protein?.name) {
        const proteinValue = cleanText(baseBreakfast.protein.name);
        message += `${proteinValue}\n`;
      }
      
      if (!isWaitress) {
        message += `Cubiertos: ${baseBreakfast.cutlery ? 'Sí' : 'No'}\n`;
      }
      
      if (baseBreakfast.additions?.length > 0) {
        baseBreakfast.additions.forEach((addition) => {
          message += `- ${cleanText(addition.name)} (${addition.quantity || 1})\n`;
        });
      }
      
      if (isWaitress) {
        message += `📍 Mesa: ${baseBreakfast.tableNumber || 'No especificada'}\n`;
      }
    }
    
    // Agregar separador después de cada grupo de desayunos
    message += `───────────────\n`;

    const hasDifferences = count > 1 && (group.identicalGroups.length > 1 || group.identicalGroups.some(ig => ig.breakfasts.length < group.breakfasts.length));
    if (hasDifferences) {
      message += `🔄 Diferencias:\n`;
      group.identicalGroups.forEach((identicalGroup, igIndex) => {
        const indices = identicalGroup.indices.map(i => i + 1).sort((a, b) => a - b);
        const indicesText = indices.length > 1
          ? `*Desayunos ${indices.slice(0, -1).join(', ')}${indices.length > 2 ? ',' : ''} y ${indices[indices.length - 1]}*`
          : `*Desayuno ${indices[0]}*`;
        message += `${indicesText}:\n`;
        const breakfast = identicalGroup.breakfasts[0];
        fieldsToCheck.forEach((field) => {
          if (group.commonFieldsInGroup.has(field) && getFieldValue(breakfast, field) === getFieldValue(baseBreakfast, field)) return;
          let formattedValue;
          if (field === 'type') {
            formattedValue = cleanText(breakfast.type?.name) || 'Sin tipo';
          } else if (field === 'eggs') {
            formattedValue = cleanText(breakfast.eggs?.name) || 'Sin huevos';
          } else if (field === 'broth') {
            formattedValue = cleanText(breakfast.broth?.name) || 'Sin caldo';
          } else if (field === 'riceBread') {
            formattedValue = cleanText(breakfast.riceBread?.name) || 'Sin arroz/pan';
          } else if (field === 'drink') {
            formattedValue = cleanText(breakfast.drink?.name) || 'Sin bebida';
          } else if (field === 'Cubiertos') {
            formattedValue = `Cubiertos: ${breakfast.cutlery ? 'Sí' : 'No'}`;
          } else if (field === 'Adiciones') {
            formattedValue = breakfast.additions?.length > 0
              ? breakfast.additions.map(a => `- ${cleanText(a.name)} (${a.quantity || 1})`).join('\n')
              : 'Adiciones: Ninguna';
          } else if (field === 'Hora') {
            formattedValue = isValidTime(breakfast.time) ? cleanText(breakfast.time.name) : 'Lo más rápido';
          } else if (field === 'Notas') {
            formattedValue = `Notas: ${formatNotes(breakfast.notes) || 'Ninguna'}`;
          } else if (field === 'Dirección') {
            const addressLines = [];
            addressFields.forEach((addrField) => {
              if (commonAddressFields[addrField]) return;
              const value = breakfast.address?.[addrField];
              const addrType = breakfast.address?.addressType || '';
              if (addrField === 'address' && value) {
                addressLines.push(`📍 Dirección: ${value}`);
              } else if (addrField === 'addressType' && value) {
                addressLines.push(`🏠 Lugar de entrega: ${
                  value === 'house' ? 'Casa/Apartamento Individual' :
                  value === 'school' ? 'Colegio/Oficina' :
                  value === 'complex' ? 'Conjunto Residencial' :
                  value === 'shop' ? 'Tienda/Local' : 'No especificado'
                }`);
              } else if (addrField === 'recipientName' && addrType === 'school' && value) {
                addressLines.push(`👤 Nombre del destinatario: ${value}`);
              } else if (addrField === 'phoneNumber' && value) {
                addressLines.push(`📞 Teléfono: ${value}`);
              } else if (addrField === 'details' && value) {
                addressLines.push(`📝 Instrucciones de entrega: ${value}`);
              } else if (addrField === 'unitDetails' && addrType === 'complex' && value) {
                addressLines.push(`🏢 Detalles: ${value}`);
              } else if (addrField === 'localName' && addrType === 'shop' && value) {
                addressLines.push(`🏬 Nombre del local: ${value}`);
              }
            });
            formattedValue = addressLines.join('\n');
          }
          if (formattedValue && (getFieldValue(breakfast, field) !== getFieldValue(baseBreakfast, field) || !group.commonFieldsInGroup.has(field))) {
            message += `${formattedValue}\n`;
          }
        });
      });
      message += `───────────────\n`;
    }

    if (!isWaitress && !allDeliveryDetailsCommon) {
      const groupDeliveryTime = group.breakfasts.every(breakfast => breakfast.time?.name === baseBreakfast.time?.name) ? baseBreakfast.time?.name : null;
      const groupAddressFields = {};
      addressFields.forEach(field => {
        groupAddressFields[field] = group.breakfasts.every(breakfast => breakfast.address?.[field] === baseBreakfast.address?.[field]) ? baseBreakfast.address?.[field] : null;
      });
      const relevantGroupAddressFields = ['address', 'addressType', 'phoneNumber', 'details'];
      if (groupAddressFields.addressType === 'school') {
        relevantGroupAddressFields.push('recipientName');
      } else if (groupAddressFields.addressType === 'complex') {
        relevantGroupAddressFields.push('unitDetails');
      } else if (groupAddressFields.addressType === 'shop') {
        relevantGroupAddressFields.push('localName');
      }
      const hasGroupDeliveryDetails = count > 1 && (groupDeliveryTime && !commonDeliveryTime || relevantGroupAddressFields.some(field => groupAddressFields[field] && !commonAddressFields[field]));
      if (hasGroupDeliveryDetails) {
        message += `───────────────\n`;
        if (groupDeliveryTime && !commonDeliveryTime) {
          message += `🕒 Entrega: ${isValidTime(baseBreakfast.time) ? cleanText(baseBreakfast.time.name) : 'Lo más rápido'}\n`;
        }
        relevantGroupAddressFields.forEach((addrField) => {
          if (groupAddressFields[addrField] && !commonAddressFields[addrField]) {
            const value = groupAddressFields[addrField];
            const addrType = groupAddressFields.addressType || '';
            if (addrField === 'address' && value) {
              message += `📍 Dirección: ${value}\n`;
            } else if (addrField === 'addressType' && value) {
              message += `🏠 Lugar de entrega: ${
                value === 'house' ? 'Casa/Apartamento Individual' :
                value === 'school' ? 'Colegio/Oficina' :
                value === 'complex' ? 'Conjunto Residencial' :
                value === 'shop' ? 'Tienda/Local' : 'No especificado'
              }\n`;
            } else if (addrField === 'recipientName' && addrType === 'school' && value) {
              message += `👤 Nombre del destinatario: ${value}\n`;
            } else if (addrField === 'phoneNumber' && value) {
              message += `📞 Teléfono: ${value}\n`;
            } else if (addrField === 'details' && value) {
              message += `📝 Instrucciones de entrega: ${value}\n`;
            } else if (addrField === 'unitDetails' && addrType === 'complex' && value) {
              message += `🏢 Detalles: ${value}\n`;
            } else if (addrField === 'localName' && addrType === 'shop' && value) {
              message += `🏬 Nombre del local: ${value}\n`;
            }
          }
        });
        if (!hasDifferences) {
          message += `───────────────\n`;
        }
      }
    }
  });

  if (commonDeliveryTime || Object.keys(commonAddressFields).some(field => commonAddressFields[field])) {
    if (commonDeliveryTime) {
      message += `🕒 Entrega: ${isValidTime(firstBreakfast.time) ? cleanText(firstBreakfast.time.name) : 'Lo más rápido'}\n`;
    }
    relevantAddressFields.forEach((addrField) => {
      if (commonAddressFields[addrField]) {
        const value = commonAddressFields[addrField];
        const addrType = commonAddressFields.addressType || '';
        if (addrField === 'address' && value) {
          message += `📍 Dirección: ${value}\n`;
        } else if (addrField === 'addressType' && value) {
          message += `🏠 Lugar de entrega: ${
            value === 'house' ? 'Casa/Apartamento Individual' :
            value === 'school' ? 'Colegio/Oficina' :
            value === 'complex' ? 'Conjunto Residencial' :
            value === 'shop' ? 'Tienda/Local' : 'No especificado'
          }\n`;
        } else if (addrField === 'recipientName' && addrType === 'school' && value) {
          message += `👤 Nombre del destinatario: ${value}\n`;
        } else if (addrField === 'phoneNumber' && value) {
          message += `📞 Teléfono: ${value}\n`;
        } else if (addrField === 'details' && value) {
          message += `📝 Instrucciones de entrega: ${value}\n`;
        } else if (addrField === 'unitDetails' && addrType === 'complex' && value) {
          message += `🏢 Detalles: ${value}\n`;
        } else if (addrField === 'localName' && addrType === 'shop' && value) {
          message += `🏬 Nombre del local: ${value}\n`;
        }
      }
    });
    message += `───────────────\n`;
  }

  const paymentSummaryMap = paymentSummaryBreakfast(breakfasts, isWaitress);
  const allCashOrUnspecified = Object.keys(paymentSummaryMap).every(method => method === 'Efectivo' || method === 'No especificado');
  if (Object.keys(paymentSummaryMap).length > 0) {
    if (allCashOrUnspecified) {
      message += `Paga en efectivo al momento de la entrega.\n`;
      message += `💵 Efectivo: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `Si no tienes efectivo,  puedes transferir.\n`;
      message += `\nBancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531\n`;
      message += `Daviplata: 📲 313 850 5647\n`;
      message += `\n💰 Total: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `🚚 Estimado: 25-30 min (10-15 si están cerca).\n`;
    } else {
      message += `💳 Formas de pago:\n\n`;
      message += `Bancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531\n`;
      message += `Daviplata: 📲 313 850 5647\n`;
      Object.entries(paymentSummaryMap).forEach(([method, amount]) => {
        if (method !== 'No especificado' && amount > 0 && method !== 'Efectivo') {
          message += `🔹 ${method}: $${(amount || 0).toLocaleString('es-CO')}\n`;
        }
      });
      if (paymentSummaryMap['Efectivo'] > 0) {
        message += `🔹 Efectivo: $${(paymentSummaryMap['Efectivo'] || 0).toLocaleString('es-CO')}\n`;
      }
      message += `\n💰 Total: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `🚚 Estimado: 25-30 min (10-15 si están cerca).\n`;
    }
  }

  message += `\n¡Gracias por tu pedido! 😊`;
  return message;
};

export const calculateBreakfastProgress = (breakfast, isTableOrder, isWaitress, breakfastTypes = []) => {
  if (!breakfast || !breakfast.type) {
    return 0;
  }

  const breakfastType = breakfastTypes.find(bt => bt.id === breakfast.type?.id) || { steps: [], requiresProtein: false };
  const currentSteps = breakfastType.steps || [];

  const mandatorySteps = ['type'];
  if (currentSteps.includes('broth')) mandatorySteps.push('broth');
  if (currentSteps.includes('eggs')) mandatorySteps.push('eggs');
  if (currentSteps.includes('riceBread')) mandatorySteps.push('riceBread');
  if (currentSteps.includes('drink')) mandatorySteps.push('drink');
  if (currentSteps.includes('protein') && breakfastType.requiresProtein) mandatorySteps.push('protein');

  if (isTableOrder) {
    mandatorySteps.push('tableNumber', 'payment');
    if (isWaitress) mandatorySteps.push('orderType');
  } else {
    mandatorySteps.push('cutlery', 'time', 'address', 'payment');
  }

  const completedSteps = mandatorySteps.filter(step => {
    if (step === 'address') {
      return breakfast.address && breakfast.address.address;
    } else if (step === 'payment') {
      // Para pedidos de mesa usar paymentMethod, para domicilio usar payment
      return isTableOrder ? breakfast.paymentMethod : breakfast.payment;
    } else {
      return breakfast[step];
    }
  });

  return Math.round((completedSteps.length / mandatorySteps.length) * 100);
};