import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageGalleryModalProps {
  imageUrls: string[];
  isOpen: boolean;
  onClose: () => void;
  initialIndex?: number;
}

export default function ImageGalleryModal({ 
  imageUrls, 
  isOpen, 
  onClose, 
  initialIndex = 0 
}: ImageGalleryModalProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex: initialIndex });
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    
    const onSelect = () => {
      setCurrentIndex(emblaApi.selectedScrollSnap());
    };

    emblaApi.on('select', onSelect);
    onSelect();

    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  if (!imageUrls || imageUrls.length === 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-4xl w-full p-0" 
        data-testid="dialog-image-gallery"
      >
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle data-testid="text-gallery-title">
              Фотографии товара
            </DialogTitle>
            <div className="flex items-center gap-2">
              <span 
                className="text-sm text-muted-foreground" 
                data-testid="text-image-counter"
              >
                {currentIndex + 1} / {imageUrls.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-gallery"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative px-6 pb-6">
          <div className="overflow-hidden" ref={emblaRef} data-testid="carousel-container">
            <div className="flex">
              {imageUrls.map((url, index) => (
                <div 
                  key={index} 
                  className="flex-[0_0_100%] min-w-0"
                  data-testid={`carousel-slide-${index}`}
                >
                  <div className="flex items-center justify-center bg-muted rounded-md" style={{ minHeight: '400px' }}>
                    <img
                      src={url}
                      alt={`Фото ${index + 1}`}
                      className="max-h-[500px] max-w-full object-contain"
                      data-testid={`image-gallery-${index}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {imageUrls.length > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                className="absolute left-8 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm"
                onClick={scrollPrev}
                data-testid="button-gallery-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="absolute right-8 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm"
                onClick={scrollNext}
                data-testid="button-gallery-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
