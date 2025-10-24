//src/components/MealItem.js
import React, { useState, useEffect, useRef } from 'react';
import OptionSelector from './OptionSelector';
import TimeSelector from './TimeSelector';
import AddressInput from './AddressInput';
import PaymentSelector from './PaymentSelector';
import CutlerySelector from './CutlerySelector';
import ProgressBar from './ProgressBar';
import OnboardingTutorial from './OnboardingTutorial';
import ErrorMessage from './ErrorMessage';
import { calculateMealPrice } from '../utils/MealCalculations';
import { db } from '../config/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const MealItem = ({
  id,
  meal,
  onMealChange,
  onRemoveMeal,
  onDuplicateMeal,
  soups = [],
  soupReplacements = [],
  principles = [],
  proteins = [],
  drinks = [],
  sides = [],
  times = [],
  paymentMethods = [],
  additions = [],
  isIncomplete = false,
  incompleteSlideIndex = null,
  address = {},
  showTutorial,
  setShowTutorial,
  maxMeals,
  totalMeals,
  successMessage,
  setSuccessMessage,
  isTableOrder = false,
  userRole, // Nuevo prop para identificar el rol
}) => {
  const [isExpanded, setIsExpanded] = useState(meal?.__startCollapsed ? false : true);
  const [isAdditionsExpanded, setIsAdditionsExpanded] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [collapseTimeout, setCollapseTimeout] = useState(null);
  const [touchStartX, setTouchStartX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showMaxMealsError, setShowMaxMealsError] = useState(false);
  const slideRef = useRef(null);
  const containerRef = useRef(null);
  const [tables, setTables] = useState([]);
  const [isAddressValid, setIsAddressValid] = useState(false);
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

  useEffect(() => {
    if (isWaitress && meal.orderType === undefined) {
      onMealChange(id, 'orderType', null);
    }
  }, [isWaitress, meal.orderType, id, onMealChange]);

  const [pendingTime, setPendingTime] = useState(meal?.time || null);
  const [pendingAddress, setPendingAddress] = useState(meal?.address || {});

  useEffect(() => {
    setPendingTime(meal?.time || null);
    setPendingAddress(meal?.address || {});
  }, [meal]);

  const isSoupComplete = meal?.soup || meal?.soupReplacement;
  const isPrincipleComplete = meal?.principle && (
    (Array.isArray(meal.principle) && meal.principle.length === 1 && meal.principle[0]?.name === 'Remplazo por Principio' && !!meal?.principleReplacement) ||
    (Array.isArray(meal.principle) && meal.principle.length >= 1 && meal.principle.length <= 2 && !meal.principle.some(opt => opt.name === 'Remplazo por Principio'))
  );

  const isCompleteRice = Array.isArray(meal?.principle) && meal.principle.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));
  const selectedRiceName = isCompleteRice ? meal.principle.find(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name))?.name : '';
  const isReplacementWithPrinciple = Array.isArray(meal?.principle) && meal.principle.some(p => p.name === 'Remplazo por Principio') && meal?.principleReplacement;

  const isSidesComplete = isCompleteRice || (Array.isArray(meal?.sides) && meal.sides.length > 0);

  // Limpiar el nombre de la proteína para evitar duplicar el precio
  const cleanProteinName = (proteinName) => {
    if (!proteinName) return 'Selecciona';
    // Remover el precio del nombre si está incluido (formato "+ $X.XXX")
    return proteinName.replace(/\s*\+\s*\$[\d,.]+/g, '').trim();
  };

  const displayMainItem = isCompleteRice ? selectedRiceName : cleanProteinName(meal?.protein?.name) || 'Selecciona';

  const totalSteps = isTableOrder ? (isWaitress ? 7 : 6) : 9; // +1 para orderType en mesera
  const completedSteps = [
    isSoupComplete,
    isPrincipleComplete,
    isCompleteRice || !!meal?.protein,
    !!meal?.drink,
    isTableOrder ? !!meal?.tableNumber : meal?.cutlery !== null,
    isTableOrder ? !!meal?.paymentMethod : !!meal?.time,
    ...(isTableOrder ? (isWaitress ? [!!meal?.orderType] : []) : [!!meal?.address?.address, !!meal?.payment]),
    isSidesComplete,
  ].filter(Boolean).length;

  const completionPercentage = Math.min(Math.round((completedSteps / totalSteps) * 100), 100);

  const isComplete = isTableOrder
    ? isWaitress
      ? isSoupComplete && isPrincipleComplete && (isCompleteRice || !!meal?.protein) && !!meal?.drink && !!meal?.tableNumber && !!meal?.paymentMethod && !!meal?.orderType && isSidesComplete
      : isSoupComplete && isPrincipleComplete && (isCompleteRice || !!meal?.protein) && !!meal?.drink && !!meal?.tableNumber && !!meal?.paymentMethod && isSidesComplete
    : isSoupComplete && isPrincipleComplete && (isCompleteRice || !!meal?.protein) && !!meal?.drink && !!meal?.time && !!meal?.address?.address && !!meal?.payment && meal?.cutlery !== null && isSidesComplete;

  const handleTutorialComplete = () => setShowTutorial(false);

  const handleImmediateChange = (field, value) => {
    let updatedMeal = { ...meal, [field]: value };
    let currentSlideIsComplete = false;

    if (field === 'principle') {
      const isNewSelectionCompleteRice = Array.isArray(value) && value.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));
      if (isNewSelectionCompleteRice) {
        updatedMeal = { ...updatedMeal, protein: null };
        onMealChange(id, 'protein', null);
      }
      onMealChange(id, 'principle', value);
      currentSlideIsComplete = updatedMeal?.principle && (
        (Array.isArray(updatedMeal.principle) && updatedMeal.principle.length === 1 && updatedMeal.principle[0]?.name === 'Remplazo por Principio' && !!updatedMeal?.principleReplacement) ||
        (Array.isArray(updatedMeal.principle) && updatedMeal.principle.length >= 1 && updatedMeal.principle.length <= 2 && !updatedMeal.principle.some(opt => opt.name === 'Remplazo por Principio'))
      );
      if (isNewSelectionCompleteRice && currentSlide < slides.length - 1) {
        setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
      }
    } else {
      onMealChange(id, field, value);
    }

    switch (field) {
      case 'soup':
currentSlideIsComplete = !!updatedMeal?.soup && (updatedMeal?.soup.name !== 'Remplazo por Sopa' || !!updatedMeal?.soup.replacement);
        break;
      case 'soupReplacement':
        currentSlideIsComplete = !!updatedMeal?.soupReplacement;
        break;
      case 'principle':
        break;
      case 'protein':
        currentSlideIsComplete = isCompleteRice || !!updatedMeal?.protein;
        break;
      case 'drink':
        currentSlideIsComplete = !!updatedMeal?.drink;
        break;
      case 'cutlery':
        currentSlideIsComplete = updatedMeal?.cutlery !== null;
        if (currentSlideIsComplete && currentSlide < slides.length - 1) {
          setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
        }
        break;
      case 'time':
        currentSlideIsComplete = !!updatedMeal?.time;
        if (currentSlideIsComplete && currentSlide < slides.length - 1) {
          setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
        }
        break;
      case 'payment':
      case 'paymentMethod':
        currentSlideIsComplete = !!updatedMeal?.[field];
        if (currentSlideIsComplete && currentSlide < slides.length - 1) {
          setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
        }
        break;
      case 'sides':
        currentSlideIsComplete = isCompleteRice || (Array.isArray(value) && value.length > 0);
        break;
      case 'notes':
      case 'additions':
        currentSlideIsComplete = true;
        if (field === 'additions' && isAdditionsExpanded) {
          if (collapseTimeout) clearTimeout(collapseTimeout);
          const timeout = setTimeout(() => setIsAdditionsExpanded(false), 10000);
          setCollapseTimeout(timeout);
        }
        break;
      case 'tableNumber':
        currentSlideIsComplete = !!updatedMeal?.tableNumber;
        if (currentSlideIsComplete && currentSlide < slides.length - 1) {
          setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
        }
        break;
      case 'orderType':
        currentSlideIsComplete = !!updatedMeal?.orderType;
        if (currentSlideIsComplete && currentSlide < slides.length - 1) {
          setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
        }
        break;
      default:
        break;
    }

    if (currentSlideIsComplete && field !== 'additions' && field !== 'principle' && currentSlide < slides.length - 1) {
      setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
    }
  };

  const handleOptionConfirm = (field, { selection, replacement }) => {
    if (field === 'principle') {
      let newSelection = selection;
      const isNewSelectionCompleteRice = selection.some(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name));

      if (isNewSelectionCompleteRice) {
        newSelection = selection.filter(p => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(p.name)).slice(-1);
        onMealChange(id, 'protein', null);
      } else if (selection.length > 2) {
        newSelection = selection.slice(0, 2);
      }

      onMealChange(id, 'principle', newSelection);
      if (replacement) onMealChange(id, 'principleReplacement', replacement);

      const updatedMealForCheck = { ...meal, principle: newSelection, principleReplacement: replacement || meal.principleReplacement };
      const checkPrincipleComplete = updatedMealForCheck?.principle && (
        (Array.isArray(updatedMealForCheck.principle) && updatedMealForCheck.principle.length === 1 && updatedMealForCheck.principle[0]?.name === 'Remplazo por Principio' && !!updatedMealForCheck?.principleReplacement) ||
        (Array.isArray(updatedMealForCheck.principle) && updatedMealForCheck.principle.length >= 1 && updatedMealForCheck.principle.length <= 2 && !updatedMealForCheck.principle.some(opt => opt.name === 'Remplazo por Principio'))
      );

      if (checkPrincipleComplete && currentSlide < slides.length - 1) {
        setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
      }
    } else {
      onMealChange(id, field, selection);
      if (replacement) onMealChange(id, `${field}Replacement`, replacement);
      if (currentSlide < slides.length - 1) {
        setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
      }
    }
  };

  const handleTimeConfirm = () => {
    if (pendingTime) {
      handleImmediateChange('time', pendingTime);
    }
  };

  const handleAddressConfirm = (confirmedDetails) => {
    onMealChange(id, 'address', confirmedDetails);
    if (currentSlide < slides.length - 1) setTimeout(() => setCurrentSlide(currentSlide + 1), 300);
  };

  const filteredSoups = soups.filter(soup => soup.name !== 'Solo bandeja' && soup.name !== 'Remplazo por Sopa');
  const filteredPrinciples = principles.filter(principle =>
    principle.name !== 'Remplazo por Principio' &&
    !['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(principle.name)
  );
  const normalizedAdditions = additions.map(add => ({
    ...add,
    price: add.name === 'Mojarra' ? 8000 : add.price,
    requiresReplacement: add.requiresReplacement || ['Proteína adicional', 'Sopa adicional', 'Principio adicional', 'Bebida adicional'].includes(add.name),
  })).filter(add =>
    add.name !== 'Arroz con pollo' &&
    add.name !== 'Arroz paisa' &&
    add.name !== 'Arroz tres carnes'
  );

  const getReplacementsForAdditions = () => {
    const selectedAdditions = meal?.additions || [];
    const unconfiguredAdditions = selectedAdditions.filter(
      (add) => add.requiresReplacement && (add.name === 'Proteína adicional' ? !add.protein : !add.replacement)
    );
    if (unconfiguredAdditions.length === 0) return [];

    const firstUnconfigured = unconfiguredAdditions[0];
    if (firstUnconfigured.name === 'Sopa adicional') return filteredSoups;
    if (firstUnconfigured.name === 'Principio adicional') return filteredPrinciples;
    if (firstUnconfigured.name === 'Proteína adicional') return proteins.filter((p) => p.name !== 'Mojarra');
    if (firstUnconfigured.name === 'Bebida adicional') return drinks.filter((d) => d.name !== 'Sin bebida');
    return [];
  };

  const shouldShowReplacements = meal?.additions?.some(
    add => (add.name === 'Proteína adicional' && !add.protein) || (add.name === 'Sopa adicional' && !add.replacement) || (add.name === 'Principio adicional' && !add.replacement) || (add.name === 'Bebida adicional' && !add.replacement)
  );

  const slides = [
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          <OptionSelector
            title="Sopa"
            emoji="🥣"
            options={soups}
            selected={meal?.soup}
            onImmediateSelect={(option) => handleImmediateChange('soup', option)}
            showReplacements={meal?.soup?.name === 'Remplazo por Sopa'}
            replacements={soupReplacements}
            selectedReplacement={meal?.soupReplacement}
            onImmediateReplacementSelect={(option) => handleImmediateChange('soupReplacement', option)}
          />
        </div>
      ),
      isComplete: isSoupComplete,
      label: 'Sopa',
      associatedField: 'soup'
    },
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          <OptionSelector
            title="Principio"
            emoji="🍚"
            options={principles}
            selected={meal?.principle}
            multiple={true}
            showConfirmButton={!isCompleteRice && !isReplacementWithPrinciple}
            onImmediateSelect={(selection) => handleImmediateChange('principle', selection)}
            onConfirm={(data) => handleOptionConfirm('principle', data)}
            showReplacements={Array.isArray(meal?.principle) && meal.principle.some(opt => opt.name === 'Remplazo por Principio')}
            replacements={soupReplacements}
            selectedReplacement={meal?.principleReplacement}
            onImmediateReplacementSelect={(option) => handleImmediateChange('principleReplacement', option)}
          />
        </div>
      ),
      isComplete: isPrincipleComplete,
      label: 'Principio',
      associatedField: 'principle'
    },
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          {isCompleteRice ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-green-700">
                {`${selectedRiceName} seleccionado`}
              </p>
              <p className="text-xs text-gray-600">
                La proteína ya está incluida. Si no te gusta, escoge un principio diferente que sí tenga la proteína aparte.
              </p>
              <p className="text-xs text-gray-600">
                Pasa a la siguiente o retrocede, si quieres proteína incluida con el arroz, escoge la proteína como adicional abajo en la ➕ Adiciones para Almuerzo
              </p>
              <div className="mt-2 flex justify-center space-x-4">
                <button
                  onClick={() => setCurrentSlide(currentSlide + 1)}
                  className="px-3 py-1 bg-green-600 text-white rounded-md text-xs hover:bg-green-700"
                >
                  Siguiente
                </button>
                <button
                  onClick={() => setCurrentSlide(currentSlide - 1)}
                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded-md text-xs hover:bg-gray-400"
                >
                  Retroceder
                </button>
              </div>
            </div>
          ) : (
            <OptionSelector
              title="Proteína"
              emoji="🍗"
              options={proteins}
              selected={meal?.protein}
              onImmediateSelect={(option) => handleImmediateChange('protein', option)}
            />
          )}
        </div>
      ),
      isComplete: isCompleteRice || !!meal?.protein,
      label: 'Proteína',
      associatedField: 'protein'
    },
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          <OptionSelector
            title="Bebida"
            emoji="🥤"
            options={drinks}
            selected={meal?.drink}
            onImmediateSelect={(option) => handleImmediateChange('drink', option)}
          />
        </div>
      ),
      isComplete: !!meal?.drink,
      label: 'Bebida',
      associatedField: 'drink'
    },
    ...(isTableOrder
      ? [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <OptionSelector
                  title="Mesa"
                  emoji="🍽️"
                  options={tables}
                  selected={tables.find(t => t.name === meal?.tableNumber) || null}
                  onImmediateSelect={(option) => handleImmediateChange('tableNumber', option?.name)}
                />
                {!meal?.tableNumber && (
                  <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
                    Por favor, selecciona una mesa
                  </p>
                )}
              </div>
            ),
            isComplete: !!meal?.tableNumber,
            label: 'Mesa',
            associatedField: 'tableNumber'
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">Método de Pago</h4>
                <PaymentSelector
                  paymentMethods={paymentMethods}
                  selectedPayment={meal?.paymentMethod}
                  setSelectedPayment={(payment) => handleImmediateChange('paymentMethod', payment)}
                />
                {!meal?.paymentMethod && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona un método de pago
                  </p>
                )}
              </div>
            ),
            isComplete: !!meal?.paymentMethod,
            label: 'Método de pago',
            associatedField: 'paymentMethod'
          },
...(isWaitress && isTableOrder ? [{
  component: (
    <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
      <h4 className="text-sm font-semibold text-green-700 mb-2">¿Para llevar o para mesa?</h4>
      <div className="flex space-x-4">
        <button
          onClick={() => handleImmediateChange('orderType', 'takeaway')}
          className={`px-4 py-2 rounded-md ${meal.orderType === 'takeaway' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Para llevar
        </button>
        <button
          onClick={() => handleImmediateChange('orderType', 'table')}
          className={`px-4 py-2 rounded-md ${meal.orderType === 'table' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Para mesa
        </button>
      </div>
      {!meal?.orderType && (
        <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
          Por favor, selecciona el tipo de pedido
        </p>
      )}
    </div>
  ),
  isComplete: !!meal?.orderType,
  label: 'Tipo de pedido',
  associatedField: 'orderType'
}] : [])
        ]
      : [
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">Cubiertos</h4>
                <CutlerySelector
                  cutlery={meal?.cutlery}
                  setCutlery={(cutlery) => handleImmediateChange('cutlery', cutlery)}
                />
                {meal?.cutlery === null && (
                  <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
                    Por favor, selecciona si necesitas cubiertos
                  </p>
                )}
              </div>
            ),
            isComplete: meal?.cutlery !== null,
            associatedField: 'cutlery'
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <TimeSelector
                  times={times}
                  selectedTime={pendingTime}
                  setSelectedTime={setPendingTime}
                  onConfirm={handleTimeConfirm}
                />
                {!meal?.time && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona una hora y confirma
                  </p>
                )}
              </div>
            ),
            isComplete: !!meal?.time,
            label: 'Hora',
            associatedField: 'time'
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
                  initialAddress={meal?.address || {}}
                />
                {!meal?.address?.address && isAddressValid === false && (
                  <p className="text-[10px] text-red-600 mt-1">
                    Por favor, completa tu dirección y teléfono.
                  </p>
                )}
                {!meal?.address?.address && isAddressValid === true && (
                  <p className="text-[10px] text-gray-600 mt-1">
                    Todo listo. Pulsa <span className="font-semibold">“Confirmar dirección”</span> para guardar.
                  </p>
                )}
              </div>
            ),
            isComplete: !!meal?.address?.address,
            label: 'Dirección',
            associatedField: 'address'
          },
          {
            component: (
              <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
                <h4 className="text-sm font-semibold text-green-700 mb-2">Método de Pago</h4>
                <PaymentSelector
                  paymentMethods={paymentMethods}
                  selectedPayment={meal?.payment}
                  setSelectedPayment={(payment) => handleImmediateChange('payment', payment)}
                />
                {!meal?.payment && (
                  <p className="text-sm font-semibold text-red-600 bg-red-50 p-2 rounded mt-2">
                    Por favor, selecciona un método de pago
                  </p>
                )}
              </div>
            ),
            isComplete: !!meal?.payment,
            label: 'Método de pago',
            associatedField: 'payment'
          },
        ]),
    {
      component: (
        <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 shadow-sm slide-item">
          {isCompleteRice ? (
            <div className="text-center">
              <p className="text-sm font-semibold text-green-700">
                {`${selectedRiceName} seleccionado`}
              </p>
              <p className="text-xs text-gray-600">La proteína ya está incluida y viene acompañada de papa a la francesa, ensalada dulce, sopa y bebida.</p>
              <p className="text-xs text-gray-600">Si tienes alguna preferencia, por favor agrégala en las notas adicionales.</p>
              <div className="mt-2">
                <h4 className="text-sm font-semibold text-green-700 mb-1">Notas Adicionales</h4>
                <textarea
                  value={meal?.notes || ''}
                  onChange={(e) => handleImmediateChange('notes', e.target.value)}
                  placeholder="Ejemplo: Sin ensalada dulce, más papa a la francesa, etc"
                  className="w-full p-2 text-sm border rounded-md"
                  rows="2"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 text-sm text-gray-700 px-2">
                Selecciona los acompañamientos que prefieras;{' '}
                <span className="font-semibold">
                  los no seleccionados se considerarán no deseados.
                </span>
              </div>
              <OptionSelector
                title="Acompañamiento"
                emoji="🥗"
                options={sides}
                selected={meal?.sides}
                multiple={true}
                onImmediateSelect={(selection) => handleImmediateChange('sides', selection)}
              />
              {!isSidesComplete && (
                <p className="text-xs font-semibold text-red-600 bg-red-50 p-1 rounded mt-1">
                  Por favor, selecciona al menos un acompañamiento
                </p>
              )}
              <div className="mt-2">
                <h4 className="text-sm font-semibold text-green-700 mb-1">Notas Adicionales</h4>
                <textarea
                  value={meal?.notes || ''}
                  onChange={(e) => handleImmediateChange('notes', e.target.value)}
                  placeholder="Ejemplo: Poquito arroz, más plátano en lugar de ensalada, etc"
                  className="w-full p-2 text-sm border rounded-md"
                  rows="2"
                />
              </div>
            </>
          )}
        </div>
      ),
      isComplete: isSidesComplete,
      label: 'Acompañamiento',
      associatedField: 'sides'
    },
  ];

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
  }, 10000);
    }
    return () => clearTimeout(timer);
  }, [isComplete, currentSlide, slides.length]);

  useEffect(() => {
    const handleUpdateSlide = (event) => {
      if (event.detail && event.detail.slideIndex !== undefined) setCurrentSlide(event.detail.slideIndex);
    };

    const mealItem = document.getElementById(`meal-item-${id}`);
    if (mealItem) mealItem.addEventListener('updateSlide', handleUpdateSlide);

    return () => {
      if (mealItem) mealItem.removeEventListener('updateSlide', handleUpdateSlide);
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
  }, [currentSlide, isExpanded, soups, soupReplacements, principles, proteins, drinks, sides, times, paymentMethods, additions]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
      slideRef.current.style.transform = `translateX(-${(currentSlide + 1) * 100}%)`;
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0 && currentSlide < slides.length) {
      setCurrentSlide(currentSlide - 1);
      slideRef.current.style.transform = `translateX(-${(currentSlide - 1) * 100}%)`;
    }
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
        slideRef.current.style.transform = `translateX(-${(currentSlide + 1) * 100}%)`;
      } else if (diff < 0 && currentSlide > 0) {
        setCurrentSlide(currentSlide - 1);
        slideRef.current.style.transform = `translateX(-${(currentSlide - 1) * 100}%)`;
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

  const handleAddAddition = (addition) => {
    const existingAddition = meal?.additions?.find(a => a.id === addition.id);
    const updatedAdditions = meal?.additions ? [...meal.additions] : [];
    if (existingAddition) {
      updatedAdditions[updatedAdditions.findIndex(a => a.id === addition.id)] = {
        ...existingAddition,
        quantity: (existingAddition.quantity || 1) + 1,
      };
    } else {
      updatedAdditions.push({ ...addition, quantity: 1 });
    }
    handleImmediateChange('additions', updatedAdditions);
  };

  const handleRemoveAddition = (additionId) => {
    const updatedAdditions = (meal?.additions || [])
      .map(add => add.id === additionId ? { ...add, quantity: (add.quantity || 1) - 1 } : add)
      .filter(add => add.quantity > 0);
    handleImmediateChange('additions', updatedAdditions);
  };

  const handleIncreaseAddition = (additionId) => {
    const updatedAdditions = (meal?.additions || []).map(add =>
      add.id === additionId ? { ...add, quantity: (add.quantity || 1) + 1 } : add
    );
    handleImmediateChange('additions', updatedAdditions);
  };

  const handleDuplicateClick = () => {
    if (totalMeals >= maxMeals) {
      setShowMaxMealsError(true);
      setTimeout(() => setShowMaxMealsError(false), 3000);
      return;
    }
    setShowMaxMealsError(false);
    onDuplicateMeal(meal);
  };

  return (
    <div id={`meal-item-${id}`} className="relative mb-2">
      {showTutorial && id === 0 && (
        <OnboardingTutorial run={showTutorial} onComplete={handleTutorialComplete} />
      )}
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
              <div className={`w-6 h-6 rounded-full mr-2 flex items-center justify-center ${isComplete ? 'bg-green-700 text-white' : 'bg-green-200 text-green-700'} text-xs font-medium`}>
                {isComplete ? '✓' : id + 1}
              </div>
              <div>
                <h3 className="font-bold text-sm text-gray-800">
                  Almuerzo #{id + 1} - {displayMainItem} - ${calculateMealPrice(meal, userRole).toLocaleString('es-CO')}
                </h3>
                <ProgressBar progress={completionPercentage} className="w-24 sm:w-32 mt-1" />
              </div>
            </div>
            <div className="flex items-center space-x-1 mt-1 sm:mt-0">
              {isComplete && (
                <span className="hidden sm:inline-flex">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-200 text-green-700">Completo</span>
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicateClick();
                }}
                className={`duplicate-button p-1 text-green-700 hover:text-green-800 flex items-center transition-colors ${totalMeals >= maxMeals ? 'opacity-50 cursor-not-allowed' : ''}`}
                aria-label={`Duplicar Almuerzo #${id + 1}`}
                disabled={totalMeals >= maxMeals}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-bold">Duplicar</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveMeal(id);
                }}
                className="remove-button p-1 text-red-600 hover:text-red-700 flex items-center transition-colors"
                aria-label={`Eliminar Almuerzo #${id + 1}`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                </svg>
                <span className="text-xs font-bold">Eliminar</span>
              </button>
            </div>
          </div>
        </div>

        {showMaxMealsError && (
          <ErrorMessage
            message="Has alcanzado el máximo de 15 almuerzos. No puedes duplicar más."
            className="fixed top-4 right-4 z-50 bg-green-100 text-green-800"
            onClose={() => setShowMaxMealsError(false)}
          />
        )}
        {successMessage && !showMaxMealsError && (
          <ErrorMessage
            message={successMessage}
            className="fixed top-12 right-4 z-50 bg-green-100 text-green-800 mt-2"
            onClose={() => setSuccessMessage('')}
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
                    <div className="p-2" style={{ height: 'fit-content' }}>{slide.component}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between items-center mt-1">
              <button
                className="prev-button p-1 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handlePrev}
                disabled={currentSlide === 0}
                aria-label="Anterior"
              >
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
              <div className="flex space-x-1">
                {slides.map((slide, index) => (
                  <button
                    key={index}
                    onClick={() => handleSlideChange(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${currentSlide === index ? 'bg-green-700' : slide.isComplete ? 'bg-green-400' : 'bg-green-200'}`}
                    aria-label={`Ir a ${slide.label}`}
                    title={slide.label}
                  />
                ))}
              </div>
              <button
                className="next-button p-1 rounded-full text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleNext}
                disabled={currentSlide === slides.length - 1}
                aria-label="Siguiente"
              >
                <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
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
            <span>Adiciones para Almuerzo #{id + 1}</span>
            <span className="font-bold text-gray-800">(opcional)</span>
          </h3>
          <span className="ml-auto text-xs text-gray-500">
            {isAdditionsExpanded ? 'Ocultar' : 'Mostrar'}
          </span>
        </div>
        {isAdditionsExpanded && (
          <div className="mt-2">
            <OptionSelector
              title="Adiciones (por almuerzo)"
              emoji="➕"
              options={normalizedAdditions}
              selected={meal?.additions || []}
              multiple={true}
              showReplacements={shouldShowReplacements}
              replacements={getReplacementsForAdditions()}
              onImmediateSelect={(selection) => {
                const updatedSelection = selection.map(add => {
                  const existingAdd = meal?.additions?.find(a => a.id === add.id);
                  return {
                    ...add,
                    quantity: existingAdd ? (existingAdd.quantity || 1) : 1,
                    protein: add.name === 'Proteína adicional' ? (add.protein || '') : add.protein || '',
                    replacement: (add.name === 'Sopa adicional' || add.name === 'Principio adicional') ? (add.replacement || '') : add.replacement || '',
                  };
                });
                handleImmediateChange('additions', updatedSelection);
              }}
              onImmediateReplacementSelect={({ id: additionId, replacement }) => {
                const updatedAdditions = (meal?.additions || []).map((add) => {
                  if (add.id === additionId) {
                    return {
                      ...add,
                      protein: add.name === 'Proteína adicional' ? replacement?.name || add.protein : add.protein,
                      replacement:
                        ['Sopa adicional', 'Principio adicional', 'Bebida adicional'].includes(add.name)
                          ? replacement?.name || add.replacement
                          : add.replacement,
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
            {meal?.additions?.length > 0 && (
              <div className="mt-2 text-sm font-semibold text-gray-700">
                Total Adiciones de este almuerzo: $
                {meal.additions.reduce((sum, item) => sum + (item?.price || 0) * (item?.quantity || 1), 0).toLocaleString('es-CO')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MealItem;