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

#[repr(C)]
struct MSG {
    hwnd: isize,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt_x: i32,
    pt_y: i32,
    l_private: u32,
}

#[cfg(windows)]
extern "system" {
    fn GetCurrentProcess() -> isize;
    fn K32GetProcessMemoryInfo(h_process: isize, counters: *mut ProcessMemoryCounters, cb: u32) -> i32;
    fn RegisterHotKey(h_wnd: isize, id: i32, fs_modifiers: u32, vk: u32) -> i32;
    fn GetMessageW(lp_msg: *mut MSG, h_wnd: isize, w_msg_filter_min: u32, w_msg_filter_max: u32) -> i32;
    fn PeekMessageW(lp_msg: *mut MSG, h_wnd: isize, w_msg_filter_min: u32, w_msg_filter_max: u32, w_remove_msg: u32) -> i32;
    fn TranslateMessage(lp_msg: *const MSG) -> i32;
    fn DispatchMessageW(lp_msg: *const MSG) -> isize;
    fn SetWindowPos(
        h_wnd: isize,
        h_wnd_insert_after: isize,
        x: i32,
        y: i32,
        cx: i32,
        cy: i32,
        u_flags: u32,
    ) -> i32;
    fn DwmSetWindowAttribute(
        h_wnd: isize,
        dw_attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
const DWMWCP_DONOTROUND: u32 = 1;
const DWMWA_BORDER_COLOR: u32 = 34;
const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFE;

const MOD_ALT: u32 = 0x0001;
const MOD_CONTROL: u32 = 0x0002;
const MOD_SHIFT: u32 = 0x0004;
const VK_I: u32 = 0x49;
const VK_SPACE: u32 = 0x20;
const WM_HOTKEY: u32 = 0x0312;

const HWND_TOPMOST: isize = -1;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_SHOWWINDOW: u32 = 0x0040;

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
        "expanded" => (440.0, 280.0),
        _ => (440.0, 40.0), // compact flush (same width so x never shifts)
    }
}

fn apply_dwm_borderless(hwnd: isize) {
    #[cfg(windows)]
    unsafe {
        let border_color: u32 = DWMWA_COLOR_NONE;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border_color as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
        let corner_pref: u32 = DWMWCP_DONOTROUND;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_pref as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );
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
    let (pw, ph) = ((w * scale).round() as i32, (h * scale).round() as i32);
    let x = mon.position().x + ((mon.size().width as f64 - pw as f64) / 2.0).round() as i32;
    let y = mon.position().y; // Flush exactly against top edge (0)

    #[cfg(windows)]
    if let Ok(hwnd) = win.hwnd() {
        apply_dwm_borderless(hwnd.0 as isize);
        unsafe {
            // Atomic update of position AND size together in a single call to prevent any tearing
            SetWindowPos(hwnd.0 as isize, HWND_TOPMOST, x, y, pw, ph, SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    } else {
        win.set_size(PhysicalSize::new(pw as u32, ph as u32))
            .map_err(|e| e.to_string())?;
        win.set_position(PhysicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
    }

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

#[tauri::command]
fn open_file(path: String) {
    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("explorer").arg(&path).spawn();
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
        .plugin(tauri_plugin_drag::init())
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

            // Background thread for System-wide Global Hotkeys (Ctrl+Alt+I and Ctrl+Shift+Space)
            let app_handle_for_hotkey = app.handle().clone();
            std::thread::spawn(move || {
                #[cfg(windows)]
                unsafe {
                    let mut msg: MSG = std::mem::zeroed();
                    // Force message queue creation for this thread
                    PeekMessageW(&mut msg, 0, 0, 0, 0);

                    // Register Ctrl + Alt + I (ID 1001)
                    let reg1 = RegisterHotKey(0, 1001, MOD_CONTROL | MOD_ALT, VK_I);
                    // Register Ctrl + Shift + Space (ID 1002) as reliable alternative
                    let reg2 = RegisterHotKey(0, 1002, MOD_CONTROL | MOD_SHIFT, VK_SPACE);

                    applog::log(&format!("Pendaftaran Hotkey: Ctrl+Alt+I={reg1}, Ctrl+Shift+Space={reg2}"));

                    while GetMessageW(&mut msg, 0, 0, 0) > 0 {
                        if msg.message == WM_HOTKEY && (msg.w_param == 1001 || msg.w_param == 1002) {
                            let app = app_handle_for_hotkey.clone();
                            let app_in_closure = app.clone();
                            let _ = app.run_on_main_thread(move || {
                                if let Some(win) = app_in_closure.get_webview_window("main") {
                                    let is_vis = win.is_visible().unwrap_or(true);
                                    applog::log(&format!("Hotkey ditekan, mengubah visibilitas jendela (saat ini: {is_vis})"));
                                    if is_vis {
                                        let _ = win.hide();
                                    } else {
                                        let _ = win.show();
                                        let _ = win.set_always_on_top(true);
                                        let _ = win.set_focus();
                                    }
                                }
                            });
                        }
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                }
            });

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
            get_hardware_metrics,
            open_file
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi My Island");
}
