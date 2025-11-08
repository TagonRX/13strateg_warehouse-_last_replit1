import WarehouseLoadingView from '../WarehouseLoadingView';

export default function WarehouseLoadingViewExample() {
  const mockLocationGroups = [
    {
      location: "A101",
      skuCount: 5,
      items: [
        { sku: "SKU-001", name: "LED Bulb", quantity: 10 },
        { sku: "SKU-002", name: "Smart Switch", quantity: 5 },
        { sku: "SKU-003", name: "USB Cable", quantity: 20 },
        { sku: "SKU-004", name: "Phone Case", quantity: 15 },
        { sku: "SKU-005", name: "Screen Protector", quantity: 8 },
      ],
    },
    {
      location: "B205",
      skuCount: 3,
      items: [
        { sku: "SKU-101", name: "Laptop Stand", quantity: 12 },
        { sku: "SKU-102", name: "Keyboard", quantity: 7 },
        { sku: "SKU-103", name: "Mouse Pad", quantity: 25 },
      ],
    },
    {
      location: "C330",
      skuCount: 2,
      items: [
        { sku: "SKU-201", name: "Monitor Mount", quantity: 4 },
        { sku: "SKU-202", name: "HDMI Cable", quantity: 18 },
      ],
    },
  ];

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Загрузка склада</h2>
      <WarehouseLoadingView locationGroups={mockLocationGroups} />
    </div>
  );
}
