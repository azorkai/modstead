//! SMAPI'nin anlamsal sürüm kurallarına yakın, hoşgörülü bir sürüm karşılaştırıcısı.
//! "1.2", "1.2.3", "1.6.15.24356", "v2.0.0-beta.3", "1.0.0+build" biçimlerini kabul eder.

use std::cmp::Ordering;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Version {
    parts: [u64; 4],
    pre: Option<String>,
}

impl Version {
    pub fn parse(input: &str) -> Option<Self> {
        let s = input.trim();
        let s = s.strip_prefix(['v', 'V']).unwrap_or(s);
        let s = s.split('+').next()?;
        let (nums, pre) = match s.split_once('-') {
            Some((n, p)) => (n, Some(p)),
            None => (s, None),
        };
        let raw: Vec<&str> = nums.split('.').collect();
        if raw.is_empty() || raw.len() > 4 {
            return None;
        }
        let mut parts = [0u64; 4];
        for (i, p) in raw.iter().enumerate() {
            if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) || p.len() > 18 {
                return None;
            }
            parts[i] = p.parse().ok()?;
        }
        let pre = match pre {
            Some(p) => {
                let p = p.trim();
                if p.is_empty() || !p.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
                    return None;
                }
                Some(p.to_ascii_lowercase())
            }
            None => None,
        };
        Some(Version { parts, pre })
    }
}

fn cmp_pre(a: &str, b: &str) -> Ordering {
    let mut ai = a.split(['.', '-']);
    let mut bi = b.split(['.', '-']);
    loop {
        match (ai.next(), bi.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) => {
                let ord = match (x.parse::<u64>(), y.parse::<u64>()) {
                    (Ok(nx), Ok(ny)) => nx.cmp(&ny),
                    (Ok(_), Err(_)) => Ordering::Less,
                    (Err(_), Ok(_)) => Ordering::Greater,
                    _ => x.cmp(y),
                };
                if ord != Ordering::Equal {
                    return ord;
                }
            }
        }
    }
}

impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        self.parts.cmp(&other.parts).then_with(|| match (&self.pre, &other.pre) {
            (None, None) => Ordering::Equal,
            (None, Some(_)) => Ordering::Greater,
            (Some(_), None) => Ordering::Less,
            (Some(a), Some(b)) => cmp_pre(a, b),
        })
    }
}

impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// İki sürüm metnini karşılaştırır; biri okunamazsa `None` döner.
pub fn compare(a: &str, b: &str) -> Option<Ordering> {
    Some(Version::parse(a)?.cmp(&Version::parse(b)?))
}

/// `installed`, `minimum` gereksinimini karşılıyor mu? Okunamayan sürümler karşılıyor sayılır
/// (yanlış alarm vermektense sessiz kalmak daha iyi).
pub fn satisfies(installed: Option<&str>, minimum: Option<&str>) -> bool {
    match (installed, minimum) {
        (_, None) => true,
        (None, Some(_)) => true,
        (Some(i), Some(m)) => compare(i, m).map(|o| o != Ordering::Less).unwrap_or(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_forms() {
        assert!(Version::parse("1.2").is_some());
        assert!(Version::parse("1.2.3").is_some());
        assert!(Version::parse("v2.0.0-beta.3").is_some());
        assert!(Version::parse("1.6.15.24356").is_some());
        assert!(Version::parse("1.0.0+abc").is_some());
        assert!(Version::parse("").is_none());
        assert!(Version::parse("abc").is_none());
        assert!(Version::parse("1..2").is_none());
    }

    #[test]
    fn orders_correctly() {
        assert_eq!(compare("1.2", "1.2.0"), Some(Ordering::Equal));
        assert_eq!(compare("1.10.0", "1.9.9"), Some(Ordering::Greater));
        assert_eq!(compare("2.0.0-beta", "2.0.0"), Some(Ordering::Less));
        assert_eq!(compare("2.0.0-beta.2", "2.0.0-beta.10"), Some(Ordering::Less));
        assert_eq!(compare("2.0.0-alpha", "2.0.0-beta"), Some(Ordering::Less));
        assert_eq!(compare("1.6.15.1", "1.6.15"), Some(Ordering::Greater));
    }

    #[test]
    fn satisfies_minimum() {
        assert!(satisfies(Some("2.1.0"), Some("2.0")));
        assert!(!satisfies(Some("1.9.0"), Some("2.0")));
        assert!(satisfies(Some("garbage"), Some("2.0")));
        assert!(satisfies(None, Some("2.0")));
    }
}
