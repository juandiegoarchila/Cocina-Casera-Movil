// src/utils/Helpers.js
export const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export const encodeMessage = (text) => encodeURIComponent(text);

export const cleanText = (text) => text?.replace(' NUEVO', '') || 'No seleccionado';

export const formatNotes = (notes) => {
  if (!notes) return '';
  return notes
    .split('. ')
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join('. ');
};