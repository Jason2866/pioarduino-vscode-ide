# Changelog

All notable changes to the **pioarduino IDE** VSCode extension are documented in this file.

---

## [1.2.6] - 2026-03-06

### 🚀 Features

- **Plugin conflict detection**: Block extension activation until conflicting PlatformIO IDE extension is resolved
- Removed `pioarduino-ide*.vsix` from `.gitignore` for easier distribution

### 🐛 Bug Fixes

- Fixed syntax of VSCode command registration

---

## [1.2.5] - 2025-10-17

### 🔧 Initial VSCodium release

- Bumped version and updated dependencies in `package.json`

---

## [1.1.4] - 2025-10-13

### 🐛 Bug Fixes

- Fixed `uv` install on Windows

### 📦 Dependencies

- Updated `pioarduino-node-helpers` to v12.1.1

---

## [1.1.0] - 2025-08-30

### 🐛 Bug Fixes

- Fixed offline mode operation (#3)
- Attempted fixes for various Windows-specific issues

---

## [1.0.8] - 2025-08-14

### 🐛 Bug Fixes

- Fixes for Windows compatibility issues

---

## [1.0.7] - 2025-08-12

### 🔧 Maintenance

- Version update and internal improvements

---

## [1.0.6] - 2025-01-12

### 🚀 Features

- Extension recommendation system for related extensions (#2)
- Issues now link to the pioarduino repository

### 📦 Dependencies

- Updated dependencies

---

## [1.0.5] - 2025-05-24

### 🐛 Bug Fixes

- Ensured terminal uses UTF-8 codepage
- Set explicit codepage UTF-8 for Windows terminals

---

## [1.0.2] - 2024-09-02

### 🚀 Features

- Custom pioarduino icons (#1)
- Brand renaming throughout the extension

### 🔧 Maintenance

- Integration of `pioarduino-node-helpers`
- Various module updates (`manager.js`, `utils.js`, `home.js`, `tests.js`, `config.js`, `main.js`)

---

## [1.0.0] - 2024-08-18

### 🎉 Initial pioarduino Release

- Forked from PlatformIO IDE and rebranded to **pioarduino IDE**
- Switched to `pioarduino-node-helpers` as the backend helper library
- New package identity as `pioarduino`
- GitHub Actions build pipeline (`build.yml`)
- DevContainer support for development

