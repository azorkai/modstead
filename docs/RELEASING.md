# Releasing Modstead

Modstead's Windows installer is built only by GitHub Actions, by the
[Release workflow](../.github/workflows/release.yml) on a GitHub-hosted Windows runner. Release builds are not made
on developer machines: every published installer comes from a tagged commit and a public build log.

## What users download

Every release has three files:

| File | What it is |
|---|---|
| `Modstead-setup-x64.exe` | The NSIS installer for Windows 10/11 (x64). The name never changes, so links to the latest release keep working. |
| `Modstead_<version>_x64-setup.exe` | The same file with the version in its name. |
| `SHA256SUMS.txt` | SHA-256 checksums of both files. |

Stable links (they always point at the newest published release; drafts and pre-releases are skipped):

- Installer: `https://github.com/azorkai/modstead/releases/latest/download/Modstead-setup-x64.exe`
- Checksums: `https://github.com/azorkai/modstead/releases/latest/download/SHA256SUMS.txt`
- Release page: `https://github.com/azorkai/modstead/releases/latest`

The installer installs Modstead for the current user (no administrator rights) and downloads Microsoft Edge WebView2
if it is missing. Modstead does not update itself yet; users install a newer release over the old one.

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
3. **Tag the commit on `main` and push the tag:**
   ```bash
   git tag -a v0.2.0 -m "Modstead 0.2.0"
   git push origin v0.2.0
   ```
4. **Wait for the workflow.** Actions → *Release* builds the installer (a clean release build takes a while), then
   creates a **draft** release for the tag with the three files and release notes. It fails early, before building,
   if the tag and the versions in the files differ.
5. **Review the draft** under Releases: read and edit the notes, download the installer, check its SHA-256 (below),
   install it on a Windows machine and start Modstead.
6. **Publish** the draft and keep *Set as the latest release* checked. From then on the stable links above point at
   this release.

A version with a pre-release part, such as `0.2.0-beta.1` (tag `v0.2.0-beta.1`), is created as a pre-release. The
stable `latest` links keep pointing at the last full release.

**If the workflow fails,** fix the cause on `main`, then either move the tag (`git tag -d v0.2.0`,
`git push origin :refs/tags/v0.2.0`, tag again and push) or run the workflow by hand on the tag (Actions → Release →
*Run workflow* → choose the tag). A run on a tag that already has a draft replaces the draft's files and leaves its
notes alone. A published release is never overwritten: release a new version instead.

**Dry run:** run the workflow by hand on a branch. It builds the installer and attaches the three files to the run as
the `modstead-windows-x64` artifact, without creating a release.

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
