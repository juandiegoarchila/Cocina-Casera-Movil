//src/components/SidesSelector.js
import React, { useState } from 'react';

const SidesSelector = ({ sides, selectedSides, setSelectedSides, notes, setNotes }) => {
  const [customSide, setCustomSide] = useState('');

  const handleSideAdd = (side) => {
    const existingSide = selectedSides.find(s => s.id === side.id);
    if (existingSide) {
      const updatedSides = selectedSides.map(s =>
        s.id === side.id ? { ...s, quantity: (s.quantity || 1) + 1 } : s
      );
      setSelectedSides(updatedSides);
    } else {
      setSelectedSides([...selectedSides, { ...side, quantity: 1 }]);
    }
  };

  const handleSideRemove = (sideId) => {
    const updatedSides = selectedSides
      .map(side =>
        side.id === sideId ? { ...side, quantity: (side.quantity || 1) - 1 } : side
      )
      .filter(side => side.quantity > 0); 
    setSelectedSides(updatedSides);
  };

  const addCustomSide = () => {
    if (customSide.trim()) {
      const newSide = { id: `custom-${customSide}`, name: customSide, quantity: 1 };
      const existingCustomSide = selectedSides.find(s => s.id === newSide.id);
      if (existingCustomSide) {
        const updatedSides = selectedSides.map(s =>
          s.id === newSide.id ? { ...s, quantity: (s.quantity || 1) + 1 } : s
        );
        setSelectedSides(updatedSides);
      } else {
        setSelectedSides([...selectedSides, newSide]);
      }
      setCustomSide('');
    }
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-green-100 p-1 xs:p-2 sm:p-3 rounded-lg shadow-sm">
      <h2 className="text-[10px] xs:text-xs sm:text-sm font-semibold mb-1 xs:mb-2 flex items-center text-green-700">
        <span className="mr-1">🥗</span> Acompañamientos
      </h2>
      <div className="flex flex-col space-y-1 xs:space-y-2">
        {sides.map(side => (
          <div key={side.id} className="flex items-center justify-between text-[10px] xs:text-xs sm:text-sm">
            <button
              onClick={() => handleSideAdd(side)}
              className="flex items-center space-x-1 xs:space-x-2 text-left hover:text-green-800 transition-colors"
            >
              <span>{side.name}</span>
            </button>
            {selectedSides.some(s => s.id === side.id) && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleSideRemove(side.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <span role="img" aria-label="Remove">🗑️</span>
                </button>
                <span>{selectedSides.find(s => s.id === side.id).quantity || 1}</span>
                <button
                  onClick={() => handleSideAdd(side)}
                  className="text-green-500 hover:text-green-700"
                >
                  <span role="img" aria-label="Add">➕</span>
                </button>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-col space-y-1 xs:space-y-2 mt-1 xs:mt-2">
          <input
            type="text"
            value={customSide}
            onChange={(e) => setCustomSide(e.target.value)}
            placeholder="Otro acompañamiento"
            className="p-1 xs:p-2 text-[10px] xs:text-xs sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 placeholder-gray-400"
            aria-label="Ingresar un acompañamiento personalizado"
          />
          <button
            onClick={addCustomSide}
            className="bg-green-500 hover:bg-green-600 text-white px-2 xs:px-3 py-0.5 xs:py-1 rounded-lg text-[10px] xs:text-xs sm:text-sm transition-colors"
            aria-label="Agregar acompañamiento personalizado"
          >
            Agregar
          </button>
        </div>
        <div className="mt-1 xs:mt-2">
          <h3 className="text-[10px] xs:text-xs sm:text-sm font-semibold mb-0.5 xs:mb-1 text-green-700">Notas adicionales</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ejemplo: Sin cebolla, por favor"
            className="w-full p-1 xs:p-2 text-[10px] xs:text-xs sm:text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 placeholder-gray-400"
            rows="2"
            aria-label="Notas adicionales para el pedido"
          />
        </div>
      </div>
    </div>
  );
};

export default SidesSelector;