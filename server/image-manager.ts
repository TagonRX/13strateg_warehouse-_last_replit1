import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const IMAGES_DIR = path.join(process.cwd(), 'server', 'public', 'images', 'products');

interface DownloadResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

/**
 * Скачивает изображение по URL и сохраняет локально
 */
export async function downloadImage(imageUrl: string, sku: string): Promise<DownloadResult> {
  try {
    // Создаем папку если не существует
    await fs.mkdir(IMAGES_DIR, { recursive: true });

    // Генерируем безопасное имя файла из SKU
    const sanitizedSku = sku.replace(/[^a-zA-Z0-9-_]/g, '_');
    const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
    const filename = `${sanitizedSku}${ext}`;
    const filepath = path.join(IMAGES_DIR, filename);

    // Проверяем, существует ли файл
    try {
      await fs.access(filepath);
      // Файл уже существует
      return {
        success: true,
        localPath: `/images/products/${filename}`
      };
    } catch {
      // Файл не существует, скачиваем
    }

    // Скачиваем изображение
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }

    // Сохраняем файл
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    return {
      success: true,
      localPath: `/images/products/${filename}`
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Удаляет локальное изображение по SKU
 */
export async function deleteImage(sku: string): Promise<boolean> {
  try {
    const sanitizedSku = sku.replace(/[^a-zA-Z0-9-_]/g, '_');
    
    // Поддерживаем разные расширения
    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    for (const ext of extensions) {
      const filename = `${sanitizedSku}${ext}`;
      const filepath = path.join(IMAGES_DIR, filename);
      
      try {
        await fs.access(filepath);
        await fs.unlink(filepath);
        console.log(`Deleted image: ${filename}`);
        return true;
      } catch {
        // Файл не существует, пробуем следующее расширение
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error deleting image for SKU ${sku}:`, error);
    return false;
  }
}

/**
 * Проверяет существование локального изображения
 */
export async function imageExists(sku: string): Promise<string | null> {
  try {
    const sanitizedSku = sku.replace(/[^a-zA-Z0-9-_]/g, '_');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    for (const ext of extensions) {
      const filename = `${sanitizedSku}${ext}`;
      const filepath = path.join(IMAGES_DIR, filename);
      
      try {
        await fs.access(filepath);
        return `/images/products/${filename}`;
      } catch {
        // Файл не существует, пробуем следующее
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Очищает все изображения для SKU с нулевым количеством
 */
export async function cleanupOrphanedImages(activeSkus: Set<string>): Promise<number> {
  try {
    const files = await fs.readdir(IMAGES_DIR);
    let deletedCount = 0;

    for (const file of files) {
      // Извлекаем SKU из имени файла (убираем расширение)
      const sku = file.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      
      if (!activeSkus.has(sku)) {
        await fs.unlink(path.join(IMAGES_DIR, file));
        deletedCount++;
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up orphaned images:', error);
    return 0;
  }
}
