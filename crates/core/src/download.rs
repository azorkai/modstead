//! Akışlı indirme: boyut sınırı, iptal, SHA-256 ve MD5 aynı geçişte hesaplanır.

use std::path::{Path, PathBuf};

use futures_util::StreamExt;
use md5::Md5;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use url::Url;

use crate::error::{AppError, AppResult};
use crate::http::Http;
use crate::jobs::JobHandle;

pub const MAX_DOWNLOAD: u64 = 24 * 1024 * 1024 * 1024; // 24 GiB

#[derive(Clone, Debug)]
pub struct Downloaded {
    pub path: PathBuf,
    pub size: u64,
    pub sha256: String,
    pub md5: String,
    /// Yönlendirmelerden sonraki son adres (yerel dosyada `None`).
    pub final_url: Option<String>,
}

/// İzinli bir kaynaktan indirir (adres ve tüm yönlendirmeler izin listesinde olmalı).
pub async fn download(http: &Http, url: Url, dest: &Path, expected_size: Option<u64>, job: &JobHandle) -> AppResult<Downloaded> {
    if !http.allowed(&url) {
        return Err(AppError::security(tr!("indirme adresi izinli kaynaklardan değil", "the download address is not an allowed source")));
    }
    let resp = http.client.get(url).send().await?;
    if !http.allowed(resp.url()) {
        return Err(AppError::security(tr!(
            "indirme izinli olmayan bir sunucuya yönlendi",
            "the download was redirected to a disallowed server"
        )));
    }
    stream_to_file(resp, dest, expected_size, job).await
}

/// Kullanıcının açıkça verdiği bir adresten indirir (izin listesi yok, yalnızca HTTPS).
/// Sonuç her zaman kaynak güveni etiketiyle incelemeye düşmelidir.
pub async fn download_user_url(http: &Http, url: Url, dest: &Path, job: &JobHandle) -> AppResult<Downloaded> {
    if url.scheme() != "https" {
        return Err(AppError::security(tr!("yalnızca https adresleri desteklenir", "only https addresses are supported")));
    }
    let resp = http.user.get(url).send().await?;
    if resp.url().scheme() != "https" {
        return Err(AppError::security(tr!("indirme güvensiz bir adrese yönlendi", "the download was redirected to an insecure address")));
    }
    stream_to_file(resp, dest, None, job).await
}

async fn stream_to_file(resp: reqwest::Response, dest: &Path, expected_size: Option<u64>, job: &JobHandle) -> AppResult<Downloaded> {
    let final_url = Some(resp.url().to_string());
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::Network(format!("{}: {status}", tr!("indirme başarısız", "download failed"))));
    }
    let total = resp.content_length().or(expected_size);
    if total.is_some_and(|t| t > MAX_DOWNLOAD) {
        return Err(AppError::security(tr!("dosya izin verilen boyuttan büyük", "the file is larger than allowed")));
    }
    if let (Some(t), Some(e)) = (resp.content_length(), expected_size) {
        if e > 0 && t != e {
            return Err(AppError::security(tr!(
                format!("sunucunun bildirdiği boyut ({t}) beklenenle ({e}) uyuşmuyor"),
                format!("the size reported by the server ({t}) does not match the expected size ({e})")
            )));
        }
    }
    if let Some(p) = dest.parent() {
        tokio::fs::create_dir_all(p).await?;
    }
    let mut file = tokio::fs::File::create(dest).await?;
    let mut sha = Sha256::new();
    let mut md5 = Md5::new();
    let mut received = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        job.check()?;
        let chunk = chunk?;
        received += chunk.len() as u64;
        if received > MAX_DOWNLOAD || total.is_some_and(|t| received > t) {
            return Err(AppError::security(tr!("sunucu bildirilenden fazla veri gönderdi", "the server sent more data than declared")));
        }
        sha.update(&chunk);
        md5.update(&chunk);
        file.write_all(&chunk).await?;
        job.progress(received, total);
    }
    file.flush().await?;
    file.sync_all().await?;
    drop(file);
    if let Some(t) = total {
        if received != t {
            return Err(AppError::Network(tr!(
                format!("indirme yarım kaldı ({received}/{t} bayt)"),
                format!("download incomplete ({received}/{t} bytes)")
            )));
        }
    }
    Ok(Downloaded { path: dest.to_path_buf(), size: received, sha256: hex::encode(sha.finalize()), md5: hex::encode(md5.finalize()), final_url })
}

/// Yerel bir arşivi karantina klasörüne kopyalarken özetlerini hesaplar (kopya doğrulanır;
/// kullanıcının dosyası sonradan değişse bile etkilenmez).
pub async fn import_local(src: &Path, dest: &Path, job: &JobHandle) -> AppResult<Downloaded> {
    let meta = tokio::fs::metadata(src).await?;
    if !meta.is_file() {
        return Err(AppError::msg(tr!("seçilen yol bir dosya değil", "the selected path is not a file")));
    }
    if meta.len() > MAX_DOWNLOAD {
        return Err(AppError::security(tr!("dosya izin verilen boyuttan büyük", "the file is larger than allowed")));
    }
    if let Some(p) = dest.parent() {
        tokio::fs::create_dir_all(p).await?;
    }
    let mut input = tokio::fs::File::open(src).await?;
    let mut out = tokio::fs::File::create(dest).await?;
    let mut sha = Sha256::new();
    let mut md5 = Md5::new();
    let mut buf = vec![0u8; 512 * 1024];
    let mut n_total = 0u64;
    loop {
        job.check()?;
        let n = input.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        n_total += n as u64;
        sha.update(&buf[..n]);
        md5.update(&buf[..n]);
        out.write_all(&buf[..n]).await?;
        job.progress(n_total, Some(meta.len()));
    }
    out.flush().await?;
    Ok(Downloaded { path: dest.to_path_buf(), size: n_total, sha256: hex::encode(sha.finalize()), md5: hex::encode(md5.finalize()), final_url: None })
}

/// Dosyanın SHA-256 özeti (DLL'ler için; inceleme ekranında ve VirusTotal bağlantısında).
pub fn sha256_file(path: &Path) -> AppResult<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(hex::encode(h.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_files() {
        let dir = std::env::temp_dir().join(format!("modstead-hash-{}", crate::fsx::short_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.txt");
        std::fs::write(&p, b"abc").unwrap();
        assert_eq!(sha256_file(&p).unwrap(), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn imports_local_files_with_both_hashes() {
        let dir = std::env::temp_dir().join(format!("modstead-import-{}", crate::fsx::short_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("src.zip");
        std::fs::write(&src, b"abc").unwrap();
        let d = import_local(&src, &dir.join("q").join("copy.zip"), &JobHandle::detached("t")).await.unwrap();
        assert_eq!(d.size, 3);
        assert_eq!(d.md5, "900150983cd24fb0d6963f7d28e17f72");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
