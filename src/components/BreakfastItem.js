//src/components/BreakfastItem.js
import React, { useState, useEffect, useRef } from 'react';
import { TrashIcon, DocumentDuplicateIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon } from '@heroicons/react/24/outline';
import OptionSelector from './OptionSelector';
import BreakfastTimeSelector from './BreakfastTimeSelector';
import AddressInput from './AddressInput';
import PaymentSelector from './PaymentSelector';
import CutlerySelector from './CutlerySelector';
import ProgressBar from './ProgressBar';
import ErrorMessage from './ErrorMessage';
import { calculateBreakfastPrice, calculateBreakfastProgress } from '../utils/BreakfastLogic';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const BreakfastItem = ({
  id,
  displayId,
  breakfast,
  onBreakfastChange,
  onRemoveBreakfast,
  onDuplicateBreakfast,
  eggs = [],
  broths = [],
  riceBread = [],
  drinks = [],
  times = [],
  paymentMethods = [],
  additions = [],
  breakfastTypes = [],
  breakfastProteins = [],
  isIncomplete = false,
  incompleteSlideIndex = null,
  maxBreakfasts = 15,
  totalBreakfasts,
  userRole,
  savedAddress = {},
  isTableOrder = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddressValid, setIsAddressValid] = useState(false);
  const [isAdditionsExpanded, setIsAdditionsExpanded] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [collapseTimeout, setCollapseTimeout] = useState(null);
  const [touchStartX, setTouchStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showMaxBreakfastsError, setShowMaxBreakfastsError] = useState(false);
  const slideRef = useRef(null);
  const containerRef = useRef(null);
  const [tables, setTables] = useState([]);

  // Cargar mesas solo en pedidos de mesa
  useEffect(() => {
    if (!isTableOrder) return;
    const q = query(collection(db, 'tables'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setTables(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      window.dispatchEvent(new Event('optionsUpdated'));
    });
    return () => unsub();
  }, [isTableOrder]);

  const isWaitress = userRole === 3;

  const stepTranslations = {
    broth: 'Caldo',
    eggs: 'Huevos',
    riceBread: 'Arroz/Pan',
    drink: 'Bebida',
    cutlery: 'Cubiertos',
    address: 'Dirección',
    payment: 'Método de pago',
    tableNumber: 'Mesa',
    orderType: 'Tipo de pedido',
    notes: 'Notas',
    protein: 'Proteína',
  };

  // Debug: Log breakfast type and protein data
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BreakfastItem #${displayId}] breakfastType:`, breakfastTypes.find(bt => bt.id === breakfast?.type?.id));
      console.log(`[BreakfastItem #${displayId}] breakfastProteins:`, breakfastProteins);
      console.log(`[BreakfastItem #${displayId}] selected breakfast:`, breakfast);
    }
  }, [breakfast, breakfastTypes, breakfastProteins, displayId]);

  useEffect(() => {
    if (isWaitress && breakfast.orderType === undefined) {
      onBreakfastChange(id, 'orderType', null);
    }
  }, [isWaitress, breakfast.orderType, id, onBreakfastChange]);

  const [pendingTime, setPendingTime] = useState(breakfast?.time || null);
  const [pendingAddress, setPendingAddress] = useState(breakfast?.address || {});

  useEffect(() => {
    setPendingTime(breakfast?.time || null);
    setPendingAddress(breakfast?.address || {});
  }, [breakfast]);

  const price = calculateBreakfastPrice(breakfast, userRole, breakfastTypes);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[BreakfastItem] Precio calculado para Desayuno #${displayId}: ${price}`);
  }

  const stepCompleteness = {
    type: !!breakfast?.type,
    broth: !!breakfast?.broth,
    eggs: !!breakfast?.eggs,
    riceBread: !!breakfast?.riceBread,
    drink: !!breakfast?.drink,
    cutlery: breakfast?.cutlery !== null,
    time: !!breakfast?.time,
    address: !!breakfast?.address?.address,
    payment: isTableOrder ? !!breakfast?.paymentMethod : !!breakfast?.payment,
    tableNumber: !!breakfast?.tableNumber,
    orderType: !!breakfast?.orderType,
    protein: !!breakfast?.protein,
  };

  const breakfastType = breakfastTypes.find(bt => bt.id === breakfast?.type?.id) || { steps: [], requiresProtein: false };
  const currentSteps = breakfastType.steps || [];

  const handleImmediateChange = (field, value) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BreakfastItem #${displayId}] Cambio en campo: ${field}, valor:`, value);
    }
    onBreakfastChange(id, field, value);

    let currentSlideIsComplete = false;

    const resetFields = () => {
      onBreakfastChange(id, 'eggs', null);
      onBreakfastChange(id, 'broth', null);
      onBreakfastChange(id, 'riceBread', null);
      onBreakfastChange(id, 'drink', null);
      onBreakfastChange(id, 'protein', null);
      onBreakfastChange(id, 'cutlery', null);
      onBreakfastChange(id, 'payment', null);
      onBreakfastChange(id, 'time', null);
      onBreakfastChange(id, 'address', savedAddress);
    };

    switch (field) {
      case 'type':
        currentSlideIsComplete = !!value;
        if (value) resetFields();
        break;
      case 'broth':
        currentSlideIsComplete = !!value;
        break;
      case 'eggs':
        currentSlideIsComplete = !!value;
        break;
      case 'riceBread':
        currentSlideIsComplete = !!value;
        break;
      case 'drink':
        currentSlideIsComplete = !!value;
        break;
      case 'protein':
        currentSlideIsComplete = !!value;
        console.log(`[BreakfastItem #${displayId}] Proteína seleccionada:`, value);
        break;
      case 'cutlery':
        currentSlideIsComplete = value !== null;
        break;
      case 'time':
        currentSlideIsComplete = !!value;
        break;
      case 'address':
        currentSlideIsComplete = !!value?.address;
        break;
      case 'payment':
      case 'paymentMethod':
        currentSlideIsComplete = !!value;
        break;
      case 'tableNumber':
        currentSlideIsComplete = !!value;
        break;
      case 'orderType':
        currentSlideIsComplete = !!value;
        break;
      case 'notes':
      case 'additions':
        currentSlideIsComplete = true;
        if (field === 'additions' && isAdditionsExpanded) {
          if (collapseTimeout) clearTimeout(collapseTimeout);
          const timeout = setTimeout(() => setIsAdditionsExpanded(false), 45000);
          setCollapseTimeout(timeout);
        }
        break;
      default:
        break;
    }

    if (currentSlideIsComplete && field !== 'additions' && currentSlide < slides.length - 1) {
      setTimeout(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BreakfastItem] Avanzando al slide:', currentSlide + 1);
        }
        setCurrentSlide(currentSlide + 1);
      }, 300);
    }
  };

  const handleTimeConfirm = () => {
    if (pendingTime) {
      handleImmediateChange('time', pendingTime);
    }
  };

  const handleAddressConfirm = (confirmedDetails) => {
    handleImmediateChange('address', confirmedDetails);
  };

  // Normalize additions to include requiresReplacement flag
  const filteredAdditions = additions.map(add => ({
    ...add,
    requiresReplacement: ['proteína adicional', 'bebida adicional'].includes(add.name.toLowerCase()),
  })).filter(
    (add) => !['Huevos adicionales', 'Caldo adicional'].includes(add.name)
  );

  const handleAddAddition = (addition) => {
    const existingAddition = breakfast.additions?.find((add) => add.id === addition.id);
    const updatedAdditions = breakfast.additions ? [...breakfast.additions] : [];
    if (existingAddition) {
      updatedAdditions[updatedAdditions.findIndex((a) => a.id === addition.id)] = {
        ...existingAddition,
        quantity: (existingAddition.quantity || 1) + 1,
      };
    } else {
      updatedAdditions.push({ ...addition, quantity: 1 });
    }
    handleImmediateChange('additions', updatedAdditions);
  };

  const handleRemoveAddition = (additionId) => {
    const updatedAdditions = (breakfast.additions || [])
      .map((add) => (add.id === additionId ? { ...add, quantity: (add.quantity || 1) - 1 } : add))
      .filter((add) => add.quantity > 0);
    handleImmediateChange('additions', updatedAdditions);
  };

  const handleIncreaseAddition = (additionId) => {
    const updatedAdditions = (breakfast.additions || []).map((add) =>
      add.id === additionId ? { ...add, quantity: (add.quantity || 1) + 1 } : add
    );
    handleImmediateChange('additions', updatedAdditions);
  };

  // Determine which replacements to show for additions
  const getReplacementsForAdditions = () => {
    const selectedAdditions = breakfast?.additions || [];
    const unconfiguredAdditions = selectedAdditions.filter(
      (add) => add.requiresReplacement && (add.name.toLowerCase() === 'proteína adicional' ? !add.protein : !add.replacement)
    );
    if (unconfiguredAdditions.length === 0) return [];

    const firstUnconfigured = unconfiguredAdditions[0];
    if (firstUnconfigured.name.toLowerCase() === 'proteína adicional') return breakfastProteins;
    if (firstUnconfigured.name.toLowerCase() === 'bebida adicional') return drinks.filter((d) => ['limonada', 'Fresa'].includes(d.name));
    return [];
  };

  // Check if submenu should be shown
  const shouldShowReplacements = breakfast?.additions?.some(
    (add) => (add.name.toLowerCase() === 'proteína adicional' && !add.protein) || (add.name.toLowerCase() === 'bebida adicional' && !add.replacement)
  );

  const handleDuplicateClick = () => {
    if (totalBreakfasts >= maxBreakfasts) {
      setShowMaxBreakfastsError(true);
      setTimeout(() => setShowMaxBreakfastsError(false), 3000);
      return;
    }
    setShowMaxBreakfastsError(false);
    onDuplicateBreakfast(breakfast);
  };

  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
    setIsSwiping(false);
  };

  const handleTouchMove = (e) => {
    if (isSwiping || !slideRef.current) return;
    const touchX = e.touches[0].clientX;
    const diff = touchStartX - touchX;

    if (Math.abs(diff) > 100) {
      setIsSwiping(true);
      if (diff > 0 && currentSlide < slides.length - 1) {
        setCurrentSlide(currentSlide + 1);
      } else if (diff < 0 && currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
      }
    }
  };

  const handleTouchEnd = () => {
    setTouchStartX(0);
    setIsSwiping(false);
  };

  const handleSlideChange = (index) => {
    if (slideRef.current) {
      setCurrentSlide(index);
      slideRef.current.style.transform = `translateX(-${index * 100}%)`;
    }
  };

  // Define slides, including protein if required and available
  const slides = [
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          {breakfastTypes.length === 0 ? (
            <p className="text-sm text-red-600">No hay tipos de desayuno disponibles.</p>
          ) : (
            <OptionSelector
              title="Tipo de Desayuno"
              emoji="🌅"
              options={breakfastTypes}
              selected={breakfast?.type || null}
              onImmediateSelect={(option) => handleImmediateChange('type', option)}
            />
          )}
        </div>
      ),
      isComplete: stepCompleteness.type,
      label: 'Tipo',
      associatedField: 'type',
    },
    ...(currentSteps.includes('broth')
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                {broths.length === 0 ? (
                  <p className="text-sm text-red-600">No hay opciones de caldo disponibles.</p>
                ) : (
                  <OptionSelector
                    title="Caldo"
                    emoji="🍲"
                    options={broths}
                    selected={breakfast?.broth}
                    onImmediateSelect={(option) => handleImmediateChange('broth', option)}
                  />
                )}
              </div>
            ),
            isComplete: stepCompleteness.broth,
            label: stepTranslations.broth,
            associatedField: 'broth',
          },
        ]
      : []),
    ...(currentSteps.includes('eggs')
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                {eggs.length === 0 ? (
                  <p className="text-sm text-red-600">No hay opciones de huevos disponibles.</p>
                ) : (
                  <OptionSelector
                    title="Huevos"
                    emoji="🍳"
                    options={eggs}
                    selected={breakfast?.eggs}
                    onImmediateSelect={(option) => handleImmediateChange('eggs', option)}
                  />
                )}
              </div>
            ),
            isComplete: stepCompleteness.eggs,
            label: stepTranslations.eggs,
            associatedField: 'eggs',
          },
        ]
      : []),
    ...(currentSteps.includes('riceBread')
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                {riceBread.length === 0 ? (
                  <p className="text-sm text-red-600">No hay opciones de arroz o pan disponibles.</p>
                ) : (
                  <OptionSelector
                    title="Arroz o Pan"
                    emoji="🍚🍞"
                    options={riceBread}
                    selected={breakfast?.riceBread}
                    onImmediateSelect={(option) => handleImmediateChange('riceBread', option)}
                  />
                )}
              </div>
            ),
            isComplete: stepCompleteness.riceBread,
            label: stepTranslations.riceBread,
            associatedField: 'riceBread',
          },
        ]
      : []),
  ...(currentSteps.includes('drink')
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                {drinks.length === 0 ? (
                  <p className="text-sm text-red-600">No hay opciones de bebida disponibles.</p>
                ) : (
                  <OptionSelector
                    title="Bebida"
                    emoji="🥤"
                    options={drinks}
                    selected={breakfast?.drink}
                    onImmediateSelect={(option) => handleImmediateChange('drink', option)}
                  />
                )}
              </div>
            ),
            isComplete: stepCompleteness.drink,
            label: stepTranslations.drink,
            associatedField: 'drink',
          },
        ]
      : []),
    ...(currentSteps.includes('protein') && breakfastProteins.length > 0
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                {console.log(`[BreakfastItem #${displayId}] Rendering protein slide, options:`, breakfastProteins)}
                {breakfastProteins.length === 0 ? (
                  <p className="text-sm text-red-600">No hay opciones de proteína disponibles. Contacta al administrador.</p>
                ) : (
                  <OptionSelector
                    title="Proteína Moñona"
                    emoji="🍖"
                    options={breakfastProteins}
                    selected={breakfast?.protein}
                    onImmediateSelect={(option) => handleImmediateChange('protein', option)}
                  />
                )}
              </div>
            ),
            isComplete: stepCompleteness.protein,
            label: stepTranslations.protein,
            associatedField: 'protein',
          },
        ]
      : []),
    ...(isTableOrder
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <OptionSelector
                  title="Mesa"
                  emoji="🍽️"
                  options={tables}
                  selected={tables.find(t => t.name === breakfast?.tableNumber) || null}
                  onImmediateSelect={(option) => handleImmediateChange('tableNumber', option?.name)}
                />
                {!breakfast?.tableNumber && (
                  <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1 text-center">
                    Selecciona la mesa
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.tableNumber,
            label: stepTranslations.tableNumber,
            associatedField: 'tableNumber',
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">{stepTranslations.payment}</h4>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-red-600">No hay métodos de pago disponibles.</p>
                ) : (
                  <PaymentSelector
                    paymentMethods={paymentMethods}
                    selectedPayment={isTableOrder ? breakfast?.paymentMethod : breakfast?.payment}
                    setSelectedPayment={(payment) => handleImmediateChange(isTableOrder ? 'paymentMethod' : 'payment', payment)}
                  />
                )}
                {!(isTableOrder ? breakfast?.paymentMethod : breakfast?.payment) && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona un método de pago
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.payment,
            label: stepTranslations.payment,
            associatedField: 'payment',
          },
          ...(isWaitress && isTableOrder
            ? [
                {
                  component: (
                    <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                      <h4 className="text-sm font-semibold text-green-700 mb-2">{stepTranslations.orderType}</h4>
                      <div className="flex space-x-4">
                        <button
                          onClick={() => handleImmediateChange('orderType', 'takeaway')}
                          className={`px-4 py-2 rounded-md ${breakfast.orderType === 'takeaway' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Para llevar
                        </button>
                        <button
                          onClick={() => handleImmediateChange('orderType', 'table')}
                          className={`px-4 py-2 rounded-md ${breakfast.orderType === 'table' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Para mesa
                        </button>
                      </div>
                      {!breakfast?.orderType && (
                        <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
                          Por favor, selecciona el tipo de pedido
                        </p>
                      )}
                    </div>
                  ),
                  isComplete: stepCompleteness.orderType,
                  label: stepTranslations.orderType,
                  associatedField: 'orderType',
                },
              ]
            : []),
        ]
      : [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">{stepTranslations.cutlery}</h4>
                <CutlerySelector
                  cutlery={breakfast?.cutlery}
                  setCutlery={(cutlery) => handleImmediateChange('cutlery', cutlery)}
                />
                {breakfast?.cutlery === null && (
                  <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
                    Por favor, selecciona si necesitas cubiertos
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.cutlery,
            label: stepTranslations.cutlery,
            associatedField: 'cutlery',
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <BreakfastTimeSelector
                  times={times}
                  selectedTime={pendingTime}
                  setSelectedTime={setPendingTime}
                  onConfirm={handleTimeConfirm}
                />
                {!breakfast?.time && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona una hora y confirma
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.time,
            label: 'Hora',
            associatedField: 'time',
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <p className="mb-2 text-sm text-gray-600 text-center md:text-left">
                  🎉 Ingresa tu dirección y teléfono <strong className="text-green-700">una sola vez</strong>. La próxima vez, solo haz clic en <strong className="text-blue-600">"Confirmar" ¡y listo!</strong>
                </p>
                <AddressInput
                  onConfirm={handleAddressConfirm}
                  onValidityChange={(valid) => setIsAddressValid(valid)}
                  initialAddress={breakfast?.address || savedAddress}
                />
                {!breakfast?.address?.address && isAddressValid === false && (
                  <p className="text-[10px] text-red-600 mt-1">
                    Por favor, completa tu dirección y teléfono.
                  </p>
                )}
                {!breakfast?.address?.address && isAddressValid === true && (
                  <p className="text-[10px] text-gray-600 mt-1">
                    Todo listo. Pulsa <span className="font-semibold">“Confirmar dirección”</span> para guardar.
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.address,
            label: stepTranslations.address,
            associatedField: 'address',
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">{stepTranslations.payment}</h4>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-red-600">No hay métodos de pago disponibles.</p>
                ) : (
                  <PaymentSelector
                    paymentMethods={paymentMethods}
                    selectedPayment={isTableOrder ? breakfast?.paymentMethod : breakfast?.payment}
                    setSelectedPayment={(payment) => handleImmediateChange(isTableOrder ? 'paymentMethod' : 'payment', payment)}
                  />
                )}
                {!(isTableOrder ? breakfast?.paymentMethod : breakfast?.payment) && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona un método de pago
                  </p>
                )}
              </div>
            ),
            isComplete: stepCompleteness.payment,
            label: stepTranslations.payment,
            associatedField: 'payment',
          },
        ]),
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          <div className="mt-2">
            <h4 className="text-sm font-semibold text-green-700 mb-1">{stepTranslations.notes}</h4>
            <textarea
              value={breakfast?.notes || ''}
              onChange={(e) => handleImmediateChange('notes', e.target.value)}
              placeholder="Ejemplo: Sin cebolla, extra picante, etc"
              className="w-full p-2 text-sm border rounded-md"
              rows="2"
            />
          </div>
        </div>
      ),
      isComplete: true,
      label: stepTranslations.notes,
      associatedField: 'notes',
    },
  ];

  // Debug: Log slides to verify protein inclusion
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BreakfastItem #${displayId}] Slides:`, slides.map(s => s.label));
    }
  }, [slides, displayId]);

  // Calcular el porcentaje de progreso usando la nueva función
  const completionPercentage = calculateBreakfastProgress(breakfast, isTableOrder, isWaitress, breakfastTypes);

  const isComplete = isTableOrder
    ? isWaitress
      ? stepCompleteness.type &&
        currentSteps.every((step) => stepCompleteness[step]) &&
        stepCompleteness.tableNumber &&
        stepCompleteness.payment &&
        stepCompleteness.orderType
      : stepCompleteness.type &&
        currentSteps.every((step) => stepCompleteness[step]) &&
        stepCompleteness.tableNumber &&
        stepCompleteness.payment
    : stepCompleteness.type &&
      currentSteps.every((step) => stepCompleteness[step]) &&
      stepCompleteness.cutlery &&
      stepCompleteness.time &&
      stepCompleteness.address &&
      stepCompleteness.payment;

  useEffect(() => {
    if (isIncomplete && incompleteSlideIndex !== null) {
      setIsExpanded(true);
      setCurrentSlide(incompleteSlideIndex);
    }
  }, [isIncomplete, incompleteSlideIndex]);

  useEffect(() => {
    let timer;
    if (isComplete && currentSlide === slides.length - 1) {
      timer = setTimeout(() => {
        if (containerRef.current) containerRef.current.style.height = '0';
        setTimeout(() => setIsExpanded(false), 300);
      }, 30000);
    }
    return () => clearTimeout(timer);
  }, [isComplete, currentSlide, slides.length]);

  useEffect(() => {
    const handleUpdateSlide = (event) => {
      if (event.detail && event.detail.slideIndex !== undefined) setCurrentSlide(event.detail.slideIndex);
    };

    const breakfastItem = document.getElementById(`breakfast-item-${id}`);
    if (breakfastItem) breakfastItem.addEventListener('updateSlide', handleUpdateSlide);

    return () => {
      if (breakfastItem) breakfastItem.removeEventListener('updateSlide', handleUpdateSlide);
      if (collapseTimeout) clearTimeout(collapseTimeout);
    };
  }, [id, collapseTimeout]);

  useEffect(() => {
    if (!containerRef.current || !slideRef.current || !isExpanded) {
      if (containerRef.current) containerRef.current.style.height = '0';
      return;
    }

    let timeoutId;
    let observedElement = null;

    const updateHeight = () => {
      if (slideRef.current && slideRef.current.children && slideRef.current.children[currentSlide]) {
        const slideHeight = slideRef.current.children[currentSlide].offsetHeight;
        containerRef.current.style.height = `${slideHeight + 8}px`;
      } else {
        containerRef.current.style.height = 'auto';
      }
    };

    const debouncedUpdateHeight = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateHeight, 100);
    };

    debouncedUpdateHeight();

    const observer = new ResizeObserver(() => debouncedUpdateHeight());

    if (slideRef.current && slideRef.current.children[currentSlide]) {
      observedElement = slideRef.current.children[currentSlide];
      observer.observe(observedElement);
    }

    const handleOptionsChange = () => debouncedUpdateHeight();
    window.addEventListener('optionsUpdated', handleOptionsChange);

    return () => {
      if (observedElement) observer.unobserve(observedElement);
      observer.disconnect();
      clearTimeout(timeoutId);
      window.removeEventListener('optionsUpdated', handleOptionsChange);
    };
  }, [currentSlide, isExpanded, breakfast.type, eggs, broths, riceBread, drinks, times, paymentMethods, additions, breakfastTypes, breakfastProteins]);

  return (
    <div id={`breakfast-item-${id}`} className="relative mb-2">
      <div className="relative bg-white rounded-lg shadow-md">
        <div
          className="sticky top-0 z-[10000] bg-white p-2 border-b border-gray-200 rounded-t-lg"
          onClick={() => {
            if (!isExpanded) setIsExpanded(true);
            else if (containerRef.current) {
              containerRef.current.style.height = '0';
              setTimeout(() => setIsExpanded(false), 300);
            }
          }}
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer hover:bg-gray-50">
            <div className="flex items-center mb-1 sm:mb-0">
              <div
                className={`w-6 h-6 rounded-full mr-2 flex items-center justify-center ${
                  isComplete ? 'bg-green-700 text-white' : 'bg-green-200 text-green-700'
                } text-xs font-medium`}
              >
                {isComplete ? '✓' : displayId}
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-800">
                  Desayuno #{displayId} - {breakfast?.type?.name || 'Selecciona'} - ${price.toLocaleString('es-CO')}
                </h3>
                <ProgressBar progress={completionPercentage} className="w-24 sm:w-32 mt-1" />
              </div>
            </div>
            <div className="flex items-center space-x-1 mt-1 sm:mt-0">
              {isComplete && (
                <span className="hidden sm:inline-flex">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-200 text-green-700">
                    Completo
                  </span>
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicateClick();
                }}
                className={`duplicate-button p-1 text-green-700 hover:text-green-800 flex items-center transition-colors ${
                  totalBreakfasts >= maxBreakfasts ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                aria-label={`Duplicar Desayuno #${displayId}`}
                disabled={totalBreakfasts >= maxBreakfasts}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs font-bold">Duplicar</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveBreakfast(id);
                }}
                className="remove-button p-1 text-red-600 hover:text-red-700 flex items-center transition-colors"
                aria-label={`Eliminar Desayuno #${displayId}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 11-2 0V8z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-xs font-bold">Eliminar</span>
              </button>
            </div>
          </div>
        </div>

        {showMaxBreakfastsError && (
          <ErrorMessage
            message="Has alcanzado el máximo de 15 desayunos. No puedes duplicar más."
            className="fixed top-4 right-4 z-50 bg-green-100 text-green-800"
            onClose={() => setShowMaxBreakfastsError(false)}
          />
        )}
        {isExpanded && (
          <div className="p-2">
            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-lg"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ transition: 'height 0.3s ease-in-out' }}
            >
              <div
                ref={slideRef}
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {slides.map((slide, index) => (
                  <div key={index} className="w-full flex-shrink-0" style={{ height: 'fit-content' }}>
                    <div className="p-2" style={{ height: 'fit-content' }}>
                      {slide.component}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center mt-1">
              <button
                className="prev-button p-1 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleSlideChange(currentSlide - 1)}
                disabled={currentSlide === 0}
                aria-label="Anterior"
              >
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <div className="flex space-x-1">
                {slides.map((slide, index) => (
                  <button
                    key={index}
                    onClick={() => handleSlideChange(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentSlide === index ? 'bg-green-700' : slide.isComplete ? 'bg-green-400' : 'bg-green-200'
                    }`}
                    aria-label={`Ir a ${slide.label}`}
                    title={slide.label}
                  />
                ))}
              </div>
              <button
                className="next-button p-1 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleSlideChange(currentSlide + 1)}
                disabled={currentSlide === slides.length - 1}
                aria-label="Siguiente"
              >
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md mt-2 p-3">
        <div
          className="flex items-center cursor-pointer justify-between p-2 hover:bg-gray-50"
          onClick={() => {
            setIsAdditionsExpanded(!isAdditionsExpanded);
            if (collapseTimeout) clearTimeout(collapseTimeout);
          }}
        >
          <h3 className="text-sm font-medium text-gray-700 flex flex-wrap items-center gap-x-1">
            <span className="text-base">➕</span>
            <span>Adiciones para Desayuno #{displayId}</span>
            <span className="font-bold text-gray-800">(opcional)</span>
          </h3>
          <span className="ml-auto text-xs text-gray-500">
            {isAdditionsExpanded ? 'Ocultar' : 'Mostrar'}
          </span>
        </div>
        {isAdditionsExpanded && (
          <div className="mt-2">
            {filteredAdditions.length === 0 ? (
              <p className="text-sm text-red-600">No hay adiciones disponibles.</p>
            ) : (
              <OptionSelector
                title="Adiciones (por desayuno)"
                emoji="➕"
                options={filteredAdditions}
                selected={breakfast.additions || []}
                multiple={true}
                showReplacements={shouldShowReplacements}
                replacements={getReplacementsForAdditions()}
                onImmediateSelect={(selection) => {
                  const updatedSelection = selection.map(add => {
                    const existingAdd = breakfast?.additions?.find(a => a.id === add.id);
                    return {
                      ...add,
                      quantity: existingAdd ? (existingAdd.quantity || 1) : 1,
                      protein: add.name.toLowerCase() === 'proteína adicional' ? (add.protein || '') : add.protein || '',
                      replacement: add.name.toLowerCase() === 'bebida adicional' ? (add.replacement || '') : add.replacement || '',
                    };
                  });
                  handleImmediateChange('additions', updatedSelection);
                }}
                onImmediateReplacementSelect={({ id: additionId, replacement }) => {
                  const updatedAdditions = (breakfast?.additions || []).map((add) => {
                    if (add.id === additionId) {
                      return {
                        ...add,
                        protein: add.name.toLowerCase() === 'proteína adicional' ? replacement?.name || add.protein : add.protein,
                        replacement: add.name.toLowerCase() === 'bebida adicional' ? replacement?.name || add.replacement : add.replacement,
                      };
                    }
                    return add;
                  });
                  handleImmediateChange('additions', updatedAdditions);
                }}
                onAdd={handleAddAddition}
                onRemove={handleRemoveAddition}
                onIncrease={handleIncreaseAddition}
              />
            )}
            {breakfast.additions?.length > 0 && (
              <div className="mt-2 text-sm font-semibold text-gray-700">
                Total Adiciones de este desayuno: $
                {breakfast.additions
                  .reduce((sum, item) => sum + (item?.price || 0) * (item?.quantity || 1), 0)
                  .toLocaleString('es-CO')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BreakfastItem;