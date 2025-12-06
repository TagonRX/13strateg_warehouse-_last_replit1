import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@/components/ui/button";

type Props = {
  onScan: (code: string) => void;
  onManualChange?: (code: string) => void;
  onDelete?: () => void;
};

export default function ScannerModule({ onScan, onManualChange, onDelete }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [lastCode, setLastCode] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [active, setActive] = useState(false); // Камера НЕ запускается автоматически

  useEffect(() => {
    if (!active) return;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.QR_CODE,
    ]);
    reader.setHints(hints as any);

    let canceled = false;
    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
      if (canceled) return;
      if (result) {
        const text = result.getText();
        if (text && text !== lastCode) {
          setLastCode(text);
          onScan(text);
        }
      }
      if (err && (err.name === "NotAllowedError" || err.name === "NotFoundException" || err.name === "NotReadableError")) {
        setCameraError("Камера недоступна: проверьте разрешение браузера или наличие камеры.");
      }
    }).catch(console.error);

    return () => {
      canceled = true;
      try { readerRef.current?.reset(); } catch {}
    };
  }, [onScan, active]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Видео камеры — показываем только если активна */}
      {active && !cameraError && (
        <video ref={videoRef} className="w-40 h-24 rounded border object-cover flex-shrink-0" muted playsInline />
      )}
      {active && cameraError && (
        <div className="w-40 h-24 p-2 border rounded bg-yellow-50 text-yellow-900 text-xs flex items-center">
          {cameraError}
        </div>
      )}
      {/* Кнопка включения/паузы */}
      <Button 
        variant={active ? "outline" : "default"} 
        size="sm"
        onClick={() => { setActive((v) => !v); setCameraError(null); }}
        className="flex-shrink-0"
      >
        {active ? "Пауза сканера" : "Включить сканер"}
      </Button>
      {/* Ручной ввод */}
      <input
        className="h-9 px-2 border rounded flex-1 min-w-[180px]"
        placeholder="Ручной ввод баркода"
        value={lastCode}
        onChange={(e) => {
          setLastCode(e.target.value);
          onManualChange?.(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && lastCode.trim()) {
            onScan(lastCode.trim());
          }
        }}
      />
      <Button variant="outline" size="sm" onClick={() => setLastCode("")}>Очистить</Button>
      {onDelete && (
        <Button variant="destructive" size="sm" onClick={() => onDelete?.()}>Удалить</Button>
      )}
    </div>
  );
}
