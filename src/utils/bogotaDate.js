// Devuelve la fecha local de Colombia (Bogotá) en formato YYYY-MM-DD
export function getColombiaLocalDateString() {
  // Obtener la hora UTC actual
  const now = new Date();
  // Calcular la hora local de Colombia (UTC-5)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const colombiaOffset = -5; // UTC-5
  const colombiaDate = new Date(utc + 3600000 * colombiaOffset);
  // Formato YYYY-MM-DD
  return colombiaDate.toISOString().split('T')[0];
}
