// My Island: Frontend Controller & UI Engine

const state = {
  mode: 'compact', // 'compact' | 'expanded'
  activeTab: 'music',
  isHovered: false,
  leaveTimeout: null,
  media: {
    title: 'Tidak ada media aktif',
    artist: 'Putar lagu di Spotify atau YouTube',
    albumArt: 'assets/default-art.svg',
    isPlaying: false,
    position: 0,
    duration: 0,
    source: 'SMTC'
  },
  weather: {
    temp: '--',
    humidity: '--',
    wind: '--',
    desc: 'Memuat cuaca...',
    city: 'Denpasar'
  },
  timer: {
    totalSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    isRunning: false,
    intervalId: null
  },
  shelf: []
};

// Safe Tauri API access
const tauri = window.__TAURI__ || null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initIslandMorph();
  initTabs();
  initClockAndCalendar();
  initWeather();
  initTimer();
  initShelf();
  initSMTC();
});

// 1. Island Morphing & Resize
function initIslandMorph() {
  const island = document.getElementById('island');
  const compactBar = document.getElementById('compact-bar');
  const expandedHud = document.getElementById('expanded-hud');

  function expand() {
    if (state.mode === 'expanded') return;
    state.mode = 'expanded';
    island.classList.remove('island-compact');
    island.classList.add('island-expanded');
    expandedHud.classList.remove('hidden');

    if (tauri && tauri.core) {
      tauri.core.invoke('set_mode', { mode: 'expanded' }).catch(console.error);
    }
  }

  function collapse() {
    if (state.mode === 'compact') return;
    state.mode = 'compact';
    island.classList.remove('island-expanded');
    island.classList.add('island-compact');
    expandedHud.classList.add('hidden');

    if (tauri && tauri.core) {
      tauri.core.invoke('set_mode', { mode: 'compact' }).catch(console.error);
    }
  }

  compactBar.addEventListener('click', () => {
    expand();
  });

  island.addEventListener('mouseenter', () => {
    if (state.leaveTimeout) {
      clearTimeout(state.leaveTimeout);
      state.leaveTimeout = null;
    }
  });

  island.addEventListener('mouseleave', () => {
    if (state.mode === 'expanded') {
      state.leaveTimeout = setTimeout(() => {
        collapse();
      }, 350);
    }
  });
}

// 2. Navigation Tabs
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetTab = btn.getAttribute('data-tab');
      if (state.activeTab === targetTab) return;

      state.activeTab = targetTab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const activePanel = document.getElementById(`tab-${targetTab}`);
      if (activePanel) activePanel.classList.add('active');
    });
  });
}

// 3. Clock & Calendar
function initClockAndCalendar() {
  const clockEl = document.getElementById('compact-clock');
  const dayNameEl = document.getElementById('cal-day-name');
  const fullDateEl = document.getElementById('cal-date-full');
  const calMatrix = document.getElementById('cal-matrix');

  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    clockEl.textContent = `${hours}:${minutes}`;

    dayNameEl.textContent = dayNames[now.getDay()];
    fullDateEl.textContent = `${now.getDate()} ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
  }

  function renderCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calMatrix.innerHTML = '';

    // Day headers
    const headers = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];
    headers.forEach(h => {
      const cell = document.createElement('div');
      cell.className = 'cal-header-cell';
      cell.textContent = h;
      calMatrix.appendChild(cell);
    });

    // Empty cells before start
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell empty';
      calMatrix.appendChild(empty);
    }

    // Days
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (d === today ? ' today' : '');
      cell.textContent = d;
      calMatrix.appendChild(cell);
    }
  }

  updateClock();
  renderCalendar();
  setInterval(updateClock, 1000);
}

// 4. Weather & Hardware Telemetry
async function initWeather() {
  const tempEl = document.getElementById('weather-temp');
  const compactTempEl = document.getElementById('compact-temp');
  const descEl = document.getElementById('weather-desc');
  const humEl = document.getElementById('weather-humidity');
  const windEl = document.getElementById('weather-wind');
  const cityEl = document.getElementById('weather-city');

  const weatherCodes = {
    0: 'Cerah Berawan',
    1: 'Cerah Sebagian',
    2: 'Berawan Tipis',
    3: 'Mendung',
    45: 'Berkabut',
    48: 'Kabut Tebal',
    51: 'Gerimis Ringan',
    61: 'Hujan Ringan',
    63: 'Hujan Sedang',
    65: 'Hujan Deras',
    80: 'Hujan Lokal',
    95: 'Badai Petir'
  };

  async function fetchWeather() {
    try {
      // Default to Bali / Indonesia coordinates or via API
      const lat = -8.65;
      const lon = 115.22;
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      const cur = data.current;

      const t = Math.round(cur.temperature_2m);
      const code = cur.weather_code;
      const desc = weatherCodes[code] || 'Cerah';

      tempEl.textContent = `${t}°C`;
      compactTempEl.textContent = `${t}°C`;
      descEl.textContent = desc;
      humEl.textContent = `${cur.relative_humidity_2m}%`;
      windEl.textContent = `${cur.wind_speed_10m} km/h`;
      cityEl.textContent = 'Bali';
    } catch (e) {
      console.warn('Weather fetch fallback:', e);
      tempEl.textContent = '29°C';
      compactTempEl.textContent = '29°C';
      descEl.textContent = 'Cerah Berawan';
      humEl.textContent = '78%';
      windEl.textContent = '12 km/h';
      cityEl.textContent = 'Lokal';
    }
  }

  fetchWeather();
  setInterval(fetchWeather, 15 * 60 * 1000); // 15 mins

  // Hardware telemetry simulation / update
  function updateHwTelemetry() {
    if (tauri && tauri.core) {
      tauri.core.invoke('get_hardware_metrics').then(metrics => {
        if (metrics) {
          document.getElementById('cpu-temp').textContent = `${metrics.cpu_temp}°C`;
          document.getElementById('gpu-temp').textContent = `${metrics.gpu_temp}°C`;
          document.getElementById('ram-usage').textContent = `My Island: ${metrics.ram_mb} MB`;
          document.getElementById('cpu-bar').style.width = `${Math.min(100, metrics.cpu_temp)}%`;
          document.getElementById('gpu-bar').style.width = `${Math.min(100, metrics.gpu_temp)}%`;
        }
      }).catch(() => {});
    }
  }

  setInterval(updateHwTelemetry, 4000);
}

// 5. Timer / Pomodoro
function initTimer() {
  const display = document.getElementById('timer-display');
  const toggleBtn = document.getElementById('timer-toggle');
  const resetBtn = document.getElementById('timer-reset');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const compactTimer = document.getElementById('compact-timer');
  const compactTimerVal = document.getElementById('compact-timer-val');
  const compactTimerRing = document.getElementById('compact-timer-progress');
  const compactMedia = document.getElementById('compact-media');

  function renderTimer() {
    const mins = Math.floor(state.timer.remainingSeconds / 60);
    const secs = state.timer.remainingSeconds % 60;
    const str = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    display.textContent = str;
    compactTimerVal.textContent = str;

    const percent = ((state.timer.totalSeconds - state.timer.remainingSeconds) / state.timer.totalSeconds) * 100;
    compactTimerRing.setAttribute('stroke-dasharray', `${percent}, 100`);
  }

  function tick() {
    if (state.timer.remainingSeconds > 0) {
      state.timer.remainingSeconds--;
      renderTimer();
    } else {
      pauseTimer();
      showToast('Waktu timer telah selesai!');
    }
  }

  function startTimer() {
    state.timer.isRunning = true;
    toggleBtn.textContent = 'Jeda';
    toggleBtn.classList.remove('primary');
    compactTimer.classList.remove('hidden');
    compactMedia.classList.add('hidden');
    state.timer.intervalId = setInterval(tick, 1000);
  }

  function pauseTimer() {
    state.timer.isRunning = false;
    toggleBtn.textContent = 'Mulai';
    toggleBtn.classList.add('primary');
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.timer.isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  });

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pauseTimer();
    state.timer.remainingSeconds = state.timer.totalSeconds;
    renderTimer();
    compactTimer.classList.add('hidden');
    compactMedia.classList.remove('hidden');
  });

  presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = parseInt(btn.getAttribute('data-minutes'), 10);
      pauseTimer();
      state.timer.totalSeconds = mins * 60;
      state.timer.remainingSeconds = mins * 60;
      renderTimer();
    });
  });

  renderTimer();
}

// 6. File Shelf
function initShelf() {
  const dropIndicator = document.getElementById('drop-indicator');
  const shelfEmpty = document.getElementById('shelf-empty');
  const shelfList = document.getElementById('shelf-list');
  const shelfCountBadge = document.getElementById('shelf-count');
  const shelfClearBtn = document.getElementById('shelf-clear');

  function updateShelfUI() {
    shelfCountBadge.textContent = state.shelf.length;
    if (state.shelf.length === 0) {
      shelfEmpty.classList.remove('hidden');
      shelfList.classList.add('hidden');
      shelfList.innerHTML = '';
    } else {
      shelfEmpty.classList.add('hidden');
      shelfList.classList.remove('hidden');
      shelfList.innerHTML = '';

      state.shelf.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'shelf-item';
        item.setAttribute('draggable', 'true');
        item.innerHTML = `
          <span class="shelf-item-name" title="${file.path || file.name}">${file.name}</span>
          <span class="shelf-item-size">${formatBytes(file.size || 0)}</span>
        `;

        item.addEventListener('dragstart', (e) => {
          if (file.path) {
            e.dataTransfer.setData('text/plain', file.path);
          }
        });

        shelfList.appendChild(item);
      });
    }
  }

  // HTML5 Drag and Drop Handlers
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropIndicator.classList.remove('hidden');
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null || e.clientX <= 0 || e.clientY <= 0) {
      dropIndicator.classList.add('hidden');
    }
  });

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dropIndicator.classList.add('hidden');

    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i];
        state.shelf.push({
          name: f.name,
          size: f.size,
          path: f.path || f.name,
          type: f.type
        });
      }
      updateShelfUI();
      showToast(`${dt.files.length} berkas ditambahkan ke Shelf`);
    }
  });

  shelfClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.shelf = [];
    updateShelfUI();
    showToast('Shelf telah dikosongkan');
  });

  updateShelfUI();
}

// 7. Windows SMTC Music Controller
function initSMTC() {
  const trackTitle = document.getElementById('music-title');
  const trackArtist = document.getElementById('music-artist');
  const compactTitle = document.getElementById('compact-track-title');
  const albumArt = document.getElementById('album-art');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnPlay = document.getElementById('btn-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  function updateMediaUI(data) {
    if (data.title) {
      trackTitle.textContent = data.title;
      compactTitle.textContent = data.title;
    }
    if (data.artist) {
      trackArtist.textContent = data.artist;
    }
    if (data.album_art) {
      albumArt.src = data.album_art;
    }
    if (data.is_playing) {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
    } else {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
    }
  }

  btnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tauri && tauri.core) {
      tauri.core.invoke('smtc_play_pause').catch(console.error);
    } else {
      state.media.isPlaying = !state.media.isPlaying;
      updateMediaUI({ is_playing: state.media.isPlaying });
    }
  });

  btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tauri && tauri.core) {
      tauri.core.invoke('smtc_previous').catch(console.error);
    }
  });

  btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tauri && tauri.core) {
      tauri.core.invoke('smtc_next').catch(console.error);
    }
  });

  // Listen to Tauri events from Rust backend
  if (tauri && tauri.event) {
    tauri.event.listen('smtc-update', (event) => {
      if (event.payload) {
        updateMediaUI(event.payload);
      }
    });
  }
}

// Helpers
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  text.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2400);
}
