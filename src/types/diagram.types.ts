export interface DiagramShape {
  id: string;
  type: "rectangle" | "circle" | "diamond" | "database" | "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color?: string;
  fontSize?: number;
  imageUrl?: string;
}

export interface DiagramConnection {
  id: string;
  from: string;
  to: string;
  fromAnchor: string;
  toAnchor: string;
}

export interface DiagramData {
  id?: string;
  user_id?: string;
  title: string;
  shapes: DiagramShape[];
  connections: DiagramConnection[];
  thumbnail?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DiagramListItem {
  id: string;
  title: string;
  thumbnail?: string | null;
  updated_at: string;
}

export interface DiagramResponse {
  data: DiagramData;
}

export interface DiagramsResponse {
  data: DiagramData[];
}

export interface DiagramListResponse {
  data: DiagramListItem[];
}
