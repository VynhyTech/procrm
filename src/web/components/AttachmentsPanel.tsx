import React, { useEffect, useState, useCallback, useRef } from "react";
import { trpc } from "../trpc";
import { Upload, FileText, Image, File, Trash2, Download } from "lucide-react";

type Attachment = Awaited<ReturnType<typeof trpc.attachments.list.query>>[number];

interface AttachmentsPanelProps {
  parentType: string;
  parentId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image className="h-4 w-4 text-info-500" />;
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-error-500" />;
  return <File className="h-4 w-4 text-foreground-muted" />;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function AttachmentsPanel({ parentType, parentId }: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try { setAttachments(await trpc.attachments.list.query({ parentType, parentId })); }
    catch (err) { console.error(err); } finally { setLoading(false); }
  }, [parentType, parentId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  const uploadFile = async (file: globalThis.File) => {
    if (file.size > 25 * 1024 * 1024) { alert("File must be under 25MB"); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") resolve(result.split(",")[1]);
          else reject(new Error("Failed to read file"));
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await trpc.attachments.upload.mutate({
        parentType, parentId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        fileData: base64,
      });
      fetchAttachments();
    } catch (err) { console.error(err); } finally { setUploading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleDownload = async (id: string) => {
    try {
      const attachment = await trpc.attachments.download.query({ id });
      const link = document.createElement("a");
      link.href = `data:${attachment.mimeType};base64,${attachment.fileData}`;
      link.download = attachment.fileName;
      link.click();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string) => {
    try { await trpc.attachments.delete.mutate({ id }); fetchAttachments(); }
    catch (err) { console.error(err); }
  };

  if (loading) return <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="skeleton h-12 rounded" />)}</div>;

  return (
    <div>
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${dragOver ? "border-primary-400 bg-primary-50 dark:bg-primary-950" : "border-border hover:border-primary-300 hover:bg-background-secondary"}`}
      >
        <Upload className={`mb-2 h-6 w-6 ${dragOver ? "text-primary-500" : "text-foreground-subtle"}`} />
        <p className="text-sm text-foreground-muted">{uploading ? "Uploading..." : "Drop a file here or click to browse"}</p>
        <p className="mt-0.5 text-2xs text-foreground-subtle">Max 25MB</p>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
      </div>

      {/* File list */}
      {attachments.length === 0 ? (
        <p className="text-center text-sm text-foreground-muted py-4">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between rounded-lg border border-border-subtle bg-background-secondary px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {fileIcon(att.mimeType)}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{att.fileName}</p>
                  <p className="text-2xs text-foreground-subtle">{formatFileSize(att.fileSize)} · {relativeTime(att.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleDownload(att.id)} title="Download" className="rounded-md p-1.5 text-foreground-muted transition-colors hover:text-foreground hover:bg-background-tertiary">
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(att.id)} title="Delete" className="rounded-md p-1.5 text-foreground-muted transition-colors hover:text-error-500 hover:bg-error-50 dark:hover:bg-error-950">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
