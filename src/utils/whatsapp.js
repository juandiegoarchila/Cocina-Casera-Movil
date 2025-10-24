// src/utils/whatsapp.js
// Utilidades para construir enlaces de WhatsApp y normalizar teléfonos (Colombia)

// Normaliza un número colombiano:
// - Elimina caracteres no numéricos
// - Si tiene 10 dígitos, antepone 57
// - Si ya empieza por 57 y tiene 12 dígitos, lo deja igual
// - Si empieza por 0 o 60 (fijo), intenta anteponer 57 igualmente
export const normalizeColombiaPhone = (raw) => {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;

  // Quitar ceros líderes innecesarios
  digits = digits.replace(/^0+/, '');

  if (digits.length === 10) {
    // Ej: 320XXXXXXX
    return `57${digits}`;
  }
  if (digits.startsWith('57') && (digits.length === 11 || digits.length === 12)) {
    // Algunos números podrían venir con 57 + 9 o 10 por errores; aceptamos 57 + 10 como válido (12)
    // Si tiene 11, probablemente perdió un dígito; en ese caso, no es confiable
    return digits.length === 12 ? digits : null;
  }
  if ((digits.startsWith('60') || digits.startsWith('1')) && digits.length >= 7) {
    // Fijos con indicativos (Bogotá 601...), intentamos enviar igualmente con 57 delante
    return `57${digits}`;
  }

  // Como fallback, si tiene entre 7 y 15 dígitos, intentar con 57
  if (digits.length >= 7 && digits.length <= 15) {
    return digits.startsWith('57') ? digits : `57${digits}`;
  }

  return null;
};

export const buildWhatsAppUrl = (phone, message) => {
  const normalized = normalizeColombiaPhone(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(message || '');
  // Usamos wa.me para compatibilidad en móvil y escritorio
  return `https://wa.me/${normalized}${text ? `?text=${text}` : ''}`;
};

export const openWhatsApp = (phone, message) => {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
};
