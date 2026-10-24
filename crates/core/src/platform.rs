//! Windows'a özgü küçük yardımcılar: konsolsuz komut, süreç listesi, PE dosya sürümü, boş disk
//! alanı. Diğer platformlarda güvenli boş dönüşler verir.

use std::path::Path;
use std::process::Command;

/// Windows'ta konsol penceresi açmadan çalışan komut (kullanıcı ekranında pencere yanıp sönmez).
pub fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Aynısının tokio sürümü (uzun süren dış araçlar için; ör. Defender).
pub fn hidden_command_async(program: impl AsRef<std::ffi::OsStr>) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Oyun başlatma adresini (`steam://…`, `shell:AppsFolder\…`) Windows kabuğuyla açar.
/// Yalnızca bu iki şema kabul edilir; konsol penceresi açılmaz (explorer bir GUI sürecidir).
pub fn open_launch_uri(uri: &str) -> std::io::Result<()> {
    let lower = uri.to_ascii_lowercase();
    if !(lower.starts_with("steam://rungameid/") || lower.starts_with("steam://run/") || lower.starts_with("shell:appsfolder\\")) {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "desteklenmeyen başlatma adresi"));
    }
    Command::new("explorer.exe").arg(uri).spawn().map(|_| ())
}

#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// Çalışan süreçlerin adları (küçük harf, ör. `flightsimulator2024.exe`).
#[cfg(windows)]
pub fn running_processes() -> Vec<String> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS};
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                out.push(String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase());
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
    }
    out
}

#[cfg(not(windows))]
pub fn running_processes() -> Vec<String> {
    Vec::new()
}

/// Verilen adlardan biriyle çalışan süreç var mı? (büyük/küçük harf duyarsız)
pub fn process_running(names: &[&str]) -> bool {
    let procs = running_processes();
    names.iter().any(|n| {
        let n = n.to_lowercase();
        procs.iter().any(|p| *p == n)
    })
}

/// PE dosyasının FileVersion bilgisini (a.b.c.d) okur.
#[cfg(windows)]
pub fn file_version(path: &Path) -> Option<[u16; 4]> {
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW};
    let p = wide(&path.to_string_lossy());
    unsafe {
        let mut handle = 0u32;
        let size = GetFileVersionInfoSizeW(p.as_ptr(), &mut handle);
        if size == 0 {
            return None;
        }
        let mut buf = vec![0u8; size as usize];
        if GetFileVersionInfoW(p.as_ptr(), 0, size, buf.as_mut_ptr().cast()) == 0 {
            return None;
        }
        let mut info: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let root = wide("\\");
        if VerQueryValueW(buf.as_ptr().cast(), root.as_ptr(), &mut info, &mut len) == 0 || info.is_null() {
            return None;
        }
        let fi = &*(info as *const VS_FIXEDFILEINFO);
        if fi.dwSignature != 0xFEEF04BD {
            return None;
        }
        Some([
            (fi.dwFileVersionMS >> 16) as u16,
            (fi.dwFileVersionMS & 0xFFFF) as u16,
            (fi.dwFileVersionLS >> 16) as u16,
            (fi.dwFileVersionLS & 0xFFFF) as u16,
        ])
    }
}

#[cfg(not(windows))]
pub fn file_version(_path: &Path) -> Option<[u16; 4]> {
    None
}

/// `[1, 6, 15, 24356]` → "1.6.15" (dördüncü parça yalnızca `keep_fourth` ve sıfır değilse).
pub fn format_version(v: [u16; 4], keep_fourth: bool) -> String {
    if keep_fourth && v[3] != 0 { format!("{}.{}.{}.{}", v[0], v[1], v[2], v[3]) } else { format!("{}.{}.{}", v[0], v[1], v[2]) }
}

/// GRPICONDIR'deki en büyük (eşitse en çok bitli) simgenin kaynak kimliği ve ICO girdisinin ilk 12 baytı.
fn best_icon_entry(group: &[u8]) -> Option<(u16, [u8; 12])> {
    let count = u16::from_le_bytes([*group.get(4)?, *group.get(5)?]) as usize;
    let mut best: Option<((u32, u16), u16, [u8; 12])> = None;
    for i in 0..count {
        let e = group.get(6 + i * 14..6 + i * 14 + 14)?;
        let side = |b: u8| if b == 0 { 256 } else { b as u32 };
        let key = (side(e[0]) * side(e[1]), u16::from_le_bytes([e[6], e[7]]));
        let mut entry = [0u8; 12];
        entry.copy_from_slice(&e[..12]);
        if best.as_ref().is_none_or(|b| key > b.0) {
            best = Some((key, u16::from_le_bytes([e[12], e[13]]), entry));
        }
    }
    best.map(|b| (b.1, b.2))
}

/// Bir .exe/.dll'in uygulama simgesini en büyük boyutuyla çıkarır: PNG ya da tek görselli ICO baytları
/// ve MIME türü. Dosya yalnızca veri olarak açılır; kod çalıştırılmaz.
#[cfg(windows)]
pub fn exe_icon(path: &Path) -> Option<(Vec<u8>, &'static str)> {
    use windows_sys::Win32::Foundation::{FreeLibrary, HMODULE};
    use windows_sys::Win32::System::LibraryLoader::{
        EnumResourceNamesW, FindResourceW, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE, LoadLibraryExW, LoadResource, LockResource,
        SizeofResource,
    };
    use windows_sys::core::{BOOL, PCWSTR};
    const RT_ICON: PCWSTR = 3 as PCWSTR;
    const RT_GROUP_ICON: PCWSTR = 14 as PCWSTR;

    unsafe fn resource(module: HMODULE, name: PCWSTR, kind: PCWSTR) -> Option<Vec<u8>> {
        unsafe {
            let res = FindResourceW(module, name, kind);
            if res.is_null() {
                return None;
            }
            let size = SizeofResource(module, res) as usize;
            let handle = LoadResource(module, res);
            if handle.is_null() || size == 0 {
                return None;
            }
            let ptr = LockResource(handle) as *const u8;
            if ptr.is_null() {
                return None;
            }
            Some(std::slice::from_raw_parts(ptr, size).to_vec())
        }
    }

    // İlk simge grubunu alır ve numaralandırmayı durdurur (ad işaretçisi yalnızca geri çağrı içinde geçerli).
    unsafe extern "system" fn first_group(module: HMODULE, _kind: PCWSTR, name: PCWSTR, out: isize) -> BOOL {
        unsafe {
            *(out as *mut Option<Vec<u8>>) = resource(module, name, RT_GROUP_ICON);
        }
        0
    }

    let file = wide(&path.to_string_lossy());
    let (bytes, entry) = unsafe {
        let module = LoadLibraryExW(file.as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE);
        if module.is_null() {
            return None;
        }
        let mut group: Option<Vec<u8>> = None;
        EnumResourceNamesW(module, RT_GROUP_ICON, Some(first_group), &mut group as *mut _ as isize);
        let found = group
            .as_deref()
            .and_then(best_icon_entry)
            .and_then(|(id, entry)| resource(module, id as usize as PCWSTR, RT_ICON).map(|b| (b, entry)));
        FreeLibrary(module);
        found?
    };
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some((bytes, "image/png"));
    }
    // Sıkıştırılmamış DIB: tek görselli bir ICO dosyasına sar (tarayıcılar ICO'yu gösterir).
    let mut ico = Vec::with_capacity(22 + bytes.len());
    ico.extend_from_slice(&[0, 0, 1, 0, 1, 0]);
    ico.extend_from_slice(&entry);
    ico.extend_from_slice(&22u32.to_le_bytes());
    ico.extend_from_slice(&bytes);
    Some((ico, "image/x-icon"))
}

#[cfg(not(windows))]
pub fn exe_icon(_path: &Path) -> Option<(Vec<u8>, &'static str)> {
    None
}

/// Yolun bulunduğu birimdeki boş alan (bayt). Yol yoksa ilk var olan üst klasöre bakar.
#[cfg(windows)]
pub fn disk_free(path: &Path) -> Option<u64> {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let existing = path.ancestors().find(|p| p.exists())?;
    let p = wide(&existing.to_string_lossy());
    let mut free = 0u64;
    let ok = unsafe { GetDiskFreeSpaceExW(p.as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut()) };
    (ok != 0).then_some(free)
}

#[cfg(not(windows))]
pub fn disk_free(_path: &Path) -> Option<u64> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_versions() {
        assert_eq!(format_version([1, 6, 15, 24356], false), "1.6.15");
        assert_eq!(format_version([4, 5, 2, 7], true), "4.5.2.7");
        assert_eq!(format_version([4, 5, 2, 0], true), "4.5.2");
    }

    #[cfg(windows)]
    #[test]
    fn sees_own_process() {
        assert!(!running_processes().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn extracts_exe_icons() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| r"C:\Windows".into());
        let (bytes, mime) = exe_icon(&Path::new(&windir).join("explorer.exe")).expect("explorer.exe simgesi");
        assert!(bytes.len() > 1000);
        assert!(mime == "image/png" || (mime == "image/x-icon" && bytes.starts_with(&[0, 0, 1, 0, 1, 0])));
        assert!(exe_icon(&Path::new(&windir).join("yok-boyle-bir-dosya.exe")).is_none());
    }

    #[test]
    fn picks_largest_icon_entry() {
        // 2 girdi: 32×32 (id 1) ve 256×256 (genişlik 0 = 256, id 7)
        let mut g = vec![0, 0, 1, 0, 2, 0];
        g.extend_from_slice(&[32, 32, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 1, 0]);
        g.extend_from_slice(&[0, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 7, 0]);
        assert_eq!(best_icon_entry(&g).map(|e| e.0), Some(7));
    }
}
