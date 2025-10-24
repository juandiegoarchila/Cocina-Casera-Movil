//src/components/OptionSelector.js
import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';

export const isMobile = () => window.innerWidth < 768;

const OptionSelector = ({
  title,
  emoji,
  options = [],
  selected = [],
  showReplacements: propShowReplacements = false,
  replacements = [],
  selectedReplacement = null,
  multiple = false,
  className = '',
  disabled = false,
  showConfirmButton = false,
  onConfirm = () => {},
  onImmediateSelect = () => {},
  onImmediateReplacementSelect = () => {},
  onAdd = () => {},
  onRemove = () => {},
  onIncrease = () => {},
}) => {
  const [showReplacement, setShowReplacement] = useState(propShowReplacements);
  const [pendingSelection, setPendingSelection] = useState(
    multiple ? (Array.isArray(selected) ? selected : []) : selected
  );
  const [currentConfiguring, setCurrentConfiguring] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  // NUEVO: nombres de opciones removidas por haberse agotado en tiempo real
  const [outOfStockRemovedNames, setOutOfStockRemovedNames] = useState([]);
  // NUEVO: previsualización de imagen
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    let initialSelection = multiple ? (Array.isArray(selected) ? selected : []) : selected;

    // En Acompañamiento, nunca conservar "Todo incluído" como parte de la selección persistida
    if (title === 'Acompañamiento' && multiple && Array.isArray(initialSelection)) {
      initialSelection = initialSelection.filter(opt => opt?.name !== 'Todo incluído');
    }
    
    // Debug específico para Principio
    if (title === 'Principio' && process.env.NODE_ENV === 'development') {
      console.log('[OptionSelector DEBUG] Principio useEffect iniciando:', {
        selectedReplacement,
        initialSelection,
        multiple,
        selectedProp: selected,
        hasSelectedReplacement: !!selectedReplacement
      });
    }
    
    // Si hay un reemplazo seleccionado para Principio, asegurar que "Remplazo por Principio" esté seleccionado
    if (title === 'Principio' && selectedReplacement && multiple) {
      const currentSelectionArray = Array.isArray(initialSelection) ? initialSelection : [];
      const hasReplacementOption = currentSelectionArray.some(opt => opt?.name === 'Remplazo por Principio');
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[OptionSelector DEBUG] Principio con reemplazo:', {
          currentSelectionArray,
          hasReplacementOption,
          optionsLength: options.length
        });
      }
      
      if (!hasReplacementOption && options.length > 0) {
        const replacementOption = options.find(opt => opt?.name === 'Remplazo por Principio');
        if (replacementOption) {
          // Si no hay selección previa, usar solo el reemplazo
          // Si hay selección previa, agregarla a la lista
          initialSelection = currentSelectionArray.length > 0 
            ? [...currentSelectionArray, replacementOption]
            : [replacementOption];
          
          if (process.env.NODE_ENV === 'development') {
            console.log('[OptionSelector DEBUG] Principio - agregando Remplazo por Principio:', {
              previousSelection: currentSelectionArray,
              newSelection: initialSelection,
              replacementOption
            });
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('[OptionSelector DEBUG] Principio - NO encontró Remplazo por Principio en options');
          }
        }
      }
    }
    
    setPendingSelection(initialSelection);
    if (process.env.NODE_ENV === 'development') {
      console.log('[OptionSelector] pendingSelection inicializado:', {
        title,
        selectedReplacement,
        initialSelection,
        hasReplacement: selectedReplacement ? true : false
      });
    }
  }, [selected, multiple, title, selectedReplacement, options]);

  useEffect(() => {
    let shouldShow = propShowReplacements && Array.isArray(replacements) && replacements.length > 0;
    
    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      const needsReplacement = pendingSelection.some(
        (opt) =>
          opt.requiresReplacement &&
          (opt.name.toLowerCase() === 'proteína adicional' ? !opt.protein : !opt.replacement)
      );
      shouldShow = needsReplacement;
      if (needsReplacement && !currentConfiguring) {
        const unconfigured = pendingSelection.find(
          (opt) =>
            opt.requiresReplacement &&
            (opt.name.toLowerCase() === 'proteína adicional' ? !opt.protein : !opt.replacement)
        );
        if (unconfigured) {
          setCurrentConfiguring(unconfigured.id);
        }
      }
    } else if (title === 'Sopa') {
      shouldShow = pendingSelection?.name === 'Remplazo por Sopa' || !!selectedReplacement;
    } else if (title === 'Principio') {
      const hasReplacementInSelection = multiple && Array.isArray(pendingSelection) && pendingSelection.some((opt) => opt.name === 'Remplazo por Principio');
      const hasNonMultipleReplacement = !multiple && pendingSelection?.name === 'Remplazo por Principio';
      const hasSelectedReplacement = !!selectedReplacement;
      
      shouldShow = hasReplacementInSelection || hasNonMultipleReplacement || hasSelectedReplacement;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[OptionSelector DEBUG] Principio shouldShow calculation:', {
          hasReplacementInSelection,
          hasNonMultipleReplacement,
          hasSelectedReplacement,
          finalShouldShow: shouldShow,
          pendingSelection,
          selectedReplacement,
          multiple
        });
      }
    }

    setShowReplacement(shouldShow);
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[OptionSelector] showReplacement actualizado:',
        shouldShow,
        'para pendingSelection:',
        pendingSelection,
        'reemplazos:',
        replacements,
        'título:',
        title
      );
    }
  }, [propShowReplacements, pendingSelection, title, replacements, currentConfiguring, multiple]);

  useEffect(() => {
    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      const validSelections = pendingSelection.filter((opt) => {
        if (opt.id === currentConfiguring) {
          return true; 
        }
        if (opt.requiresReplacement) {
          if (opt.name.toLowerCase() === 'proteína adicional') {
            return !!opt.protein;
          } else if (['sopa adicional', 'principio adicional', 'bebida adicional'].includes(opt.name.toLowerCase())) {
            return !!opt.replacement;
          }
        }
        return true;
      });
      if (validSelections.length !== pendingSelection.length) {
        setPendingSelection(validSelections);
        onImmediateSelect(validSelections);
        if (process.env.NODE_ENV === 'development') {
          console.log('[OptionSelector] Selecciones inválidas eliminadas:', validSelections);
        }
      }
    }
  }, [pendingSelection, title, onImmediateSelect, currentConfiguring]);

  // NUEVO: efecto que limpia selecciones que se han marcado como isFinished (agotadas) después de haber sido elegidas
  useEffect(() => {
    if (!options || options.length === 0) return;
    const finishedById = new Map();
    const finishedByName = new Set();
    options.forEach(o => {
      if (o?.isFinished) {
        if (o.id) finishedById.set(o.id, o);
        if (o.name) finishedByName.add(o.name);
      }
    });

    if (multiple) {
      if (!Array.isArray(pendingSelection) || pendingSelection.length === 0) return;
      const toRemove = pendingSelection.filter(sel => sel && (finishedById.has(sel.id) || finishedByName.has(sel.name)));
      if (toRemove.length > 0) {
        const kept = pendingSelection.filter(sel => sel && !(finishedById.has(sel.id) || finishedByName.has(sel.name)));
        setPendingSelection(kept);
        onImmediateSelect(kept);
        const removedNames = toRemove.map(r => r.name);
        setOutOfStockRemovedNames(prev => [...prev, ...removedNames].slice(-5));
        try {
          window.dispatchEvent(new CustomEvent('option-out-of-stock', { detail: { names: removedNames, title, timestamp: Date.now() } }));
        } catch(e) { /* noop */ }
        if (process.env.NODE_ENV === 'development') {
          console.log('[OptionSelector] Removidas por agotarse:', toRemove.map(r => r.name));
        }
      }
    } else {
      if (pendingSelection && (finishedById.has(pendingSelection.id) || finishedByName.has(pendingSelection.name))) {
        const removedName = pendingSelection.name;
        setPendingSelection(null);
        onImmediateSelect(null);
        setOutOfStockRemovedNames(prev => [...prev, removedName].slice(-5));
        try {
          window.dispatchEvent(new CustomEvent('option-out-of-stock', { detail: { names: [removedName], title, timestamp: Date.now() } }));
        } catch(e) { /* noop */ }
        if (process.env.NODE_ENV === 'development') {
          console.log('[OptionSelector] Opción única removida por agotarse:', removedName);
        }
      }
    }
  }, [options, pendingSelection, multiple, onImmediateSelect]);

  // Limpiar mensajes de agotado tras unos segundos
  useEffect(() => {
    if (!outOfStockRemovedNames.length) return;
    const t = setTimeout(() => setOutOfStockRemovedNames([]), 6000);
    return () => clearTimeout(t);
  }, [outOfStockRemovedNames]);

  // Muestra advertencia si una adición está incompleta al colapsar
  const handleCollapseCheck = () => {
    const hasIncompleteAddition = pendingSelection.some(
      (opt) =>
        opt.requiresReplacement &&
        !opt.protein &&
        !opt.replacement &&
        opt.id === currentConfiguring
    );
    setShowWarning(hasIncompleteAddition);
    return hasIncompleteAddition;
  };

  // Verifica si el botón de confirmar está deshabilitado
  const isConfirmDisabled = useCallback(() => {
    if (!showConfirmButton) return false;
    if (title === 'Principio' && multiple) {
      if (pendingSelection.some((opt) => opt.name === 'Remplazo por Principio')) {
        return !pendingSelection[0]?.replacement;
      }
      const hasSpecialRice = pendingSelection.some(opt => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(opt.name));
      return hasSpecialRice ? pendingSelection.length > 1 : pendingSelection.length === 0 || pendingSelection.length > 2;
    }
    return multiple ? pendingSelection.length === 0 : !pendingSelection;
  }, [pendingSelection, showConfirmButton, title, multiple]);

  // Maneja el clic en una opción
  const handleOptionClick = (option) => {
    if (disabled || option.isFinished) return;

    let updatedSelection = multiple ? [...pendingSelection] : null;
    const isCurrentlySelected = multiple
      ? updatedSelection.some((opt) => opt.id === option.id)
      : pendingSelection?.id === option.id;

    const toggleableOptions = [
      'Remplazo por Principio',
      'Remplazo por Sopa',
      'Proteína adicional',
      'Sopa adicional',
      'Principio adicional',
      'Bebida adicional',
      'proteína adicional',
      'bebida adicional',
    ];

    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      if (isCurrentlySelected) {
        updatedSelection = updatedSelection.filter((opt) => opt.id !== option.id);
        onRemove(option.id);
        if (currentConfiguring === option.id) {
          setCurrentConfiguring(null);
          setShowWarning(false);
        }
        setShowReplacement(false);
      } else {
        const newOption = { ...option, quantity: 1 };
        updatedSelection.push(newOption);
        onAdd(newOption);
        if (option.requiresReplacement) {
          setCurrentConfiguring(option.id);
          setShowReplacement(true);
        }
      }
      setPendingSelection(updatedSelection);
      onImmediateSelect(updatedSelection);
    } else {
      let shouldShowReplacement = false;
      if (toggleableOptions.includes(option.name)) {
        if (isCurrentlySelected) {
          if (multiple) {
            updatedSelection = updatedSelection.filter((opt) => opt.id !== option.id);
          } else {
            updatedSelection = null;
          }
          if (title === 'Sopa' || title === 'Principio') {
            onImmediateReplacementSelect(null);
          }
          shouldShowReplacement = false;
        } else {
          shouldShowReplacement = option.name === 'Remplazo por Sopa' || option.name === 'Remplazo por Principio';
          if (multiple) {
            if (title === 'Principio' && option.name === 'Remplazo por Principio') {
              updatedSelection = [option];
            } else {
              updatedSelection.push(option);
            }
          } else {
            updatedSelection = option;
          }
        }
      } else {
        shouldShowReplacement = false;
        if (title === 'Sopa' || title === 'Principio') {
          onImmediateReplacementSelect(null);
        }
        if (title === 'Principio' && multiple) {
          const isSpecialRice = ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(option.name);
          const hasSpecialRice = updatedSelection.some(opt => ['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes'].includes(opt.name));
          const hasReplacement = updatedSelection.some(opt => opt.name === 'Remplazo por Principio');

          if (isSpecialRice || option.name === 'Remplazo por Principio') {
            if (isCurrentlySelected) {
              updatedSelection = updatedSelection.filter((opt) => opt.id !== option.id);
              if (hasReplacement) onImmediateReplacementSelect(null); // Limpia el reemplazo si deseleccionamos
            } else {
              updatedSelection = [option]; // Limpia todo y establece solo la opción especial o reemplazo
              if (option.name === 'Remplazo por Principio') {
                setShowReplacement(true); // Activa el submenú para reemplazo
              }
            }
          } else {
            if (hasSpecialRice || hasReplacement) {
              updatedSelection = updatedSelection.filter(opt => !['Arroz con pollo', 'Arroz paisa', 'Arroz tres carnes', 'Remplazo por Principio'].includes(opt.name));
              if (hasReplacement) onImmediateReplacementSelect(null); // Limpia el reemplazo al cambiar
            }
            const optionIndex = updatedSelection.findIndex((opt) => opt.id === option.id);
            if (optionIndex > -1) {
              updatedSelection.splice(optionIndex, 1);
            } else if (updatedSelection.length < 2) {
              updatedSelection.push(option);
            }
          }
        } else if (title === 'Acompañamiento' && multiple) {
          // Opción rápida: "Todo incluído" marca todas las opciones disponibles excepto "Ninguno" y la propia
          if (option.name === 'Todo incluído') {
            const allAvailable = (options || [])
              .filter(o => !o?.isFinished && o?.name !== 'Ninguno' && o?.name !== 'Todo incluído');
            updatedSelection = allAvailable;
            const hadNinguno = updatedSelection.some(opt => opt.name === 'Ninguno');
            if (hadNinguno) {
              updatedSelection = updatedSelection.filter(opt => opt.name !== 'Ninguno');
            }
            setPendingSelection(updatedSelection);
            onImmediateSelect(updatedSelection);
            setShowReplacement(false);
            return; // salir porque ya aplicamos el select-all
          }
          if (option.name === 'Ninguno') {
            if (isCurrentlySelected) {
              updatedSelection = updatedSelection.filter((opt) => opt.id !== option.id);
            } else {
              if (updatedSelection.length === 0) {
                updatedSelection = [option];
              } else {
                updatedSelection = [option];
              }
            }
          } else {
            const hasNinguno = updatedSelection.some(opt => opt.name === 'Ninguno');
            if (hasNinguno) {
              updatedSelection = updatedSelection.filter(opt => opt.name !== 'Ninguno');
            }
            // Si el usuario selecciona una opción individual, asegurarnos de remover "Todo incluído" si por alguna razón estuviera en selección
            updatedSelection = updatedSelection.filter(opt => opt.name !== 'Todo incluído');
            const optionIndex = updatedSelection.findIndex((opt) => opt.id === option.id);
            if (optionIndex > -1) {
              updatedSelection.splice(optionIndex, 1);
            } else {
              updatedSelection.push(option);
            }
          }
        } else if (multiple) {
          const optionIndex = updatedSelection.findIndex((opt) => opt.id === option.id);
          if (optionIndex > -1) {
            updatedSelection.splice(optionIndex, 1);
          } else {
            updatedSelection.push(option);
          }
        } else {
          updatedSelection = option;
        }
      }
      setPendingSelection(updatedSelection);
      onImmediateSelect(updatedSelection);
      setShowReplacement(shouldShowReplacement);
    }
  };

  // Maneja el clic en un reemplazo
  const handleReplacementClick = (replacement) => {
    if (disabled || replacement.isFinished) return;

    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      if (currentConfiguring) {
        const updatedSelection = pendingSelection.map((opt) => {
          if (opt.id === currentConfiguring) {
            return {
              ...opt,
              protein: opt.name.toLowerCase() === 'proteína adicional' ? replacement.name : opt.protein,
              replacement: ['sopa adicional', 'principio adicional', 'bebida adicional'].includes(opt.name.toLowerCase())
                ? replacement.name
                : opt.replacement,
            };
          }
          return opt;
        });
        setPendingSelection(updatedSelection);
        onImmediateSelect(updatedSelection);
        onImmediateReplacementSelect({ id: currentConfiguring, replacement });
        onConfirm({ selection: updatedSelection, replacement });

        // Verifica el siguiente elemento sin configurar
        const nextUnconfigured = updatedSelection.find(
          (opt) => opt.requiresReplacement && !opt.replacement && opt.name.toLowerCase() !== 'proteína adicional' && opt.id !== currentConfiguring
        );
        if (nextUnconfigured) {
          setCurrentConfiguring(nextUnconfigured.id);
          setShowReplacement(true);
        } else {
          setCurrentConfiguring(null);
          setShowReplacement(false);
        }
      }
    } else if (title === 'Sopa' || title === 'Principio') {
      const updatedSelection = multiple
        ? pendingSelection.map((opt) => ({
            ...opt,
            replacement:
              opt.name === 'Remplazo por Sopa' || opt.name === 'Remplazo por Principio'
                ? replacement.name
                : opt.replacement,
          }))
        : { ...pendingSelection, replacement: replacement.name };
      setPendingSelection(updatedSelection);
      onImmediateSelect(updatedSelection);
      onImmediateReplacementSelect(replacement);
      onConfirm({ selection: updatedSelection, replacement });
      setShowReplacement(false);
    }
  };

  // Cancela la selección de reemplazo
  const handleCancelReplacement = () => {
    if ((title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && currentConfiguring) {
      const updatedSelection = pendingSelection.filter((opt) => opt.id !== currentConfiguring);
      setPendingSelection(updatedSelection);
      onImmediateSelect(updatedSelection);
      onRemove(currentConfiguring);
      setCurrentConfiguring(null);
      setShowWarning(false);
      setShowReplacement(false);
    }
  };

  // Deselecciona una adición u opción
  const handleDeselect = () => {
    if ((title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && currentConfiguring) {
      const updatedSelection = pendingSelection.filter((opt) => opt.id !== currentConfiguring);
      setPendingSelection(updatedSelection);
      onImmediateSelect(updatedSelection);
      onRemove(currentConfiguring);
      setCurrentConfiguring(null);
      setShowWarning(false);
      setShowReplacement(false);
    } else if (title === 'Sopa' || title === 'Principio') {
      setPendingSelection(multiple ? [] : null);
      onImmediateSelect(multiple ? [] : null);
      onImmediateReplacementSelect(null);
      setShowReplacement(false);
    }
  };

  // Confirma la selección para casos con botón de confirmar
  const handleConfirm = () => {
    if (showConfirmButton && onConfirm) {
      onConfirm({ selection: pendingSelection, replacement: null });
    }
  };

  // Verifica si una opción está seleccionada
  const isOptionSelected = useCallback(
    (option) => {
      const currentCheckSelection = showConfirmButton ? pendingSelection : selected;
      if (multiple) {
        return (
          Array.isArray(currentCheckSelection) &&
          currentCheckSelection.some((opt) => opt.id === option.id)
        );
      }
      return currentCheckSelection?.id === option.id;
    },
    [pendingSelection, selected, showConfirmButton, multiple]
  );

  // Obtiene la cantidad de una opción
  const getOptionQuantity = (option) => {
    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      const selectedOption = pendingSelection.find((opt) => opt.id === option.id);
      return selectedOption ? (selectedOption.quantity || 1) : 0;
    }
    return 0;
  };

  // Verifica si un reemplazo está seleccionado
  const isReplacementSelected = useCallback(
    (replacement) => {
      if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
        const selectedOption = pendingSelection.find((opt) => opt.id === currentConfiguring);
        return (
          selectedOption &&
          (selectedOption.protein === replacement.name ||
            selectedOption.replacement === replacement.name)
        );
      } else if (title === 'Sopa' || title === 'Principio') {
        // Verificar primero el selectedReplacement prop
        if (selectedReplacement) {
          // selectedReplacement puede ser string o objeto
          const replacementName = typeof selectedReplacement === 'string' 
            ? selectedReplacement 
            : selectedReplacement.name;
          
          if (process.env.NODE_ENV === 'development' && title === 'Principio') {
            console.log('[OptionSelector DEBUG] isReplacementSelected for Principio:', {
              replacementBeingChecked: replacement.name,
              selectedReplacement,
              selectedReplacementType: typeof selectedReplacement,
              replacementName,
              replacementId: replacement.id,
              selectedReplacementId: selectedReplacement?.id,
              isMatch: replacementName === replacement.name,
              isIdMatch: selectedReplacement?.id === replacement.id
            });
          }
          
          // Comparar tanto por nombre como por ID para mayor robustez
          if (replacementName === replacement.name || selectedReplacement?.id === replacement.id) {
            return true;
          }
        }
        
        return (
          pendingSelection?.replacement === replacement.name ||
          (Array.isArray(pendingSelection) &&
            pendingSelection.some((opt) => opt.replacement === replacement.name)) ||
          selected?.replacement?.name === replacement.name
        );
      }
      return false;
    },
    [pendingSelection, selected, currentConfiguring, title, selectedReplacement]
  );

  // Analiza el texto de visualización y extrae la descripción si el nombre incluye "(Nuevo)"
  const getDisplayText = (option) => {
    const selectedOption = multiple
      ? Array.isArray(pendingSelection)
        ? pendingSelection.find((opt) => opt.id === option.id)
        : null
      : pendingSelection;

    if (!selectedOption) return option.name;

    let baseName = option.name;
    let isNew = option.isNew || false;

    // Analiza "(Nuevo)" del nombre si está presente
    if (baseName.includes('(Nuevo)')) {
      baseName = baseName.replace(' (Nuevo)', '');
      isNew = true;
    }

    if (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') {
      if ((option.name.toLowerCase() === 'proteína adicional') && selectedOption.protein) {
        return `${baseName} (${selectedOption.protein})`;
      }
      if (
        ['sopa adicional', 'principio adicional', 'bebida adicional'].includes(option.name.toLowerCase()) &&
        selectedOption.replacement
      ) {
        return `${baseName} (${selectedOption.replacement})`;
      }
    } else if (title === 'Sopa' && option.name === 'Remplazo por Sopa') {
      const replacementText = typeof selectedReplacement === 'object' && selectedReplacement 
        ? selectedReplacement.name 
        : selectedReplacement || selectedOption.replacement;
      if (replacementText) {
        return `${baseName} (${replacementText})`;
      }
    } else if (title === 'Principio' && option.name === 'Remplazo por Principio') {
      const replacementText = typeof selectedReplacement === 'object' && selectedReplacement 
        ? selectedReplacement.name 
        : selectedReplacement || selectedOption.replacement;
      if (process.env.NODE_ENV === 'development') {
        console.log('[OptionSelector] Principio replacement debug:', {
          selectedReplacement,
          selectedOptionReplacement: selectedOption.replacement,
          replacementText,
          optionName: option.name
        });
      }
      if (replacementText) {
        return `${baseName} (${replacementText})`;
      }
    }
    return baseName;
  };

  const EyeButton = ({ url, small = false, className = '' }) => (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); setPreviewImage(url); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPreviewImage(url); } }}
      className={`absolute top-1/2 -translate-y-1/2 right-3 sm:right-4 ${small ? 'p-1' : 'p-1.5'} rounded-full bg-white/90 text-gray-700 hover:bg-white shadow cursor-pointer ${className}`}
      aria-label="Ver imagen"
      title="Ver imagen"
      style={{ zIndex: 5 }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={`${small ? 'w-4 h-4' : 'w-5 h-5'}`}>
        <path d="M12 5c-7.633 0-11 7-11 7s3.367 7 11 7 11-7 11-7-3.367-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      </svg>
    </span>
  );

  const mobileLayout = (option, index, isSelected, quantity) => (
    <div key={option.id || index} className="relative">
      <button
        onClick={() => handleOptionClick(option)}
        disabled={disabled || option.isFinished}
        className={`relative w-full p-2 ${option.imageUrl ? 'pr-12' : ''} rounded-t-lg text-sm font-medium transition-all duration-200 flex items-center justify-between text-left min-h-[60px] shadow-sm ${
          disabled || option.isFinished
            ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
            : isSelected
            ? 'bg-green-200 text-green-800 border border-green-300'
            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
        } ${
          ((title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && currentConfiguring === option.id && showReplacement) ||
          ((title === 'Sopa' || title === 'Principio') && option.name.includes('Remplazo') && showReplacement)
            ? 'rounded-b-none'
            : 'rounded-b-lg'
        }`}
        aria-label={`Seleccionar ${option.name}${isSelected ? ' (seleccionado)' : ''}`}
      >
        <div className="flex items-center flex-grow">
          {option.emoji && <span className="mr-2 text-base sm:text-sm">{option.emoji}</span>}
          <div className="flex-grow">
            {getDisplayText(option)}
            {option.description && (
              <span className="text-xs text-gray-500 block mt-1">{option.description}</span>
            )}
          </div>
        </div>
        {/* Checkmark para opciones normales */}
        {isSelected && (title !== 'Adiciones (por almuerzo)' && title !== 'Adiciones (por desayuno)') && (
          <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {/* Controles para adiciones */}
        {(title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && isSelected && (
          <div className="flex items-center space-x-1 flex-shrink-0">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onRemove(option.id);
              }}
              className="text-red-500 hover:text-red-700 cursor-pointer"
              aria-label={`Disminuir cantidad de ${option.name}`}
            >
              <span role="img" aria-label="Eliminar">🗑️</span>
            </div>
            <span className="text-sm">{quantity}</span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onIncrease(option.id);
              }}
              className="text-green-500 hover:text-green-700 cursor-pointer"
              aria-label={`Aumentar cantidad de ${option.name}`}
            >
              <span role="img" aria-label="Agregar">➕</span>
            </div>
          </div>
        )}
      </button>
      {(((title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && currentConfiguring === option.id && showReplacement) ||
        ((title === 'Sopa' || title === 'Principio') && option.name.includes('Remplazo') && showReplacement)) &&
        replacements.length > 0 && (
          <div className="bg-green-50 p-2 rounded-b-lg border border-t-0 border-green-300 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-[10px] font-medium text-gray-600">
                Selecciona tu opción para {option.name}:
              </h4>
              <div>
                {(title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && (
                  <button
                    onClick={handleCancelReplacement}
                    className="text-red-600 hover:text-red-700 text-xs mr-2"
                    aria-label="Cancelar selección"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  onClick={handleDeselect}
                  className="text-red-600 hover:text-red-700 text-xs"
                  aria-label="Deseleccionar opción"
                >
                  Deseleccionar
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {replacements.map((replacement, idx) => {
                // Debug para Principio antes del render
                if (process.env.NODE_ENV === 'development' && title === 'Principio') {
                  console.log(`[OptionSelector DEBUG] Rendering replacement ${idx + 1}/${replacements.length}:`, {
                    replacementName: replacement.name,
                    replacementId: replacement.id,
                    isSelected: isReplacementSelected(replacement),
                    selectedReplacement,
                    hasSelectedReplacement: !!selectedReplacement
                  });
                }
                
                return (
                  <div key={replacement.id || idx} className="relative">
                  <button
                    onClick={() => handleReplacementClick(replacement)}
                    disabled={disabled || replacement.isFinished}
                    className={`relative w-full p-2 rounded-lg text-sm font-medium transition-all duration-200 flex flex-col items-start text-left min-h-[60px] shadow-sm ${
                      disabled || replacement.isFinished
                        ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
                        : isReplacementSelected(replacement)
                        ? 'bg-green-200 text-green-800 border border-green-300'
                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                    }`}
                    aria-label={`Seleccionar opción ${replacement.name}${isReplacementSelected(replacement) ? ' (seleccionado)' : ''}`}
                  >
                    <div className="flex items-center w-full">
                      {replacement.emoji && (
                        <span className="mr-2 text-base sm:text-sm">{replacement.emoji}</span>
                      )}
                      <div className="flex-grow">
                        {getDisplayText(replacement)}
                      </div>
                      {isReplacementSelected(replacement) && (
                        <svg className="ml-2 h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                    {replacement.description && (
                      <span className="text-xs text-gray-500 block mt-1">{replacement.description}</span>
                    )}
                  </button>
                  {!!replacement.imageUrl && <EyeButton url={replacement.imageUrl} small className="right-3 sm:right-4" />}
                  {replacement.isNew && !replacement.isFinished && (
                    <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
                      NUEVO
                    </span>
                  )}
                  {replacement.isFinished && (
                    <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-gray-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
                      AGOTADO
                    </span>
                  )}
                  </div>
                );
              })}
            </div>
            {showWarning && (
              <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
                Por favor, selecciona una opción o deselecciona la adición antes de cerrar.
              </p>
            )}
          </div>
        )}
      {option.isNew && !option.isFinished && (
        <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
          NUEVO
        </span>
      )}
      {option.isFinished && (
        <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-gray-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
          AGOTADO
        </span>
      )}
  {!!option.imageUrl && <EyeButton url={option.imageUrl} small className="right-3 sm:right-4" />}
    </div>
  );

  const pcLayout = (option, index, isSelected, quantity) => (
    <div key={option.id || index} className="relative">
      <button
        onClick={() => handleOptionClick(option)}
        disabled={disabled || option.isFinished}
        className={`relative w-full p-2 ${option.imageUrl ? 'pr-12' : ''} rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-between text-left min-h-[60px] shadow-sm ${
          disabled || option.isFinished
            ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
            : isSelected
            ? 'bg-green-200 text-green-800 border border-green-300'
            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
        }`}
        aria-label={`Seleccionar ${option.name}${isSelected ? ' (seleccionado)' : ''}`}
      >
        <div className="flex items-center flex-grow">
          {option.emoji && <span className="mr-2 text-base sm:text-sm">{option.emoji}</span>}
          <div>
            {getDisplayText(option)}
            {option.description && (
              <span className="text-xs text-gray-500 block mt-1">{option.description}</span>
            )}
          </div>
        </div>
        {/* Marca de seleccionado */}
        {(title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && isSelected && (
          <div className="flex items-center space-x-1">
            <div
              onClick={(e) => {
                e.stopPropagation();
                onRemove(option.id);
              }}
              className="text-red-500 hover:text-red-700 cursor-pointer"
              aria-label={`Disminuir cantidad de ${option.name}`}
            >
              <span role="img" aria-label="Eliminar">🗑️</span>
            </div>
            <span className="text-sm">{quantity}</span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                onIncrease(option.id);
              }}
              className="text-green-500 hover:text-green-700 cursor-pointer"
              aria-label={`Aumentar cantidad de ${option.name}`}
            >
              <span role="img" aria-label="Agregar">➕</span>
            </div>
          </div>
        )}
        {isSelected && (title !== 'Adiciones (por almuerzo)' && title !== 'Adiciones (por desayuno)') && (
          <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </button>
  {!!option.imageUrl && <EyeButton url={option.imageUrl} className="right-3 sm:right-4" />}
      {option.isNew && !option.isFinished && (
        <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
          NUEVO
        </span>
      )}
      {option.isFinished && (
        <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-gray-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
          AGOTADO
        </span>
      )}
    </div>
  );

  return (
    <div className={`mb-2 ${className}`}>
      {title && title !== 'Adiciones (por almuerzo)' && title !== 'Adiciones (por desayuno)' && (
        <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-700">
          <span className="mr-1">{emoji}</span>
          {title}
        </h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {options.map((option, index) => {
          const isSelected = isOptionSelected(option);
          const quantity = getOptionQuantity(option);
          return isMobile() ? mobileLayout(option, index, isSelected, quantity) : pcLayout(option, index, isSelected, quantity);
        })}
      </div>
      {showReplacement && replacements.length > 0 && !isMobile() && (
        <div className="mt-2 pl-2 border-l-2 border-green-200">
          <div className="flex justify-between items-center mb-1">
            <h4 className="text-[10px] font-medium text-gray-600">
              Selecciona tu opción para{' '}
              {(title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') 
                ? options.find((opt) => opt.id === currentConfiguring)?.name || title
                : title === 'Sopa'
                ? 'Remplazo por Sopa'
                : 'Remplazo por Principio'}:
            </h4>
            <div>
              {(title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && (
                <button
                  onClick={handleCancelReplacement}
                  className="text-red-600 hover:text-red-700 text-xs mr-2"
                  aria-label="Cancelar selección"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleDeselect}
                className="text-red-600 hover:text-red-700 text-xs"
                aria-label="Deseleccionar opción"
              >
                Deseleccionar
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {replacements.map((replacement, index) => (
              <div key={replacement.id || index} className="relative">
                <button
                  onClick={() => handleReplacementClick(replacement)}
                  disabled={disabled || replacement.isFinished}
                  className={`relative w-full p-2 rounded-lg text-sm font-medium transition-all duration-200 flex flex-col items-start text-left min-h-[60px] shadow-sm ${
                    disabled || replacement.isFinished
                      ? 'bg-gray-100 text-gray-400 border border-gray-300 cursor-not-allowed'
                      : isReplacementSelected(replacement)
                      ? 'bg-green-200 text-green-800 border border-green-300'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                  aria-label={`Seleccionar opción ${replacement.name}${isReplacementSelected(replacement) ? ' (seleccionado)' : ''}`}
                >
                  <div className="flex items-center w-full">
                    {replacement.emoji && (
                      <span className="mr-2 text-base sm:text-sm">{replacement.emoji}</span>
                    )}
                    <span className="flex-grow">{getDisplayText(replacement)}</span>
                    {isReplacementSelected(replacement) && (
                      <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  {replacement.description && (
                    <span className="text-xs text-gray-500 block mt-1">{replacement.description}</span>
                  )}
                </button>
                {!!replacement.imageUrl && <EyeButton url={replacement.imageUrl} className="right-3 sm:right-4" />}
                {replacement.isNew && !replacement.isFinished && (
                  <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
                    NUEVO
                  </span>
                )}
                {replacement.isFinished && (
                  <span className="absolute top-0 right-7 transform translate-x-1/2 -translate-y-1/2 bg-gray-500 text-white text-[10px] font-semibold rounded-full px-2 py-0.5">
                    AGOTADO
                  </span>
                )}
              </div>
            ))}
          </div>
          {showWarning && (
            <p className="text-[10px] text-red-600 bg-red-50 p-1 rounded mt-1">
              Por favor, selecciona una opción o deselecciona la adición antes de cerrar.
            </p>
          )}
        </div>
      )}
      {multiple && title === 'Principio' && (
        <div className="mt-1 text-sm sm:text-base text-gray-600 font-semibold">
          {pendingSelection?.some((opt) => opt?.name === 'Remplazo por Principio')
            ? 'Selecciona tu reemplazo por principio entre las opciones disponibles.'
            : 'Puedes seleccionar hasta dos principios. (Mixto)'}
        </div>
      )}
      {multiple && (title === 'Adiciones (por almuerzo)' || title === 'Adiciones (por desayuno)') && (
        <div className="mt-1 text-xs text-gray-500">
          Selecciona los extras para este almuerzo/desayuno. (Opcional)
        </div>
      )}
      {multiple && title === 'Acompañamiento' && (
        <div className="mt-1 text-xs text-gray-500">
        </div>
      )}
      {showConfirmButton && (
 <button
  onClick={handleConfirm}
  disabled={isConfirmDisabled()}
  className={`mt-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2 rounded-lg text-sm transition-colors duration-200 ${
    isConfirmDisabled() ? 'opacity-50 cursor-not-allowed' : ''
  }`}
  aria-label={`Confirmar ${title}`}
>
  Confirmar Principio
</button>
      )}
      {outOfStockRemovedNames.length > 0 && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {outOfStockRemovedNames.length === 1 ? (
            <span>La opción "{outOfStockRemovedNames[0]}" se agotó y fue removida. Selecciona otra.</span>
          ) : (
            <span>
              Las opciones {outOfStockRemovedNames.map((n,i)=>`"${n}"${i < outOfStockRemovedNames.length-1 ? ', ' : ''}`)} se agotaron y fueron removidas. Selecciona otras.
            </span>
          )}
        </div>
      )}
      <Modal isOpen={!!previewImage} onClose={() => setPreviewImage(null)}>
        <div className="flex flex-col items-center justify-center">
          <img
            src={previewImage || ''}
            alt="Vista previa"
            className="max-w-full max-h-[70vh] object-contain rounded shadow"
          />
        </div>
      </Modal>
    </div>
  );
};

export default React.memo(OptionSelector);