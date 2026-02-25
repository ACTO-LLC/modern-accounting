import { useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

export interface Attachment {
  id?: string;
  fileName: string;
  contentType: string;
  fileData: string; // base64 data URL
}

interface ScreenshotUploaderProps {
  value: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

export default function ScreenshotUploader({
  value,
  onChange,
  maxFiles = 10,
  maxSizeMB = 5
}: ScreenshotUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const processFile = useCallback((file: File): Promise<Attachment | null> => {
    return new Promise((resolve) => {
      // Check file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        alert(`File ${file.name} is too large. Maximum size is ${maxSizeMB}MB.`);
        resolve(null);
        return;
      }

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert(`File ${file.name} is not an image.`);
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        resolve({
          fileName: file.name,
          contentType: file.type,
          fileData: result
        });
      };
      reader.onerror = () => {
        alert(`Failed to read file ${file.name}`);
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }, [maxSizeMB]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const remainingSlots = maxFiles - value.length;
    if (remainingSlots <= 0) {
      alert(`Maximum of ${maxFiles} files allowed.`);
      return;
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    const newAttachments: Attachment[] = [];

    for (const file of filesToProcess) {
      const attachment = await processFile(file);
      if (attachment) {
        newAttachments.push(attachment);
      }
    }

    if (newAttachments.length > 0) {
      onChange([...value, ...newAttachments]);
    }
  }, [value, onChange, maxFiles, processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove('border-indigo-500', 'bg-indigo-50');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.add('border-indigo-500', 'bg-indigo-50');
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneRef.current?.classList.remove('border-indigo-500', 'bg-indigo-50');
  }, []);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }, [addFiles]);

  const removeAttachment = useCallback((index: number) => {
    const newAttachments = [...value];
    newAttachments.splice(index, 1);
    onChange(newAttachments);
  }, [value, onChange]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        ref={dropZoneRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onPaste={handlePaste}
        tabIndex={0}
        className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">Click to upload</span> or drag and drop
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          You can also paste images from clipboard (Ctrl+V)
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          PNG, JPG, GIF up to {maxSizeMB}MB each (max {maxFiles} files)
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Preview thumbnails */}
      {value.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {value.map((attachment, index) => (
            <div key={index} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                {attachment.fileData ? (
                  <img
                    src={attachment.fileData}
                    alt={attachment.fileName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                title="Remove"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate" title={attachment.fileName}>
                {attachment.fileName}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
