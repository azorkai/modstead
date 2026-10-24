//! Güvenli arşiv açma. Her girdinin yolu doğrulanır (`..`, mutlak yol, sürücü harfi, ADS, aygıt
//! adı), sembolik bağlar reddedilir, toplam boyut / girdi sayısı / sıkıştırma oranı sınırlanır ve
//! bildirilen boyuttan fazla veri yazılmaz. Herhangi bir ihlalde arşivin tamamı reddedilir.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::jobs::JobHandle;
use crate::fsx::safe_relative_path;

pub const MAX_TOTAL: u64 = 40 * 1024 * 1024 * 1024; // 40 GiB
pub const MAX_ENTRIES: usize = 250_000;
const MAX_RATIO: u64 = 1_000;
const RATIO_MIN_SIZE: u64 = 64 * 1024 * 1024;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Zip,
    SevenZ,
    Rar,
}

impl Kind {
    pub fn label(self) -> &'static str {
        match self {
            Kind::Zip => "ZIP",
            Kind::SevenZ => "7z",
            Kind::Rar => "RAR",
        }
    }
}

pub fn detect(path: &Path) -> AppResult<Kind> {
    let mut head = [0u8; 8];
    let n = File::open(path)?.read(&mut head)?;
    let h = &head[..n];
    if h.starts_with(b"PK\x03\x04") || h.starts_with(b"PK\x05\x06") {
        Ok(Kind::Zip)
    } else if h.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        Ok(Kind::SevenZ)
    } else if h.starts_with(b"Rar!\x1A\x07") {
        Ok(Kind::Rar)
    } else {
        Err(AppError::msg(tr!("desteklenmeyen dosya türü (yalnızca .zip, .7z ve .rar)", "unsupported file type (only .zip, .7z and .rar)")))
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Stats {
    pub files: u64,
    pub bytes: u64,
}

struct Guard<'a> {
    dest: &'a Path,
    job: &'a JobHandle,
    seen: HashSet<String>,
    stats: Stats,
    declared_total: u64,
}

impl<'a> Guard<'a> {
    fn new(dest: &'a Path, job: &'a JobHandle, declared_total: u64) -> Self {
        Guard { dest, job, seen: HashSet::new(), stats: Stats::default(), declared_total }
    }

    fn target(&mut self, name: &str) -> AppResult<PathBuf> {
        let rel = safe_relative_path(name)
            .ok_or_else(|| AppError::security(format!("{}: {name}", tr!("arşiv güvensiz bir yol içeriyor", "the archive contains an unsafe path"))))?;
        if self.seen.len() >= MAX_ENTRIES {
            return Err(AppError::security(tr!("arşivde çok fazla dosya var", "the archive contains too many files")));
        }
        self.seen.insert(rel.to_string_lossy().to_lowercase());
        Ok(self.dest.join(rel))
    }

    /// `limit` bayttan fazla yazmayı reddederek kopyalar.
    fn write(&mut self, target: &Path, reader: &mut dyn Read, limit: u64) -> AppResult<()> {
        if let Some(p) = target.parent() {
            fs::create_dir_all(p)?;
        }
        if target.exists() && crate::fsx::is_link(target) {
            return Err(AppError::security(tr!("hedefte bağ var", "the target is a link")));
        }
        let mut out = io::BufWriter::with_capacity(1 << 20, File::create(target)?);
        let mut buf = vec![0u8; 256 * 1024];
        let mut written = 0u64;
        loop {
            self.job.check()?;
            let n = reader.read(&mut buf).map_err(map_io)?;
            if n == 0 {
                break;
            }
            written += n as u64;
            if written > limit {
                return Err(AppError::security(tr!("arşivdeki bir dosya bildirilen boyutundan büyük", "a file in the archive is larger than its declared size")));
            }
            self.stats.bytes += n as u64;
            if self.stats.bytes > MAX_TOTAL {
                return Err(AppError::security(tr!("arşivin açılmış boyutu sınırı aşıyor", "the archive's extracted size exceeds the limit")));
            }
            out.write_all(&buf[..n]).map_err(map_io)?;
            self.job.progress(self.stats.bytes, Some(self.declared_total.max(self.stats.bytes)));
        }
        out.flush().map_err(map_io)?;
        self.stats.files += 1;
        Ok(())
    }
}

/// Defender gerçek zamanlı koruması dosyayı engellerse Windows 225 döndürür.
fn map_io(e: io::Error) -> AppError {
    match e.raw_os_error() {
        Some(225) | Some(226) => AppError::security(tr!("Microsoft Defender arşivdeki bir dosyayı zararlı buldu ve engelledi", "Microsoft Defender flagged a file in the archive as malicious and blocked it")),
        _ => AppError::Io(e),
    }
}

fn check_ratio(name: &str, size: u64, compressed: u64) -> AppResult<()> {
    if size > RATIO_MIN_SIZE && size / compressed.max(1) > MAX_RATIO {
        return Err(AppError::security(format!("{}: {name}", tr!("olağandışı sıkıştırma oranı (sıkıştırma bombası?)", "abnormal compression ratio (zip bomb?)"))));
    }
    Ok(())
}

pub fn extract(path: &Path, kind: Kind, dest: &Path, job: &JobHandle) -> AppResult<Stats> {
    fs::create_dir_all(dest)?;
    match kind {
        Kind::Zip => extract_zip(path, dest, job),
        Kind::SevenZ => extract_7z(path, dest, job),
        Kind::Rar => extract_rar(path, dest, job),
    }
}

fn extract_zip(path: &Path, dest: &Path, job: &JobHandle) -> AppResult<Stats> {
    let mut zip = zip::ZipArchive::new(File::open(path)?)
        .map_err(|e| AppError::msg(format!("{}: {e}", tr!("ZIP okunamadı", "could not read ZIP"))))?;
    if zip.len() > MAX_ENTRIES {
        return Err(AppError::security(tr!("arşivde çok fazla dosya var", "the archive contains too many files")));
    }
    // Önce tüm başlıkları denetle, sonra aç: yarım kalmış güvensiz çıkarma olmasın.
    let zip_name = |f: &zip::read::ZipFile<'_, File>| -> AppResult<String> {
        f.name()
            .map(|n| n.into_owned())
            .map_err(|e| AppError::security(format!("{}: {e}", tr!("ZIP girdisinin adı okunamadı", "could not read ZIP entry name"))))
    };
    let mut declared = 0u64;
    for i in 0..zip.len() {
        let f = zip.by_index_raw(i).map_err(|e| AppError::msg(format!("{}: {e}", tr!("ZIP girdisi okunamadı", "could not read ZIP entry"))))?;
        let name = zip_name(&f)?;
        if f.is_symlink() {
            return Err(AppError::security(format!("{}: {name}", tr!("arşiv sembolik bağ içeriyor", "the archive contains a symbolic link"))));
        }
        if f.encrypted() {
            return Err(AppError::msg(tr!("şifreli arşivler desteklenmiyor", "encrypted archives are not supported")));
        }
        if safe_relative_path(&name).is_none() && !name.replace('\\', "/").trim_matches('/').is_empty() {
            return Err(AppError::security(format!("{}: {name}", tr!("arşiv güvensiz bir yol içeriyor", "the archive contains an unsafe path"))));
        }
        check_ratio(&name, f.size(), f.compressed_size())?;
        declared = declared.saturating_add(f.size());
    }
    if declared > MAX_TOTAL {
        return Err(AppError::security(tr!("arşivin açılmış boyutu sınırı aşıyor", "the archive's extracted size exceeds the limit")));
    }
    let mut g = Guard::new(dest, job, declared);
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| AppError::msg(format!("{}: {e}", tr!("ZIP girdisi açılamadı", "could not open ZIP entry"))))?;
        let name = zip_name(&f)?;
        if name.replace('\\', "/").trim_matches('/').is_empty() {
            continue;
        }
        let target = g.target(&name)?;
        if f.is_dir() {
            fs::create_dir_all(&target)?;
            continue;
        }
        let limit = f.size();
        g.write(&target, &mut f, limit)?;
    }
    Ok(g.stats)
}

fn extract_7z(path: &Path, dest: &Path, job: &JobHandle) -> AppResult<Stats> {
    use sevenz_rust2::{ArchiveReader, Password};
    let mut reader = ArchiveReader::open(path, Password::empty()).map_err(|e| {
        let s = e.to_string();
        if s.to_lowercase().contains("password") {
            AppError::msg(tr!("şifreli arşivler desteklenmiyor", "encrypted archives are not supported"))
        } else {
            AppError::msg(format!("{}: {s}", tr!("7z okunamadı", "could not read 7z")))
        }
    })?;
    let entries = reader.archive().files.clone();
    if entries.len() > MAX_ENTRIES {
        return Err(AppError::security(tr!("arşivde çok fazla dosya var", "the archive contains too many files")));
    }
    let mut declared = 0u64;
    for e in &entries {
        if e.is_anti_item() {
            continue;
        }
        if safe_relative_path(e.name()).is_none() {
            return Err(AppError::security(format!("{}: {}", tr!("arşiv güvensiz bir yol içeriyor", "the archive contains an unsafe path"), e.name())));
        }
        let attrs = e.windows_attributes();
        let unix_mode = attrs >> 16;
        if attrs & FILE_ATTRIBUTE_REPARSE_POINT != 0 || (attrs & 0x8000 != 0 && unix_mode & 0o170000 == 0o120000) {
            return Err(AppError::security(format!("{}: {}", tr!("arşiv sembolik bağ içeriyor", "the archive contains a symbolic link"), e.name())));
        }
        declared = declared.saturating_add(e.size());
    }
    if declared > MAX_TOTAL {
        return Err(AppError::security(tr!("arşivin açılmış boyutu sınırı aşıyor", "the archive's extracted size exceeds the limit")));
    }
    let mut g = Guard::new(dest, job, declared);
    let mut failure: Option<AppError> = None;
    let result = reader.for_each_entries(|entry, rd| {
        if entry.is_anti_item() {
            return Ok(true);
        }
        let step = (|| -> AppResult<()> {
            let target = g.target(entry.name())?;
            if entry.is_directory() {
                fs::create_dir_all(&target)?;
                return Ok(());
            }
            g.write(&target, rd, entry.size())
        })();
        match step {
            Ok(()) => Ok(true),
            Err(e) => {
                failure = Some(e);
                Ok(false)
            }
        }
    });
    if let Some(e) = failure {
        return Err(e);
    }
    result.map_err(|e| AppError::msg(format!("{}: {e}", tr!("7z açılamadı", "could not extract 7z"))))?;
    Ok(g.stats)
}

fn extract_rar(path: &Path, dest: &Path, job: &JobHandle) -> AppResult<Stats> {
    let rar_err = |e: unrar::error::UnrarError| AppError::msg(format!("{}: {e}", tr!("RAR okunamadı", "could not read RAR")));
    // İlk geçiş: yalnızca başlıklar.
    let mut declared = 0u64;
    let mut count = 0usize;
    let listing = unrar::Archive::new(path).open_for_listing().map_err(rar_err)?;
    for entry in listing {
        let entry = entry.map_err(rar_err)?;
        let name = entry.filename.to_string_lossy().into_owned();
        if entry.is_encrypted() {
            return Err(AppError::msg(tr!("şifreli arşivler desteklenmiyor", "encrypted archives are not supported")));
        }
        if safe_relative_path(&name).is_none() {
            return Err(AppError::security(format!("{}: {name}", tr!("arşiv güvensiz bir yol içeriyor", "the archive contains an unsafe path"))));
        }
        if entry.file_attr & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(AppError::security(format!("{}: {name}", tr!("arşiv sembolik bağ içeriyor", "the archive contains a symbolic link"))));
        }
        declared = declared.saturating_add(entry.unpacked_size);
        count += 1;
        if count > MAX_ENTRIES || declared > MAX_TOTAL {
            return Err(AppError::security(tr!("arşiv sınırları aşıyor", "the archive exceeds the limits")));
        }
    }
    let mut g = Guard::new(dest, job, declared);
    let mut archive = unrar::Archive::new(path).open_for_processing().map_err(rar_err)?;
    while let Some(header) = archive.read_header().map_err(rar_err)? {
        job.check()?;
        let entry = header.entry();
        let name = entry.filename.to_string_lossy().into_owned();
        let target = g.target(&name)?;
        if entry.is_directory() {
            fs::create_dir_all(&target)?;
            archive = header.skip().map_err(rar_err)?;
            continue;
        }
        if let Some(p) = target.parent() {
            fs::create_dir_all(p)?;
        }
        let size = entry.unpacked_size;
        archive = header.extract_to(&target).map_err(rar_err)?;
        // unrar dosyayı kendisi yazar; sonucu denetle.
        let meta = fs::symlink_metadata(&target)?;
        if meta.file_type().is_symlink() || crate::fsx::is_link(&target) {
            let _ = fs::remove_file(&target);
            return Err(AppError::security(format!("{}: {name}", tr!("arşiv sembolik bağ içeriyor", "the archive contains a symbolic link"))));
        }
        if meta.len() > size {
            return Err(AppError::security(tr!("arşivdeki bir dosya bildirilen boyutundan büyük", "a file in the archive is larger than its declared size")));
        }
        g.stats.files += 1;
        g.stats.bytes += meta.len();
        job.progress(g.stats.bytes, Some(declared.max(g.stats.bytes)));
    }
    Ok(g.stats)
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;

    fn make_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut w = zip::ZipWriter::new(File::create(path).unwrap());
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, data) in entries {
            w.start_file(*name, opts).unwrap();
            w.write_all(data).unwrap();
        }
        w.finish().unwrap();
    }

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("modstead-archive-{name}-{}", crate::fsx::short_id()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn extracts_normal_zip() {
        let dir = temp("ok");
        let zip_path = dir.join("a.zip");
        make_zip(&zip_path, &[("Mod/manifest.json", b"{}"), ("Mod/a.txt", b"hello")]);
        assert_eq!(detect(&zip_path).unwrap(), Kind::Zip);
        let out = dir.join("x");
        let stats = extract(&zip_path, Kind::Zip, &out, &JobHandle::detached("t")).unwrap();
        assert_eq!(stats.files, 2);
        assert_eq!(fs::read(out.join("Mod").join("a.txt")).unwrap(), b"hello");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_zip_slip_before_writing_anything() {
        let dir = temp("slip");
        let zip_path = dir.join("evil.zip");
        make_zip(&zip_path, &[("ok.txt", b"1"), ("../evil.txt", b"2")]);
        let out = dir.join("x");
        assert!(matches!(extract(&zip_path, Kind::Zip, &out, &JobHandle::detached("t")), Err(AppError::Security(_))));
        assert!(!out.join("ok.txt").exists(), "güvensiz arşivden hiçbir dosya yazılmamalı");
        assert!(!dir.join("evil.txt").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detects_type_by_signature_not_extension() {
        let dir = temp("sig");
        let fake = dir.join("fake.zip");
        fs::write(&fake, b"MZ not an archive").unwrap();
        assert!(detect(&fake).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
