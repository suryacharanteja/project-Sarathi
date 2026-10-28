# Chakra Icon Pack

Rebuilt from a vector master, with four detail levels so the logo stays sharp at every size:

| Detail | Used for | What changes |
|---|---|---|
| full   | 256 px and up | all 16 spokes, 16 triangles, dots, ticks |
| bold   | 72-128 px    | same art, strokes ~2x heavier |
| medium | 40-64 px     | thicker lines, 8 triangles, no dots or ticks |
| small  | 16-32 px     | bold ring, 8 spokes, large hub |

## Folders
- `ico/chakra_app.ico`: Windows app/installer icon (16, 20, 24, 32, 40, 48, 64, 96, 128, 256). Sizes under 256 are stored as 32-bit BMP and 256 as PNG, which is what Windows expects.
- `ico/favicon.ico`: small favicon (16, 32, 48)
- `png/`: transparent PNGs, 16 to 1024 px
- `svg/`: vector sources for each detail level (`chakra_full.svg` is the master)
- `web/`: favicon.svg, favicon.ico, apple-touch-icon (180), android-chrome 192/512, site.webmanifest
- `preview_sheet.png`: every icon size at 1:1 on light and dark backgrounds

## Usage
- Electron: `new BrowserWindow({ icon: 'ico/chakra_app.ico' })`; electron-builder: `"win": { "icon": "ico/chakra_app.ico" }`
- PyInstaller: `pyinstaller --icon=ico/chakra_app.ico app.py`
- Inno Setup: `SetupIconFile=ico\chakra_app.ico`
- HTML:
```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
```
