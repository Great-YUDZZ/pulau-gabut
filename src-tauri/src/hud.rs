use serde::Serialize;

#[derive(Serialize, Clone, Default)]
pub struct SystemHudState {
    pub volume: u32,
    pub muted: bool,
    pub battery_pct: u8,
    pub is_charging: bool,
    pub has_battery: bool,
}

#[cfg(windows)]
mod win_hud {
    use super::SystemHudState;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eConsole, eRender, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };

    #[repr(C)]
    struct SYSTEM_POWER_STATUS {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }

    extern "system" {
        fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SYSTEM_POWER_STATUS) -> i32;
    }

    struct ComGuard(bool);
    impl ComGuard {
        fn new() -> Self {
            unsafe {
                let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                Self(hr.is_ok())
            }
        }
    }
    impl Drop for ComGuard {
        fn drop(&mut self) {
            if self.0 {
                unsafe {
                    CoUninitialize();
                }
            }
        }
    }

    unsafe fn get_endpoint_volume() -> Option<IAudioEndpointVolume> {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
        let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
        device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None).ok()
    }

    pub fn get_system_hud_state() -> SystemHudState {
        let _guard = ComGuard::new();
        let mut volume: u32 = 0;
        let mut muted = false;

        unsafe {
            if let Some(ep) = get_endpoint_volume() {
                if let Ok(scalar) = ep.GetMasterVolumeLevelScalar() {
                    volume = (scalar * 100.0).round().clamp(0.0, 100.0) as u32;
                }
                if let Ok(m) = ep.GetMute() {
                    muted = m.as_bool();
                }
            }
        }

        let mut power = SYSTEM_POWER_STATUS {
            ac_line_status: 255,
            battery_flag: 255,
            battery_life_percent: 255,
            system_status_flag: 0,
            battery_life_time: 0,
            battery_full_life_time: 0,
        };
        let ok = unsafe { GetSystemPowerStatus(&mut power) } != 0;
        let has_battery = ok && (power.battery_flag & 128) == 0 && power.battery_life_percent <= 100;
        let battery_pct = if has_battery {
            power.battery_life_percent
        } else {
            100
        };
        let is_charging = ok && (power.ac_line_status == 1 || (power.battery_flag & 8) != 0);

        SystemHudState {
            volume,
            muted,
            battery_pct,
            is_charging,
            has_battery,
        }
    }

    pub fn set_system_volume(level: u32) -> bool {
        let _guard = ComGuard::new();
        let clamped = (level.min(100) as f32) / 100.0;
        unsafe {
            if let Some(ep) = get_endpoint_volume() {
                return ep.SetMasterVolumeLevelScalar(clamped, std::ptr::null()).is_ok();
            }
        }
        false
    }

    pub fn toggle_system_mute() -> bool {
        let _guard = ComGuard::new();
        unsafe {
            if let Some(ep) = get_endpoint_volume() {
                if let Ok(current) = ep.GetMute() {
                    let next = !current.as_bool();
                    if ep.SetMute(next, std::ptr::null()).is_ok() {
                        return next;
                    }
                }
            }
        }
        false
    }
}

pub fn get_system_hud_state() -> SystemHudState {
    #[cfg(windows)]
    {
        win_hud::get_system_hud_state()
    }
    #[cfg(not(windows))]
    {
        SystemHudState::default()
    }
}

pub fn set_system_volume(level: u32) -> bool {
    #[cfg(windows)]
    {
        win_hud::set_system_volume(level)
    }
    #[cfg(not(windows))]
    {
        let _ = level;
        false
    }
}

pub fn toggle_system_mute() -> bool {
    #[cfg(windows)]
    {
        win_hud::toggle_system_mute()
    }
    #[cfg(not(windows))]
    {
        false
    }
}
