import InventoryTable from '../InventoryTable';

export default function InventoryTableExample() {
  const mockItems = [
    {
      id: "1",
      productId: "PROD001",
      name: "LED Bulb GU10 5W",
      sku: "A101",
      location: "A101-J",
      quantity: 25,
      barcode: "1234567890123",
      status: "IN_STOCK" as const,
    },
    {
      id: "2",
      productId: "PROD002",
      name: "Smart Switch Hub",
      sku: "A101",
      location: "A101-K",
      quantity: 10,
      barcode: "9876543210987",
      status: "IN_STOCK" as const,
    },
    {
      id: "3",
      productId: "PROD003",
      name: "USB Cable 2m",
      sku: "B205",
      location: "B205-A",
      quantity: 50,
      status: "PICKED" as const,
    },
  ];

  return (
    <div className="p-8">
      <InventoryTable items={mockItems} />
    </div>
  );
}
