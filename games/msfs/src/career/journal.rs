//! Kariyer günlüğü: simle konuşmanın, uçuş başlatmanın ve takibin ayrıntılı, sürekli kaydı. Bir şey ters
//! gidince "ne oldu" sorusunun cevabı buradadır: bağlantı, her başlatma adımı, simin akış ve sistem olayları,
//! kamera değişimleri, uçuşta/menüde geçişleri, ışınlamalar, gönderilen tuş olayları, SimConnect istisnaları,
//! takip evreleri, cezalar ve kullanıcının komutları.
//!
//! Dosya: `<önbellek>/career/logs/career.log`. 4 MB'yi geçince döner; iki eski kopya tutulur.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_BYTES: u64 = 4_000_000;
/// career.log + career.1.log + career.2.log
const KEEP: usize = 3;

pub struct Journal {
    path: PathBuf,
    file: Mutex<Option<File>>,
}

impl Journal {
    pub fn new(dir: &Path) -> Self {
        let _ = std::fs::create_dir_all(dir);
        Journal { path: dir.join("career.log"), file: Mutex::new(None) }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn numbered(&self, i: usize) -> PathBuf {
        if i == 0 { self.path.clone() } else { self.path.with_file_name(format!("career.{i}.log")) }
    }

    fn open(&self) -> Option<File> {
        OpenOptions::new().create(true).append(true).open(&self.path).ok()
    }

    /// Bir satır yazar: `2026-10-25 16:40:12.345 [alan] ileti`.
    pub fn write(&self, area: &str, msg: &str) {
        let line = format!("{} [{area}] {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f"), msg.replace('\n', " | "));
        let mut f = self.file.lock().unwrap_or_else(|e| e.into_inner());
        if f.is_none() {
            *f = self.open();
        }
        if f.as_ref().and_then(|x| x.metadata().ok()).is_some_and(|m| m.len() > MAX_BYTES) {
            *f = None;
            for i in (1..KEEP).rev() {
                let _ = std::fs::rename(self.numbered(i - 1), self.numbered(i));
            }
            *f = self.open();
        }
        if let Some(file) = f.as_mut() {
            let _ = file.write_all(line.as_bytes());
        }
    }

    /// Son `n` satır (eskiden yeniye).
    pub fn tail(&self, n: usize) -> Vec<String> {
        let text = std::fs::read(&self.path).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
        let lines: Vec<&str> = text.lines().collect();
        lines[lines.len().saturating_sub(n)..].iter().map(|s| s.to_string()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_tails_and_rotates() {
        let dir = std::env::temp_dir().join(format!("modstead-journal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let j = Journal::new(&dir);
        j.write("test", "bir");
        j.write("test", "iki\nsatır");
        let t = j.tail(5);
        assert_eq!(t.len(), 2);
        assert!(t[0].ends_with("[test] bir") && t[1].ends_with("[test] iki | satır"), "{t:?}");

        // Döndürme: sınırı aşan dosya career.1.log olur, yenisi baştan başlar.
        drop(j);
        std::fs::write(dir.join("career.log"), vec![b'x'; MAX_BYTES as usize + 1]).unwrap();
        let j = Journal::new(&dir);
        j.write("test", "yeni");
        assert!(dir.join("career.1.log").is_file());
        assert_eq!(j.tail(5).len(), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
