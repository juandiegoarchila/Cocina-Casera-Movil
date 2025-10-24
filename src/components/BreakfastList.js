//src/components/BreakfastList.js
import React, { useState, useEffect } from 'react';
import BreakfastItem from './BreakfastItem';
import ErrorMessage from './ErrorMessage';

const BreakfastList = ({
  breakfasts,
  setBreakfasts,
  eggs,
  broths,
  riceBread,
  drinks,
  times,
  paymentMethods,
  additions,
  breakfastTypes,
  breakfastProteins, // Recibir breakfastProteins
  onBreakfastChange,
  onRemoveBreakfast,
  onAddBreakfast,
  onDuplicateBreakfast,
  incompleteBreakfastIndex,
  incompleteSlideIndex,
  isOrderingDisabled,
  userRole,
  savedAddress,
  isTableOrder,
}) => {
  const [showTutorial, setShowTutorial] = useState(breakfasts.length === 0);
  const maxBreakfasts = 15;
  const [showMaxBreakfastsError, setShowMaxBreakfastsError] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[BreakfastList] Props recibidas:', {
        eggs: eggs || [],
        broths: broths || [],
        riceBread: riceBread || [],
        drinks: drinks || [],
        breakfastTypes: breakfastTypes || [],
        breakfastProteins: breakfastProteins || [], // Log para verificar
        additions: additions || [],
        times: times || [],
        paymentMethods: paymentMethods || [],
        breakfasts: breakfasts.map((b, i) => ({ index: i, id: b.id, type: b.type })),
      });
    }
  }, [eggs, broths, riceBread, drinks, breakfastTypes, breakfastProteins, additions, times, paymentMethods, breakfasts]);

  useEffect(() => {
    if (breakfasts.length >= maxBreakfasts) {
      setShowMaxBreakfastsError(true);
      const timer = setTimeout(() => setShowMaxBreakfastsError(false), 3000);
      return () => clearTimeout(timer);
    } else {
      setShowMaxBreakfastsError(false);
    }
  }, [breakfasts.length, maxBreakfasts]);

  const completedBreakfasts = breakfasts.filter((b) => {
    const breakfastType = breakfastTypes.find((bt) => bt.name === b.type) || { steps: [] };
    const currentSteps = breakfastType.steps || [];
    const stepCompleteness = {
      type: !!b.type,
      broth: !!b.broth,
      eggs: !!b.eggs,
      riceBread: !!b.riceBread,
      drink: !!b.drink,
      protein: !!b.protein, // Verificar proteína
      cutlery: b.cutlery !== null,
      time: !!b.time,
      address: !!b.address?.address,
      payment: !!b.payment,
      tableNumber: !!b.tableNumber,
      orderType: !!b.orderType,
    };
    return isTableOrder
      ? userRole === 3
        ? stepCompleteness.type &&
          currentSteps.every((step) => stepCompleteness[step]) &&
          stepCompleteness.tableNumber &&
          stepCompleteness.payment &&
          stepCompleteness.orderType
        : stepCompleteness.type &&
          currentSteps.every((step) => stepCompleteness[step]) &&
          stepCompleteness.tableNumber &&
          stepCompleteness.payment
      : stepCompleteness.type && currentSteps.every((step) => stepCompleteness[step]);
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2 xs:p-3 sm:p-3 rounded-md shadow-sm overflow-hidden">
        <div>
          <h2 className="text-sm sm:text-lg md:text-xl font-bold text-gray-800">Tus Desayunos</h2>
          <p className="text-xs sm:text-sm md:text-base text-gray-600">{completedBreakfasts} de {breakfasts.length} completos</p>
        </div>
        <button
          onClick={onAddBreakfast}
          className={`add-breakfast-button bg-green-600 hover:bg-green-700 text-white px-2 xs:px-3 py-1 xs:py-1.5 rounded-md transition-colors text-xs sm:text-sm md:text-base font-bold flex items-center shadow-sm flex-shrink-0 ${breakfasts.length >= maxBreakfasts || isOrderingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-label="Añadir un nuevo desayuno"
          disabled={breakfasts.length >= maxBreakfasts || isOrderingDisabled}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 xs:h-5 w-4 xs:w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Añadir un nuevo desayuno
        </button>
      </div>
      {showMaxBreakfastsError && (
        <div className="fixed right-4 z-[10002] w-80 max-w-xs" style={{ top: '128px' }}>
          <ErrorMessage message="Has alcanzado el máximo de 15 desayunos. No puedes añadir más." className="bg-green-100 text-green-800 min-h-[60px]" onClose={() => setShowMaxBreakfastsError(false)} />
        </div>
      )}
      <div className="space-y-2 sm:space-y-4">
        {breakfasts.length === 0 ? (
          <p className="text-center text-gray-600">No hay desayunos. ¡Añade uno para comenzar!</p>
        ) : (
          breakfasts.map((breakfast, index) => (
            <BreakfastItem
              key={breakfast.id}
              id={breakfast.id}
              displayId={index + 1}
              breakfast={breakfast}
              onBreakfastChange={onBreakfastChange}
              onRemoveBreakfast={() => onRemoveBreakfast(breakfast.id)}
              onDuplicateBreakfast={() => onDuplicateBreakfast(breakfast)}
              eggs={eggs || []}
              broths={broths || []}
              riceBread={riceBread || []}
              drinks={drinks || []}
              times={times || []}
              paymentMethods={paymentMethods || []}
              additions={additions || []}
              breakfastTypes={breakfastTypes || []}
              breakfastProteins={breakfastProteins || []} // Pasar breakfastProteins
              isIncomplete={index === incompleteBreakfastIndex}
              incompleteSlideIndex={incompleteSlideIndex}
              maxBreakfasts={maxBreakfasts}
              totalBreakfasts={breakfasts.length}
              userRole={userRole}
              savedAddress={savedAddress}
              isTableOrder={isTableOrder}
              showTutorial={showTutorial && index === 0}
              setShowTutorial={setShowTutorial}
            />
          ))
        )}
      </div>
      {breakfasts.length > 0 && (
        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 shadow-md">
          <h3 className="font-semibold text-blue-800 mb-2 flex items-center text-sm md:text-base">
            <span className="mr-1.5 text-xl">🚀</span>
            <span className="font-bold">¡Configura tu desayuno!</span>
          </h3>
          <p className="text-xs sm:text-sm text-blue-700 leading-relaxed">
            <strong className="font-bold">Desliza</strong> para navegar por las opciones. Cada desayuno se <strong className="font-bold">esconde en 30 segundos</strong> al completarse.
          </p>
          <p className="text-xs sm:text-sm text-blue-700 leading-relaxed mt-1">
            ¿Quieres verlo de nuevo? ¡Solo <strong>haz clic</strong>!
          </p>
        </div>
      )}
    </div>
  );
};

export default BreakfastList;