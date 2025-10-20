import { useEffect, useRef } from 'react';

/**
 * Hook для автоматического управления фокусом на поле ввода баркода.
 * 
 * Этот hook решает проблему: USB-сканер пикает, но не заполняет поле,
 * если другое поле находится в фокусе.
 * 
 * Логика работы (event-driven):
 * 1. При монтировании компонента автоматически фокусируется на поле баркода
 * 2. При потере фокуса проверяет, куда ушел фокус
 * 3. Если фокус ушел на body (клик в пустое место) - возвращает фокус на баркод
 * 4. Если фокус ушел на другой элемент управления - НЕ мешает работе
 * 
 * @param enabled - включить/выключить автофокус (по умолчанию true)
 */
export function useGlobalBarcodeInput(enabled: boolean = true) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled || !inputRef.current) {
      return;
    }

    const barcodeInput = inputRef.current;

    // Немедленный фокус при монтировании
    barcodeInput.focus();

    // Event-driven: возвращаем фокус только при клике в пустое место
    const handleBlur = () => {
      // Небольшая задержка, чтобы activeElement успел обновиться
      setTimeout(() => {
        const activeElement = document.activeElement;
        
        // Возвращаем фокус ТОЛЬКО если фокус ушел на body или null
        // Все остальные элементы (button, select, input) сохраняют фокус
        const shouldRefocus = 
          !activeElement || 
          activeElement === document.body;

        if (shouldRefocus && barcodeInput) {
          barcodeInput.focus();
        }
      }, 10);
    };

    barcodeInput.addEventListener('blur', handleBlur);

    return () => {
      barcodeInput.removeEventListener('blur', handleBlur);
    };
  }, [enabled]);

  return { inputRef };
}
