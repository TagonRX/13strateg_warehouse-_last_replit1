import { useEffect, useRef } from 'react';

/**
 * Hook для умного управления полем ввода баркода.
 * 
 * НОВАЯ ЛОГИКА (по запросу пользователя):
 * - Мышка остается где пользователь хочет (НЕ крадём фокус)
 * - Когда сканер отправляет данные → они попадают в поле баркода
 * - Различаем сканер vs ручной ввод через глобальный keypress listener
 * 
 * Как работает:
 * 1. Начальный фокус только при монтировании (один раз)
 * 2. Глобальный keydown listener перехватывает keypress события
 * 3. Если пользователь НЕ печатает в другом input/textarea/select → направляем в barcode field
 * 4. Если пользователь печатает в другом поле → НЕ трогаем
 * 
 * @param enabled - включить/выключить умный автофокус (по умолчанию true)
 */
export function useGlobalBarcodeInput(enabled: boolean = true) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!enabled || !inputRef.current) {
      return;
    }

    const barcodeInput = inputRef.current;

    // Начальный фокус только при монтировании (один раз)
    barcodeInput.focus();

    // Глобальный keydown listener - перехватывает ввод со сканера
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      
      // Если фокус на input/textarea/select - НЕ перехватываем
      // Пользователь вручную печатает в другом поле - не трогаем
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      // Игнорируем модификаторы и спец.клавиши
      if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) {
        return;
      }

      // Обычная клавиша нажата вне input полей → направляем в barcode field
      // Это работает для USB сканеров которые эмулируют клавиатуру
      barcodeInput.focus();
      // Событие всплывет и попадет в focused barcode input
    };

    // Слушаем на capture phase для раннего перехвата
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);

  return { inputRef };
}
