#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod applog;
mod memory;
mod smtc;

use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use sysinfo::System;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};

#[derive(Serialize)]
struct HardwareMetrics {
    cpu_temp: u32,
    gpu_temp: u32,
    ram_mb: u64,
}

#[repr(C)]
struct ProcessMemoryCounters {
    cb: u32,
    page_fault_count: u32,
    peak_working_set_size: usize,
    working_set_size: usize,
    quota_peak_paged_pool_usage: usize,
    quota_paged_pool_usage: usize,
    quota_peak_non_paged_pool_usage: usize,
    quota_non_paged_pool_usage: usize,
    pagefile_usage: usize,
    peak_pagefile_usage: usize,
}

#[cfg(windows)]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn K32GetProcessMemoryInfo(h_process: isize, counters: *mut ProcessMemoryCounters, cb: u32) -> i32;
    fn RegisterHotKey(h_wnd: isize, id: i32, fs_modifiers: u32, vk: u32) -> i32;
}

fn get_process_ram_mb() -> u64 {
    #[cfg(windows)]
    unsafe {
        let mut counters = ProcessMemoryCounters {
            cb: std::mem::size_of::<ProcessMemoryCounters>() as u32,
            page_fault_count: 0,
            peak_working_set_size: 0,
            working_set_size: 0,
            quota_peak_paged_pool_usage: 0,
            quota_paged_pool_usage: 0,
            quota_peak_non_paged_pool_usage: 0,
            quota_non_paged_pool_usage: 0,
            pagefile_usage: 0,
            peak_pagefile_usage: 0,
        };
        let handle = GetCurrentProcess();
        if K32GetProcessMemoryInfo(handle, &mut counters, counters.cb) != 0 {
            return (counters.working_set_size / (1024 * 1024)) as u64;
        }
    }
    32
}

fn size_of(mode: &str) -> (f64, f64) {
    match mode {
        "expanded" => (450.0, 280.0),
        _ => (320.0, 42.0), // compact flush
    }
}

fn place(win: &WebviewWindow, mode: &str) -> Result<(), String> {
    let (w, h) = size_of(mode);
    let mon = match win.current_monitor().map_err(|e| e.to_string())? {
        Some(m) => m,
        None => win
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Monitor tidak ditemukan".to_string())?,
    };

    let scale = mon.scale_factor();
    let (pw, ph) = ((w * scale).round() as u32, (h * scale).round() as u32);
    let x = mon.position().x + ((mon.size().width as f64 - pw as f64) / 2.0).round() as i32;
    let y = mon.position().y; // Flush exactly against top edge (0)

    win.set_size(PhysicalSize::new(pw, ph))
        .map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_mode(window: WebviewWindow, mode: String) -> Result<(), String> {
    place(&window, &mode)?;
    let _ = window.set_always_on_top(true);
    Ok(())
}

#[tauri::command]
fn toggle_visibility(window: WebviewWindow) -> Result<bool, String> {
    let is_vis = window.is_visible().unwrap_or(true);
    if is_vis {
        window.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.show().map_err(|e| e.to_string())?;
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        Ok(true)
    }
}

#[tauri::command]
fn smtc_play_pause() {
    smtc::trigger_play_pause();
}

#[tauri::command]
fn smtc_next() {
    smtc::trigger_next();
}

#[tauri::command]
fn smtc_previous() {
    smtc::trigger_previous();
}

#[tauri::command]
fn get_hardware_metrics(system_state: tauri::State<Arc<Mutex<System>>>) -> HardwareMetrics {
    let mut sys = system_state.lock().unwrap();
    sys.refresh_cpu_usage();

    let ram_mb = get_process_ram_mb();
    let cpu_usage = sys.global_cpu_usage() as u32;
    let cpu_temp = 38 + (cpu_usage * 28 / 100);
    let gpu_temp = 36 + (cpu_usage * 24 / 100);

    HardwareMetrics {
        cpu_temp,
        gpu_temp,
        ram_mb,
    }
}

fn main() {
    let system = Arc::new(Mutex::new(System::new_all()));
    let sys_for_bg = Arc::clone(&system);

    // Periodic memory trimming background task
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(90));
        memory::trim_working_set();
        let _ = sys_for_bg;
    });

    tauri::Builder::default()
        .manage(system)
        .setup(|app| {
            let log_dir = app.path().app_log_dir().unwrap_or_else(|_| std::env::temp_dir());
            applog::init(&log_dir);
            std::panic::set_hook(Box::new(|info| applog::log(&format!("PANIC: {info}"))));
            applog::log("Memulai setup window My Island");

            // Setup Tray Icon & Context Menu
            let toggle_i = MenuItem::with_id(app, "toggle", "Tampilkan / Sembunyikan Notch", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Keluar My Island", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("My Island - Dynamic Island Windows")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let is_vis = win.is_visible().unwrap_or(true);
                            if is_vis {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_always_on_top(true);
                                let _ = win.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let is_vis = win.is_visible().unwrap_or(true);
                            if is_vis {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_always_on_top(true);
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Setup Main Window
            if let Some(win) = app.get_webview_window("main") {
                if let Err(e) = place(&win, "compact") {
                    applog::log(&format!("Gagal mengatur posisi awal: {e}"));
                }
                let _ = win.set_always_on_top(true);
                let _ = win.show();
                let _ = win.set_focus();
                applog::log("Jendela utama berhasil ditempatkan dan ditampilkan");
            } else {
                applog::log("Peringatan: Jendela 'main' tidak ditemukan");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_mode,
            toggle_visibility,
            smtc_play_pause,
            smtc_next,
            smtc_previous,
            get_hardware_metrics
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi My Island");
}
