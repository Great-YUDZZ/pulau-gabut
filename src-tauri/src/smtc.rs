// Windows Media Control & SMTC Bridge via Windows.Media.Control (WinRT)

use serde::Serialize;
use windows::Foundation::AsyncStatus;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession,
    GlobalSystemMediaTransportControlsSessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrackInfo {
    pub title: String,
    pub artist: String,
    pub is_playing: bool,
    pub source: String,
    pub position_sec: f64,
    pub duration_sec: f64,
}

fn wait_async<T: windows::core::Interface + windows::core::RuntimeType>(
    op: windows::Foundation::IAsyncOperation<T>,
) -> windows::core::Result<T> {
    let mut count = 0;
    while op.Status()? == AsyncStatus::Started && count < 60 {
        std::thread::sleep(std::time::Duration::from_millis(5));
        count += 1;
    }
    op.GetResults()
}

fn wait_async_bool(
    op: windows::Foundation::IAsyncOperation<bool>,
) -> windows::core::Result<bool> {
    let mut count = 0;
    while op.Status()? == AsyncStatus::Started && count < 60 {
        std::thread::sleep(std::time::Duration::from_millis(5));
        count += 1;
    }
    op.GetResults()
}

fn get_session_manager() -> windows::core::Result<GlobalSystemMediaTransportControlsSessionManager> {
    let async_op = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?;
    wait_async(async_op)
}

fn get_best_session(
    mgr: &GlobalSystemMediaTransportControlsSessionManager,
) -> Option<GlobalSystemMediaTransportControlsSession> {
    // 1. Cek current session terlebih dahulu
    let current = mgr.GetCurrentSession().ok();
    if let Some(ref s) = current {
        if let Ok(info) = s.GetPlaybackInfo() {
            if let Ok(status) = info.PlaybackStatus() {
                if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                    return current;
                }
            }
        }
    }

    // 2. Loop semua session aktif dari browser, Spotify, dsb. Cari yang sedang Playing
    if let Ok(sessions) = mgr.GetSessions() {
        if let Ok(size) = sessions.Size() {
            let mut fallback_session = None;
            for i in 0..size {
                if let Ok(session) = sessions.GetAt(i) {
                    if let Ok(info) = session.GetPlaybackInfo() {
                        if let Ok(status) = info.PlaybackStatus() {
                            if status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing {
                                return Some(session);
                            }
                        }
                    }
                    if fallback_session.is_none() {
                        fallback_session = Some(session);
                    }
                }
            }
            if current.is_some() {
                return current;
            }
            if fallback_session.is_some() {
                return fallback_session;
            }
        }
    }

    current
}

fn get_current_session() -> Option<GlobalSystemMediaTransportControlsSession> {
    if let Ok(mgr) = get_session_manager() {
        return get_best_session(&mgr);
    }
    None
}

pub fn get_media_info() -> Option<MediaTrackInfo> {
    if let Some(session) = get_current_session() {
        let is_playing = if let Ok(info) = session.GetPlaybackInfo() {
            if let Ok(status) = info.PlaybackStatus() {
                status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
            } else {
                false
            }
        } else {
            false
        };

        let (title, artist) = if let Ok(async_prop) = session.TryGetMediaPropertiesAsync() {
            if let Ok(props) = wait_async(async_prop) {
                let t = props.Title().map(|s| s.to_string()).unwrap_or_default();
                let a = props.Artist().map(|s| s.to_string()).unwrap_or_default();
                (t, a)
            } else {
                (String::new(), String::new())
            }
        } else {
            (String::new(), String::new())
        };

        let app_id = session.SourceAppUserModelId().map(|s| s.to_string()).unwrap_or_default();

        let (position_sec, duration_sec) = if let Ok(timeline) = session.GetTimelineProperties() {
            let pos = timeline.Position().map(|t| t.Duration as f64 / 10_000_000.0).unwrap_or(0.0);
            let end = timeline.EndTime().map(|t| t.Duration as f64 / 10_000_000.0).unwrap_or(0.0);
            (pos, end)
        } else {
            (0.0, 0.0)
        };

        if !title.is_empty() || !artist.is_empty() {
            return Some(MediaTrackInfo {
                title: if title.is_empty() { "Media Aktif".to_string() } else { title },
                artist: if artist.is_empty() { "Windows Media".to_string() } else { artist },
                is_playing,
                source: if app_id.is_empty() { "SMTC".to_string() } else { app_id },
                position_sec,
                duration_sec,
            });
        }
    }
    None
}

// Media Control Actions (WinRT First, Fallback to Media Keys)
pub fn trigger_play_pause() {
    if let Some(session) = get_current_session() {
        if let Ok(op) = session.TryTogglePlayPauseAsync() {
            if let Ok(success) = wait_async_bool(op) {
                if success {
                    return;
                }
            }
        }
    }
    send_media_key(VK_MEDIA_PLAY_PAUSE);
}

pub fn trigger_next() {
    if let Some(session) = get_current_session() {
        if let Ok(op) = session.TrySkipNextAsync() {
            if let Ok(success) = wait_async_bool(op) {
                if success {
                    return;
                }
            }
        }
    }
    send_media_key(VK_MEDIA_NEXT_TRACK);
}

pub fn trigger_previous() {
    if let Some(session) = get_current_session() {
        if let Ok(op) = session.TrySkipPreviousAsync() {
            if let Ok(success) = wait_async_bool(op) {
                if success {
                    return;
                }
            }
        }
    }
    send_media_key(VK_MEDIA_PREV_TRACK);
}

// Virtual key fallback via SendInput
#[cfg(windows)]
#[repr(C)]
struct KEYBDINPUT {
    w_vk: u16,
    w_scan: u16,
    dw_flags: u32,
    time: u32,
    dw_extra_info: usize,
}

#[cfg(windows)]
#[repr(C)]
struct INPUT {
    r#type: u32,
    ki: KEYBDINPUT,
    padding: [u8; 24],
}

#[cfg(windows)]
extern "system" {
    fn SendInput(c_inputs: u32, p_inputs: *const INPUT, cb_size: i32) -> u32;
}

const INPUT_KEYBOARD: u32 = 1;
const KEYEVENTF_KEYUP: u32 = 0x0002;
const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;

const VK_MEDIA_NEXT_TRACK: u16 = 0xB0;
const VK_MEDIA_PREV_TRACK: u16 = 0xB1;
const VK_MEDIA_PLAY_PAUSE: u16 = 0xB3;

fn send_media_key(vk: u16) {
    #[cfg(windows)]
    unsafe {
        let down = INPUT {
            r#type: INPUT_KEYBOARD,
            ki: KEYBDINPUT {
                w_vk: vk,
                w_scan: 0,
                dw_flags: KEYEVENTF_EXTENDEDKEY,
                time: 0,
                dw_extra_info: 0,
            },
            padding: [0; 24],
        };

        let up = INPUT {
            r#type: INPUT_KEYBOARD,
            ki: KEYBDINPUT {
                w_vk: vk,
                w_scan: 0,
                dw_flags: KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
                time: 0,
                dw_extra_info: 0,
            },
            padding: [0; 24],
        };

        let inputs = [down, up];
        SendInput(2, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
    }
}
