import CSVUploader from '../CSVUploader';

export default function CSVUploaderExample() {
  const handleUpload = async (file: File) => {
    console.log('Uploading file:', file.name);
    
    // Имитация загрузки
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: 150,
      updated: 23,
      errors: 5,
    };
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Массовая загрузка</h2>
      <CSVUploader onUpload={handleUpload} />
    </div>
  );
}
