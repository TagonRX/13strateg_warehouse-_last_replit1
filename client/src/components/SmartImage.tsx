import { useState, useEffect } from 'react';
import { ImageIcon } from 'lucide-react';

interface SmartImageProps {
  sku: string;
  imageUrl: string | null;
  imageIndex?: number; // Индекс фото (1-24) для множественных изображений
  alt: string;
  className?: string;
  onImageClick?: () => void;
}

/**
 * Умный компонент изображения:
 * 1. Проверяет наличие локальной копии
 * 2. Если нет - показывает оригинальный URL (может не загрузиться)
 * 3. При ошибке загрузки - показывает плейсхолдер
 * 4. Автоматически скачивает в фоне при первом просмотре
 */
export function SmartImage({ sku, imageUrl, imageIndex = 1, alt, className, onImageClick }: SmartImageProps) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!imageUrl) {
      setIsLoading(false);
      return;
    }

    // Проверяем локальную копию
    const skuWithIndex = `${sku}_${imageIndex}`;
    fetch(`/api/inventory/image/${encodeURIComponent(skuWithIndex)}`)
      .then(res => res.json())
      .then(data => {
        if (data.exists && data.localPath) {
          setCurrentSrc(data.localPath);
        } else {
          // Используем оригинальный URL
          setCurrentSrc(imageUrl);
          
          // Запускаем фоновую загрузку
          fetch('/api/inventory/download-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku: skuWithIndex, imageUrl }),
          }).then(res => res.json())
            .then(result => {
              if (result.success && result.localPath) {
                // Обновляем на локальный путь после загрузки
                setCurrentSrc(result.localPath);
              }
            })
            .catch(err => console.error('Background download failed:', err));
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to check local image:', err);
        setCurrentSrc(imageUrl);
        setIsLoading(false);
      });
  }, [sku, imageUrl, imageIndex]);

  const handleError = () => {
    setHasError(true);
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  if (!imageUrl || hasError) {
    return (
      <div 
        className={`bg-muted rounded flex items-center justify-center ${className || 'w-12 h-12'}`}
        onClick={onImageClick}
      >
        <ImageIcon className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative" onClick={onImageClick}>
      {isLoading && (
        <div className={`absolute inset-0 bg-muted rounded animate-pulse ${className || 'w-12 h-12'}`} />
      )}
      <img
        src={currentSrc || imageUrl}
        alt={alt}
        className={className || 'w-12 h-12 object-cover rounded'}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
      />
    </div>
  );
}
