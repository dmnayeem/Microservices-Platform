"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, CheckCircle, AlertCircle, File, Image as ImageIcon } from "lucide-react";
import { uploadMediaFile } from "@/lib/s3-multipart-upload";
import type { UploadProgress, MediaItem } from "@/types/media";
import { toast } from "@/lib/toast";

interface MediaUploaderProps {
  onUploadComplete?: (mediaItems: MediaItem[]) => void;
  onUploadError?: (error: string) => void;
  acceptedTypes?: string[];
  maxFiles?: number;
  maxFileSize?: number; // in bytes
  className?: string;
}

export function MediaUploader({
  onUploadComplete,
  onUploadError,
  acceptedTypes = ["image/*", "video/*"],
  maxFiles = 10,
  maxFileSize = 100 * 1024 * 1024, // 100MB default
  className = "",
}: MediaUploaderProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isFileDialogOpenRef = useRef(false);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    // Validate number of files
    if (fileArray.length > maxFiles) {
      const error = `Maximum ${maxFiles} files allowed`;
      toast.error(error);
      onUploadError?.(error);
      return;
    }

    // Validate each file
    const validFiles: File[] = [];
    for (const file of fileArray) {
      // Check file size
      if (file.size > maxFileSize) {
        const error = `${file.name} exceeds maximum size of ${Math.round(maxFileSize / (1024 * 1024))}MB`;
        toast.error(error);
        continue;
      }

      // Check file type
      if (acceptedTypes.length > 0) {
        const isAccepted = acceptedTypes.some(type => {
          if (type.endsWith("/*")) {
            return file.type.startsWith(type.replace("/*", ""));
          }
          return file.type === type;
        });

        if (!isAccepted) {
          toast.error(`${file.name} is not an accepted file type`);
          continue;
        }
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    // Initialize upload progress for each file
    const newUploads: UploadProgress[] = validFiles.map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      progress: 0,
      status: "pending" as const,
    }));

    setUploads(prev => [...prev, ...newUploads]);

    // Upload files
    const uploadedMedia: MediaItem[] = [];

    for (const upload of newUploads) {
      try {
        // Update status to uploading
        setUploads(prev =>
          prev.map(u => u.id === upload.id ? { ...u, status: "uploading" as const } : u)
        );

        // Upload file
        const result = await uploadMediaFile(upload.file, {
          onProgress: (progress) => {
            setUploads(prev =>
              prev.map(u =>
                u.id === upload.id ? { ...u, progress } : u
              )
            );
          },
        });

        if (result.success && result.mediaItem) {
          // Update status to completed
          setUploads(prev =>
            prev.map(u =>
              u.id === upload.id
                ? { ...u, status: "completed" as const, progress: 100, mediaItem: result.mediaItem }
                : u
            )
          );
          uploadedMedia.push(result.mediaItem);
          toast.success(`${upload.file.name} uploaded successfully`);
        } else {
          throw new Error(result.error || "Upload failed");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Upload failed";
        setUploads(prev =>
          prev.map(u =>
            u.id === upload.id
              ? { ...u, status: "error" as const, error: errorMessage }
              : u
          )
        );
        toast.error(`${upload.file.name}: ${errorMessage}`);
        onUploadError?.(errorMessage);
      }
    }

    // Call completion callback
    if (uploadedMedia.length > 0) {
      onUploadComplete?.(uploadedMedia);
    }
  }, [maxFiles, maxFileSize, acceptedTypes, onUploadComplete, onUploadError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    // Reset input value to allow uploading same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [handleFiles]);

  const removeUpload = useCallback((id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status !== "completed"));
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: UploadProgress["status"]) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />;
      case "completed":
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <File className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div
      className={className}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      onBlur={(e) => e.stopPropagation()}
    >
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          isFileDialogOpenRef.current = true;
          fileInputRef.current?.click();
        }}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-indigo-500 bg-indigo-500/10"
            : "border-gray-700 hover:border-gray-600 bg-gray-800"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(",")}
          onChange={(e) => {
            isFileDialogOpenRef.current = false;
            handleFileInputChange(e);
          }}
          onFocus={(e) => e.stopPropagation()}
          onBlur={(e) => {
            e.stopPropagation();
            // Small delay to ensure file dialog has closed
            setTimeout(() => {
              isFileDialogOpenRef.current = false;
            }, 100);
          }}
          onClick={(e) => e.stopPropagation()}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          <div className={`p-4 rounded-full ${isDragging ? "bg-indigo-500/20" : "bg-gray-700"}`}>
            <Upload className={`w-8 h-8 ${isDragging ? "text-indigo-400" : "text-gray-400"}`} />
          </div>

          <div>
            <p className="text-lg font-medium text-white mb-1">
              {isDragging ? "Drop files here" : "Click to upload or drag and drop"}
            </p>
            <p className="text-sm text-gray-400">
              {acceptedTypes.includes("image/*") && "Images, "}
              {acceptedTypes.includes("video/*") && "Videos, "}
              up to {Math.round(maxFileSize / (1024 * 1024))}MB each
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Maximum {maxFiles} files at once
            </p>
          </div>
        </div>
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">
              Uploading {uploads.filter(u => u.status !== "completed").length} of {uploads.length} files
            </h3>
            {uploads.some(u => u.status === "completed") && (
              <button
                onClick={clearCompleted}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear completed
              </button>
            )}
          </div>

          <div className="space-y-2">
            {uploads.map((upload) => (
              <div
                key={upload.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-3"
              >
                <div className="flex items-start gap-3">
                  {/* File Icon */}
                  <div className="shrink-0 mt-1">
                    {upload.file.type.startsWith("image/") ? (
                      <ImageIcon className="w-5 h-5 text-gray-400" />
                    ) : (
                      <File className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-sm font-medium text-white truncate">
                        {upload.file.name}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {getStatusIcon(upload.status)}
                        {upload.status !== "uploading" && (
                          <button
                            onClick={() => removeUpload(upload.id)}
                            className="text-gray-400 hover:text-white transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                      <span>{formatFileSize(upload.file.size)}</span>
                      {upload.status === "uploading" && (
                        <span>{upload.progress}%</span>
                      )}
                      {upload.status === "error" && (
                        <span className="text-red-400">{upload.error}</span>
                      )}
                      {upload.status === "completed" && (
                        <span className="text-emerald-400">Complete</span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {upload.status === "uploading" && (
                      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all duration-300"
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
