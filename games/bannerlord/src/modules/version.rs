//! TaleWorlds `ApplicationVersion` biçimi: `v1.2.12.77991`, `e1.5.2`, `v1.3.4.*`.

use std::cmp::Ordering;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppVersion {
    /// a: alfa, b: beta, e: erken erişim, v: sürüm, d: geliştirme
    pub kind: char,
    pub parts: Vec<u32>,
    /// `*` ile biten sürüm deseni (yalnızca baştaki parçalar karşılaştırılır).
    pub wildcard: bool,
}

impl AppVersion {
    pub fn parse(raw: &str) -> Option<AppVersion> {
        let s = raw.trim();
        if s.is_empty() {
            return None;
        }
        let mut chars = s.chars();
        let first = chars.next()?;
        let (kind, rest) = if first.is_ascii_alphabetic() {
            (first.to_ascii_lowercase(), chars.as_str())
        } else {
            ('v', s)
        };
        let mut parts = Vec::new();
        let mut wildcard = false;
        for piece in rest.split('.') {
            let piece = piece.trim();
            if piece == "*" {
                wildcard = true;
                break;
            }
            let digits: String = piece.chars().take_while(|c| c.is_ascii_digit()).collect();
            if digits.is_empty() {
                if parts.is_empty() {
                    return None;
                }
                break;
            }
            parts.push(digits.parse::<u32>().unwrap_or(u32::MAX));
            if parts.len() == 4 {
                break;
            }
        }
        if parts.is_empty() && !wildcard {
            return None;
        }
        Some(AppVersion { kind, parts, wildcard })
    }

    fn part(&self, i: usize) -> u32 {
        self.parts.get(i).copied().unwrap_or(0)
    }

    pub fn major_minor(&self) -> (u32, u32) {
        (self.part(0), self.part(1))
    }

    /// Sayısal parçaları karşılaştırır; türü (v/e) yok sayar. Nexus/GitHub sürümleri için.
    pub fn cmp_numbers(&self, other: &AppVersion) -> Ordering {
        for i in 0..4 {
            match self.part(i).cmp(&other.part(i)) {
                Ordering::Equal => continue,
                o => return o,
            }
        }
        Ordering::Equal
    }

    /// Kurulu sürüm bu gereksinimi karşılıyor mu? Gereksinim bir alt sınırdır (BUTR ModuleManager
    /// ile aynı): `v1.0.0.*` "en az 1.0.0, değişiklik numarası fark etmez" demektir.
    pub fn satisfies(installed: &AppVersion, required: &AppVersion) -> bool {
        // Gereksinimde verilmeyen parçalar sıfır kabul edilir; tür farkı (e/v) engel sayılmaz.
        let n = required.parts.len().max(1);
        for i in 0..n {
            match installed.part(i).cmp(&required.part(i)) {
                Ordering::Greater => return true,
                Ordering::Less => return false,
                Ordering::Equal => continue,
            }
        }
        true
    }
}

/// Serbest biçimli sürüm metinlerini karşılaştırır ("2.4.2.248" > "v2.4.2.225").
pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (AppVersion::parse(candidate), AppVersion::parse(current)) {
        (Some(a), Some(b)) => a.cmp_numbers(&b) == Ordering::Greater,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_forms() {
        let v = AppVersion::parse("v1.2.12.77991").unwrap();
        assert_eq!(v.kind, 'v');
        assert_eq!(v.parts, vec![1, 2, 12, 77991]);
        let e = AppVersion::parse("e1.5.2").unwrap();
        assert_eq!(e.kind, 'e');
        let w = AppVersion::parse("v1.3.4.*").unwrap();
        assert!(w.wildcard);
        assert_eq!(w.parts, vec![1, 3, 4]);
        assert_eq!(AppVersion::parse("2.4.2").unwrap().parts, vec![2, 4, 2]);
        assert!(AppVersion::parse("").is_none());
        assert!(AppVersion::parse("all").is_none());
    }

    #[test]
    fn satisfies_rules() {
        let game = AppVersion::parse("v1.2.12.77991").unwrap();
        assert!(AppVersion::satisfies(&game, &AppVersion::parse("v1.2.12").unwrap()));
        assert!(AppVersion::satisfies(&game, &AppVersion::parse("v1.0.0").unwrap()));
        assert!(!AppVersion::satisfies(&game, &AppVersion::parse("v1.3.0").unwrap()));
        assert!(!AppVersion::satisfies(&game, &AppVersion::parse("v1.3.4.*").unwrap()));
        assert!(AppVersion::satisfies(&game, &AppVersion::parse("v1.2.*").unwrap()));
        assert!(AppVersion::satisfies(&game, &AppVersion::parse("v1.0.0.*").unwrap()));
        let harmony = AppVersion::parse("v2.4.2.225").unwrap();
        assert!(AppVersion::satisfies(&harmony, &AppVersion::parse("v2.2.2").unwrap()));
    }

    #[test]
    fn newer_ignores_prefix() {
        assert!(is_newer("2.4.2.248", "v2.4.2.225"));
        assert!(!is_newer("v2.4.2.225", "2.4.2.225"));
        assert!(is_newer("v3.0.3", "v2.13.2.0"));
    }
}
