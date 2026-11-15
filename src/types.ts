export interface HardwareMetrics {
  cpu_temp: number;
  gpu_temp: number;
  ram_mb: number;
}

export interface WeatherData {
  temp: number | string;
  humidity: number | string;
  wind: number | string;
  desc: string;
  city: string;
}

export interface MediaState {
  title: string;
  artist: string;
  isPlaying: boolean;
  albumArt?: string;
  source: string;
  positionSec?: number;
  durationSec?: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface ShelfItem {
  id: string;
  name: string;
  size: number;
  type: string;
  path?: string;
  addedAt: Date;
}

export interface ClipboardItem {
  id: string;
  text: string;
  timestamp: number;
}

export interface SystemHudState {
  volume: number;
  muted: boolean;
  battery_pct: number;
  is_charging: boolean;
  has_battery: boolean;
}

export interface NotificationItem {
  id: number;
  app_name: string;
  title: string;
  body: string;
}

export interface NotificationResponse {
  access_status: string;
  items: NotificationItem[];
}

export type CompactViewMode = 'music' | 'weather' | 'timer';

export type TabType = 'music' | 'weather' | 'calendar' | 'shelf';
