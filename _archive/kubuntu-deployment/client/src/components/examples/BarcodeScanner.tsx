import BarcodeScanner from '../BarcodeScanner';

export default function BarcodeScannerExample() {
  const handleScan = (barcode: string) => {
    console.log('Scanned barcode:', barcode);
    alert(`Отсканирован штрихкод: ${barcode}`);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <BarcodeScanner onScan={handleScan} />
    </div>
  );
}
