// src/utils/classNames.js
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}