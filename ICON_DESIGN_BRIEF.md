# Icon Design Brief - Randiris Home CCTV-Viewer

## Brand Identity
- **App Name**: Randiris Home CCTV-Viewer
- **Theme**: Security, Surveillance, Monitoring
- **Color Palette**:
  - Primary: Security Blue (#0066CC)
  - Accent: Cyan (#00B4D8)
  - Alert: Recording Red (#E63946)
  - Background: Dark Gray (#1A1F2C)

## Required Icons

### 1. Main App Icon (icon.ico)
**Purpose**: Installed application icon, taskbar, desktop shortcut
**Sizes needed**: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
**Design concept**:
- Shield shape with a camera lens in the center
- Camera lens should have a subtle blue glow (security blue)
- Shield outline in white/light gray
- Background: Dark gradient (dark blue to dark gray)
- Optional: Small "REC" dot in red at top right corner
- Style: Modern, flat with subtle depth, professional

### 2. Portable EXE Icon (portable-icon.ico)
**Purpose**: Portable executable icon
**Sizes needed**: Same as main icon
**Design concept**:
- Same as main icon but with a USB drive symbol overlay
- USB drive symbol in bottom right corner, semi-transparent
- Or: Add a small "P" badge in the corner
- Maintains brand consistency while indicating portable nature

### 3. System Tray Icon (tray-icon.ico)
**Purpose**: System tray notification area
**Sizes needed**: 16x16, 32x32, 48x48
**Design concept**:
- Simplified version of main icon
- Just the camera lens with shield outline
- Must be recognizable at small sizes
- White icon on transparent background (or dark icon on light)
- Consider a "recording" state variant (red dot)

### 4. Installer Icon (installer-icon.ico)
**Purpose**: NSIS installer executable
**Sizes needed**: 16x16, 32x32, 48x48, 64x64, 128x128
**Design concept**:
- Main icon with a "setup/install" visual cue
- Add a gear or download arrow overlay
- Or: Box/package icon with camera lens
- Green accent color to indicate "safe to install"
- Professional, trustworthy appearance

### 5. Uninstaller Icon (uninstaller-icon.ico)
**Purpose**: NSIS uninstaller executable
**Sizes needed**: Same as installer
**Design concept**:
- Similar to installer but with "remove" visual cue
- Add a trash can or "X" overlay
- Or: Box with opening lid (being emptied)
- Orange/red accent to indicate "caution/remove"
- Clearly distinguishable from installer

## File Placement
Once created, place icons in:
- `build/icon.ico` - Main app icon (electron-builder default)
- `build/installer-icon.ico` - Installer icon
- `build/uninstaller-icon.ico` - Uninstaller icon
- `build/portable-icon.ico` - Portable icon
- `build/tray-icon.ico` - System tray icon

## Additional Notes
- All icons should follow Windows 11 design guidelines
- Use anti-aliasing for smooth edges
- Test icons at all sizes for readability
- Consider both light and dark mode backgrounds
- Keep file sizes reasonable (under 1MB each)

## Alternative: Use Icon Generator
If you prefer to use an icon generator tool:
1. Create a 512x512 PNG of your design
2. Use tools like:
   - https://icoconvert.com/
   - https://www.icoconverter.com/
   - ImageMagick CLI
3. Generate multi-size ICO files
