// Shared type definitions between client and server

export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasElement {
  id: string;
  type: 'rect' | 'ellipse' | 'arrow' | 'freehand' | 'sticky' | 'text';
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: number[][];
  text?: string;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  fontSize?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
  zIndex: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface CursorPosition {
  userId: string;
  username: string;
  x: number;
  y: number;
  color: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiError {
  error: string;
  code?: string;
}

export type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'freehand' | 'sticky' | 'text' | 'pan' | 'eraser';

export interface ViewState {
  x: number;
  y: number;
  zoom: number;
}
