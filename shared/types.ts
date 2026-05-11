export interface User {
  id: string;
  email: string;
  username: string;
  cursorColor?: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creatorName?: string;
  memberCount?: number;
  elementCount?: number;
  collaboratorNames?: string[];
}

export type Tool =
  | 'select'
  | 'pan'
  | 'rect'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freehand'
  | 'text'
  | 'sticky'
  | 'eraser'
  | 'comment'
  | 'laser';

export type BoardElementType = 'rect' | 'ellipse' | 'arrow' | 'line' | 'freehand' | 'sticky' | 'text' | 'comment';

export interface ElementStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
}

export interface BoardElement {
  id: string;
  roomId?: string;
  type: BoardElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: [number, number][];
  text?: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  fontSize?: number;
  rotation?: number;
  opacity?: number;
  collapsed?: boolean;
  resolved?: boolean;
  authorName?: string;
  zIndex: number;
  createdBy: string;
  updatedBy?: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted?: boolean;
}

export interface BoardComment {
  id: string;
  roomId: string;
  elementId?: string;
  x: number;
  y: number;
  body: string;
  authorId: string;
  authorName: string;
  resolved: boolean;
  replies: Array<{
    id: string;
    body: string;
    authorId: string;
    authorName: string;
    createdAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface CursorPresence {
  userId: string;
  username: string;
  color: string;
  activeTool: Tool;
  cursor: { x: number; y: number };
  editingElementId?: string;
}

export interface CanvasSnapshot {
  roomId: string;
  roomVersion: number;
  elements: BoardElement[];
  comments: BoardComment[];
  updatedAt: string;
}

export interface SyncDebugState {
  connected: boolean;
  reconnecting: boolean;
  lastSyncAt?: number;
  latencyMs?: number;
  pendingOps: number;
  rejectedOps: number;
  roomVersion: number;
  connectedUsers: number;
}

export interface ExportPayload {
  exportedAt: string;
  version: string;
  user: User;
  rooms: Room[];
  snapshots: CanvasSnapshot[];
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}
