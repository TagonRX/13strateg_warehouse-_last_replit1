import { useEffect, useRef } from 'react';

/**
 * Hook для СТРОГОЙ маршрутизации ввода баркодов с ZERO-LEAK гарантией.
 * 
 * КРИТИЧЕСКОЕ ТРЕБОВАНИЕ:
 * - Данные со сканера ВСЕГДА попадают ТОЛЬКО в поле barcode
 * - Даже если фокус в другом поле (location, productId и т.д.)
 * - НИ ОДИН символ не должен попасть в неправильное поле
 * 
 * Как работает (Pre-buffering + Auto-reset алгоритм):
 * 1. Любой символ при фокусе НЕ на barcode → preventDefault + буферизация
 * 2. Ждем 80мс - если приходит второй символ → это сканер
 * 3. Переключаем фокус на barcode + выливаем буфер
 * 4. Если второй символ НЕ пришел → это пользователь, возвращаем в оригинальное поле
 * 5. Auto-reset: scannerActive сбрасывается через 200мс после последнего символа
 * 
 * @param enabled - включить/выключить строгую маршрутизацию (по умолчанию true)
 */
export function useGlobalBarcodeInput(enabled: boolean = true) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buffer = useRef<string>('');
  const detectionTimer = useRef<number | null>(null);
  const inactivityTimer = useRef<number | null>(null);
  const scannerActive = useRef<boolean>(false);
  const originalTarget = useRef<HTMLElement | null>(null);
  const originalSelectionStart = useRef<number | null>(null);
  const originalSelectionEnd = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !inputRef.current) {
      return;
    }

    const barcodeInput = inputRef.current;

    // Начальный фокус при монтировании
    barcodeInput.focus();

    // Сброс режима сканера через 200мс бездействия
    const resetScannerMode = () => {
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
      }
      inactivityTimer.current = window.setTimeout(() => {
        scannerActive.current = false;
        inactivityTimer.current = null;
      }, 200);
    };

    // Глобальный keydown listener - строгая маршрутизация с pre-buffering
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем модификаторы
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Enter - завершаем сканирование
      if (e.key === 'Enter') {
        if (scannerActive.current) {
          // Если Enter не на barcode поле - preventDefault и синтезируем Enter на barcode
          if (document.activeElement !== barcodeInput) {
            e.preventDefault();
            e.stopPropagation();
            const enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              bubbles: true,
            });
            barcodeInput.dispatchEvent(enterEvent);
          }
          
          // Сброс состояния
          scannerActive.current = false;
          buffer.current = '';
          if (detectionTimer.current) {
            window.clearTimeout(detectionTimer.current);
            detectionTimer.current = null;
          }
          if (inactivityTimer.current) {
            window.clearTimeout(inactivityTimer.current);
            inactivityTimer.current = null;
          }
        }
        return;
      }

      // Только печатные символы
      if (!e.key || e.key.length !== 1) {
        return;
      }

      const activeElement = document.activeElement;

      // Если уже активен режим сканера - направляем в barcode
      if (scannerActive.current) {
        if (activeElement !== barcodeInput) {
          e.preventDefault();
          e.stopPropagation();
          
          // Добавляем в barcode поле программно
          const currentValue = barcodeInput.value;
          const newValue = currentValue + e.key;
          
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          
          nativeInputValueSetter?.call(barcodeInput, newValue);
          
          const inputEvent = new Event('input', { bubbles: true });
          barcodeInput.dispatchEvent(inputEvent);
        }
        
        // Обновляем таймер бездействия
        resetScannerMode();
        return;
      }

      // Если фокус НЕ на barcode input
      if (activeElement !== barcodeInput) {
        // ВСЕГДА блокируем символ для pre-buffering
        e.preventDefault();
        e.stopPropagation();

        // Если это input/textarea - сохраняем позицию курсора
        if (
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement
        ) {
          if (!originalTarget.current) {
            const target = activeElement;
            
            // Пропускаем readOnly/disabled поля - направляем в barcode сразу
            if (target.readOnly || target.disabled) {
              scannerActive.current = true;
              barcodeInput.focus();
              
              const currentValue = barcodeInput.value || '';
              const newValue = currentValue + e.key;
              
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
              )?.set;
              
              nativeInputValueSetter?.call(barcodeInput, newValue);
              
              const inputEvent = new Event('input', { bubbles: true });
              barcodeInput.dispatchEvent(inputEvent);
              
              resetScannerMode();
              return;
            }
            
            originalTarget.current = target;
            originalSelectionStart.current = target.selectionStart;
            originalSelectionEnd.current = target.selectionEnd;
            buffer.current = e.key;
            
            // Запускаем таймер детекции (80мс)
            detectionTimer.current = window.setTimeout(() => {
              // Таймаут истек - это был медленный ввод (пользователь)
              // Возвращаем символ в оригинальное поле
              if (originalTarget.current && buffer.current) {
                const target = originalTarget.current as HTMLInputElement | HTMLTextAreaElement;
                
                // Проверяем что элемент еще в DOM
                if (!target.isConnected) {
                  buffer.current = '';
                  originalTarget.current = null;
                  originalSelectionStart.current = null;
                  originalSelectionEnd.current = null;
                  detectionTimer.current = null;
                  return;
                }
                
                const currentValue = target.value || '';
                const start = originalSelectionStart.current ?? currentValue.length;
                const end = originalSelectionEnd.current ?? start;
                
                // Заменяем выделенный текст (или вставляем в позицию курсора)
                const newValue = 
                  currentValue.slice(0, start) + 
                  buffer.current + 
                  currentValue.slice(end);
                
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  target.constructor.prototype,
                  'value'
                )?.set;
                
                nativeInputValueSetter?.call(target, newValue);
                
                const inputEvent = new Event('input', { bubbles: true });
                target.dispatchEvent(inputEvent);
                
                // Восстанавливаем курсор ПОСЛЕ вставленного символа
                // Для type="number" это может не работать, но не критично
                try {
                  target.setSelectionRange(start + 1, start + 1);
                } catch {
                  // type="number" не поддерживает setSelectionRange
                }
                
                // Восстанавливаем фокус
                target.focus();
              }
              
              // Сброс
              buffer.current = '';
              originalTarget.current = null;
              originalSelectionStart.current = null;
              originalSelectionEnd.current = null;
              detectionTimer.current = null;
            }, 80);
          } else {
            // Второй символ пришел быстро - это СКАНЕР!
            window.clearTimeout(detectionTimer.current!);
            detectionTimer.current = null;
            
            // Активируем режим сканера
            scannerActive.current = true;
            
            // Фокус на barcode поле
            barcodeInput.focus();
            
            // Выливаем буфер + текущий символ
            const fullBarcode = buffer.current + e.key;
            
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            
            const currentValue = barcodeInput.value || '';
            nativeInputValueSetter?.call(barcodeInput, currentValue + fullBarcode);
            
            const inputEvent = new Event('input', { bubbles: true });
            barcodeInput.dispatchEvent(inputEvent);
            
            // Сброс буфера
            buffer.current = '';
            originalTarget.current = null;
            originalSelectionStart.current = null;
            originalSelectionEnd.current = null;
            
            // Запускаем таймер бездействия
            resetScannerMode();
          }
        } else {
          // Фокус на не-editable элементе (body, button, etc.)
          // Сразу считаем сканером и направляем в barcode
          scannerActive.current = true;
          barcodeInput.focus();
          
          // Добавляем символ
          const currentValue = barcodeInput.value || '';
          const newValue = currentValue + e.key;
          
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          )?.set;
          
          nativeInputValueSetter?.call(barcodeInput, newValue);
          
          const inputEvent = new Event('input', { bubbles: true });
          barcodeInput.dispatchEvent(inputEvent);
          
          // Запускаем таймер бездействия
          resetScannerMode();
        }
      }
    };

    // Сброс при blur barcode input
    const handleBlur = () => {
      if (scannerActive.current && inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
        inactivityTimer.current = null;
        scannerActive.current = false;
      }
    };

    // Сброс при изменении фокуса
    const handleFocusChange = () => {
      // Очищаем detection timer если фокус сменился
      if (detectionTimer.current && originalTarget.current) {
        const activeElement = document.activeElement;
        if (activeElement !== originalTarget.current) {
          window.clearTimeout(detectionTimer.current);
          detectionTimer.current = null;
          buffer.current = '';
          originalTarget.current = null;
          originalSelectionStart.current = null;
          originalSelectionEnd.current = null;
        }
      }
    };

    // Слушаем на capture phase для раннего перехвата
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocusChange);
    barcodeInput.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocusChange);
      barcodeInput.removeEventListener('blur', handleBlur);
      if (detectionTimer.current) {
        window.clearTimeout(detectionTimer.current);
      }
      if (inactivityTimer.current) {
        window.clearTimeout(inactivityTimer.current);
      }
    };
  }, [enabled]);

  return { inputRef };
}
