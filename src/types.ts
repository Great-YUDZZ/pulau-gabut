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

export type TabType = 'music' | 'weather' | 'calendar' | 'shelf';
