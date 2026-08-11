"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Grid3x3, List, Upload, Edit, Trash2, X, Loader2, Image as ImageIcon, Video, FileAudio, FileText, File, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaItem, MediaFilter } from "@/types/media";
import { MediaUploader } from "./MediaUploader";
import { toast } from "@/lib/toast";
import { SmartImage } from "@/components/user/primitives/smart-image";

export function MediaLibrary() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<MediaFilter["fileType"]>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editData, setEditData] = useState({
    altText: "",
    caption: "",
    description: "",
    folder: "",
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [folderFilter, setFolderFilter] = useState<string>(""); // "" = root, "__all__" = no filter
  const [folders, setFolders] = useState<string[]>([]);

  const fetchMedia = useCallback(async (loadMore = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: loadMore ? String(page + 1) : "1",
        limit: "20",
        includeFolders: "true",
        ...(filterType && filterType !== "all" && { fileType: filterType }),
        ...(searchQuery && { search: searchQuery }),
        ...(folderFilter !== "__all__" && { folder: folderFilter }),
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
        if (Array.isArray(data.folders)) {
          setFolders(data.folders);
        }
      }
    } catch (error) {
      console.error("Error fetching media:", error);
      toast.error("Failed to load media");
    } finally {
      setLoading(false);
    }
  }, [page, filterType, searchQuery, folderFilter]);

  useEffect(() => {
    fetchMedia();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, searchQuery, folderFilter]);

  const handleUploadComplete = useCallback((mediaItems: MediaItem[]) => {
    setMedia(prev => [...mediaItems, ...prev]);
    setShowUploader(false);
    toast.success(`${mediaItems.length} file(s) uploaded successfully`);
  }, []);

  const handleEdit = useCallback((item: MediaItem) => {
    setSelectedMedia(item);
    setEditData({
      altText: item.altText || "",
      caption: item.caption || "",
      description: item.description || "",
      folder: item.folder || "",
    });
    setShowEditModal(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedMedia) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/media/${selectedMedia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update media");
      }

      setMedia(prev =>
        prev.map(m => (m.id === selectedMedia.id ? data.mediaItem : m))
      );
      setShowEditModal(false);
      toast.success("Media updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update media");
    } finally {
      setIsUpdating(false);
    }
  }, [selectedMedia, editData]);

  const handleDelete = useCallback((item: MediaItem) => {
    setSelectedMedia(item);
    setShowDeleteModal(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!selectedMedia) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/media/${selectedMedia.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete media");
      }

      setMedia(prev => prev.filter(m => m.id !== selectedMedia.id));
      setShowDeleteModal(false);
      toast.success("Media deleted successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete media");
    } finally {
      setIsDeleting(false);
    }
  }, [selectedMedia]);

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

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Filter */}
          <select
            value={filterType || "all"}
            onChange={(e) => setFilterType(e.target.value as MediaFilter["fileType"])}
            className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Types</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
            <option value="AUDIO">Audio</option>
            <option value="DOCUMENT">Documents</option>
          </select>

          {/* Folder filter */}
          <select
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            className="px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="__all__">📁 All Folders</option>
            <option value="">📁 Root</option>
            {folders
              .filter((f) => f && f !== "")
              .map((f) => (
                <option key={f} value={f}>
                  📁 {f}
                </option>
              ))}
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

          {/* Upload Button */}
          <Button
            onClick={() => setShowUploader(!showUploader)}
            className="inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Upload Files
          </Button>
        </div>
      </div>

      {/* Uploader */}
      {showUploader && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <MediaUploader onUploadComplete={handleUploadComplete} />
        </div>
      )}

      {/* Media Grid/List */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        {loading && media.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <File className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium mb-2">No media found</p>
            <p className="text-sm">Upload your first file to get started</p>
          </div>
        ) : (
          <>
            <div
              className={
                viewMode === "grid"
                  ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                  : "space-y-2"
              }
            >
              {media.map((item) => {
                if (viewMode === "grid") {
                  return (
                    <div
                      key={item.id}
                      className="group relative aspect-square rounded-lg overflow-hidden bg-gray-800 hover:ring-2 hover:ring-indigo-500 transition-all"
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
                        <div className="w-full h-full flex items-center justify-center">
                          {getFileIcon(item)}
                        </div>
                      )}

                      {/* Overlay on hover */}
                      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="text-xs text-white truncate mb-2">{item.originalFilename}</p>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 bg-gray-800/80 hover:bg-gray-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-3.5 h-3.5 text-white" />
                            </button>
                            <a
                              href={item.cloudFrontUrl || item.s3Url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 bg-gray-800/80 hover:bg-gray-700 rounded transition-colors"
                              title="View"
                            >
                              <ExternalLink className="w-3.5 h-3.5 text-white" />
                            </a>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 bg-gray-800/80 hover:bg-red-600 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-4 p-4 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors"
                    >
                      <div className="shrink-0">
                        {item.fileType === "IMAGE" ? (
                          <SmartImage
                            src={item.cloudFrontUrl || item.s3Url}
                            alt={(item.altText || item.originalFilename) ?? ""}
                            width={64}
                            height={64}
                            className="w-16 h-16 rounded object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-700 rounded flex items-center justify-center">
                            {getFileIcon(item)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{item.originalFilename}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatFileSize(item.fileSize)} • {item.fileType} • {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                        {item.uploadedBy && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Uploaded by {item.uploadedBy.name || item.uploadedBy.email}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <a
                          href={item.cloudFrontUrl || item.s3Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                          title="View"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                }
              })}
            </div>

            {/* Load More */}
            {hasMore && !loading && (
              <div className="flex justify-center mt-6">
                <Button
                  onClick={() => fetchMedia(true)}
                  variant="secondary"
                >
                  Load More
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Edit Media</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Preview */}
              <div className="flex items-start gap-4">
                {selectedMedia.fileType === "IMAGE" ? (
                  <SmartImage
                    src={selectedMedia.cloudFrontUrl || selectedMedia.s3Url}
                    alt={(selectedMedia.altText || selectedMedia.originalFilename) ?? ""}
                    width={128}
                    height={128}
                    className="w-32 h-32 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-32 h-32 bg-gray-800 rounded-lg flex items-center justify-center">
                    {getFileIcon(selectedMedia)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">{selectedMedia.originalFilename}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatFileSize(selectedMedia.fileSize)} • {selectedMedia.fileType}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Uploaded {new Date(selectedMedia.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Folder */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Folder
                </label>
                <input
                  type="text"
                  value={editData.folder}
                  onChange={(e) => setEditData({ ...editData, folder: e.target.value })}
                  list="media-folder-suggestions"
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                  placeholder='e.g. "banners" or "2026/april" — leave blank for root'
                />
                <datalist id="media-folder-suggestions">
                  {folders
                    .filter((f) => f && f !== "")
                    .map((f) => (
                      <option key={f} value={f} />
                    ))}
                </datalist>
                <p className="text-[11px] text-gray-500 mt-1">
                  Use slashes for nested paths. Existing folders auto-suggest.
                </p>
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Alt Text
                </label>
                <input
                  type="text"
                  value={editData.altText}
                  onChange={(e) => setEditData({ ...editData, altText: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Describe the image for accessibility"
                />
              </div>

              {/* Caption */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Caption
                </label>
                <input
                  type="text"
                  value={editData.caption}
                  onChange={(e) => setEditData({ ...editData, caption: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Add a caption"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Add a description"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowEditModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isUpdating}
                className="flex-1"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedMedia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Delete Media</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-400">
                Are you sure you want to delete <span className="text-white font-medium">&quot;{selectedMedia.originalFilename}&quot;</span>?
              </p>
              <p className="text-red-400 text-sm mt-2">
                This action cannot be undone. The file will be permanently removed from storage.
              </p>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-800">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Media
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
