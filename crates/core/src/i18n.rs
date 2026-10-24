//! Arka uç mesajlarının dili (arayüzle aynı ayar: "auto" | "tr" | "en").
//!
//! Her kullanıcıya dönük metin `tr!("Türkçe", "English")` ile yazılır; etkin dil seçilir.

use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set_language(setting: &str) {
    let en = match setting {
        "en" => true,
        "tr" => false,
        _ => !system_prefers_turkish(),
    };
    ENGLISH.store(en, Ordering::Relaxed);
}

pub fn is_en() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

/// Etkin dil: "tr" | "en" ("auto" çözülmüş hali; arayüz de bunu kullanır).
pub fn resolved() -> &'static str {
    if is_en() { "en" } else { "tr" }
}

/// Windows arayüz dili, bölge biçimi ya da ev konumu Türkçe/Türkiye ise Türkçe.
/// (İngilizce Windows kullanan Türk kullanıcılar da Türkçe başlar.)
#[cfg(windows)]
fn system_prefers_turkish() -> bool {
    use windows_sys::Win32::Globalization::{GEOCLASS_NATION, GetUserDefaultLCID, GetUserDefaultUILanguage, GetUserGeoID};
    const LANG_TURKISH: u32 = 0x1F;
    const GEO_TURKEY: i32 = 235;
    unsafe {
        (GetUserDefaultUILanguage() as u32 & 0x3FF) == LANG_TURKISH
            || (GetUserDefaultLCID() & 0x3FF) == LANG_TURKISH
            || GetUserGeoID(GEOCLASS_NATION) == GEO_TURKEY
    }
}

#[cfg(not(windows))]
fn system_prefers_turkish() -> bool {
    std::env::var("LANG").map(|l| l.starts_with("tr")).unwrap_or(false)
}

/// `tr!("Türkçe metin", "English text")` — etkin dile göre birini seçer.
/// İki dal da aynı türde olmalı (`&str` ya da `String`).
#[macro_export]
macro_rules! tr {
    ($tr:expr, $en:expr $(,)?) => {
        if $crate::i18n::is_en() { $en } else { $tr }
    };
}

#[cfg(test)]
mod tests {
    #[test]
    fn switches_language() {
        super::set_language("en");
        assert_eq!(tr!("evet", "yes"), "yes");
        super::set_language("tr");
        assert_eq!(tr!("evet", "yes"), "evet");
    }
}
