# My Island

My Island adalah aplikasi desktop Windows yang menghadirkan antarmuka Dynamic Island / floating notch di bagian atas layar. Dirancang dengan prinsip efisiensi sumber daya tinggi (target konsumsi RAM di bawah 50MB), kecepatan responsif, serta estetika visual Obsidian Dark presisi.

---

## Fitur Utama

- **Integrasi Musik Universal (Windows SMTC)**: Mendeteksi dan mengontrol media yang sedang diputar di Windows (Spotify, YouTube Music via Chrome/Edge, VLC, dan pemutar audio lainnya) secara real-time tanpa memerlukan API key atau autentikasi akun tambahan.
- **Cuaca dan Telemetri Perangkat Keras**: Mengambil data cuaca dan suhu luar ruangan melalui Open-Meteo API, disertai pemantauan suhu CPU, GPU, dan alokasi memori proses aplikasi secara langsung.
- **Kalender dan Timer Fokus**: Indikator tanggal, hari, matriks kalender bulanan, serta timer hitung mundur dengan preset cepat (5m, 15m, 25m, 60m) dan indikator cincin progres melingkar pada mode compact.
- **File Shelf Sementara**: Area drop zone terintegrasi untuk menampung berkas sementara, mendukung operasi drag-and-drop antar aplikasi (File Explorer, peramban web, aplikasi pesan instan, dan email).
- **Manajemen Memori Efisien**: Menggunakan arsitektur Tauri v2 (Rust backend) dipadukan dengan frontend Vanilla ES Modules tanpa runtime framework berat, dilengkapi pemangkasan berkala Windows Working Set (`SetProcessWorkingSetSize`).

---

## Arsitektur Teknologi

- **Backend**: Rust 1.80+ / 1.99+, Tauri v2, Tokio, Windows API (SMTC / User32 / Kernel32), sysinfo.
- **Frontend**: Vanilla ES Modules, HTML5, CSS Hardware-Accelerated Transforms.
- **Sistem Animasi**: CSS Spring Physics dengan kurva transisi `cubic-bezier(0.16, 1, 0.3, 1)`.

---

## Persyaratan Sistem

- Windows 10 atau Windows 11 (64-bit)
- Node.js versi 18 ke atas
- Toolchain Rust (target x86_64-pc-windows-gnu atau msvc)

---

## Instalasi dan Menjalankan

1. Pasang dependensi frontend dan CLI:
   ```powershell
   npm install
   ```

2. Jalankan aplikasi dalam mode pengembangan:
   ```powershell
   npm run dev
   ```

3. Bangun paket biner produksi:
   ```powershell
   npm run build
   ```

---

## Lisensi

Proyek ini dirilis di bawah lisensi MIT.
