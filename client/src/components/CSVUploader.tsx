import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CSVUploaderProps {
  onUpload: (file: File) => Promise<{
    success: number;
    updated: number;
    errors: number;
  }>;
}

export default function CSVUploader({ onUpload }: CSVUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{
    success: number;
    updated: number;
    errors: number;
  } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setResult(null);

    // Имитация загрузки с прогрессом
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const uploadResult = await onUpload(file);
      setProgress(100);
      setResult(uploadResult);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      clearInterval(interval);
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Массовая загрузка CSV</CardTitle>
        <CardDescription>
          Формат: ID товара; Название; SKU; Количество; Штрихкод (опц.)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="border-2 border-dashed rounded-md p-8 text-center">
          <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Перетащите CSV файл или нажмите для выбора
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
              disabled={uploading}
              data-testid="input-csv-file"
            />
            <label htmlFor="csv-upload">
              <Button 
                variant="outline" 
                disabled={uploading}
                asChild
                data-testid="button-upload-csv"
              >
                <span>
                  <FileText className="w-4 h-4 mr-2" />
                  Выбрать файл
                </span>
              </Button>
            </label>
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Загрузка...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                <strong>Загрузка завершена</strong>
                <div className="mt-2 space-y-1 text-sm">
                  <p>✓ Новых записей: {result.success}</p>
                  <p>↻ Обновлено: {result.updated}</p>
                  {result.errors > 0 && (
                    <p className="text-destructive">✗ Ошибок: {result.errors}</p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="bg-muted rounded-md p-4">
          <h4 className="text-sm font-medium mb-2">Правила обработки:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• При совпадении ID товара - обновляется количество</li>
            <li>• Локация извлекается из SKU (A101-G → локация A101)</li>
            <li>• Если SKU без формата (kjkhk) → локация = SKU</li>
            <li>• Штрихкод опционален (5-й столбец)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
