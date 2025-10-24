// src/components/AddressInput.js
import React, { useState, useEffect } from "react";
import useLocalStorage from "../hooks/useLocalStorage";
import Select from "react-select";

// Lista de tipos de vía
const STREET_TYPES = ["Calle", "Carrera", "Diagonal", "Transversal"];

// Lista de barrios disponibles
const BARRIOS = [
  "Atenas",
  "Berlín",
  "Bilbao",
  "Cañiza I",
  "Cañiza II",
  "Cañiza III",
  "Carolina II",
  "Carolina III",
  "Compartir",
  "El Cedro",
  "Fontanar del Río",
  "La Gaitana",
  "La Isabela",
  "Lisboa",
  "Los Nogales de Tibabuyes",
  "Miramar",
  "Nueva Tibabuyes",
  "Nuevo Corinto",
  "Prados de Santa Bárbara",
  "Rincón de Boyacá",
  "Sabana de Tibabuyes",
  "San Carlos de Suba",
  "San Carlos de Tibabuyes",
  "San Pedro de Tibabuyes",
  "Santa Cecilia",
  "Santa Rita",
  "Tibabuyes Universal",
  "Toscana",
  "Vereda Suba-Rincón",
  "Vereda Tibabuyes",
  "Verona",
  "Villa Cindy",
  "Villa de las Flores",
  "Villa Gloria",
];

// Convertir arrays a formato react-select
const streetTypeOptions = STREET_TYPES.map((s) => ({ value: s, label: s }));
const barrioOptions = BARRIOS.map((b) => ({ value: b, label: b }));

// Estilos customizados para react-select
const customStyles = {
  control: (base, state) => ({
    ...base,
    borderRadius: "0.375rem",
    borderColor: state.isFocused ? "#22c55e" : "#d1d5db",
    boxShadow: state.isFocused ? "0 0 0 2px #22c55e33" : "none",
    "&:hover": { borderColor: "#22c55e" },
    padding: "2px",
    minHeight: "42px",
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "#22c55e"
      : state.isFocused
      ? "#bbf7d0"
      : "white",
    color: state.isSelected ? "white" : "#374151",
    "&:active": {
      backgroundColor: "#22c55e",
      color: "white",
    },
    fontSize: "0.875rem",
    padding: "8px 12px",
    borderBottom: "1px solid #e5e7eb",
  }),
  placeholder: (base) => ({
    ...base,
    color: "#9ca3af",
    fontSize: "0.875rem",
  }),
  singleValue: (base) => ({
    ...base,
    fontSize: "0.9rem",
    color: "#374151",
  }),
  menu: (base) => ({
    ...base,
    borderRadius: "0.5rem",
    zIndex: 50,
  }),
};

// 🔥 Normalizador de teléfonos
const normalizePhone = (value) => {
  let clean = (value || "").replace(/\s+/g, "");
  if (clean.startsWith("+57")) clean = clean.slice(3);
  if (clean.startsWith("57") && clean.length > 10) clean = clean.slice(2);
  if (clean.startsWith("0") && clean.length === 11) clean = clean.slice(1);
  return clean;
};

const InputField = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  autoComplete,
}) => (
  <div className="mb-3">
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      className={`w-full p-2 border rounded-md focus:outline-none focus:ring-2 ${
        error ? "border-red-500 focus:ring-red-500" : "focus:ring-green-500"
      }`}
    />
    {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
  </div>
);

const AddressInput = ({ onConfirm, onValidityChange, initialAddress }) => {
  const [formData, setFormData] = useLocalStorage("addressForm", {
    streetType: "Calle",
    streetNumber: "",
    houseNumber: "",
    neighborhood: "",
    details: "",
    phoneNumber: "",
  });
  const [errors, setErrors] = useState({});
  const [isConfirmed, setIsConfirmed] = useState(false);

  const isValidPhone = (phone) => /^3\d{9}$/.test(phone);

  // Validación
  useEffect(() => {
    const newErrors = {};
    if (!formData.streetNumber) newErrors.streetNumber = "Campo requerido.";
    if (!formData.houseNumber) newErrors.houseNumber = "Campo requerido.";
    if (!formData.neighborhood) newErrors.neighborhood = "Selecciona un barrio.";
    if (!formData.phoneNumber) {
      newErrors.phoneNumber = "Campo requerido.";
    } else if (!isValidPhone(formData.phoneNumber)) {
      newErrors.phoneNumber = "Formato no válido (Ej: 3001234567).";
    }
    setErrors(newErrors);
  }, [formData]);

  // 🔥 Si Google mete "Casa 39" en Número, lo movemos a Instrucciones
  useEffect(() => {
    if (/^(Casa|Apto|Apartamento|Torre)/i.test(formData.houseNumber)) {
      setFormData((prev) => ({
        ...prev,
        details: prev.details || prev.houseNumber,
        houseNumber: "",
      }));
    }
  }, [formData.houseNumber]);

  const handleInputChange = (e) => {
    const { id, value } = e.target;

    if (id === "phoneNumber") {
      setFormData((prev) => ({ ...prev, [id]: normalizePhone(value) }));
      return;
    }

    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleStreetTypeChange = (selected) => {
    setFormData((prev) => ({ ...prev, streetType: selected?.value || "" }));
  };

  const handleNeighborhoodChange = (selected) => {
    setFormData((prev) => ({ ...prev, neighborhood: selected?.value || "" }));
  };

  const isFormValid = Object.keys(errors).length === 0;

  // Notificar validez al padre (para ocultar/mostrar mensajes contextuales)
  useEffect(() => {
    onValidityChange?.(isFormValid);
  }, [isFormValid, onValidityChange]);

  const handleConfirm = () => {
    if (!isFormValid) return;
    setIsConfirmed(true);

    const addressFormatted = `${formData.streetType} ${formData.streetNumber} # ${formData.houseNumber}`;
    const confirmedDetails = {
      address: addressFormatted,
      neighborhood: formData.neighborhood,
      details: formData.details,
      phoneNumber: normalizePhone(formData.phoneNumber),
    };

    onConfirm?.(confirmedDetails);
  };

  // siempre mostrar teléfono limpio
  const phoneValue = normalizePhone(formData.phoneNumber);

  if (isConfirmed) {
    return (
      <div className="bg-white p-4 rounded-lg shadow space-y-3 text-sm sm:text-base">
        <h4 className="font-semibold text-gray-800">📋 Dirección guardada</h4>
        <p>
          <span className="font-medium text-blue-600">Dirección</span>
          <br />
          {formData.streetType} {formData.streetNumber} # {formData.houseNumber}
        </p>
        <p>
          <span className="font-medium text-blue-600">Barrio</span>
          <br />
          {formData.neighborhood}
        </p>
        {formData.details && (
          <p>
            <span className="font-medium text-blue-600">Instrucciones de entrega</span>
            <br />
            {formData.details}
          </p>
        )}
        <p>
          <span className="font-medium text-blue-600">Teléfono</span>
          <br />
          {formData.phoneNumber}
        </p>
        <button
          onClick={() => setIsConfirmed(false)}
          className="mt-3 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md"
        >
          Editar dirección
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-lg shadow space-y-4 text-sm sm:text-base">
      {/* Tipo de vía */}
      <div>
        <label className="block font-medium text-gray-700 mb-1">Tipo de vía</label>
        <Select
          options={streetTypeOptions}
          value={streetTypeOptions.find((o) => o.value === formData.streetType) || null}
          onChange={handleStreetTypeChange}
          placeholder="Selecciona tipo de vía"
          styles={customStyles}
          classNamePrefix="react-select"
        />
      </div>

      {/* Números */}
      <div className="grid grid-cols-2 gap-4">
        <InputField
          id="streetNumber"
          label="Número de vía"
          value={formData.streetNumber}
          onChange={handleInputChange}
          placeholder="Ej: 137ABis"
          error={errors.streetNumber}
          autoComplete="address-line1"
        />
        <InputField
          id="houseNumber"
          label="Número"
          value={formData.houseNumber}
          onChange={handleInputChange}
          placeholder="Ej: 128b-01"
          error={errors.houseNumber}
          autoComplete="address-line2"
        />
      </div>

      {/* Barrio */}
      <div>
        <label className="block font-medium text-gray-700 mb-1">Barrio</label>
        <Select
          options={barrioOptions}
          value={barrioOptions.find((o) => o.value === formData.neighborhood) || null}
          onChange={handleNeighborhoodChange}
          placeholder="Escribe o selecciona un barrio"
          styles={customStyles}
          classNamePrefix="react-select"
          isSearchable
        />
        {errors.neighborhood && (
          <p className="text-red-500 text-xs mt-1">{errors.neighborhood}</p>
        )}
      </div>

      {/* Instrucciones */}
      <InputField
        id="details"
        label="Instrucciones de entrega (opcional)"
        value={formData.details}
        onChange={handleInputChange}
        placeholder="Ej: Nombre, Colegio, Apto 302, int 3, Cade..."
        autoComplete="address-line3"
      />

      {/* Teléfono */}
      <InputField
        id="phoneNumber"
        label="Número de teléfono"
        value={phoneValue}
        onChange={handleInputChange}
        placeholder="Ej: 3001234567"
        error={errors.phoneNumber}
        type="tel"
        autoComplete="tel"
      />

      <button
        onClick={handleConfirm}
        disabled={!isFormValid}
        className={`w-full mt-2 bg-green-500 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-md transition-colors ${
          !isFormValid ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        Confirmar dirección
      </button>
    </div>
  );
};

export default AddressInput;
