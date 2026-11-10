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
        let mut down = INPUT {
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

        let mut up = INPUT {
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

pub fn trigger_play_pause() {
    send_media_key(VK_MEDIA_PLAY_PAUSE);
}

pub fn trigger_next() {
    send_media_key(VK_MEDIA_NEXT_TRACK);
}

pub fn trigger_previous() {
    send_media_key(VK_MEDIA_PREV_TRACK);
}
