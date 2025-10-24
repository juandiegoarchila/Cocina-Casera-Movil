//src/utils/MealLogic.js
import { isMobile, encodeMessage } from './Helpers';

export const initializeMealData = ({ address, phoneNumber, details, isWaitress = false }) => ({
  id: 0,
  soup: null,
  soupReplacement: null,
  principle: null,
  principleReplacement: null,
  protein: null,
  drink: null,
  sides: [],
  additions: [],
  notes: '',
  tableNumber: isWaitress ? '' : null,
  paymentMethod: isWaitress ? null : null,
  ...(isWaitress ? {} : {
    time: null,
    address: {
      address: address || '',
      phoneNumber: phoneNumber || '',
      details: details || '',
    },
    payment: null,
    cutlery: null,
  })
});

export const handleMealChange = (setMeals, id, field, value) => {
  setMeals(prev => prev.map(meal => (meal.id === id ? { ...meal, [field]: value } : meal)));
};

export const addMeal = (setMeals, setSuccessMessage, meals, initialMeal) => {
  const newId = meals.length > 0 ? Math.max(...meals.map(meal => meal.id)) + 1 : 0;
  const newMeal = { ...initialMeal, id: newId };
  if (meals.length > 0) {
    const firstMeal = meals[0];
    setSuccessMessage("Tu dirección, hora y método de pago se han copiado del primer almuerzo.");
    if (firstMeal.time) newMeal.time = firstMeal.time;
    if (firstMeal.address) newMeal.address = firstMeal.address;
    if (firstMeal.payment) newMeal.payment = firstMeal.payment;
    if (firstMeal.paymentMethod) newMeal.paymentMethod = firstMeal.paymentMethod;
  }
  setMeals(prev => [...prev, newMeal]);
};

export const duplicateMeal = (setMeals, setSuccessMessage, mealToDuplicate, meals) => {
  setSuccessMessage("Se ha duplicado el almuerzo.");
  setMeals((prev) => {
    const newId = Math.max(...prev.map((meal) => meal.id), 0) + 1;
    const newMeal = JSON.parse(JSON.stringify({
      ...mealToDuplicate,
      id: newId,
  __startCollapsed: true,
    }));
    const originalIndex = prev.findIndex(meal => meal.id === mealToDuplicate.id);
    const newMeals = [...prev];
    newMeals.splice(originalIndex + 1, 0, newMeal);
    return newMeals.map((meal, index) => ({ ...meal, id: index }));
  });
};

export const removeMeal = (setMeals, setSuccessMessage, id, meals) => {
  const updatedMeals = meals.filter(meal => meal.id !== id).map((meal, index) => ({ ...meal, id: index }));
  setMeals(updatedMeals);
  setSuccessMessage(updatedMeals.length === 0 ? "Todos los almuerzos han sido eliminados." : "Almuerzo eliminado.");
};

export const calculateMealPrice = (meal) => {
  if (!meal) return 0;
  
  // Mojarra tiene precio base fijo - verificación robusta
  const proteinName = meal?.protein?.name || '';
  const proteinNameClean = proteinName.toLowerCase().trim();
  const hasMojarra = proteinNameClean === 'mojarra' || proteinNameClean.includes('mojarra');
  
  if (hasMojarra) {
    console.log('✅ MealLogic: Mojarra detectada, precio: 16000');
    const additionsPrice = meal?.additions?.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0) || 0;
    return 16000 + additionsPrice;
  }
  
  const hasSoupOrReplacement = meal?.soup?.name && meal.soup.name !== 'Sin sopa' && meal.soup.name !== 'Solo bandeja' || meal?.soupReplacement;
  const basePrice = hasSoupOrReplacement ? 13000 : 12000;
  const additionsPrice = meal?.additions?.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0) || 0;
  
  console.log('⚠️ MealLogic: No mojarra, precio normal:', {
    hasSoupOrReplacement,
    basePrice,
    additionsPrice,
    total: basePrice + additionsPrice
  });
  
  return basePrice + additionsPrice;
};

export const calculateTotal = (meals) => {
  if (!Array.isArray(meals)) return 0;
  return meals.reduce((sum, meal) => sum + calculateMealPrice(meal), 0);
};

export const paymentSummary = (meals, isWaitress = false) => {
  if (!Array.isArray(meals) || meals.length === 0) return {};
  return meals.reduce((acc, meal) => {
    const price = calculateMealPrice(meal);
    const paymentMethod = isWaitress ? (meal?.paymentMethod?.name || 'No especificado') : (meal?.payment?.name || 'No especificado');
    acc[paymentMethod] = (acc[paymentMethod] || 0) + price;
    return acc;
  }, {});
};

export const sendToWhatsApp = (
  setIsLoading,
  setErrorMessage,
  setSuccessMessage,
  meals,
  incompleteMealIndex,
  setIncompleteMealIndex,
  incompleteSlideIndex,
  setIncompleteSlideIndex,
  calculateMealPrice,
  total,
  isWaitress = false // Añadido con valor por defecto
) => {
  return new Promise((resolve) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!Array.isArray(meals)) {
      setErrorMessage('Error: Los pedidos no están correctamente definidos.');
      setIsLoading(false);
      resolve();
      return;
    }

    const safeMeals = Array.isArray(meals) ? meals : [];

    const incompleteMeals = safeMeals.map((meal, index) => {
      const missing = [];
      const isCompleteRice = Array.isArray(meal?.principle) &&
        meal.principle.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));

      if (!meal?.soup && !meal?.soupReplacement) missing.push('Sopa o reemplazo de sopa');
      if (!meal?.principle) missing.push('Principio');
      if (!isCompleteRice && !meal?.protein) missing.push('Proteína');
      if (!meal?.drink) missing.push('Bebida');
      if (isWaitress) {
        if (!meal?.tableNumber) missing.push('Número de mesa');
        if (!meal?.paymentMethod) missing.push('Método de pago');
      } else {
        if (!meal?.time) missing.push('Hora');
        if (!meal?.address?.address) missing.push('Dirección');
        if (!meal?.payment) missing.push('Método de pago');
        if (meal?.cutlery === null) missing.push('Cubiertos');
        if (meal?.address?.addressType === 'shop' && !meal?.address?.localName) missing.push('Nombre del local');
      }
      if (!isCompleteRice && (!meal?.sides || meal.sides.length === 0)) missing.push('Acompañamientos');

      if (missing.length > 0 && process.env.NODE_ENV === 'development') {
        console.log(`Meal ${index + 1} is incomplete. Missing fields:`, missing);
        console.log(`Meal ${index + 1} data:`, meal);
      }

      return { index, missing };
    }).filter(m => m.missing.length > 0);

    if (incompleteMeals.length > 0) {
      const firstIncomplete = incompleteMeals[0];
      const slideMap = isWaitress
        ? {
            'Sopa o reemplazo de sopa': 0,
            'Principio': 1,
            'Proteína': 2,
            'Bebida': 3,
            'Número de mesa': 4,
            'Método de pago': 5,
            'Acompañamientos': 6,
          }
        : {
            'Sopa o reemplazo de sopa': 0,
            'Principio': 1,
            'Proteína': 2,
            'Bebida': 3,
            'Cubiertos': 4,
            'Hora': 5,
            'Dirección': 6,
            'Método de pago': 7,
            'Acompañamientos': 8,
            'Nombre del local': 6,
          };
      const firstMissingField = firstIncomplete.missing[0];
      setIncompleteMealIndex(firstIncomplete.index);
      setIncompleteSlideIndex(slideMap[firstMissingField] || 0);
      setErrorMessage(
        `Por favor, completa el campo "${firstMissingField}" para el Almuerzo #${firstIncomplete.index + 1}.`
      );
      setTimeout(() => {
        const element = document.getElementById(`meal-item-${firstIncomplete.index}`);
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

const message = generateMessageFromMeals(meals, calculateMealPrice, total, isWaitress);
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

    setSuccessMessage('¡Pedido enviado correctamente a WhatsApp!');
    setIsLoading(false);
    setTimeout(() => setSuccessMessage(null), 5000);
    resolve();
  });
};

export const cleanText = (text) => text?.replace(' NUEVO', '') || 'No seleccionado';

export const formatNotes = (notes) => {
  if (!notes) return '';
  return notes
    .split('. ')
    .map(sentence => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join('. ');
};

export const isValidTime = (time) => {
  if (!time || !time.name) return false;
  const n = time.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  // permitir 'lo más pronto posible' y 'lo antes posible'
  if (n === 'lo mas pronto posible' || n === 'lo antes posible') return true;
  return true; // cualquier otra hora con name presente se valida en el nivel de UI
};

const fieldsToCheck = ['Sopa', 'Principio', 'Proteína', 'Bebida', 'Cubiertos', 'Acompañamientos', 'Hora', 'Dirección', 'Pago', 'Adiciones', 'Mesa'];
const addressFields = ['address', 'phoneNumber', 'details'];
const specialRiceOptions = ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'];

export const generateMessageFromMeals = (meals, calculateMealPrice, total, isWaitress = false) => {
  let message = `👋 ¡Hola Cocina Casera! 🍴\nQuiero hacer mi pedido:\n\n`;

  const safeMeals = Array.isArray(meals) ? meals : [];

  if (safeMeals.length === 0) {
    message += `🍽 0 almuerzos en total\n💰 Total: $0\n¡Gracias por tu pedido! 😊`;
    return message;
  }

  const getFieldValue = (meal, field) => {
    if (!meal) return '';
    if (field === 'Sopa') {
      if (meal.soup?.name === 'Solo bandeja') return 'solo bandeja';
      if (meal.soupReplacement?.name) return JSON.stringify({ name: cleanText(meal.soupReplacement.name), type: 'por sopa' });
      if (meal.soup?.name && meal.soup.name !== 'Sin sopa') return cleanText(meal.soup.name);
      return 'Sin sopa';
    } else if (field === 'Principio') {
      const principleNames = meal.principle?.map(p => cleanText(p.name)).sort() || [];
      const replacement = meal.principleReplacement?.name ? cleanText(meal.principleReplacement.name) : '';
      return JSON.stringify([principleNames.join(','), replacement]);
    } else if (field === 'Proteína') {
      return cleanText(meal.protein?.name || 'Sin proteína');
    } else if (field === 'Bebida') {
      return cleanText(meal.drink?.name || 'Sin bebida');
    } else if (field === 'Cubiertos') {
      return meal.cutlery ? 'Sí' : 'No';
    } else if (field === 'Acompañamientos') {
      return JSON.stringify(meal.sides?.map(s => cleanText(s.name)).sort() || []);
    } else if (field === 'Hora') {
      return meal.time?.name || 'No especificada';
    } else if (field === 'Dirección') {
      return JSON.stringify(addressFields.map(f => meal.address?.[f] || ''));
    } else if (field === 'Pago') {
      return isWaitress ? (meal.paymentMethod?.name || 'No especificado') : (meal.payment?.name || 'No especificado');
    } else if (field === 'Adiciones') {
      return JSON.stringify(
        meal.additions?.map(a => ({
          name: cleanText(a.name),
          protein: a.protein || '',
          replacement: a.replacement || '',
          quantity: a.quantity || 1,
        })).sort((a, b) => a.name.localeCompare(b.name)) || []
      );
    } else if (field === 'Mesa') {
      return meal.tableNumber || 'No especificada';
    }
    return '';
  };

  const mealGroups = new Map();
  safeMeals.forEach((meal, index) => {
    let assigned = false;
    for (let [, groupData] of mealGroups) {
      const refMeal = groupData.meals[0];
      let differences = 0;
      fieldsToCheck.forEach(field => {
        if (getFieldValue(meal, field) !== getFieldValue(refMeal, field)) {
          differences++;
        }
      });
      if (differences <= 3) {
        groupData.meals.push(meal);
        groupData.indices.push(index);
        if (isWaitress ? meal.paymentMethod?.name : meal.payment?.name) {
          groupData.payments.add(isWaitress ? meal.paymentMethod?.name : meal.payment?.name);
        }
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      const key = `${index}|${fieldsToCheck.map(field => getFieldValue(meal, field)).join('|')}`;
      mealGroups.set(key, {
        meals: [meal],
        indices: [index],
        payments: new Set((isWaitress ? meal.paymentMethod?.name : meal.payment?.name) ? [(isWaitress ? meal.paymentMethod?.name : meal.payment?.name)] : []),
      });
    }
  });

  const groupedMeals = Array.from(mealGroups.values()).map(groupData => {
    const group = {
      meals: groupData.meals,
      payments: groupData.payments,
      originalIndices: groupData.indices,
    };
    group.commonFieldsInGroup = new Set(fieldsToCheck.filter(field => {
      const firstValue = getFieldValue(group.meals[0], field);
      return group.meals.every(meal => getFieldValue(meal, field) === firstValue);
    }));
    group.commonAddressFieldsInGroup = {};
    addressFields.forEach(field => {
      group.commonAddressFieldsInGroup[field] = group.meals.every(meal => meal.address?.[field] === group.meals[0].address?.[field])
        ? group.meals[0].address?.[field]
        : null;
    });
    const identicalGroups = new Map();
    group.meals.forEach((meal, idx) => {
      const key = fieldsToCheck.map(field => getFieldValue(meal, field)).join('|');
      if (!identicalGroups.has(key)) {
        identicalGroups.set(key, { meals: [], indices: [] });
      }
      identicalGroups.get(key).meals.push(meal);
      identicalGroups.get(key).indices.push(groupData.indices[idx]);
    });
    group.identicalGroups = Array.from(identicalGroups.values());
    return group;
  });

  const firstMeal = safeMeals[0];
  const commonDeliveryTime = safeMeals.every(meal => meal.time?.name === firstMeal?.time?.name) ? firstMeal?.time?.name : null;
  const commonAddressFields = {};
  addressFields.forEach(field => {
    const isCommon = safeMeals.every(meal => meal.address?.[field] === firstMeal?.address?.[field]);
    commonAddressFields[field] = isCommon ? firstMeal?.address?.[field] : null;
  });
  const relevantAddressFields = ['address', 'phoneNumber', 'details'];
  if (commonAddressFields.addressType === 'school') {
    relevantAddressFields.push('recipientName');
  } else if (commonAddressFields.addressType === 'complex') {
    relevantAddressFields.push('unitDetails');
  } else if (commonAddressFields.addressType === 'shop') {
    relevantAddressFields.push('localName');
  }
  const allDeliveryDetailsCommon = !isWaitress && commonDeliveryTime && relevantAddressFields.every(field => commonAddressFields[field] !== null || !firstMeal?.address?.[field]);

  const totalMeals = safeMeals.length;
  message += `🍽 ${totalMeals} almuerzos en total\n`;
  groupedMeals.forEach(group => {
    if (group.meals.length > 1) {
      message += `* ${group.meals.length} almuerzos iguales\n`;
    }
  });
message += `💰 Total: $${total.toLocaleString('es-CO')}\n`;
message += `───────────────\n`;


  groupedMeals.forEach((group, index) => {
    const baseMeal = group.meals[0];
    const count = group.meals.length;
    const totalPrice = group.meals.reduce((sum, m) => sum + calculateMealPrice(m), 0);
    const paymentNames = Array.from(group.payments).filter(name => name && name !== 'No especificado');
    const paymentText = paymentNames.length > 0 ? `(${paymentNames.join(' y ')})` : '(No especificado)';
    const hasSpecialRice = baseMeal?.principle?.some(p => specialRiceOptions.includes(p.name));

    message += `🍽 ${count === 1 ? '1 Almuerzo' : `${count} Almuerzos iguales`} – $${totalPrice.toLocaleString('es-CO')} ${paymentText}\n`;

    if (count === 1) {
      const soupValue = baseMeal.soup?.name === 'Solo bandeja' ? 'solo bandeja' :
        baseMeal.soupReplacement?.name ? `${cleanText(baseMeal.soupReplacement.name)} (por sopa)` :
        baseMeal.soup?.name && baseMeal.soup.name !== 'Sin sopa' ? cleanText(baseMeal.soup.name) : 'Sin sopa';
      message += `${soupValue}\n`;

      const principleValue = baseMeal.principleReplacement?.name
        ? `${cleanText(baseMeal.principleReplacement.name)} (por principio)`
        : baseMeal.principle?.length > 0
        ? `${baseMeal.principle.map(p => cleanText(p.name)).join(', ')}${baseMeal.principle.length > 1 ? ' (mixto)' : ''}`
        : 'Sin principio';
      message += `${principleValue}\n`;

      if (!hasSpecialRice && baseMeal.protein?.name) {
        message += `${cleanText(baseMeal.protein.name)}\n`;
      }

      const drinkValue = baseMeal.drink?.name === 'Juego de mango' ? 'Jugo de mango' : cleanText(baseMeal.drink?.name || 'Sin bebida');
      message += `${drinkValue}\n`;

      if (!isWaitress) {
        message += `Cubiertos: ${baseMeal.cutlery ? 'Sí' : 'No'}\n`;
      }

      // Verificar si seleccionó "Ninguno" en acompañamientos
      const selectedSides = baseMeal.sides?.map(s => cleanText(s.name)) || [];
      const hasNoneSelected = selectedSides.includes('Ninguno');
      
      if (hasSpecialRice) {
        message += `Acompañamientos: Ya incluidos\n`;
      } else if (hasNoneSelected) {
        message += `Acompañamientos: Ninguno\n`;
        // No mostrar "No Incluir" cuando explícitamente seleccionó "Ninguno"
      } else if (selectedSides.length > 0) {
        message += `Acompañamientos: ${selectedSides.join(', ')}\n`;
        // Solo mostrar "No Incluir" si hay acompañamientos seleccionados (no "Ninguno")
        // Y usar los acompañamientos actuales del sistema, no una lista hardcodeada
        // Esta lógica puede agregarse si es necesario mostrar los no incluidos
      } else {
        message += `Acompañamientos: Sin acompañamientos\n`;
      }

      if (baseMeal.additions?.length > 0) {
        baseMeal.additions.forEach((addition, idx) => {
          message += `- ${cleanText(addition.name)}${addition.protein || addition.replacement ? ` (${addition.protein || addition.replacement})` : ''} (${addition.quantity || 1})\n`;
        });
      }

      const notesValue = formatNotes(baseMeal.notes) || 'Ninguna';
      message += `Notas: ${notesValue}\n`;

      if (isWaitress) {
        message += `📍 Mesa: ${baseMeal.tableNumber || 'No especificada'}\n`;
      }

      if (!isWaitress && !allDeliveryDetailsCommon) {
        const addressLines = [];
        addressFields.forEach((addrField) => {
          if (commonAddressFields[addrField] && safeMeals.length > 1) return;
          const value = baseMeal.address?.[addrField];
          const addrType = baseMeal.address?.addressType || '';
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

      message += `💳 Pago: ${isWaitress ? (baseMeal.paymentMethod?.name || 'No especificado') : (baseMeal.payment?.name || 'No especificado')}\n`;
    } else {
      if (group.commonFieldsInGroup.has('Sopa')) {
        const soupValue = baseMeal.soup?.name === 'Solo bandeja' ? 'solo bandeja' :
          baseMeal.soupReplacement?.name ? `${cleanText(baseMeal.soupReplacement.name)} (por sopa)` :
          baseMeal.soup?.name && baseMeal.soup.name !== 'Sin sopa' ? cleanText(baseMeal.soup.name) : 'Sin sopa';
        message += `${soupValue}\n`;
      }
      if (group.commonFieldsInGroup.has('Principio')) {
        const principleValue = baseMeal.principleReplacement?.name
          ? `${cleanText(baseMeal.principleReplacement.name)} (por principio)`
          : baseMeal.principle?.length > 0
          ? `${baseMeal.principle.map(p => cleanText(p.name)).join(', ')}${baseMeal.principle.length > 1 ? ' (mixto)' : ''}`
          : 'Sin principio';
        message += `${principleValue}\n`;
      }
      if (group.commonFieldsInGroup.has('Proteína') && !hasSpecialRice) {
        message += `${cleanText(baseMeal.protein?.name || 'Sin proteína')}\n`;
      }
      if (group.commonFieldsInGroup.has('Bebida')) {
        const commonDrink = baseMeal.drink?.name === 'Juego de mango' ? 'Jugo de mango' : cleanText(baseMeal.drink?.name || 'Sin bebida');
        message += `${commonDrink}\n`;
      }
      if (group.commonFieldsInGroup.has('Cubiertos') && !isWaitress) {
        message += `Cubiertos: ${baseMeal.cutlery ? 'Sí' : 'No'}\n`;
      }
      if (group.commonFieldsInGroup.has('Acompañamientos')) {
        message += `Acompañamientos: ${hasSpecialRice ? 'Ya incluidos' : baseMeal.sides?.length > 0 ? baseMeal.sides.map(s => cleanText(s.name)).join(', ') : 'Sin acompañamientos'}\n`;
      }
      if (group.commonFieldsInGroup.has('Adiciones') && baseMeal.additions?.length > 0) {
        baseMeal.additions.forEach((addition, aIdx) => {
          message += `- ${cleanText(addition.name)}${addition.protein || addition.replacement ? ` (${addition.protein || addition.replacement})` : ''} (${addition.quantity || 1})\n`;
        });
      }
      if (group.commonFieldsInGroup.has('Notas')) {
        const notesValue = formatNotes(baseMeal.notes) || 'Ninguna';
        message += `Notas: ${notesValue}\n`;
      }
      if (group.commonFieldsInGroup.has('Mesa') && isWaitress) {
        message += `📍 Mesa: ${baseMeal.tableNumber || 'No especificada'}\n`;
      }
    }

    message += `───────────────\n`;

    const hasDifferences = count > 1 && (group.identicalGroups.length > 1 || group.identicalGroups.some(ig => ig.meals.length < group.meals.length));
    if (hasDifferences) {
      message += `🔄 Diferencias:\n`;
      group.identicalGroups.forEach((identicalGroup, igIndex) => {
        const indices = identicalGroup.indices.map(i => i + 1).sort((a, b) => a - b);
        const indicesText = indices.length > 1
          ? `*Almuerzos ${indices.slice(0, -1).join(', ')}${indices.length > 2 ? ',' : ''} y ${indices[indices.length - 1]}*`
          : `*Almuerzo ${indices[0]}*`;
        message += `${indicesText}:\n`;
        const meal = identicalGroup.meals[0];
        const mealHasSpecialRice = meal?.principle?.some(p => specialRiceOptions.includes(p.name));
        fieldsToCheck.forEach((field) => {
          if (group.commonFieldsInGroup.has(field) && getFieldValue(meal, field) === getFieldValue(baseMeal, field)) {
            return;
          }
          let formattedValue;
          if (field === 'Sopa') {
            formattedValue = meal.soup?.name === 'Solo bandeja' ? 'solo bandeja' :
              meal.soupReplacement?.name ? `${cleanText(meal.soupReplacement.name)} (por sopa)` :
              meal.soup?.name && meal.soup.name !== 'Sin sopa' ? cleanText(meal.soup.name) : 'Sin sopa';
          } else if (field === 'Principio') {
            formattedValue = meal.principleReplacement?.name
              ? `${cleanText(meal.principleReplacement.name)} (por principio)`
              : meal.principle?.length > 0
              ? `${meal.principle.map(p => cleanText(p.name)).join(', ')}${meal.principle.length > 1 ? ' (mixto)' : ''}`
              : 'Sin principio';
          } else if (field === 'Proteína') {
            formattedValue = mealHasSpecialRice ? 'Proteína: Ya incluida en el arroz' : cleanText(meal.protein?.name || 'Sin proteína');
          } else if (field === 'Bebida') {
            formattedValue = meal.drink?.name === 'Juego de mango' ? 'Jugo de mango' : cleanText(meal.drink?.name || 'Sin bebida');
          } else if (field === 'Cubiertos') {
            formattedValue = `Cubiertos: ${meal.cutlery ? 'Sí' : 'No'}`;
          } else if (field === 'Acompañamientos') {
            formattedValue = mealHasSpecialRice ? 'Acompañamientos: Ya incluidos' : `Acompañamientos: ${meal.sides?.length > 0 ? meal.sides.map(s => cleanText(s.name)).join(', ') : 'Ninguno'}`;
          } else if (field === 'Hora') {
            formattedValue = isValidTime(meal.time) ? cleanText(meal.time.name) : 'Lo más rápido';
          } else if (field === 'Pago') {
            formattedValue = cleanText(isWaitress ? (meal.paymentMethod?.name || 'No especificado') : (meal.payment?.name || 'No especificado'));
          } else if (field === 'Notas') {
            formattedValue = `Notas: ${formatNotes(meal.notes) || 'Ninguna'}`;
          } else if (field === 'Mesa' && isWaitress) {
            formattedValue = `Mesa: ${meal.tableNumber || 'No especificada'}`;
          } else if (field === 'Dirección') {
            const addressLines = [];
            addressFields.forEach((addrField) => {
              if (group.commonAddressFieldsInGroup[addrField]) return;
              const value = meal.address?.[addrField];
              const addrType = meal.address?.addressType || '';
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
          if (formattedValue && (getFieldValue(meal, field) !== getFieldValue(baseMeal, field) || !group.commonFieldsInGroup.has(field))) {
            message += `${formattedValue}\n`;
          }
        });
        message += `\n`;
      });
      message += `───────────────\n`;
    }
  });



  if (commonDeliveryTime || Object.keys(commonAddressFields).some(field => commonAddressFields[field])) {
    if (commonDeliveryTime) {
      message += `🕒 Entrega: ${isValidTime(firstMeal.time) ? cleanText(firstMeal.time.name) : 'Lo más rápido'}\n`;
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

  const paymentSummaryMap = paymentSummary(safeMeals);
  if (process.env.NODE_ENV === 'development') {
    console.log('paymentSummaryMap:', paymentSummaryMap);
  }
  const allCashOrUnspecified = Object.keys(paymentSummaryMap).every(method => method === 'Efectivo' || method === 'No especificado');
  if (process.env.NODE_ENV === 'development') {
    console.log('allCashOrUnspecified:', allCashOrUnspecified);
    console.log('Total before payment summary:', total);
  }

  if (Object.keys(paymentSummaryMap).length > 0) {
    if (allCashOrUnspecified) {
      // Nuevo formato para pagos en efectivo
      message += `Paga en efectivo al momento de la entrega.\n`;
      message += `💵 Efectivo: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `Si no tienes efectivo,  puedes transferir.\n`;
      message += `\nBancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531\n`;
      message += `Daviplata: 📲 313 850 5647\n`;
      message += `\n💰 Total: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `🚚 Estimado: 25-30 min (10-15 si están cerca).\n`;
    } else {
      // Nuevo formato para instrucciones de pago mixtas / no solo efectivo
      message += `💳 Formas de pago:\n\n`;
      message += `Bancolombia (Ahorros – Nequi a Bancolombia): 📲 54706725531\n`;
      message += `Daviplata: 📲 313 850 5647\n`;
      // Listado de métodos seleccionados con montos
      Object.entries(paymentSummaryMap).forEach(([method, amount]) => {
        if (method !== 'No especificado' && amount > 0 && method !== 'Efectivo') {
          message += `🔹 ${method}: $${(amount || 0).toLocaleString('es-CO')}\n`;
        }
      });
      // Mostrar efectivo si hay mezcla
      if (!allCashOrUnspecified && paymentSummaryMap['Efectivo'] > 0) {
        message += `🔹 Efectivo: $${(paymentSummaryMap['Efectivo'] || 0).toLocaleString('es-CO')}\n`;
      }
      message += `\n💰 Total: $${(total || 0).toLocaleString('es-CO')}\n`;
      message += `🚚 Estimado: 25-30 min (10-15 si están cerca).\n`;
    }
  }

  message += `\n¡Gracias por tu pedido! 😊`;
  return message;
};