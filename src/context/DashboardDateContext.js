// src/context/DashboardDateContext.jsx
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const DashboardDateContext = createContext(null);

const tz = 'America/Bogota'; // sin DST

// YYYY-MM-DD en zona Bogotá
const ymdInBogota = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(date); // 'YYYY-MM-DD'
};

const startOfDayBogota = (ymd) => new Date(`${ymd}T00:00:00.000-05:00`);
const endOfDayBogota   = (ymd) => new Date(`${ymd}T23:59:59.999-05:00`);

const timeAgo = (date) => {
  if (!date) return '—';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.max(0, Math.floor(diff / 60000));
  if (mins < 1) return 'hace segundos';
  if (mins === 1) return 'hace 1 min';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return 'hace 1 hora';
  if (hours < 24) return `hace ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
};

export const DashboardDateProvider = ({ children }) => {
  const [selectedDate, setSelectedDate] = useState(ymdInBogota());

  const setDateFromInput = useCallback((value) => {
    // value es 'YYYY-MM-DD'
    if (!value) return;
    setSelectedDate(value);
  }, []);

  const value = useMemo(() => {
    const startOfDay = startOfDayBogota(selectedDate);
    const endOfDay   = endOfDayBogota(selectedDate);
    return {
      selectedDate,
      startOfDay,
      endOfDay,
      setSelectedDate: setDateFromInput,
      timeAgo,
      ymdInBogota,
    };
  }, [selectedDate]);

  return (
    <DashboardDateContext.Provider value={value}>
      {children}
    </DashboardDateContext.Provider>
  );
};

export const useDashboardDate = () => useContext(DashboardDateContext);
