# Randiris Home CCTV-Viewer — Full Codebase Audit

**Date:** 2026-06-08
**Auditor:** Cascade (AI Pair Programmer)
**Scope:** Entire source codebase (electron/, frontend/src/, excluding reference system)
**Method:** Static code review, functional analysis, security review

---

## How to Read This Document

- **Severity:** `CRITICAL` = ship-blocker (data loss, security breach, crash), `HIGH` = broken feature or significant stability risk, `MEDIUM` = UX/polish issue, `LOW` = minor cleanup.
- **Status:** `FIXED` = changes applied to source code in this session, `PENDING` = still open.

---

## CRITICAL (Ship-Blockers)

### C1. Disabled Web Security (`webSecurity: false`, `allowRunningInsecureContent: true`)

**File:** `electron/main/index.ts:44-47`

**Status:** FIXED

**Change:** Removed all three insecure flags from the `BrowserWindow` constructor:
```ts
// BEFORE:
webSecurity: false,
allowRunningInsecureContent: true,
sandbox: false,

// AFTER: removed entirely (defaults are safe)
```

**Rationale:** The frontend now uses `fetch()` + manual JPEG extraction, so `fetch()` to localhost from `file://` does not require these flags. Removing them restores Chromium's same-origin policy, CSP enforcement, and mixed-content blocking.

---

### C2. Async `before-quit` Handler Not Awaited

**File:** `electron/main/index.ts:105-119`

**Status:** FIXED

**Change:** Replaced `app.on('before-quit')` with `app.on('will-quit')` and added explicit exit sequencing:
```ts
// BEFORE:
app.on('before-quit', async () => {
  await backendService.stop();
  databaseService.close();
});

// AFTER:
app.on('will-quit', (e) => {
  e.preventDefault();
  backendService.stop()
    .catch((err) => console.error('Error stopping backend:', err))
    .finally(() => {
      databaseService.close();
      app.exit(0);
    });
});
```

**Rationale:** Electron does not await async `before-quit` handlers. Using `will-quit` with `preventDefault()` + explicit `app.exit(0)` ensures FFmpeg processes are terminated and the DB is closed before the process exits.

---

### C3. RTSP Credentials Logged to Console in Production

**File:** `electron/services/backend/index.ts:211`

**Status:** FIXED

**Change:** Log output now uses a sanitized URL:
```ts
// BEFORE:
console.log(`[Stream] Starting new FFmpeg for camera ${camera.name}: ${rtspUrl}`);

// AFTER:
const sanitizedUrl = rtspUrl.replace(/\/\/[^:]+:[^@]+@/, '//**:**@');
console.log(`[Stream] Starting new FFmpeg for camera ${camera.name}: ${sanitizedUrl}`);
```

**Rationale:** Prevents `username:password` strings from leaking into system logs and crash dumps.

---

### C4. Camera Passwords Stored in Plaintext

**File:** `electron/services/database/index.ts`

**Status:** FIXED

**Changes:**
1. Added `encryptPassword()` / `decryptPassword()` helpers using Electron's `safeStorage` API (lines 7-21).
2. `getCameras()` and `getCamera()` now call `decryptPassword(row.password)` to return plaintext to consumers.
3. `addCamera()` encrypts the password before storing: `encryptPassword(camera.password)`.
4. `updateCamera()` encrypts the password when updating: `encryptPassword(value as string)`.

```ts
function encryptPassword(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (!safeStorage.isEncryptionAvailable()) return plain;
  return safeStorage.encryptString(plain).toString('base64');
}

function decryptPassword(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!safeStorage.isEncryptionAvailable()) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch { return stored; }
}
```

**Rationale:** `safeStorage` uses the OS keyring (Windows DPAPI, macOS Keychain, Linux Secret Service). Passwords are encrypted before storage and decrypted on read. When unavailable, falls back to storing plaintext (better than crashing). Note: moving a portable `.db` between machines will require re-entering passwords since the encryption key is machine-bound.

---

## HIGH (Functional Bugs / Stability Risks)

### H1. `img.src` Not Cleared on Unmount — Chrome Keeps Resource Alive

**File:** `frontend/src/components/VideoPlayer.tsx:169-184`

**Status:** FIXED

**Change:** Unmount cleanup now clears `img.src` before revoking the blob URL:
```ts
// BEFORE:
if (blobUrlRef.current) {
  URL.revokeObjectURL(blobUrlRef.current);
  blobUrlRef.current = null;
}

// AFTER:
if (imgRef.current) {
  imgRef.current.src = '';
}
if (blobUrlRef.current) {
  URL.revokeObjectURL(blobUrlRef.current);
  blobUrlRef.current = null;
}
```

**Rationale:** Explicitly clearing `src = ''` forces Chrome to release the decoded image bitmap and close the underlying HTTP socket before the blob URL is revoked. This was identified in prior sessions as critical for preventing zombie TCP connections.

---

### H2. Settings Page is Completely Non-Functional

**File:** `frontend/src/pages/Settings.tsx`

**Status:** FIXED

**Changes:**
1. Settings now load from the backend on mount via `electronAPI.getSettings()`.
2. `handleSave` now calls `electronAPI.updateSettings(settings)` instead of the no-op `setTimeout`.
3. Added loading state, success banner, and error banner to the UI.
4. Added IPC handlers `settings:get` and `settings:update` in `main/index.ts` (lines 164-180).
5. Added `getSettings` / `updateSettings` to the preload bridge and `api.ts` type declarations.

---

### H3. No Error Handling on IPC Handlers

**File:** `electron/main/index.ts:127-180`

**Status:** FIXED

**Change:** All IPC handlers (`cameras:getAll`, `cameras:add`, `cameras:update`, `cameras:delete`, `settings:get`, `settings:update`) now check `response.ok` before returning:
```ts
// BEFORE:
const response = await fetch(...);
return response.json();

// AFTER:
const response = await fetch(...);
const result = await response.json();
if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
return result;
```

**Rationale:** Errors now propagate to the renderer as structured exceptions with user-facing messages, rather than silent failures.

---

### H4. Duplicate Camera Check Uses Loose Port Comparison

**File:** `electron/services/backend/index.ts:98-123`

**Status:** FIXED

**Change:** Both `POST` and `PUT` duplicate checks now coerce ports to numbers:
```ts
// BEFORE:
cam.port === request.body.port

// AFTER:
Number(cam.port) === Number(request.body.port)
```

**Rationale:** SQLite stores `port` as an integer. JSON body may send it as a string. Strict `===` between `number` and `string` would allow duplicate cameras.

---

### H5. Dead Code: `go2rtc` Service and `ProcessManager` Never Used

**Files:**
- `electron/services/go2rtc/index.ts` (deleted)
- `electron/main/process-manager.ts` (deleted)

**Status:** FIXED

**Changes:**
1. Deleted `electron/services/go2rtc/index.ts` (109 lines).
2. Deleted `electron/main/process-manager.ts` (142 lines).
3. Removed `go2rtc` binary entry from `package.json` `extraResources`.
4. Removed `go2rtc` binary entry from `electron-builder.json` `extraResources`.

**Rationale:** These modules were never imported or instantiated in `main/index.ts`. Removing them reduces build size by ~5-10MB and removes dead code confusion.

---

### H6. No Camera Enable/Disable Toggle on Management Page

**File:** `frontend/src/pages/Cameras.tsx`

**Status:** FIXED

**Changes:**
1. Added `ToggleLeft` / `ToggleRight` Lucide imports.
2. Added `handleToggleEnabled` function that calls `electronAPI.updateCamera(id, { enabled: !enabled })`.
3. Added a toggle button next to Edit and Delete on each camera card.
4. Added `actionError` state to display backend errors on the page.
5. Wired error handling into `handleSave`, `handleDelete`, and `handleToggleEnabled`.

---

## MEDIUM (UX / Polish / Missing Features)

### M1. Camera Cards Use `w-[75%]` — Wastes Grid Space

**File:** `frontend/src/pages/Dashboard.tsx:263`

**Status:** FIXED

**Change:** `w-[75%]` → `w-full` on the `CameraCard` root element.

**Rationale:** Previously each card was only 75% width inside its grid cell, leaving empty margins on both sides and wasting ~25% of screen space.

---

### M2. VideoPlayer Has Unused Props

**File:** `frontend/src/components/VideoPlayer.tsx`

**Status:** FIXED

**Changes:**
1. Removed unused props from interface: `autoPlay`, `muted`, `timestamp`.
2. Kept `connectTimeoutMs` and wired it into the `setTimeout` fallback: `}, connectTimeoutMs);` (was hardcoded to `8000`).
3. Default value set to `8000`.

---

### M3. `StreamStore` Defined but Never Consumed

**Files:**
- `frontend/src/stores/stream-store.ts`
- `frontend/src/components/VideoPlayer.tsx`
- `frontend/src/pages/Dashboard.tsx`

**Status:** FIXED

**Changes:**
1. `VideoPlayer.tsx` now imports `useStreamStore` and reports:
   - `ONLINE` when the first frame arrives.
   - `CONNECTING` when auto-retrying.
   - `ERROR` when retries are exhausted.
   - `removeStream(cameraId)` on unmount.
2. `Dashboard.tsx` now consumes `useStreamStore`, computes `onlineCount`, and displays it in the header as a green "X online" label.

---

### M4. About Page Lists Unimplemented Features

**File:** `frontend/src/App.tsx:127-133`

**Status:** FIXED

**Change:** Updated the feature list to match current capabilities:
```
// BEFORE:
- Low latency streaming via WebRTC
- Snapshot capture
- Basic recording

// AFTER:
- MJPEG live streaming via FFmpeg
- Paged camera grid with navigation
```

---

### M5. No Max Camera Limit Enforcement

**File:** `electron/services/backend/index.ts:98-103`

**Status:** FIXED

**Change:** Added a limit check in `POST /api/cameras`:
```ts
if (existingCameras.length >= 32) {
  throw this.server.httpErrors.badRequest('Camera limit reached (maximum 32 cameras)');
}
```

---

### M6. Refresh / Force Refresh Buttons Do the Same Thing

**File:** `frontend/src/App.tsx:58-104`

**Status:** FIXED

**Change:** Removed the `DropdownMenu` component and the duplicate `handleForceRefresh` function. Replaced with a single Refresh button. Also removed unused `ChevronDown`, `RotateCcw`, and `DropdownMenu*` imports.

---

## LOW (Code Quality / Cleanup)

### L1. Console Log Forwarding Runs in Production

**File:** `electron/main/index.ts:58-65`

**Status:** FIXED

**Change:** Wrapped the `console-message` listener behind `if (isDev)`:
```ts
if (isDev) {
  mainWindow.webContents.on('console-message', ...);
}
```

**Rationale:** In production, every `console.log` triggers a synchronous IPC round-trip, slowing the renderer.

---

### L2. Hardcoded Backend URL Everywhere

**Files:** `main/index.ts`, `VideoPlayer.tsx`

**Status:** FIXED

**Changes:**
1. Created `electron/shared/config.ts` exporting `API_BASE = 'http://127.0.0.1:3000'`.
2. `main/index.ts`: all IPC handlers now use `${API_BASE}/api/...`.
3. `VideoPlayer.tsx`: `streamSrc` now uses `${API_BASE}/api/streams/${cameraId}/mjpeg?...`.

---

### L3. `Sandbox: false` is Unnecessary

**File:** `electron/main/index.ts:47`

**Status:** FIXED

**Change:** Removed `sandbox: false` from `BrowserWindow` constructor.

**Rationale:** The preload script correctly uses `contextBridge` and does not need Node.js access in the renderer. Disabling the sandbox weakened security without benefit.

---

## Summary Table

| # | Issue | Severity | Status |
|---|---|---|---|
| C1 | `webSecurity: false` / `allowRunningInsecureContent` | CRITICAL | **FIXED** |
| C2 | Async `before-quit` not awaited | CRITICAL | **FIXED** |
| C3 | RTSP credentials logged | CRITICAL | **FIXED** |
| C4 | Passwords stored plaintext | CRITICAL | **FIXED** |
| H1 | `img.src` not cleared on unmount | HIGH | **FIXED** |
| H2 | Settings page is a no-op | HIGH | **FIXED** |
| H3 | No IPC error handling | HIGH | **FIXED** |
| H4 | Loose port comparison | HIGH | **FIXED** |
| H5 | Dead go2rtc code | HIGH | **FIXED** |
| H6 | No enable/disable toggle | HIGH | **FIXED** |
| M1 | `w-[75%]` wastes space | MEDIUM | **FIXED** |
| M2 | Unused VideoPlayer props | MEDIUM | **FIXED** |
| M3 | `StreamStore` unused | MEDIUM | **FIXED** |
| M4 | About page lies | MEDIUM | **FIXED** |
| M5 | No camera limit | MEDIUM | **FIXED** |
| M6 | Refresh/Force Refresh identical | LOW | **FIXED** |
| L1 | Console forwarding in prod | LOW | **FIXED** |
| L2 | Hardcoded backend URL | LOW | **FIXED** |
| L3 | `sandbox: false` unnecessary | LOW | **FIXED** |

---

## Files Modified This Session

| File | Changes |
|---|---|
| `electron/main/index.ts` | Removed insecure webSecurity/sandbox/allowRunningInsecureContent; fixed will-quit cleanup; gated console forwarding behind isDev; added settings IPC handlers; replaced hardcoded URLs with API_BASE |
| `electron/services/backend/index.ts` | Sanitized RTSP URLs in logs; fixed loose port comparison; added 32-camera limit enforcement |
| `electron/services/database/index.ts` | Added safeStorage password encryption (encrypt on write, decrypt on read); added update path for password field |
| `electron/shared/config.ts` | **NEW** — centralized `API_BASE` constant |
| `electron/preload/index.ts` | Added `getSettings` / `updateSettings` to bridge |
| `frontend/src/lib/api.ts` | Added `getSettings` / `updateSettings` type declarations |
| `frontend/src/components/VideoPlayer.tsx` | Clear `img.src` on unmount; removed unused props; wired `connectTimeoutMs`; connected to StreamStore for ONLINE/CONNECTING/ERROR reporting |
| `frontend/src/pages/Settings.tsx` | Full load/save wiring to backend; added loading, success, and error UI states |
| `frontend/src/pages/Cameras.tsx` | Added enable/disable toggle button; added `actionError` banner; wired error handling on save/delete/toggle |
| `frontend/src/pages/Dashboard.tsx` | `w-[75%]` → `w-full`; added StreamStore `onlineCount` display in header |
| `frontend/src/App.tsx` | Updated About page features; removed duplicate Force Refresh dropdown |
| `package.json` | Removed go2rtc from `extraResources` |
| `electron-builder.json` | Removed go2rtc from `extraResources` |
| `electron/services/go2rtc/index.ts` | **DELETED** |
| `electron/main/process-manager.ts` | **DELETED** |

---

*End of Audit — All 19 items resolved.*
