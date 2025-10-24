// src/components/OnboardingTutorial.js
import React, { useState, useEffect } from 'react';
import Joyride, { Step } from 'react-joyride';

const getSteps = (mealsCount) => {
  let baseSteps = [
    {
      target: '.add-meal-button',
      content: 'Toca para **añadir tu almuerzo**. 🍽️',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '.slide-item',
      content: '**Desliza** para ver categorías (Sopa, Proteína...). 👉',
      placement: 'auto',
      disableBeacon: true,
    },
    {
      target: '.next-button',
      content: 'Usa la flecha para **avanzar**. ✨',
      placement: 'bottom',
    },
    {
      target: '.prev-button',
      content: 'Toca para **volver atrás**. ↩️',
      placement: 'bottom',
    },
    {
      target: '.order-summary',
      content: '**Resumen** de tu pedido aquí. 📝',
  
      placement: 'bottom',
    },
    {
      target: '.total-price',
      content: '**Valor total** a pagar. 💰',
      placement: 'top',
    },
    {
      target: '.send-order-button',
      content: '¡Toca para **enviar pedido por WhatsApp**! 🚀',
      placement: 'top',
    },
    {
      target: '.back-to-whatsapp',
      content: '**¿Primera vez?** Envía "Hola" a WhatsApp antes de pedir. 💬',
      placement: 'bottom',
    },
  ];

  
  if (mealsCount > 1) {
    baseSteps.splice(4, 0, 
      {
        target: '.duplicate-button',
        content: '¡Toca para **duplicar este almuerzo**! 🍝',
        placement: 'bottom',
      },
      {
        target: '.remove-button',
        content: 'Toca para **eliminar este almuerzo**. 🗑️',
        placement: 'bottom',
      }
    );
  }

  return baseSteps;
};

const OnboardingTutorial = ({ run = true, onComplete, mealsCount }) => {
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [startJoyride, setStartJoyride] = useState(false);

  useEffect(() => {
    if (!run) {
      setShowWelcomeModal(false);
      setStartJoyride(false);
    }
  }, [run]);

  const handleJoyrideCallback = (data) => {
    const { status, action } = data;

    if (
      status === 'finished' || 
      status === 'skipped' || 
      action === 'close'    
    ) {
      setStartJoyride(false); 
      onComplete();           
    }
  };

  const handleStartTour = () => {
    setShowWelcomeModal(false); 
    setStartJoyride(true);      
    };
const handleSkipWelcome = () => {
    setShowWelcomeModal(false); 
    onComplete();               
  };

  
  if (showWelcomeModal && run) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10002, 
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '25px',
          borderRadius: '8px',
          textAlign: 'center',
          maxWidth: '350px',
          boxShadow: '0 4px 10px rgba(0, 0, 0, 0.2)',
          color: '#333',
        }}>
          <h2>¡Bienvenido/a! 👋</h2>
          <p style={{ lineHeight: '1.4', marginBottom: '20px' }}>
            Este tour te guiará para hacer tu pedido de almuerzo de forma rápida y sencilla.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
            <button
              onClick={handleStartTour}
              style={{
                backgroundColor: '#10B981', 
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                transition: 'background-color 0.2s ease',
              }}
            >
              Empezar Tour
            </button>
            <button
              onClick={handleSkipWelcome}
              style={{
                backgroundColor: '#6B7280', 
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold',
                boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                transition: 'background-color 0.2s ease',
              }}
            >
              No, gracias
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <Joyride
      steps={getSteps(mealsCount)}
      run={startJoyride && run}
      continuous={true}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      disableOverlayClose={true} 
      spotlightClicks={true}     
      
      styles={{
        options: {
          zIndex: 10001,
          primaryColor: '#10B981', 
          overlayColor: 'rgba(0, 0, 0, 0.6)',
          spotlightPadding: 5,
        },
        tooltip: {
          fontSize: '14px',
          maxWidth: '300px',
        },
      }}
      disableScrolling={false} 
      locale={{
        back: 'Atrás',
        next: 'Siguiente',
        skip: 'Omitir',
        last: '¡Entendido!',
      }}
    />
  );
};

export default OnboardingTutorial;