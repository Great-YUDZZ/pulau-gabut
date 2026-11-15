use serde::Serialize;
use std::sync::{
    atomic::{AtomicU32, Ordering},
    Mutex, OnceLock,
};

#[derive(Clone, Serialize)]
pub struct ClipboardItem {
    pub id: String,
    pub text: String,
    pub timestamp: String,
}

static HISTORY: OnceLock<Mutex<Vec<ClipboardItem>>> = OnceLock::new();
static LAST_SEQ: AtomicU32 = AtomicU32::new(0);

fn history_store() -> &'static Mutex<Vec<ClipboardItem>> {
    HISTORY.get_or_init(|| Mutex::new(Vec::new()))
}

#[cfg(windows)]
const CF_UNICODETEXT: u32 = 13;
#[cfg(windows)]
const GMEM_MOVEABLE: u32 = 0x0002;

#[cfg(windows)]
extern "system" {
    fn GetClipboardSequenceNumber() -> u32;
    fn OpenClipboard(h_wnd_new_owner: isize) -> i32;
    fn CloseClipboard() -> i32;
    fn EmptyClipboard() -> i32;
    fn IsClipboardFormatAvailable(format: u32) -> i32;
    fn GetClipboardData(u_format: u32) -> isize;
    fn SetClipboardData(u_format: u32, h_mem: isize) -> isize;
    fn GlobalAlloc(u_flags: u32, dw_bytes: usize) -> isize;
    fn GlobalLock(h_mem: isize) -> *mut u16;
    fn GlobalUnlock(h_mem: isize) -> i32;
}

#[cfg(windows)]
fn read_clipboard_text() -> Option<String> {
    unsafe {
        if IsClipboardFormatAvailable(CF_UNICODETEXT) == 0 {
            return None;
        }
        if OpenClipboard(0) == 0 {
            return None;
        }
        let handle = GetClipboardData(CF_UNICODETEXT);
        let mut result = None;
        if handle != 0 {
            let ptr = GlobalLock(handle);
            if !ptr.is_null() {
                let mut len = 0usize;
                // Cap at 4096 UTF-16 code units to keep memory minimal
                while len < 4096 && *ptr.add(len) != 0 {
                    len += 1;
                }
                let slice = std::slice::from_raw_parts(ptr, len);
                let text = String::from_utf16_lossy(slice).trim().to_string();
                if !text.is_empty() {
                    result = Some(text);
                }
                GlobalUnlock(handle);
            }
        }
        CloseClipboard();
        result
    }
}

pub fn poll_clipboard() {
    #[cfg(windows)]
    unsafe {
        let seq = GetClipboardSequenceNumber();
        let prev = LAST_SEQ.load(Ordering::Relaxed);
        if seq == 0 || seq == prev {
            return;
        }
        LAST_SEQ.store(seq, Ordering::Relaxed);

        if let Some(text) = read_clipboard_text() {
            let mut store = history_store().lock().unwrap();
            // Remove duplicate if already present so the newest copy rises to the top
            store.retain(|item| item.text != text);
            let now = chrono::Local::now().format("%H:%M").to_string();
            let id = format!("cb-{}-{}", seq, store.len());
            store.insert(0, ClipboardItem { id, text, timestamp: now });
            if store.len() > 15 {
                store.truncate(15);
            }
        }
    }
}

pub fn get_history() -> Vec<ClipboardItem> {
    poll_clipboard();
    history_store().lock().unwrap().clone()
}

pub fn clear_history() {
    history_store().lock().unwrap().clear();
}

pub fn copy_to_clipboard(text: &str) -> bool {
    #[cfg(windows)]
    unsafe {
        let mut wide: Vec<u16> = text.encode_utf16().collect();
        wide.push(0);
        let bytes = wide.len() * std::mem::size_of::<u16>();

        let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes);
        if h_mem == 0 {
            return false;
        }

        let ptr = GlobalLock(h_mem);
        if ptr.is_null() {
            return false;
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        GlobalUnlock(h_mem);

        if OpenClipboard(0) == 0 {
            return false;
        }
        EmptyClipboard();
        let ok = SetClipboardData(CF_UNICODETEXT, h_mem) != 0;
        CloseClipboard();
        if ok {
            LAST_SEQ.store(GetClipboardSequenceNumber(), Ordering::Relaxed);
        }
        return ok;
    }
    #[cfg(not(windows))]
    false
}
