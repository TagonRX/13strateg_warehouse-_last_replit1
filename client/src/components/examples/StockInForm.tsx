import StockInForm from '../StockInForm';

export default function StockInFormExample() {
  const handleSubmit = (data: any) => {
    console.log('Stock in data:', data);
    alert(`Товар добавлен: ${data.name} (${data.quantity} шт)`);
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Приход товара</h2>
      <StockInForm onSubmit={handleSubmit} />
    </div>
  );
}
