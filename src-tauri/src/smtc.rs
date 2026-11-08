// Windows Media Control & SMTC Bridge

use serde::Serialize;

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct MediaTrackInfo {
    pub title: String,
    pub artist: String,
    pub album_art: String,
    pub is_playing: bool,
}

#[cfg(windows)]
extern "system" {
    fn keybd_event(b_vk: u8, b_scan: u8, dw_flags: u32, dw_extra_info: usize);
}

const VK_MEDIA_NEXT_TRACK: u8 = 0xB0;
const VK_MEDIA_PREV_TRACK: u8 = 0xB1;
const VK_MEDIA_PLAY_PAUSE: u8 = 0xB3;
const KEYEVENTF_KEYUP: u32 = 0x0002;

pub fn trigger_play_pause() {
    #[cfg(windows)]
    unsafe {
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0);
        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn trigger_next() {
    #[cfg(windows)]
    unsafe {
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, 0, 0);
        keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_KEYUP, 0);
    }
}

pub fn trigger_previous() {
    #[cfg(windows)]
    unsafe {
        keybd_event(VK_MEDIA_PREV_TRACK, 0, 0, 0);
        keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_KEYUP, 0);
    }
}
