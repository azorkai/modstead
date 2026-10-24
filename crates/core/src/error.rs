use std::fmt;

use serde::Serialize;
use serde::ser::SerializeStruct;

/// Arayüze `{ code, message }` olarak giden tek hata tipi. Mesaj etkin dilde üretilir.
#[derive(Debug)]
pub enum AppError {
    Message(String),
    /// Oyun bulunamadı; değer oyunun görünen adıdır.
    GameNotFound(String),
    /// Oyun açık; değişiklik yapılamaz. Değer oyunun görünen adıdır.
    GameRunning(String),
    Security(String),
    Network(String),
    Nexus(String),
    Io(std::io::Error),
    Cancelled,
    NotFound(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Message(m) => write!(f, "{m}"),
            AppError::GameNotFound(game) => write!(
                f,
                "{}",
                tr!(
                    format!("{game} kurulumu bulunamadı. Oyun klasörünü seçin."),
                    format!("{game} installation not found. Choose the game folder.")
                )
            ),
            AppError::GameRunning(game) => write!(
                f,
                "{}",
                tr!(
                    format!("{game} şu anda açık. Değişiklik yapmadan önce oyunu kapatın."),
                    format!("{game} is running. Close the game before making changes.")
                )
            ),
            AppError::Security(m) => write!(f, "{}: {m}", tr!("Güvenlik denetimi", "Security check")),
            AppError::Network(m) => write!(f, "{}: {m}", tr!("Ağ hatası", "Network error")),
            AppError::Nexus(m) => write!(f, "Nexus Mods: {m}"),
            AppError::Io(e) => write!(f, "{}: {e}", tr!("Dosya işlemi başarısız", "File operation failed")),
            AppError::Cancelled => f.write_str(tr!("İşlem iptal edildi.", "Operation cancelled.")),
            AppError::NotFound(m) => write!(f, "{}: {m}", tr!("Bulunamadı", "Not found")),
        }
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError::Message(s.into())
    }

    pub fn security(s: impl Into<String>) -> Self {
        AppError::Security(s.into())
    }

    /// Başka bir hata türünü (ör. `tauri::Error`) metniyle sarar.
    pub fn other(e: impl fmt::Display) -> Self {
        AppError::Message(e.to_string())
    }

    pub fn code(&self) -> &'static str {
        match self {
            AppError::Message(_) => "message",
            AppError::GameNotFound(_) => "game_not_found",
            AppError::GameRunning(_) => "game_running",
            AppError::Security(_) => "security",
            AppError::Network(_) => "network",
            AppError::Nexus(_) => "nexus",
            AppError::Io(_) => "io",
            AppError::Cancelled => "cancelled",
            AppError::NotFound(_) => "not_found",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("code", self.code())?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::Network(tr!("sunucu zamanında yanıt vermedi", "the server did not respond in time").into())
        } else if e.is_connect() {
            AppError::Network(
                tr!("bağlantı kurulamadı (internet bağlantınızı kontrol edin)", "could not connect (check your internet connection)").into(),
            )
        } else if e.is_redirect() {
            AppError::Security(format!("{}: {e}", tr!("güvenilmeyen yönlendirme engellendi", "untrusted redirect blocked")))
        } else {
            AppError::Network(e.to_string())
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::msg(format!("{}: {e}", tr!("JSON okunamadı", "could not read JSON")))
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(e: tokio::task::JoinError) -> Self {
        AppError::msg(format!("{}: {e}", tr!("arka plan görevi çöktü", "background task crashed")))
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// `Result<T, E: Display>` → `AppResult<T>` (Tauri gibi dış kütüphane hataları için).
pub trait ResultExt<T> {
    fn app_err(self) -> AppResult<T>;
}

impl<T, E: fmt::Display> ResultExt<T> for Result<T, E> {
    fn app_err(self) -> AppResult<T> {
        self.map_err(AppError::other)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Dil genel bir durum; testler paralel koştuğu için burada dile dokunulmaz.
    #[test]
    fn serializes_code_and_message() {
        let v = serde_json::to_value(AppError::GameRunning("Stardew Valley".into())).unwrap();
        assert_eq!(v["code"], "game_running");
        assert!(v["message"].as_str().unwrap().starts_with("Stardew Valley"));
    }
}
