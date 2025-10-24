// src/utils/bogotaTime.js
export const BOGOTA_TZ = 'America/Bogota';
export const ymdInBogota = (date = new Date()) => {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: BOGOTA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(date);
};
export const startOfDayBogota = (ymd) => new Date(`${ymd}T00:00:00.000-05:00`);
export const endOfDayBogota   = (ymd) => new Date(`${ymd}T23:59:59.999-05:00`);
export const timeAgo = (date) => {
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
