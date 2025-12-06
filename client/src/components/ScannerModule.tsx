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
  const [active, setActive] = useState(true);

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
    <div className="space-y-2">
      {cameraError ? (
        <div className="p-3 border rounded bg-yellow-50 text-yellow-900 text-sm">
          {cameraError}
        </div>
      ) : (
        <video ref={videoRef} className="w-full max-h-64 rounded border" muted playsInline />
      )}
      <div className="flex items-center gap-2">
        <Button variant={active ? "outline" : "default"} onClick={() => setActive((v) => !v)}>
          {active ? "Пауза сканера" : "Включить сканер"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="h-9 px-2 border rounded w-full"
          placeholder="Ручной ввод баркода"
          value={lastCode}
          onChange={(e) => {
            setLastCode(e.target.value);
            onManualChange?.(e.target.value);
          }}
        />
        <Button variant="outline" onClick={() => setLastCode("")}>Очистить</Button>
        {onDelete && (
          <Button variant="destructive" onClick={() => onDelete?.()}>Удалить</Button>
        )}
      </div>
    </div>
  );
}
