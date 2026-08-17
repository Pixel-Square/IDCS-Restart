import React, { useState } from 'react'
import { Folder, FolderOpen, FileCode, ChevronDown, ChevronRight, Plus, Trash2, Edit2, Lock, FolderPlus, FilePlus } from 'lucide-react'

// Types representing the API tree nodes
export interface TreeNode {
  id: number
  type: 'file' | 'folder'
  name: string
  path: string
  is_locked: boolean
  parent?: number | null
  children?: TreeNode[]
}

interface FileTreeProps {
  tree: TreeNode[]
  selectedFileId?: number | null
  selectedFolderId?: number | null
  onSelectFile: (file: any) => void
  onSelectFolder?: (folder: any) => void
  onAddFile?: (parentFolderId: number | null) => void
  onAddFolder?: (parentFolderId: number | null) => void
  onRename?: (type: 'file' | 'folder', id: number, currentName: string) => void
  onDelete?: (type: 'file' | 'folder', id: number, name: string) => void
  readOnly?: boolean
}

export default function FileTree({
  tree,
  selectedFileId,
  selectedFolderId,
  onSelectFile,
  onSelectFolder,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  readOnly = false,
}: FileTreeProps) {
  // Store expanded state of folders by path/id
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    root: true,
  })

  const toggleExpand = (path: string) => {
    setExpanded((prev) => ({ ...prev, [path]: !prev[path] }))
  }

  // Sort folders first, then files alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    return [...nodes].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === 'folder'
    const isExpanded = expanded[node.path] ?? false
    const isSelected = isFolder ? selectedFolderId === node.id : selectedFileId === node.id

    return (
      <div key={`${node.type}-${node.id}`} style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Row element */}
        <div
          className={`file-tree-item ${isSelected ? 'active' : ''}`}
          style={{
            paddingLeft: `${depth * 12 + 8}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '28px',
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: '0.8125rem',
            borderRadius: '4px',
            margin: '2px 4px',
            background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
            borderLeft: isSelected ? '2px solid var(--brand)' : 'none',
          }}
          onClick={() => {
            if (isFolder) {
              toggleExpand(node.path)
              if (onSelectFolder) {
                onSelectFolder(node)
              }
            } else {
              onSelectFile(node)
            }
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
            {isFolder ? (
              <>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {isExpanded ? (
                  <FolderOpen size={16} color="var(--brand-light)" style={{ flexShrink: 0 }} />
                ) : (
                  <Folder size={16} color="var(--brand)" style={{ flexShrink: 0 }} />
                )}
              </>
            ) : (
              <>
                <span style={{ width: 14 }} /> {/* placeholder for chevron space */}
                <FileCode size={15} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
              </>
            )}

            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: isFolder ? 500 : 400,
                color: node.is_locked ? 'var(--text-muted)' : 'inherit',
              }}
            >
              {node.name}
            </span>

            {node.is_locked && (
              <Lock size={10} color="var(--accent-yellow)" style={{ marginLeft: '4px', flexShrink: 0 }} />
            )}
          </div>

          {/* Quick action controls for non-readonly */}
          {!readOnly && (
            <div
              className="tree-actions"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                paddingRight: '6px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {isFolder && onAddFile && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px', height: 'auto' }}
                  title="New File"
                  onClick={() => onAddFile(node.id)}
                >
                  <FilePlus size={12} />
                </button>
              )}
              {isFolder && onAddFolder && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px', height: 'auto' }}
                  title="New Folder"
                  onClick={() => onAddFolder(node.id)}
                >
                  <FolderPlus size={12} />
                </button>
              )}
              {onRename && !node.is_locked && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px', height: 'auto' }}
                  title="Rename"
                  onClick={() => onRename(node.type, node.id, node.name)}
                >
                  <Edit2 size={11} />
                </button>
              )}
              {onDelete && !node.is_locked && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '2px', height: 'auto', color: 'var(--accent-red)' }}
                  title="Delete"
                  onClick={() => onDelete(node.type, node.id, node.name)}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Nested Children */}
        {isFolder && isExpanded && node.children && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sortNodes(node.children).map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Root actions toolbar */}
      {!readOnly && (onAddFile || onAddFolder) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          <span>Workspace Tree</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {onAddFile && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                onClick={() => onAddFile(selectedFolderId || null)}
              >
                + File
              </button>
            )}
            {onAddFolder && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                onClick={() => onAddFolder(selectedFolderId || null)}
              >
                + Folder
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '6px 0', flex: 1 }}>
        {tree.length === 0 ? (
          <div style={{ padding: '16px', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            No files or folders yet.
          </div>
        ) : (
          sortNodes(tree).map((node) => renderNode(node, 0))
        )}
      </div>
    </div>
  )
}
