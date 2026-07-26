"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Search, Grid3x3, List, CheckCircle, Loader2, Image as ImageIcon, Video, FileAudio, FileText, File, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem, MediaFilter } from "@/types/media";
import { hasPermission, type UserRole } from "@/lib/rbac";
import { MediaUploader } from "./MediaUploader";
import { AiImageGenerator } from "./AiImageGenerator";
import { SmartImage } from "@/components/user/primitives/smart-image";

interface MediaSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: MediaItem | MediaItem[]) => void;
  multiple?: boolean;
  fileType?: "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "all";
  title?: string;
  maxFileSize?: number;
  allowedTypes?: string[];
}

export function MediaSelector({
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  fileType = "all",
  title = "Select Media",
  maxFileSize,
  allowedTypes,
}: MediaSelectorProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MediaFilter["fileType"]>(fileType);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState<"library" | "upload" | "ai">("library");
  const modalRef = useRef<HTMLDivElement>(null);

  // Role is fetched from NextAuth's session endpoint (no SessionProvider in this
  // app), used only to decide whether to offer the admin-only AI Generate tab.
  const [role, setRole] = useState<UserRole | undefined>(undefined);
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (active) setRole(s?.user?.role as UserRole | undefined);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isOpen]);
  const canUseAi =
    hasPermission(role, "ai.manage") &&
    (fileType === "IMAGE" || fileType === "all");

  const fetchMedia = useCallback(async (loadMore = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: loadMore ? String(page + 1) : "1",
        limit: "20",
        ...(filterType && filterType !== "all" && { fileType: filterType }),
        ...(searchQuery && { search: searchQuery }),
      });

      const response = await fetch(`/api/media?${params}`);
      const data = await response.json();

      if (response.ok) {
        if (loadMore) {
          setMedia(prev => [...prev, ...data.items]);
          setPage(prev => prev + 1);
        } else {
          setMedia(data.items);
          setPage(1);
        }
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error("Error fetching media:", error);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, searchQuery]);

  useEffect(() => {
    if (isOpen && activeTab === "library") {
      fetchMedia();
    }
    // fetchMedia depends on the same vars listed below; safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, filterType, searchQuery]);

  const handleSelectMedia = useCallback((item: MediaItem) => {
    if (multiple) {
      setSelectedMedia(prev => {
        const isSelected = prev.find(m => m.id === item.id);
        if (isSelected) {
          return prev.filter(m => m.id !== item.id);
        }
        return [...prev, item];
      });
    } else {
      setSelectedMedia([item]);
    }
  }, [multiple]);

  const handleInsert = useCallback(() => {
    if (selectedMedia.length > 0) {
      onSelect(multiple ? selectedMedia : selectedMedia[0]);
      onClose();
      setSelectedMedia([]);
    }
  }, [selectedMedia, multiple, onSelect, onClose]);

  const handleUploadComplete = useCallback((mediaItems: MediaItem[]) => {
    // Add newly uploaded items to the list
    setMedia(prev => [...mediaItems, ...prev]);
    // Auto-select uploaded items
    if (multiple) {
      setSelectedMedia(prev => [...prev, ...mediaItems]);
    } else if (mediaItems.length > 0) {
      setSelectedMedia([mediaItems[0]]);
    }
    // Switch to library tab
    setActiveTab("library");
  }, [multiple]);

  const getFileIcon = (item: MediaItem) => {
    switch (item.fileType) {
      case "IMAGE":
        return <ImageIcon className="w-5 h-5 text-blue-400" />;
      case "VIDEO":
        return <Video className="w-5 h-5 text-purple-400" />;
      case "AUDIO":
        return <FileAudio className="w-5 h-5 text-green-400" />;
      case "DOCUMENT":
        return <FileText className="w-5 h-5 text-amber-400" />;
      default:
        return <File className="w-5 h-5 text-gray-400" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [mounted, setMounted] = useState(false);

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only close if clicking directly on the backdrop (not on modal content)
        if (e.target === e.currentTarget) {
          // Don't close - user must click Cancel or X button
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
      onFocus={(e) => e.stopPropagation()}
      onBlur={(e) => e.stopPropagation()}
    >
      <div
        ref={modalRef}
        className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        onBlur={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {selectedMedia.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">
                {selectedMedia.length} selected
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab("library")}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "library"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Media Library
          </button>
          <button
            onClick={() => setActiveTab("upload")}
            className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "upload"
                ? "border-indigo-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Upload Files
          </button>
          {canUseAi && (
            <button
              onClick={() => setActiveTab("ai")}
              className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-1.5 ${
                activeTab === "ai"
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-400" />
              AI Generate
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "ai" && canUseAi ? (
            <div className="overflow-y-auto">
              <AiImageGenerator onGenerated={(media) => handleUploadComplete([media])} />
            </div>
          ) : activeTab === "upload" ? (
            <div className="p-6 overflow-y-auto">
              <MediaUploader
                onUploadComplete={handleUploadComplete}
                acceptedTypes={allowedTypes}
                maxFileSize={maxFileSize}
              />
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-4 p-4 border-b border-gray-800">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search media..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Filter */}
                <select
                  value={filterType || "all"}
                  onChange={(e) => setFilterType(e.target.value as MediaFilter["fileType"])}
                  className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="all">All Types</option>
                  <option value="IMAGE">Images</option>
                  <option value="VIDEO">Videos</option>
                  <option value="AUDIO">Audio</option>
                  <option value="DOCUMENT">Documents</option>
                </select>

                {/* View Mode */}
                <div className="flex gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2 rounded ${
                      viewMode === "grid" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2 rounded ${
                      viewMode === "list" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Media Grid/List */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading && media.length === 0 ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                  </div>
                ) : media.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                    <File className="w-12 h-12 mb-4" />
                    <p>No media found</p>
                  </div>
                ) : (
                  <div
                    className={
                      viewMode === "grid"
                        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
                        : "space-y-2"
                    }
                  >
                    {media.map((item) => {
                      const isSelected = selectedMedia.find(m => m.id === item.id);

                      if (viewMode === "grid") {
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectMedia(item)}
                            className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${
                              isSelected ? "ring-2 ring-indigo-500" : "hover:ring-2 hover:ring-gray-600"
                            }`}
                          >
                            {item.fileType === "IMAGE" ? (
                              <SmartImage
                                src={item.cloudFrontUrl || item.s3Url}
                                alt={(item.altText || item.originalFilename) ?? ""}
                                fill
                                sizes="200px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                {getFileIcon(item)}
                              </div>
                            )}

                            {isSelected && (
                              <div className="absolute top-2 right-2 bg-indigo-500 rounded-full p-1">
                                <CheckCircle className="w-4 h-4 text-white" />
                              </div>
                            )}

                            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="absolute bottom-0 left-0 right-0 p-2">
                                <p className="text-xs text-white truncate">{item.originalFilename}</p>
                              </div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectMedia(item)}
                            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                              isSelected ? "bg-indigo-500/20 border-2 border-indigo-500" : "bg-gray-800 hover:bg-gray-700"
                            }`}
                          >
                            <div className="shrink-0">
                              {item.fileType === "IMAGE" ? (
                                <SmartImage
                                  src={item.cloudFrontUrl || item.s3Url}
                                  alt={(item.altText || item.originalFilename) ?? ""}
                                  width={48}
                                  height={48}
                                  className="w-12 h-12 rounded object-cover"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center">
                                  {getFileIcon(item)}
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{item.originalFilename}</p>
                              <p className="text-xs text-gray-400">
                                {formatFileSize(item.fileSize)} • {new Date(item.createdAt).toLocaleDateString()}
                              </p>
                            </div>

                            {isSelected && (
                              <CheckCircle className="w-5 h-5 text-indigo-400 shrink-0" />
                            )}
                          </div>
                        );
                      }
                    })}
                  </div>
                )}

                {/* Load More */}
                {hasMore && !loading && media.length > 0 && (
                  <div className="flex justify-center mt-6">
                    <Button
                      onClick={() => fetchMedia(true)}
                      variant="secondary"
                    >
                      Load More
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-800">
          <div className="text-sm text-gray-400">
            {activeTab === "library" && `${media.length} items`}
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleInsert}
              disabled={selectedMedia.length === 0}
            >
              Insert {selectedMedia.length > 0 && `(${selectedMedia.length})`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render modal outside of the DOM hierarchy
  // This prevents issues with form events, focus trapping, etc.
  return createPortal(modalContent, document.body);
}
