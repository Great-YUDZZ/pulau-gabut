use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct NotificationItem {
    pub id: u32,
    pub app_name: String,
    pub title: String,
    pub body: String,
}

#[derive(Serialize, Clone)]
pub struct NotificationResponse {
    pub access_status: String,
    pub items: Vec<NotificationItem>,
}

#[cfg(windows)]
mod win_notif {
    use super::{NotificationItem, NotificationResponse};
    use windows::UI::Notifications::Management::{
        UserNotificationListener, UserNotificationListenerAccessStatus,
    };
    use windows::UI::Notifications::{KnownNotificationBindings, NotificationKinds};

    pub fn get_latest_notifications() -> NotificationResponse {
        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(_) => {
                return NotificationResponse {
                    access_status: "Unavailable".to_string(),
                    items: Vec::new(),
                }
            }
        };

        let access = match listener.RequestAccessAsync() {
            Ok(op) => match op.get() {
                Ok(status) => status,
                Err(_) => UserNotificationListenerAccessStatus::Unspecified,
            },
            Err(_) => UserNotificationListenerAccessStatus::Unspecified,
        };

        let status_str = if access == UserNotificationListenerAccessStatus::Allowed {
            "Allowed"
        } else if access == UserNotificationListenerAccessStatus::Denied {
            "Denied"
        } else {
            "Unspecified"
        };

        if access != UserNotificationListenerAccessStatus::Allowed {
            return NotificationResponse {
                access_status: status_str.to_string(),
                items: Vec::new(),
            };
        }

        let mut items = Vec::new();
        if let Ok(op) = listener.GetNotificationsAsync(NotificationKinds::Toast) {
            if let Ok(list) = op.get() {
                let toast_template = KnownNotificationBindings::ToastGeneric().ok();
                let count = list.Size().unwrap_or(0);
                // Iterate from newest to oldest, cap at 10 items
                let start = count.saturating_sub(10);
                for idx in (start..count).rev() {
                    if let Ok(notif) = list.GetAt(idx) {
                        let id = notif.Id().unwrap_or(0);
                        let app_name = "Windows".to_string();

                        let mut title = String::new();
                        let mut body = String::new();

                        if let Some(ref tmpl) = toast_template {
                            if let Ok(visual) = notif.Notification().and_then(|n| n.Visual()) {
                                if let Ok(binding) = visual.GetBinding(tmpl) {
                                    if let Ok(texts) = binding.GetTextElements() {
                                        let t_len = texts.Size().unwrap_or(0);
                                        if t_len > 0 {
                                            if let Ok(el) = texts.GetAt(0) {
                                                title = el
                                                    .Text()
                                                    .map(|h| h.to_string_lossy())
                                                    .unwrap_or_default();
                                            }
                                        }
                                        if t_len > 1 {
                                            let mut parts = Vec::new();
                                            for j in 1..t_len {
                                                if let Ok(el) = texts.GetAt(j) {
                                                    if let Ok(txt) = el.Text() {
                                                        let s = txt.to_string_lossy();
                                                        if !s.trim().is_empty() {
                                                            parts.push(s);
                                                        }
                                                    }
                                                }
                                            }
                                            body = parts.join(" ");
                                        }
                                    }
                                }
                            }
                        }

                        if !title.is_empty() || !body.is_empty() {
                            items.push(NotificationItem {
                                id,
                                app_name,
                                title,
                                body,
                            });
                        }
                    }
                }
            }
        }

        NotificationResponse {
            access_status: status_str.to_string(),
            items,
        }
    }
}

pub fn get_latest_notifications() -> NotificationResponse {
    #[cfg(windows)]
    {
        win_notif::get_latest_notifications()
    }
    #[cfg(not(windows))]
    {
        NotificationResponse {
            access_status: "Unsupported".to_string(),
            items: Vec::new(),
        }
    }
}
