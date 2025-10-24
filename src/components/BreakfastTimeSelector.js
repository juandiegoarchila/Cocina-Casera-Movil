//src/components/BreakfastTimeSelector.js
import React, { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const BreakfastTimeSelector = ({ times, selectedTime, setSelectedTime, onConfirm }) => {
  const [error, setError] = useState('');

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const cleanedTime = timeStr.trim();
    const timeMatch = cleanedTime.match(/^(\d{1,2}:\d{2})(?:\s)?([AaPp][Mm])$/i);
    if (!timeMatch) {
      try {
        const [hours, minutes] = cleanedTime.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) {
          throw new Error(`Formato de hora inválido: ${timeStr}`);
        }
        return hours * 60 + minutes;
      } catch {
        return Infinity; // Para horarios no HH:MM, no deshabilitar
      }
    }
    const [, time, period] = timeMatch;
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) {
      throw new Error(`Formato de hora inválido: ${timeStr}`);
    }
    let totalMinutes = hours * 60 + minutes;
    if (period.toUpperCase() === 'PM' && hours !== 12) totalMinutes += 12 * 60;
    if (period.toUpperCase() === 'AM' && hours === 12) totalMinutes = minutes;
    return totalMinutes;
  };

  const isValidTimeFormat = (value) => {
    if (!value) return false;
    const timeRegex = /^([1-9]|1[0-2]):[0-5][0-9](?:\s)?(AM|PM|am|pm)$/i;
    return timeRegex.test(value.trim());
  };

  const isWithinServiceHours = (timeStr) => {
    try {
      const inputMinutes = timeToMinutes(timeStr);
      const startMinutes = 7 * 60; // 7:00 AM
      const endMinutes = 11 * 60; // 11:00 AM
      if (process.env.NODE_ENV === 'development') {
        console.log(`Validando ${timeStr}: ${inputMinutes} minutos, rango: ${startMinutes}-${endMinutes}`);
      }
      return inputMinutes >= startMinutes && inputMinutes <= endMinutes;
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Error en isWithinServiceHours para ${timeStr}: ${error.message}`);
      }
      return false;
    }
  };

  const isTimeDisabled = (time) => {
    try {
      const timeMinutes = timeToMinutes(time.name);
      const currentTime = new Date();
      const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
      return timeMinutes < currentMinutes;
    } catch {
      return false; // No deshabilitar si no es formato HH:MM
    }
  };

  const handleCustomTimeChange = (e) => {
    const value = e.target.value;
    setSelectedTime({ id: 0, name: value });
    setError('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const normalize = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const isASAP = (name = '') => {
    const n = normalize(name);
    return n === 'lo mas pronto posible' || n === 'lo antes posible';
  };

  const handleConfirm = () => {
    if (!selectedTime || !selectedTime.name) {
      setError('Por favor, ingresa una hora válida (Ej: 8:00 AM)');
      if (process.env.NODE_ENV === 'development') {
        console.log('Error: selectedTime es nulo o no tiene name');
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Confirmando hora: ${selectedTime.name}, id: ${selectedTime.id}`);
    }

    // Aceptar siempre la opción especial "lo más pronto posible"
    if (isASAP(selectedTime.name)) {
      setError('');
      onConfirm();
      return;
    }

    if (selectedTime.id === 0) {
      if (!isValidTimeFormat(selectedTime.name)) {
        setError('Por favor, ingresa una hora válida (Ej: 8:00 AM)');
        if (process.env.NODE_ENV === 'development') {
          console.log(`Error: Formato inválido para ${selectedTime.name}`);
        }
        return;
      }
      if (!isWithinServiceHours(selectedTime.name)) {
        setError('👉 No tenemos desayuno a esa hora, solo de 7:00 AM a 11:00 AM');
        if (process.env.NODE_ENV === 'development') {
          console.log(`Error: ${selectedTime.name} fuera del rango 7:00 AM - 11:00 AM`);
        }
        return;
      }
    } else if (isValidTimeFormat(selectedTime.name) && !isWithinServiceHours(selectedTime.name)) {
      setError('👉 No tenemos desayuno a esa hora, solo de 7:00 AM a 11:00 AM');
      if (process.env.NODE_ENV === 'development') {
        console.log(`Error: Hora predefinida ${selectedTime.name} fuera del rango 7:00 AM - 11:00 AM`);
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Hora válida confirmada: ${selectedTime.name}`);
    }
    onConfirm();
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-green-100 p-1 xs:p-2 sm:p-3 rounded-lg shadow-sm">
      <h2 className="text-[10px] xs:text-xs sm:text-sm font-semibold mb-1 xs:mb-2 flex items-center text-green-700">
        <span className="mr-1">🕒</span> ¿Para qué hora?
      </h2>
      {times.length === 0 ? (
        <p className="text-[10px] xs:text-xs sm:text-sm text-red-600">No hay horarios de desayuno disponibles.</p>
      ) : (
        <div className="grid grid-cols-2 xs:grid-cols-2 gap-1 xs:gap-2">
          {times.map((time) => (
            <button
              key={time.id}
              onClick={() => {
                setSelectedTime(time);
                setError('');
                if (process.env.NODE_ENV === 'development') {
                  console.log(`Hora seleccionada: ${time.name}, id: ${time.id}`);
                }
              }}
              disabled={isTimeDisabled(time)}
              className={`relative p-1 xs:p-2 rounded-lg text-[10px] xs:text-xs sm:text-sm font-medium transition-all duration-200 flex items-center justify-center text-center min-h-[30px] xs:min-h-[40px] shadow-sm ${
                selectedTime?.id === time.id
                  ? 'bg-green-200 text-green-800 border border-green-300'
                  : isTimeDisabled(time)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
              aria-label={`Seleccionar hora ${time.name}`}
            >
              {time.name}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        placeholder="Otra hora (e.g., 8:00 AM)"
        value={selectedTime?.id === 0 ? selectedTime.name : ''}
        onChange={handleCustomTimeChange}
        onKeyDown={handleKeyDown}
        className="col-span-2 mt-2 p-1 xs:p-2 text-[10px] xs:text-xs sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 placeholder-gray-400 w-full"
        aria-label="Ingresar una hora personalizada"
      />
      {error && (
        <p className="text-[10px] xs:text-xs text-red-600 mt-1">{error}</p>
      )}
      <button
        onClick={handleConfirm}
        disabled={!selectedTime || !selectedTime.name}
        className={`mt-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded-lg text-sm transition-colors ${
          !selectedTime || !selectedTime.name ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        aria-label="Confirmar hora"
      >
        Confirmar hora
      </button>
    </div>
  );
};

export default BreakfastTimeSelector;