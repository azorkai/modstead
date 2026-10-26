# Security Policy

Modstead installs files downloaded from the internet, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private
[vulnerability reporting](https://github.com/azorkai/modstead/security/advisories/new) instead and include:

- what is affected (download, archive extraction, content check, nxm handler, credential storage, a game module…),
- steps or a sample archive to reproduce it,
- the impact you expect.

You will get an answer as soon as possible. Please give us reasonable time to fix the issue before disclosing it.

## Scope

In scope: anything that lets a mod archive, a download link, an `nxm://` link or a remote server write outside the
expected folder, run code, bypass the review dialog, bypass hash verification, read stored API keys or make Modstead
install an update that is not signed with its release key.

Out of scope: malicious behaviour inside a mod that the user reviewed and approved; Modstead reduces this risk but
cannot guarantee that a mod is harmless.

## Supported versions

Only the latest commit on `main` is supported while the project is in early development.
