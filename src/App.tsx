import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  CloudSun, 
  Calendar, 
  FolderDown, 
  Timer, 
  Cpu, 
  X, 
  FileText, 
  Music,
  Check
} from 'lucide-react';
import { HardwareMetrics, WeatherData, MediaState, ShelfItem, TabType } from './types';

// Safely access Tauri invoke
const invokeTauri = async (cmd: string, args: Record<string, any> = {}) => {
  try {
    if ((window as any).__TAURI__?.core) {
      return await (window as any).__TAURI__.core.invoke(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri invoke '${cmd}' failed:`, err);
  }
  return null;
};

export const App: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('music');
  const [currentTime, setCurrentTime] = useState<string>('');
  
  // Media State
  const [media, setMedia] = useState<MediaState>({
    title: 'Spotify / YouTube Music',
    artist: 'Menunggu pemutaran musik sistem',
    isPlaying: false,
    source: 'SMTC'
  });

  // Weather & Hardware
  const [weather, setWeather] = useState<WeatherData>({
    temp: '--',
    humidity: '--',
    wind: '--',
    desc: 'Memuat cuaca...',
    city: 'Denpasar'
  });
  const [hardware, setHardware] = useState<HardwareMetrics>({
    cpu_temp: 42,
    gpu_temp: 40,
    ram_mb: 28
  });

  // Pomodoro Timer
  const [timerSeconds, setTimerSeconds] = useState<number>(25 * 60);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);

  // File Shelf
  const [shelfItems, setShelfItems] = useState<ShelfItem[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const hoverLeaveTimer = useRef<number | null>(null);

  // Keyboard shortcut listener (Escape to collapse)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
        setTimeout(() => {
          invokeTauri('set_mode', { mode: 'compact' });
        }, 320);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Smooth Hover Handlers
  const handleMouseEnter = () => {
    if (hoverLeaveTimer.current) {
      window.clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
    if (!isExpanded) {
      // 1. Expand the OS canvas immediately so Framer Motion has room to grow without clipping
      invokeTauri('set_mode', { mode: 'expanded' });
      setIsExpanded(true);
    }
  };

  const handleMouseLeave = () => {
    if (hoverLeaveTimer.current) window.clearTimeout(hoverLeaveTimer.current);
    hoverLeaveTimer.current = window.setTimeout(() => {
      // 1. First animate the visual capsule back to compact size smoothly
      setIsExpanded(false);
      // 2. Only resize the OS window bounds AFTER the spring animation completes (320ms)
      setTimeout(() => {
        invokeTauri('set_mode', { mode: 'compact' });
      }, 320);
    }, 380);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  // 1. Clock Poller
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Weather Fetcher (Open-Meteo)
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-8.65&longitude=115.21&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code');
        if (res.ok) {
          const data = await res.json();
          const curr = data.current;
          const code = curr.weather_code;
          let desc = 'Cerah';
          if (code >= 1 && code <= 3) desc = 'Sebagian Berawan';
          else if (code >= 45 && code <= 48) desc = 'Berkabut';
          else if (code >= 51 && code <= 67) desc = 'Hujan Ringan';
          else if (code >= 80 && code <= 99) desc = 'Hujan Lebat / Petir';

          setWeather({
            temp: Math.round(curr.temperature_2m),
            humidity: Math.round(curr.relative_humidity_2m),
            wind: Math.round(curr.wind_speed_10m),
            desc,
            city: 'Denpasar'
          });
        }
      } catch (e) {
        console.warn('Weather fetch error:', e);
      }
    };
    fetchWeather();
    const wInterval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(wInterval);
  }, []);

  // 3. Hardware Metrics Poller
  useEffect(() => {
    const pollHardware = async () => {
      const metrics = await invokeTauri('get_hardware_metrics');
      if (metrics) {
        setHardware(metrics);
      }
    };
    pollHardware();
    const hInterval = setInterval(pollHardware, 3000);
    return () => clearInterval(hInterval);
  }, []);

  // 4. Pomodoro Countdown
  useEffect(() => {
    let interval: number | null = null;
    if (timerRunning) {
      interval = window.setInterval(() => {
        setTimerSeconds(prev => {
          if (prev <= 1) {
            setTimerRunning(false);
            showToast('Sesi Fokus Selesai');
            return 25 * 60;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerRunning]);

  // SMTC Media Actions
  const handlePlayPause = async () => {
    setMedia(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    await invokeTauri('smtc_play_pause');
  };

  const handleNext = async () => {
    await invokeTauri('smtc_next');
  };

  const handlePrev = async () => {
    await invokeTauri('smtc_previous');
  };

  // Drag and Drop for Temporary Shelf
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newItems: ShelfItem[] = Array.from(e.dataTransfer.files).map(file => ({
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: file.size,
        type: file.type || 'file',
        addedAt: new Date()
      }));
      setShelfItems(prev => [...prev, ...newItems]);
      showToast(`${newItems.length} berkas disimpan ke Shelf`);
      setActiveTab('shelf');
    }
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: 0,
        background: 'transparent',
        border: 'none',
        outline: 'none',
        boxShadow: 'none'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <motion.div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={{
          width: isExpanded ? 440 : 310,
          height: isExpanded ? 275 : 36,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 280,
          damping: 26,
          mass: 0.7
        }}
        style={{
          background: '#000000',
          border: 'none',
          outline: 'none',
          boxShadow: 'none', // Strictly no shadow to eliminate any halo/border
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          cursor: isExpanded ? 'default' : 'pointer'
        }}
      >
        {/* Drop Over Indicator */}
        <AnimatePresence>
          {isDraggingOver && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(16, 185, 129, 0.22)',
                border: '2px dashed #10b981',
                zIndex: 50,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: '#10b981',
                fontSize: 13,
                fontWeight: 500,
                backdropFilter: 'blur(8px)'
              }}
            >
              <FolderDown size={20} />
              <span>Lepaskan berkas di sini</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 1. Compact Notch Bar */}
        <div
          onClick={() => {
            invokeTauri('set_mode', { mode: 'expanded' });
            setIsExpanded(true);
          }}
          style={{
            height: 36,
            minHeight: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            fontSize: 11,
            color: '#a1a1aa',
            border: 'none',
            outline: 'none'
          }}
        >
          {/* Left: Jam & Cuaca */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#f4f4f5', fontFamily: 'monospace' }}>
              {currentTime || '12:00'}
            </span>
            <span style={{ color: '#71717a' }}>•</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>{weather.temp}°C</span>
            </span>
          </div>

          {/* Center: Clean Spacer (no camera dot) */}
          <div style={{ flex: 1 }} />

          {/* Right: Media indicator atau Timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {timerRunning ? (
              <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 600 }}>
                {formatTimer(timerSeconds)}
              </span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="eq-container">
                  <div className={`eq-bar ${media.isPlaying ? 'active' : ''}`} style={{ height: 6 }} />
                  <div className={`eq-bar ${media.isPlaying ? 'active' : ''}`} style={{ height: 10 }} />
                  <div className={`eq-bar ${media.isPlaying ? 'active' : ''}`} style={{ height: 5 }} />
                </div>
                <span style={{ 
                  maxWidth: 90, 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis',
                  color: '#f4f4f5'
                }}>
                  {media.title}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 2. Expanded HUD Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
              transition={{ duration: 0.2, delay: 0.04 }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                padding: '8px 12px 10px 12px',
                gap: 8,
                background: '#000000',
                border: 'none',
                outline: 'none'
              }}
            >
              {/* Top Navigation Tabs */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: 3,
                  borderRadius: 10
                }}
              >
                {[
                  { id: 'music', label: 'Musik', icon: Music },
                  { id: 'weather', label: 'Sistem', icon: CloudSun },
                  { id: 'calendar', label: 'Waktu', icon: Calendar },
                  { id: 'shelf', label: `Shelf (${shelfItems.length})`, icon: FolderDown }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        background: isActive ? '#1c1c1f' : 'transparent',
                        color: isActive ? '#f4f4f5' : '#71717a',
                        border: 'none',
                        outline: 'none',
                        borderRadius: 7,
                        padding: '5px 0',
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Icon size={12} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Panel Body */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* 1. Tab Musik */}
                {activeTab === 'music' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div 
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 10,
                          background: '#141416',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: 'none'
                        }}
                      >
                        <Music size={22} color="#10b981" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: 13, 
                          fontWeight: 600, 
                          color: '#f4f4f5',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {media.title}
                        </div>
                        <div style={{ 
                          fontSize: 11, 
                          color: '#a1a1aa',
                          marginTop: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {media.artist}
                        </div>
                      </div>
                    </div>

                    {/* Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                      <button
                        onClick={handlePrev}
                        style={{
                          background: 'none',
                          border: 'none',
                          outline: 'none',
                          color: '#a1a1aa',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <SkipBack size={18} />
                      </button>

                      <button
                        onClick={handlePlayPause}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: '#f4f4f5',
                          border: 'none',
                          outline: 'none',
                          color: '#000000',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        {media.isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
                      </button>

                      <button
                        onClick={handleNext}
                        style={{
                          background: 'none',
                          border: 'none',
                          outline: 'none',
                          color: '#a1a1aa',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <SkipForward size={18} />
                      </button>
                    </div>

                    <div style={{ fontSize: 10, color: '#52525b', textAlign: 'center' }}>
                      Sinkron otomatis dengan Windows SMTC (Spotify / YouTube)
                    </div>
                  </div>
                )}

                {/* 2. Tab Cuaca & Telemetri */}
                {activeTab === 'weather' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                    <div style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '1fr 1fr', 
                      gap: 8 
                    }}>
                      {/* Cuaca Card */}
                      <div 
                        style={{
                          background: '#0c0c0e',
                          padding: 10,
                          borderRadius: 10,
                          border: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#38bdf8', fontSize: 11 }}>
                          <CloudSun size={14} />
                          <span>{weather.city}</span>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#f4f4f5', marginTop: 4 }}>
                          {weather.temp}°C
                        </div>
                        <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 2 }}>
                          {weather.desc}
                        </div>
                      </div>

                      {/* Telemetri Suhu & RAM */}
                      <div 
                        style={{
                          background: '#0c0c0e',
                          padding: 10,
                          borderRadius: 10,
                          border: 'none'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 11 }}>
                          <Cpu size={14} />
                          <span>Sistem & RAM</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#f4f4f5', marginTop: 4, fontFamily: 'monospace' }}>
                          {hardware.ram_mb} MB
                        </div>
                        <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 2, display: 'flex', gap: 8 }}>
                          <span>CPU: {hardware.cpu_temp}°C</span>
                          <span>GPU: {hardware.gpu_temp}°C</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: 10, 
                      color: '#71717a', 
                      background: 'rgba(255, 255, 255, 0.03)', 
                      padding: '6px 8px', 
                      borderRadius: 6 
                    }}>
                      <span>Kelembapan: {weather.humidity}%</span>
                      <span>Kecepatan Angin: {weather.wind} km/h</span>
                    </div>
                  </div>
                )}

                {/* 3. Tab Waktu & Pomodoro */}
                {activeTab === 'calendar' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#f4f4f5' }}>
                          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                        </div>
                        <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 1 }}>
                          Sesi Fokus Pomodoro
                        </div>
                      </div>

                      <div style={{ 
                        fontSize: 22, 
                        fontWeight: 700, 
                        color: timerRunning ? '#10b981' : '#f4f4f5', 
                        fontFamily: 'monospace' 
                      }}>
                        {formatTimer(timerSeconds)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setTimerRunning(!timerRunning)}
                        style={{
                          flex: 1,
                          padding: '7px 0',
                          borderRadius: 8,
                          background: timerRunning ? '#ef4444' : '#10b981',
                          color: '#ffffff',
                          border: 'none',
                          outline: 'none',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Timer size={14} />
                        <span>{timerRunning ? 'Jeda Timer' : 'Mulai Fokus'}</span>
                      </button>

                      <button
                        onClick={() => {
                          setTimerRunning(false);
                          setTimerSeconds(25 * 60);
                        }}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          background: '#18181b',
                          color: '#a1a1aa',
                          border: 'none',
                          outline: 'none',
                          fontSize: 11,
                          cursor: 'pointer'
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. Tab File Shelf */}
                {activeTab === 'shelf' && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: 160 }}>
                    <div style={{ 
                      flex: 1, 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 6,
                      paddingRight: 4
                    }}>
                      {shelfItems.length === 0 ? (
                        <div style={{ 
                          flex: 1, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: '#52525b',
                          gap: 6,
                          fontSize: 11
                        }}>
                          <FolderDown size={24} strokeWidth={1.5} />
                          <span>Seret dan jatuhkan berkas ke sini</span>
                        </div>
                      ) : (
                        shelfItems.map(item => (
                          <div
                            key={item.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#0c0c0e',
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: 'none',
                              fontSize: 11
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <FileText size={14} color="#38bdf8" />
                              <span style={{ 
                                color: '#f4f4f5', 
                                whiteSpace: 'nowrap', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                maxWidth: 260
                              }}>
                                {item.name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ color: '#71717a', fontSize: 10 }}>
                                {formatFileSize(item.size)}
                              </span>
                              <button
                                onClick={() => setShelfItems(prev => prev.filter(i => i.id !== item.id))}
                                style={{ background: 'none', border: 'none', outline: 'none', color: '#71717a', cursor: 'pointer' }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {shelfItems.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 6 }}>
                        <button
                          onClick={() => setShelfItems([])}
                          style={{
                            background: 'none',
                            border: 'none',
                            outline: 'none',
                            color: '#ef4444',
                            fontSize: 10,
                            cursor: 'pointer'
                          }}
                        >
                          Bersihkan Semua
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feedback Toast */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              style={{
                position: 'absolute',
                bottom: 8,
                left: 12,
                right: 12,
                background: '#10b981',
                color: '#ffffff',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                zIndex: 60
              }}
            >
              <Check size={12} />
              <span>{toastMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default App;
