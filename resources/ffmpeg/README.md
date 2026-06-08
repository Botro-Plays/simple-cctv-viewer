# FFmpeg Binary

Download the FFmpeg binary for your platform and place it in this directory.

## Download Links

- **Windows (static build):** https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
- **Linux:** `sudo apt install ffmpeg` or download from https://ffmpeg.org/download.html
- **macOS:** `brew install ffmpeg`

## Installation

### Windows
1. Download the static build from the link above
2. Extract the zip file
3. Copy `ffmpeg.exe` to this directory

### Linux
1. Install FFmpeg via package manager
2. Create a symlink or copy the binary to this directory

### macOS
1. Install FFmpeg via Homebrew
2. Copy the binary to this directory

## Verification

After installation, verify the binary works:

```bash
# Windows
.\ffmpeg.exe -version

# Linux/macOS
./ffmpeg -version
```
