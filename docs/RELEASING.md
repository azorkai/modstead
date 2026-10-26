# Releasing Modstead

Modstead's Windows installer is built only by GitHub Actions, by the
[Release workflow](../.github/workflows/release.yml) on a GitHub-hosted Windows runner. Release builds are not made
on developer machines: every published installer comes from a tagged commit and a public build log.

## What users download

Every release has these files:

| File | What it is |
|---|---|
| `Modstead-setup-x64.exe` | The NSIS installer for Windows 10/11 (x64). The name never changes, so links to the latest release keep working. |
| `Modstead_<version>_x64-setup.exe` | The same file with the version in its name. |
| `SHA256SUMS.txt` | SHA-256 checksums of both installers. |
| `latest.json` | The update manifest that installed copies of Modstead read (see [Updates](#updates)). |

Stable links (they always point at the newest published release; drafts and pre-releases are skipped):

- Installer: `https://github.com/azorkai/modstead/releases/latest/download/Modstead-setup-x64.exe`
- Checksums: `https://github.com/azorkai/modstead/releases/latest/download/SHA256SUMS.txt`
- Release page: `https://github.com/azorkai/modstead/releases/latest`

The installer installs Modstead for the current user (no administrator rights) and downloads Microsoft Edge WebView2
if it is missing. From the first release with the updater on, Modstead updates itself (see [Updates](#updates));
Modstead 0.1.0 has no updater, so its users install a newer release over it once.

## Cut a release

1. **Bump the version.** The same version must be in every file; the workflow stops otherwise.
   ```bash
   npm version 0.2.0 --no-git-tag-version   # package.json and package-lock.json
   # Cargo.toml: [workspace.package] version = "0.2.0"   (every crate inherits it)
   # src-tauri/tauri.conf.json: "version": "0.2.0"
   cargo update --workspace                 # writes the new version into Cargo.lock, nothing else
   node scripts/release-check.mjs v0.2.0    # must print "Tag v0.2.0 matches."
   ```
2. **Commit and merge** the bump into `main`.
3. **Tag the commit on `main` and push the tag.** The tag's message becomes the notes that the in-app update dialog
   shows, so give it a short summary after the title:
   ```bash
   git tag -a v0.2.0 -m "Modstead 0.2.0" -m "What changed, in a sentence or two."
   git push origin v0.2.0
   ```
4. **Wait for the workflow.** Actions → *Release* builds the installer (a clean release build takes a while), then
   creates a **draft** release for the tag with the files above and release notes. It fails early, before building,
   if the tag and the versions in the files differ or the updater configuration is broken.
5. **Review the draft** under Releases: read and edit the notes, download the installer, check its SHA-256 (below),
   install it on a Windows machine and start Modstead.
6. **Publish** the draft and keep *Set as the latest release* checked. From then on the stable links above point at
   this release, and installed copies find the update the next time they check (shortly after they start, then every
   six hours).

A version with a pre-release part, such as `0.2.0-beta.1` (tag `v0.2.0-beta.1`), is created as a pre-release. The
stable `latest` links keep pointing at the last full release, so installed copies are never offered a pre-release.

**If the workflow fails,** fix the cause on `main`, then either move the tag (`git tag -d v0.2.0`,
`git push origin :refs/tags/v0.2.0`, tag again and push) or run the workflow by hand on the tag (Actions → Release →
*Run workflow* → choose the tag). A run on a tag that already has a draft replaces the draft's files and leaves its
notes alone. A published release is never overwritten: release a new version instead.

**Dry run:** run the workflow by hand on a branch. It builds and signs the installer and attaches the installers, checksums and
signature to the run as the `modstead-windows-x64` artifact, without creating a release (`latest.json` is written
only for a tag).

## Updates

Installed copies of Modstead update themselves with Tauri's updater plugin, and every update is signed.

**How it works** (`src-tauri/src/updater.rs`):

1. About a minute after it starts and then every six hours, Modstead reads
   `https://github.com/azorkai/modstead/releases/latest/download/latest.json`. That link always resolves to the newest
   published full release (drafts and pre-releases are skipped), and Modstead also ignores versions with a
   pre-release part. Users can turn the background check off, and check by hand, in Settings → Updates.
2. If the manifest announces a newer version, Modstead downloads the installer it points at (only files under this
   repository's `releases/download/` are accepted) and verifies its signature with the public key built into the
   app. The signature also records the version it was made for; Modstead rejects an installer whose signed version
   differs from the announced one, so an older genuine installer cannot be passed off as a new one.
3. Once the download is verified, Modstead shows *Update ready · Restart* and keeps a button in the top bar. Nothing is
   installed until the user clicks **Restart**; if they don't, the update is offered again on the next start.
4. Modstead does not restart while a game reports that it is busy (MSFS: the sim is open, or a career flight is being
   started or tracked) or while downloads are running. On **Restart** the installer runs in passive mode (a progress
   bar, no questions), replaces the app and starts it again. Settings and game data are kept.

**What the workflow does:**

- `bundle.createUpdaterArtifacts` in `src-tauri/tauri.conf.json` makes `tauri build` sign the NSIS installer and write
  `<installer>.sig`. The key and its password come from the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, which only the *Build installer* step receives; without them the build stops.
- The release job writes `latest.json` from that signature: the version, notes (the tag message), the publication time
  and the URL of this tag's versioned installer. `scripts/release-check.mjs` stops the workflow before building if the
  updater configuration (public key, endpoint, signed version) is missing or wrong.

### The signing key

The public key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) and inside every installed copy. The
private key is password protected. The key and its password exist only as the two repository secrets and in the
maintainer's backup: Windows Credential Manager (generic credentials `Modstead/Release/UpdaterKey` and
`Modstead/Release/UpdaterKeyPassword`) and a password manager. GitHub secrets cannot be read back, so the backup is the
only copy. Never commit the key, store it as a plain file or print it in a log.

To put the backup back into the repository secrets (PowerShell; nothing is printed, `gh` reads the values from stdin):

```powershell
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class CredBackup {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct C { public int Flags, Type; public string Target, Comment; public System.Runtime.InteropServices.ComTypes.FILETIME Written; public int Size;
             public IntPtr Blob; public int Persist, Count; public IntPtr Attrs; public string Alias, User; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredReadW(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr cred);
  public static string Read(string target) {
    IntPtr p;
    if (!CredReadW(target, 1, 0, out p)) throw new System.ComponentModel.Win32Exception();
    try {
      C c = (C)Marshal.PtrToStructure(p, typeof(C)); byte[] b = new byte[c.Size];
      Marshal.Copy(c.Blob, b, 0, c.Size); return System.Text.Encoding.UTF8.GetString(b);
    } finally { CredFree(p); }
  }
}
'@
[CredBackup]::Read('Modstead/Release/UpdaterKey') | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo azorkai/modstead
[CredBackup]::Read('Modstead/Release/UpdaterKeyPassword') | gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo azorkai/modstead
```

**Rotating the key** (planned, for example when a maintainer with access leaves). Installed copies accept only updates
signed with the key whose public half they carry, so a rotation takes two releases:

1. On a trusted machine, generate a new pair with a strong password:
   `npx tauri signer generate -w <temporary folder>\modstead-updater.key -p <password>`. Back up the new private key and
   password (Credential Manager and password manager), then delete the files.
2. Release version N with the **new** public key in `tauri.conf.json`, still signed with the **old** secrets. Installed
   copies accept it and from then on trust the new key.
3. When most users run N, replace both secrets with the new key and password and release N+1. Copies that never
   installed N cannot verify N+1 and have to install it by hand.

**If the key leaks:** rotate at once and say so in the release notes. To reach installed copies an attacker would also
have to publish a release in this repository (the app accepts no other download address), so check repository access
too.

**If the private key or its password is lost,** installed copies can no longer be updated. Generate a new pair, put the
new public key in `tauri.conf.json`, set the secrets and release; every user has to download and install that release
by hand once. Say so in its release notes and in the README.

**The first release with the updater:** copies of 0.1.0 have no updater, so their users install it by hand once (the
release notes say so). After publishing, `https://github.com/azorkai/modstead/releases/latest/download/latest.json` must
return the new version. The whole flow can be watched only from the second updater release on: install N, publish N+1.

## Verify a download

Compare the installer's SHA-256 with the matching line in `SHA256SUMS.txt` from the same release (upper or lower case
does not matter).

```powershell
# PowerShell
(Get-FileHash .\Modstead-setup-x64.exe -Algorithm SHA256).Hash
```

```bat
:: Command Prompt
certutil -hashfile Modstead-setup-x64.exe SHA256
```

```bash
# Git Bash, WSL or Linux (in the folder with the download and SHA256SUMS.txt)
sha256sum --check --ignore-missing SHA256SUMS.txt
```

If the checksums do not match, do not run the file. Download it again from the release page, and if it still does not
match, report it as described in [SECURITY.md](../SECURITY.md).

## SmartScreen and code signing

The installer is not code-signed yet. Browsers may warn that the file is not commonly downloaded, and Windows
SmartScreen may show *"Windows protected your PC"*; users who downloaded it from the release page choose
**More info → Run anyway**. The warning comes from the missing signature and reputation, not from a detection.

Signing can be added later without restructuring the workflow: store the certificate or signing service credentials as
repository secrets, set `bundle.windows.signCommand` (or `certificateThumbprint` for a certificate in the runner's
store) in `src-tauri/tauri.conf.json`, and pass the secrets as environment variables to the *Build installer* step.
Tauri then signs both the app executable and the installer.

## How the workflow keeps the build trustworthy

- It runs on tags `v*` and by hand. The build job has read-only access to the repository; only the release job, which
  does not check out or run project code, can create releases.
- Every action is pinned to a full commit SHA. Node.js and Rust versions are fixed in the workflow.
- JavaScript dependencies are installed with `npm ci` (exact versions from `package-lock.json`, install scripts
  disabled by `.npmrc`); Rust builds with `--locked`, so `Cargo.lock` is used as committed.
- The checkout keeps line endings as committed, so files embedded into the app (the frontend build, aircraft photos,
  in-sim packages, data files) are byte-identical to the repository.
- Release builds start clean: there is no Cargo cache. The npm download cache is used because npm verifies every
  package against the `sha512` integrity in `package-lock.json`.
- Checksums are computed on the Windows build runner and verified again on the release runner before upload.
- The updater signing key reaches only the step that builds the installer. The release job writes `latest.json` from
  the signature the build produced, and installed copies check that signature with the public key built into them.
