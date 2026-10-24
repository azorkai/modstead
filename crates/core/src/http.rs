//! HTTP istemcileri. Yalnızca HTTPS, yalnızca izinli sunucular, her yönlendirme yeniden denetlenir.
//!
//! Üç istemci vardır:
//! - `client`: arşiv indirme ve API çağrıları. Çekirdek listesi (Nexus, GitHub, VirusTotal) +
//!   oyunların bildirdiği sunucular (ör. Stardew için smapi.io).
//! - `media`: yalnızca görsel ve meta veri sunucuları; buradan arşiv indirilmez.
//! - `user`: yalnızca kullanıcının AÇIKÇA verdiği bir adres için (ör. MSFS'te bir mod sitesinden
//!   kopyalanan bağlantı). Sunucu listesi yoktur ama HTTPS zorunludur ve sonuç her zaman
//!   kaynak güveni etiketiyle incelemeye düşer (`security::source_info`).

use std::sync::Arc;
use std::time::Duration;

use url::Url;

use crate::error::{AppError, AppResult};

/// Tam eşleşen ve sonek ile eşleşen sunucu adları.
#[derive(Clone, Debug, Default)]
pub struct HostList {
    exact: Vec<String>,
    suffix: Vec<String>,
}

impl HostList {
    pub fn new(exact: &[&str], suffix: &[&str]) -> Self {
        HostList {
            exact: exact.iter().map(|h| h.to_ascii_lowercase()).collect(),
            suffix: suffix.iter().map(|s| normalize_suffix(s)).collect(),
        }
    }

    pub fn extend(&mut self, exact: &[&str], suffix: &[&str]) {
        for h in exact {
            let h = h.to_ascii_lowercase();
            if !self.exact.contains(&h) {
                self.exact.push(h);
            }
        }
        for s in suffix {
            let s = normalize_suffix(s);
            if !self.suffix.contains(&s) {
                self.suffix.push(s);
            }
        }
    }

    pub fn allows_host(&self, host: &str) -> bool {
        let host = host.to_ascii_lowercase();
        self.exact.contains(&host) || self.suffix.iter().any(|s| host.ends_with(s.as_str()))
    }

    /// HTTPS, varsayılan port ve izinli sunucu.
    pub fn allows(&self, url: &Url) -> bool {
        url.scheme() == "https" && url.port().is_none_or(|p| p == 443) && url.host_str().is_some_and(|h| self.allows_host(h))
    }
}

/// Sonek her zaman nokta ile başlar: "nexus-cdn.com" → ".nexus-cdn.com" (evil-nexus-cdn.com eşleşmesin).
fn normalize_suffix(s: &str) -> String {
    let s = s.to_ascii_lowercase();
    if s.starts_with('.') { s } else { format!(".{s}") }
}

/// Bir oyunun çekirdek listesine eklediği sunucular.
#[derive(Clone, Copy, Debug, Default)]
pub struct GameHosts {
    pub download: &'static [&'static str],
    pub download_suffix: &'static [&'static str],
    pub media: &'static [&'static str],
}

#[derive(Clone, Debug)]
pub struct HttpPolicy {
    pub download: HostList,
    pub media: HostList,
}

impl HttpPolicy {
    /// Tüm oyunların ortak kullandığı sunucular.
    pub fn core() -> Self {
        HttpPolicy {
            download: HostList::new(
                &[
                    "api.nexusmods.com",
                    "www.nexusmods.com",
                    "nexusmods.com",
                    "staticdelivery.nexusmods.com",
                    "api.github.com",
                    "github.com",
                    "objects.githubusercontent.com",
                    "release-assets.githubusercontent.com",
                    "www.virustotal.com",
                ],
                &["nexus-cdn.com"],
            ),
            // Oyun görselleri: Nexus görselleri ve Steam'in herkese açık mağaza görselleri (logo, vitrin, kapak).
            media: HostList::new(&["staticdelivery.nexusmods.com", "api.nexusmods.com", "shared.akamai.steamstatic.com", "cdn.akamai.steamstatic.com"], &[]),
        }
    }

    pub fn with(mut self, hosts: &GameHosts) -> Self {
        self.download.extend(hosts.download, hosts.download_suffix);
        self.media.extend(hosts.media, &[]);
        self
    }
}

#[derive(Clone)]
pub struct Http {
    pub client: reqwest::Client,
    pub media: reqwest::Client,
    pub user: reqwest::Client,
    policy: Arc<HttpPolicy>,
}

impl Http {
    pub fn new(policy: HttpPolicy, user_agent: &str) -> Self {
        let policy = Arc::new(policy);
        let p1 = policy.clone();
        let client = reqwest::Client::builder()
            .user_agent(user_agent)
            .https_only(true)
            .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                if attempt.previous().len() >= 8 {
                    attempt.error(tr!("çok fazla yönlendirme", "too many redirects"))
                } else if p1.download.allows(attempt.url()) {
                    attempt.follow()
                } else {
                    let host = attempt.url().host_str().unwrap_or("?").to_string();
                    attempt.error(format!("{}: {host}", tr!("izin verilmeyen sunucuya yönlendirme", "redirect to a disallowed server")))
                }
            }))
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(90))
            .build()
            .expect("HTTP istemcisi kurulamadı");
        let p2 = policy.clone();
        let media = reqwest::Client::builder()
            .user_agent(user_agent)
            .https_only(true)
            .redirect(reqwest::redirect::Policy::custom(move |attempt| {
                if attempt.previous().len() >= 4 || !p2.media.allows(attempt.url()) { attempt.stop() } else { attempt.follow() }
            }))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .expect("HTTP istemcisi kurulamadı");
        let user = reqwest::Client::builder()
            .user_agent(user_agent)
            .https_only(true)
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 8 || attempt.url().scheme() != "https" { attempt.stop() } else { attempt.follow() }
            }))
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(90))
            .build()
            .expect("HTTP istemcisi kurulamadı");
        Http { client, media, user, policy }
    }

    pub fn policy(&self) -> &HttpPolicy {
        &self.policy
    }

    pub fn allowed(&self, url: &Url) -> bool {
        self.policy.download.allows(url)
    }

    pub fn media_allowed(&self, url: &Url) -> bool {
        self.policy.media.allows(url)
    }

    /// Adres izinli bir indirme kaynağı mı? Değilse güvenlik hatası.
    pub fn ensure_allowed(&self, raw: &str) -> AppResult<Url> {
        let url = Url::parse(raw).map_err(|_| AppError::security(format!("{}: {raw}", tr!("geçersiz adres", "invalid address"))))?;
        if !self.allowed(&url) {
            return Err(AppError::security(format!(
                "{} {}",
                url.host_str().unwrap_or("?"),
                tr!("izinli indirme kaynakları arasında değil", "is not an allowed download source")
            )));
        }
        Ok(url)
    }
}

/// Uygulamanın kimliği: tüm isteklerde aynı.
pub fn user_agent(version: &str) -> String {
    format!("Modstead/{version} (mod manager; Windows)")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(list: &HostList, s: &str) -> bool {
        list.allows(&Url::parse(s).unwrap())
    }

    #[test]
    fn core_allowlist() {
        let p = HttpPolicy::core();
        assert!(ok(&p.download, "https://api.nexusmods.com/v1/x"));
        assert!(ok(&p.download, "https://supporter-files.nexus-cdn.com/3174/2006/a.zip"));
        assert!(ok(&p.download, "https://release-assets.githubusercontent.com/x"));
        assert!(!ok(&p.download, "http://api.nexusmods.com/v1/x"));
        assert!(!ok(&p.download, "https://evil-nexus-cdn.com/x"));
        assert!(!ok(&p.download, "https://nexus-cdn.com.evil.io/x"));
        assert!(!ok(&p.download, "https://api.nexusmods.com:8443/x"));
        assert!(!ok(&p.download, "https://example.com/x"));
        assert!(!ok(&p.download, "https://smapi.io/api"));
    }

    #[test]
    fn games_extend_the_list() {
        let p = HttpPolicy::core().with(&GameHosts { download: &["smapi.io"], download_suffix: &[], media: &["images.steamusercontent.com"] });
        assert!(ok(&p.download, "https://smapi.io/api/v4.0.0/mods"));
        assert!(ok(&p.media, "https://images.steamusercontent.com/ugc/1/2/"));
        assert!(!ok(&p.download, "https://images.steamusercontent.com/ugc/1/2/"));
    }
}
