import React, { useState } from "react";
import { ChevronRight, Folder, Globe, Users, MoreHorizontal, BarChart3 } from "lucide-react";

export interface FolderTreeFolder {
  id: string;
  name: string;
  parentId: string | null;
  isShared: boolean;
  shares?: Array<{ targetType: string; targetId: string; name: string }>;
  _count: { items: number; children: number };
}

export interface FolderTreeItem {
  id: string;
  name: string;
  meta?: string;
  folderId: string | null;
}

interface FolderTreeProps {
  folders: FolderTreeFolder[];
  items: FolderTreeItem[];
  parentId: string | null;
  depth?: number;
  onOpenItem: (id: string) => void;
  onEditFolder: (folder: FolderTreeFolder) => void;
  onDeleteFolder: (folder: FolderTreeFolder) => void;
}

export function FolderTree({ folders, items, parentId, depth = 0, onOpenItem, onEditFolder, onDeleteFolder }: FolderTreeProps) {
  const childFolders = folders.filter((f) => f.parentId === parentId);
  const childItems = items.filter((r) => r.folderId === parentId);

  if (childFolders.length === 0 && childItems.length === 0) return null;

  return (
    <div className="space-y-0.5" style={depth ? { paddingLeft: 20 } : undefined}>
      {childFolders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder}
          folders={folders}
          items={items}
          depth={depth}
          onOpenItem={onOpenItem}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
      {childItems.map((item) => (
        <ItemRow key={item.id} item={item} onOpenItem={onOpenItem} />
      ))}
    </div>
  );
}

function FolderRow({
  folder, folders, items, depth, onOpenItem, onEditFolder, onDeleteFolder,
}: {
  folder: FolderTreeFolder;
  folders: FolderTreeFolder[];
  items: FolderTreeItem[];
  depth: number;
  onOpenItem: (id: string) => void;
  onEditFolder: (folder: FolderTreeFolder) => void;
  onDeleteFolder: (folder: FolderTreeFolder) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = folder._count.items > 0 || folder._count.children > 0;
  const shares = folder.shares ?? [];

  return (
    <div>
      <div className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-background-secondary">
        <button
          type="button"
          onClick={() => hasChildren && setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-foreground-subtle transition-transform ${open ? "rotate-90" : ""} ${hasChildren ? "" : "invisible"}`} />
          <Folder className="h-4 w-4 shrink-0 text-warning-600" />
          <span className="truncate text-sm font-medium text-foreground">{folder.name}</span>
          <span className="shrink-0 text-2xs text-foreground-subtle">{folder._count.items}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {folder.isShared && <Globe className="h-3.5 w-3.5 text-foreground-subtle" />}
          {shares.length > 0 && (
            <span className="flex items-center gap-0.5 text-foreground-subtle" title={shares.map((s) => s.name).join(", ")}>
              <Users className="h-3.5 w-3.5" />
              <span className="text-2xs">{shares.length}</span>
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((m) => !m)}
              className="rounded-md p-1 text-foreground-subtle opacity-0 transition-opacity hover:bg-background-tertiary hover:text-foreground group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-card-border bg-card py-1 shadow-card"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onEditFolder(folder); }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-background-secondary"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onDeleteFolder(folder); }}
                  className="block w-full px-3 py-1.5 text-left text-xs text-error-500 hover:bg-error-50 dark:hover:bg-error-950"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {open && (
        <FolderTree
          folders={folders}
          items={items}
          parentId={folder.id}
          depth={depth + 1}
          onOpenItem={onOpenItem}
          onEditFolder={onEditFolder}
          onDeleteFolder={onDeleteFolder}
        />
      )}
    </div>
  );
}

function ItemRow({ item, onOpenItem }: { item: FolderTreeItem; onOpenItem: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpenItem(item.id)}
      className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pl-7 pr-2 text-left hover:bg-background-secondary"
    >
      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.name}</span>
      {item.meta && <span className="shrink-0 text-2xs text-foreground-subtle">{item.meta}</span>}
    </button>
  );
}
