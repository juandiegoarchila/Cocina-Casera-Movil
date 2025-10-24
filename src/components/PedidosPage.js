// src/components/PedidosPage.js
import React, { useState, useEffect } from 'react';
import { useAuth } from './Auth/AuthProvider';
import Header from './Header';
import MealList from './MealList';
import BreakfastList from './BreakfastList';
import OrderSummary from './OrderSummary';
import BreakfastOrderSummary from './BreakfastOrderSummary';
import LoadingIndicator from './LoadingIndicator';
import ErrorMessage from './ErrorMessage';
import SuccessMessage from './SuccessMessage';
import InfoMessage from './InfoMessage';
import Footer from './Footer';
import Modal from './Modal';
import PrivacyPolicy from './PrivacyPolicy';
import useLocalStorage from '../hooks/useLocalStorage';
import { db } from '../config/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { initializeMealData, handleMealChange, addMeal, duplicateMeal, removeMeal, sendToWhatsApp } from '../utils/MealLogic';
import { calculateTotal, calculateMealPrice } from '../utils/MealCalculations';
import { calculateTotalBreakfastPrice, generateMessageFromBreakfasts, calculateBreakfastPrice } from '../utils/BreakfastLogic';
import { getColombiaLocalDateString } from '../utils/bogotaDate';

const PedidosPage = () => {
  const { user } = useAuth();
  const [meals, setMeals] = useState([]);
  const [breakfasts, setBreakfasts] = useState([]);
  const [address, setAddress] = useLocalStorage('userAddress', '');
  const [phoneNumber, setPhoneNumber] = useLocalStorage('userPhoneNumber', '');
  const [details, setDetails] = useLocalStorage('userAddressDetails', '');
  const [neighborhood, setNeighborhood] = useLocalStorage('userAddressNeighborhood', '');
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [incompleteMealIndex, setIncompleteMealIndex] = useState(null);
  const [incompleteSlideIndex, setIncompleteSlideIndex] = useState(null);
  const [incompleteBreakfastIndex, setIncompleteBreakfastIndex] = useState(null);
  const [incompleteBreakfastSlideIndex, setIncompleteBreakfastSlideIndex] = useState(null);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Estados para datos de Firebase
  const [soups, setSoups] = useState([]);
  const [soupReplacements, setSoupReplacements] = useState([]);
  const [principles, setPrinciples] = useState([]);
  const [proteins, setProteins] = useState([]);
  const [drinks, setDrinks] = useState([]);
  const [sides, setSides] = useState([]);
  const [additions, setAdditions] = useState([]);
  const [times, setTimes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [breakfastEggs, setBreakfastEggs] = useState([]);
  const [breakfastBroths, setBreakfastBroths] = useState([]);
  const [breakfastRiceBread, setBreakfastRiceBread] = useState([]);
  const [breakfastDrinks, setBreakfastDrinks] = useState([]);
  const [breakfastAdditions, setBreakfastAdditions] = useState([]);
  const [breakfastTypes, setBreakfastTypes] = useState([]);
  const [breakfastProteins, setBreakfastProteins] = useState([]);
  const [breakfastTimes, setBreakfastTimes] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [currentMenuType, setCurrentMenuType] = useState('lunch');
  const [isOrderingDisabled, setIsOrderingDisabled] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Datos iniciales
  const initialMeal = { id: Date.now(), soup: '', principle: '', protein: '', drink: '', sides: [], additions: [], notes: '', cutlery: null, time: '', paymentMethod: '', address: address, phoneNumber: phoneNumber, neighborhood: neighborhood, details: details };
  const initialBreakfast = { id: Date.now(), type: '', eggs: '', broth: '', riceBread: '', drink: '', additions: [], notes: '', cutlery: null, time: '', paymentMethod: '', address: address, phoneNumber: phoneNumber, neighborhood: neighborhood, details: details };

  // Función para verificar si la dirección está completa
  const isAddressComplete = () => {
    return address.trim() !== '' && phoneNumber.trim() !== '';
  };

  const savedAddress = { address, phoneNumber, neighborhood, details };

  // Funciones de cookies
  const handleAcceptCookies = () => {
    setShowCookieBanner(false);
    localStorage.setItem('cookiesAccepted', 'true');
  };

  // Función para formatear tiempo
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    try {
      const [hours, minutes] = timeStr.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return timeStr;
    }
  };

  // Función para manejar cambio de desayuno
  const handleBreakfastChange = (id, field, value) => {
    setBreakfasts(breakfasts.map(breakfast => 
      breakfast.id === id ? { ...breakfast, [field]: value } : breakfast
    ));
  };

  // Función para enviar desayuno por WhatsApp
  const sendBreakfastToWhatsApp = async () => {
    // Lógica de envío de desayuno
    console.log('Enviando desayuno por WhatsApp');
  };

  // Función para enviar pedido
  const onSendOrder = async (isTableOrder) => {
    // Lógica de envío de pedido
    console.log('Enviando pedido');
  };

  // useEffect para cargar datos de Firebase
  useEffect(() => {
    const collections = [
      { name: 'soups', setter: setSoups },
      { name: 'soupReplacements', setter: setSoupReplacements },
      { name: 'principles', setter: setPrinciples },
      { name: 'proteins', setter: setProteins },
      { name: 'drinks', setter: setDrinks },
      { name: 'sides', setter: setSides },
      { name: 'additions', setter: setAdditions },
      { name: 'times', setter: setTimes },
      { name: 'paymentMethods', setter: setPaymentMethods },
      { name: 'breakfastEggs', setter: setBreakfastEggs },
      { name: 'breakfastBroths', setter: setBreakfastBroths },
      { name: 'breakfastRiceBread', setter: setBreakfastRiceBread },
      { name: 'breakfastDrinks', setter: setBreakfastDrinks },
      { name: 'breakfastAdditions', setter: setBreakfastAdditions },
      { name: 'breakfastTypes', setter: setBreakfastTypes },
      { name: 'breakfastProteins', setter: setBreakfastProteins },
      { name: 'breakfastTimes', setter: setBreakfastTimes }
    ];

    const unsubscribes = collections.map(({ name, setter }) => 
      onSnapshot(collection(db, name), (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setter(data);
      })
    );

    return () => unsubscribes.forEach(unsubscribe => unsubscribe());
  }, []);

  // useEffect para cookies
  useEffect(() => {
    const cookiesAccepted = localStorage.getItem('cookiesAccepted');
    if (!cookiesAccepted) {
      setShowCookieBanner(true);
    }
  }, []);

  // Inicializar meals si está vacío
  useEffect(() => {
    if (meals.length === 0) {
      setMeals([{ ...initialMeal }]);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-200 flex flex-col relative">
      <Header />
      {showCookieBanner && (
        <div className="fixed bottom-0 left-0 right-0 bg-blue-100 text-gray-800 p-4 z-[10001] rounded-t-lg shadow-lg">
          <p className="text-sm font-medium">🍪 Usamos cookies para guardar tus preferencias y hacer tu experiencia más fácil. ¡Todo seguro!</p>
          <div className="mt-2 flex gap-2">
            <button onClick={handleAcceptCookies} className="bg-green-500 hover:bg-green-600 text-white px-4 py-1 rounded text-sm font-semibold">¡Entendido!</button>
            <button onClick={() => { setShowCookieBanner(false); setShowPrivacyModal(true); }} className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-1 rounded text-sm" aria-label="Ver política de privacidad">Más info</button>
          </div>
        </div>
      )}
      <Modal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)}>
        <PrivacyPolicy />
      </Modal>
      <main role="main" className="p-2 sm:p-4 flex-grow w-full max-w-4xl mx-auto">
        {isOrderingDisabled || currentMenuType === 'closed' ? (
          <div className="flex flex-col items-center justify-center text-center bg-red-50 text-red-700 p-4 sm:p-6 rounded-xl shadow-md space-y-2 mt-8 sm:mt-10">
            <h2 className="text-xl sm:text-2xl font-bold">🚫 Restaurante cerrado</h2>
            <p className="text-sm sm:text-base font-medium">{isOrderingDisabled ? 'Los pedidos estarán disponibles nuevamente mañana.' : 'No hay pedidos disponibles en este horario.'}</p>
            <p className="text-sm sm:text-base text-gray-700">⏰ Horarios de atención:</p>
            <p className="text-sm sm:text-base text-gray-700"><strong>Desayuno: {formatTime(schedules.breakfastStart)} - {formatTime(schedules.breakfastEnd)}</strong></p>
            <p className="text-sm sm:text-base text-gray-700"><strong>Almuerzo: {formatTime(schedules.lunchStart)} - {formatTime(schedules.lunchEnd)}</strong></p>
            <p className="text-xs sm:text-sm text-gray-500 italic">Gracias por tu comprensión y preferencia.</p>
          </div>
        ) : (
          <div className="fade-in">
            <p className="text-center text-gray-700 mb-2 sm:mb-4 text-sm xs:text-base sm:text-lg md:text-xl bg-white p-2 sm:p-3 md:p-4 rounded-lg shadow-sm">
              {currentMenuType === 'breakfast' ? '¡Pide tu desayuno fácil y rápido!' : '¡Pide tu almuerzo fácil y rápido! Almuerzo $13.000 (solo bandeja o sin sopa $12.000)'}
            </p>
            <div className="text-center text-gray-600 mb-4 text-sm sm:text-base bg-yellow-100 p-2 rounded-lg">{countdown}</div>
            {currentMenuType === 'breakfast' ? (
              <>
                <BreakfastList
                  breakfasts={breakfasts}
                  setBreakfasts={setBreakfasts}
                  eggs={breakfastEggs}
                  broths={breakfastBroths}
                  riceBread={breakfastRiceBread}
                  drinks={breakfastDrinks}
                  additions={breakfastAdditions}
                  breakfastTypes={breakfastTypes}
                  breakfastProteins={breakfastProteins}
                  times={breakfastTimes}
                  paymentMethods={paymentMethods}
                  onBreakfastChange={handleBreakfastChange}
                  onRemoveBreakfast={(id) => setBreakfasts(breakfasts.filter(b => b.id !== id))}
                  onAddBreakfast={() => {
                    if (breakfasts.length > 0 && !isAddressComplete()) {
                      setErrorMessage('Por favor, completa tu dirección y teléfono antes de añadir más desayunos.');
                      return;
                    }
                    setBreakfasts([...breakfasts, { ...initialBreakfast, id: Date.now() }]);
                  }}
                  onDuplicateBreakfast={(breakfast) => {
                    if (breakfasts.length > 0 && !isAddressComplete()) {
                      setErrorMessage('Por favor, completa tu dirección y teléfono antes de duplicar desayunos.');
                      return;
                    }
                    if (breakfasts.length < 15) {
                      setBreakfasts([...breakfasts, { ...breakfast, id: Date.now() }]);
                      setSuccessMessage('Desayuno duplicado con éxito.');
                    } else {
                      setErrorMessage('Has alcanzado el máximo de 15 desayunos.');
                    }
                  }}
                  incompleteBreakfastIndex={incompleteBreakfastIndex}
                  incompleteSlideIndex={incompleteBreakfastSlideIndex}
                  isOrderingDisabled={isOrderingDisabled}
                  userRole={user?.role || 1}
                  savedAddress={savedAddress}
                  isAddressComplete={isAddressComplete()}
                />
                <BreakfastOrderSummary items={breakfasts} onSendOrder={sendBreakfastToWhatsApp} user={user} isLoading={isLoading} />
              </>
            ) : (
              <>
                <MealList
                  meals={meals}
                  soups={soups}
                  soupReplacements={soupReplacements}
                  principles={principles}
                  proteins={proteins}
                  drinks={drinks}
                  sides={sides}
                  additions={additions}
                  times={times}
                  paymentMethods={paymentMethods}
                  isTableOrder={false}
                  onMealChange={(id, field, value) => handleMealChange(setMeals, id, field, value)}
                  onRemoveMeal={(id) => {
                    removeMeal(setMeals, setSuccessMessage, id, meals);
                    const willBeEmpty = meals.length <= 1;
                    if (willBeEmpty) {
                      setIncompleteMealIndex(null);
                      setIncompleteSlideIndex(null);
                    }
                  }}
                  onAddMeal={() => {
                    if (meals.length > 0 && !isAddressComplete()) {
                      setErrorMessage('Por favor, completa tu dirección y teléfono antes de añadir más almuerzos.');
                      return;
                    }
                    if (meals.length === 0) {
                      setIncompleteMealIndex(null);
                      setIncompleteSlideIndex(null);
                    }
                    addMeal(setMeals, setSuccessMessage, meals, initialMeal);
                  }}
                  onDuplicateMeal={(meal) => {
                    if (meals.length > 0 && !isAddressComplete()) {
                      setErrorMessage('Por favor, completa tu dirección y teléfono antes de duplicar almuerzos.');
                      return;
                    }
                    duplicateMeal(setMeals, setSuccessMessage, meal, meals);
                  }}
                  incompleteMealIndex={incompleteMealIndex}
                  incompleteSlideIndex={incompleteSlideIndex}
                  isOrderingDisabled={isOrderingDisabled}
                  isAddressComplete={isAddressComplete()}
                />
                {(() => {
                  const totalCalculated = calculateTotal(meals);
                  return (
                    <OrderSummary 
                      meals={meals} 
                      onSendOrder={() => onSendOrder(false)} 
                      calculateTotal={calculateTotal} 
                      preCalculatedTotal={totalCalculated}
                      isTableOrder={false} 
                      allSides={sides}
                      isLoading={isLoading}
                    />
                  );
                })()}
              </>
            )}
          </div>
        )}
      </main>
      <div className="fixed top-16 right-4 z-[10002] space-y-2 w-80 max-w-xs">
        {isLoading && <LoadingIndicator />}
        {errorMessage && <ErrorMessage message={errorMessage} onClose={() => setErrorMessage(null)} />}
        {successMessage && <SuccessMessage message={successMessage} onClose={() => setSuccessMessage(null)} />}
        {infoMessage && <InfoMessage message={infoMessage} onClose={() => setInfoMessage(null)} />}
      </div>
      <Footer />
    </div>
  );
};

export default PedidosPage;