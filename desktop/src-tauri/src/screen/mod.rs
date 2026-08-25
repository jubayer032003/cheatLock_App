use crate::hardware::{collect_hardware_diagnostics, DisplayDevice};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_SAMPLE_INTERVAL_MS: u64 = 1_000;
const MIN_SAMPLE_INTERVAL_MS: u64 = 250;
const MAX_SAMPLE_INTERVAL_MS: u64 = 30_000;
const MAX_CAPTURE_BYTES: usize = 96 * 1024 * 1024;
const MIN_STALE_FRAME_THRESHOLD_MS: u64 = 5_000;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeMonitorState {
    Idle,
    Starting,
    Active,
    Degraded,
    Failed,
    Stopping,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMonitorStatus {
    pub module: String,
    pub state: NativeMonitorState,
    pub error_code: Option<String>,
    pub message: String,
    pub active_exam_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMonitorError {
    pub code: String,
    pub message: String,
    pub module: String,
}

impl NativeMonitorError {
    pub fn not_implemented(module: &str, message: &str) -> Self {
        Self {
            code: "not_implemented".to_string(),
            message: message.to_string(),
            module: module.to_string(),
        }
    }

    fn screen(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            module: "screen".to_string(),
        }
    }
}

impl std::fmt::Display for NativeMonitorError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenCaptureConfig {
    pub display_id: Option<String>,
    pub sample_interval_ms: Option<u64>,
    pub active_exam_id: Option<String>,
}

impl Default for ScreenCaptureConfig {
    fn default() -> Self {
        Self {
            display_id: None,
            sample_interval_ms: Some(DEFAULT_SAMPLE_INTERVAL_MS),
            active_exam_id: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenCaptureStatus {
    pub module: String,
    pub state: NativeMonitorState,
    pub error_code: Option<String>,
    pub message: String,
    pub active_exam_id: Option<String>,
    pub selected_display_id: Option<String>,
    pub selected_display_label: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub frame_count: u64,
    pub capture_started_at: Option<String>,
    pub latest_frame_timestamp: Option<String>,
    pub latest_frame_sequence: Option<u64>,
    pub sample_interval_ms: u64,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenFrameSample {
    pub display_id: String,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub pixel_format: String,
    pub sequence_number: u64,
    pub captured_at: String,
    pub size_bytes: usize,
    pub bgra: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressedScreenSample {
    pub display_id: String,
    pub width: u32,
    pub height: u32,
    pub encoding: String,
    pub pixel_source_format: String,
    pub sequence_number: u64,
    pub captured_at: String,
    pub size_bytes: usize,
    pub data: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenCaptureDiagnostic {
    pub display_id: Option<String>,
    pub display_label: Option<String>,
    pub display_x: i32,
    pub display_y: i32,
    pub width: u32,
    pub height: u32,
    pub expected_bgra_size: usize,
    pub attempts: Vec<GdiCaptureAttemptDiagnostic>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GdiCaptureAttemptDiagnostic {
    pub source_strategy: String,
    pub source_dc_acquired: bool,
    pub source_dc_handle: usize,
    pub source_object_type: u32,
    pub source_raster_caps: i32,
    pub source_supports_bitblt: bool,
    pub memory_dc_created: bool,
    pub memory_dc_handle: usize,
    pub memory_object_type: u32,
    pub bitmap_created: bool,
    pub bitmap_handle: usize,
    pub object_selected: bool,
    pub previous_object_handle: usize,
    pub capture_blt_succeeded: bool,
    pub capture_blt_error: Option<u32>,
    pub srccopy_succeeded: bool,
    pub srccopy_error: Option<u32>,
    pub frame_byte_length: Option<usize>,
    pub png_byte_length: Option<usize>,
    pub error_stage: Option<String>,
    pub win32_error: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenSessionDiagnostics {
    pub process_id: u32,
    pub current_session_id: Option<u32>,
    pub current_session_error: Option<String>,
    pub active_console_session_id: Option<u32>,
    pub session_matches_active_console: Option<bool>,
    pub interactive_desktop_opened: bool,
    pub interactive_desktop_error: Option<String>,
    pub elevated: Option<bool>,
    pub elevation_error: Option<String>,
    pub integrity_level: Option<String>,
    pub integrity_error: Option<String>,
}

#[derive(Clone)]
pub struct ScreenManager {
    shared: Arc<Mutex<ScreenShared>>,
    worker: Arc<Mutex<Option<JoinHandle<()>>>>,
    backend: Arc<dyn ScreenCaptureBackend>,
}

#[cfg(any(test, debug_assertions))]
pub fn collect_screen_session_diagnostics() -> NativeScreenSessionDiagnostics {
    platform_screen_session_diagnostics()
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn platform_screen_session_diagnostics() -> NativeScreenSessionDiagnostics {
    let process_id = std::process::id();
    let (current_session_id, current_session_error) = current_windows_session_id(process_id);
    let active_console_session_id = active_console_windows_session_id();
    let session_matches_active_console = match (current_session_id, active_console_session_id) {
        (Some(current), Some(active)) => Some(current == active),
        _ => None,
    };
    let (interactive_desktop_opened, interactive_desktop_error) = can_open_input_desktop();
    let (elevated, elevation_error) = is_process_elevated();

    NativeScreenSessionDiagnostics {
        process_id,
        current_session_id,
        current_session_error,
        active_console_session_id,
        session_matches_active_console,
        interactive_desktop_opened,
        interactive_desktop_error,
        elevated,
        elevation_error,
        integrity_level: None,
        integrity_error: Some(
            "Integrity level collection is not implemented for this diagnostic build.".to_string(),
        ),
    }
}

#[cfg(all(not(target_os = "windows"), any(test, debug_assertions)))]
fn platform_screen_session_diagnostics() -> NativeScreenSessionDiagnostics {
    NativeScreenSessionDiagnostics {
        process_id: std::process::id(),
        current_session_id: None,
        current_session_error: Some(
            "Windows session diagnostics are unavailable on this platform.".to_string(),
        ),
        active_console_session_id: None,
        session_matches_active_console: None,
        interactive_desktop_opened: false,
        interactive_desktop_error: Some(
            "Interactive desktop diagnostics are unavailable on this platform.".to_string(),
        ),
        elevated: None,
        elevation_error: Some(
            "Elevation diagnostics are unavailable on this platform.".to_string(),
        ),
        integrity_level: None,
        integrity_error: Some(
            "Integrity level diagnostics are unavailable on this platform.".to_string(),
        ),
    }
}

#[derive(Clone)]
struct ScreenShared {
    status: NativeScreenCaptureStatus,
    latest_frame: Option<ScreenFrameSample>,
    stop_signal: Option<Arc<AtomicBool>>,
}

trait ScreenCaptureBackend: Send + Sync {
    fn capture_frame(
        &self,
        display: &DisplayDevice,
        sequence_number: u64,
    ) -> Result<ScreenFrameSample, NativeMonitorError>;
}

struct NativeScreenCaptureBackend;

impl ScreenManager {
    pub fn new() -> Self {
        Self::with_backend(Arc::new(NativeScreenCaptureBackend))
    }

    fn with_backend(backend: Arc<dyn ScreenCaptureBackend>) -> Self {
        Self {
            shared: Arc::new(Mutex::new(ScreenShared {
                status: idle_capture_status(),
                latest_frame: None,
                stop_signal: None,
            })),
            worker: Arc::new(Mutex::new(None)),
            backend,
        }
    }

    pub fn start_capture(&self) -> Result<(), NativeMonitorError> {
        self.start_capture_with_config(ScreenCaptureConfig::default())
    }

    pub fn start_capture_with_config(
        &self,
        config: ScreenCaptureConfig,
    ) -> Result<(), NativeMonitorError> {
        self.reap_finished_worker();

        {
            let shared = self.shared.lock().map_err(|_| {
                NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
            })?;
            if matches!(
                shared.status.state,
                NativeMonitorState::Starting | NativeMonitorState::Active
            ) {
                return Ok(());
            }
        }

        let display = self.resolve_display(config.display_id.as_deref())?;
        self.start_capture_for_display(display, config)
    }

    fn start_capture_for_display(
        &self,
        display: DisplayDevice,
        config: ScreenCaptureConfig,
    ) -> Result<(), NativeMonitorError> {
        let interval_ms = normalize_interval(config.sample_interval_ms);
        self.set_starting(&display, interval_ms, config.active_exam_id.clone())?;

        let first_frame = match self.backend.capture_frame(&display, 1) {
            Ok(frame) => frame,
            Err(error) => {
                self.set_failed(
                    Some(error.code.clone()),
                    error.message.clone(),
                    config.active_exam_id,
                    Some(&display),
                    interval_ms,
                );
                return Err(error);
            }
        };

        let stop_signal = Arc::new(AtomicBool::new(false));
        {
            let mut shared = self.shared.lock().map_err(|_| {
                NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
            })?;
            shared.latest_frame = Some(first_frame.clone());
            shared.stop_signal = Some(stop_signal.clone());
            shared.status = active_capture_status(
                &display,
                interval_ms,
                config.active_exam_id.clone(),
                first_frame.sequence_number,
                first_frame.captured_at.clone(),
                unix_timestamp(),
            );
        }

        let shared = self.shared.clone();
        let backend = self.backend.clone();
        let worker_display = display.clone();
        let worker_exam_id = config.active_exam_id.clone();
        let handle = thread::spawn(move || {
            let mut sequence = first_frame.sequence_number;
            while !stop_signal.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(interval_ms));
                if stop_signal.load(Ordering::SeqCst) {
                    break;
                }
                sequence += 1;
                match backend.capture_frame(&worker_display, sequence) {
                    Ok(frame) => {
                        if let Ok(mut shared) = shared.lock() {
                            shared.latest_frame = Some(frame.clone());
                            shared.status.frame_count = frame.sequence_number;
                            shared.status.latest_frame_sequence = Some(frame.sequence_number);
                            shared.status.latest_frame_timestamp = Some(frame.captured_at);
                            shared.status.state = NativeMonitorState::Active;
                            shared.status.error_code = None;
                            shared.status.last_error = None;
                            shared.status.message = "Native screen capture is active.".to_string();
                        }
                    }
                    Err(error) => {
                        if let Ok(mut shared) = shared.lock() {
                            shared.stop_signal = None;
                            shared.status.state = NativeMonitorState::Failed;
                            shared.status.error_code = Some(error.code);
                            shared.status.last_error = Some(error.message.clone());
                            shared.status.message = error.message;
                            shared.status.active_exam_id = worker_exam_id.clone();
                        }
                        break;
                    }
                }
            }
        });

        let mut worker = self.worker.lock().map_err(|_| {
            NativeMonitorError::screen("worker_lock_failed", "Screen worker lock failed.")
        })?;
        *worker = Some(handle);
        Ok(())
    }

    #[cfg(test)]
    fn start_capture_for_display_test(
        &self,
        display: DisplayDevice,
        config: ScreenCaptureConfig,
    ) -> Result<(), NativeMonitorError> {
        self.reap_finished_worker();
        {
            let shared = self.shared.lock().map_err(|_| {
                NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
            })?;
            if matches!(
                shared.status.state,
                NativeMonitorState::Starting | NativeMonitorState::Active
            ) {
                return Ok(());
            }
        }
        self.start_capture_for_display(display, config)
    }

    pub fn stop_capture(&self) -> Result<(), NativeMonitorError> {
        let handle = {
            let mut shared = self.shared.lock().map_err(|_| {
                NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
            })?;
            if matches!(
                shared.status.state,
                NativeMonitorState::Idle | NativeMonitorState::Unsupported
            ) {
                shared.latest_frame = None;
                shared.stop_signal = None;
                return Ok(());
            }
            shared.status.state = NativeMonitorState::Stopping;
            shared.status.message = "Native screen capture is stopping.".to_string();
            if let Some(signal) = &shared.stop_signal {
                signal.store(true, Ordering::SeqCst);
            }
            self.worker
                .lock()
                .map_err(|_| {
                    NativeMonitorError::screen("worker_lock_failed", "Screen worker lock failed.")
                })?
                .take()
        };

        if let Some(handle) = handle {
            handle.join().map_err(|_| {
                NativeMonitorError::screen("worker_join_failed", "Screen capture worker panicked.")
            })?;
        }

        let mut shared = self.shared.lock().map_err(|_| {
            NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
        })?;
        shared.latest_frame = None;
        shared.stop_signal = None;
        shared.status = idle_capture_status();
        Ok(())
    }

    pub fn status(&self) -> NativeMonitorStatus {
        let status = self.capture_status();
        NativeMonitorStatus {
            module: status.module,
            state: status.state,
            error_code: status.error_code,
            message: status.message,
            active_exam_id: status.active_exam_id,
        }
    }

    pub fn capture_status(&self) -> NativeScreenCaptureStatus {
        self.shared
            .lock()
            .map(|shared| shared.status.clone())
            .unwrap_or_else(|_| NativeScreenCaptureStatus {
                state: NativeMonitorState::Failed,
                error_code: Some("state_lock_failed".to_string()),
                message: "Native screen monitor state could not be read.".to_string(),
                last_error: Some("Native screen monitor state could not be read.".to_string()),
                ..idle_capture_status()
            })
    }

    pub fn health_check(&self) -> NativeMonitorStatus {
        self.reap_finished_worker();
        let status = self.capture_status();
        if status.state == NativeMonitorState::Active && status.latest_frame_timestamp.is_none() {
            NativeMonitorStatus {
                module: "screen".to_string(),
                state: NativeMonitorState::Failed,
                error_code: Some("no_frame_available".to_string()),
                message: "Native screen capture is active but no frame has been captured."
                    .to_string(),
                active_exam_id: status.active_exam_id,
            }
        } else if status.state == NativeMonitorState::Active && self.is_stale(&status) {
            NativeMonitorStatus {
                module: "screen".to_string(),
                state: NativeMonitorState::Degraded,
                error_code: Some("stale_frame".to_string()),
                message: "Native screen capture is active but the latest frame is stale."
                    .to_string(),
                active_exam_id: status.active_exam_id,
            }
        } else {
            NativeMonitorStatus {
                module: status.module,
                state: status.state,
                error_code: status.error_code,
                message: status.message,
                active_exam_id: status.active_exam_id,
            }
        }
    }

    pub fn latest_frame(&self) -> Result<Option<ScreenFrameSample>, NativeMonitorError> {
        let shared = self.shared.lock().map_err(|_| {
            NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
        })?;
        Ok(shared.latest_frame.clone())
    }

    pub fn latest_compressed_sample(
        &self,
    ) -> Result<Option<CompressedScreenSample>, NativeMonitorError> {
        self.latest_frame()?
            .map(|frame| encode_png_sample(&frame))
            .transpose()
    }

    #[cfg(debug_assertions)]
    pub fn diagnose_capture(&self) -> Result<NativeScreenCaptureDiagnostic, NativeMonitorError> {
        let display = self.resolve_display(None)?;
        diagnose_display_capture(&display)
    }

    pub fn is_monitoring(&self) -> bool {
        self.capture_status().state == NativeMonitorState::Active
    }

    fn is_stale(&self, status: &NativeScreenCaptureStatus) -> bool {
        let Some(latest) = status.latest_frame_timestamp.as_deref() else {
            return true;
        };
        let Some(latest_ms) = parse_unix_millis(latest) else {
            return true;
        };
        let now_ms = unix_millis();
        let stale_after = (status.sample_interval_ms.saturating_mul(3))
            .max(MIN_STALE_FRAME_THRESHOLD_MS)
            .into();
        now_ms.saturating_sub(latest_ms) > stale_after
    }

    fn resolve_display(
        &self,
        display_id: Option<&str>,
    ) -> Result<DisplayDevice, NativeMonitorError> {
        let diagnostics = collect_hardware_diagnostics();
        if diagnostics.displays.is_empty() {
            return Err(NativeMonitorError::screen(
                "display_not_found",
                "No Windows display is available for native screen capture.",
            ));
        }
        if let Some(display_id) = display_id {
            return diagnostics
                .displays
                .into_iter()
                .find(|display| display.id == display_id)
                .ok_or_else(|| {
                    NativeMonitorError::screen(
                        "invalid_display",
                        format!("Selected display '{display_id}' was not found."),
                    )
                });
        }
        diagnostics
            .displays
            .iter()
            .find(|display| display.is_primary)
            .cloned()
            .or_else(|| diagnostics.displays.first().cloned())
            .ok_or_else(|| {
                NativeMonitorError::screen(
                    "display_not_found",
                    "No Windows display is available for native screen capture.",
                )
            })
    }

    fn set_starting(
        &self,
        display: &DisplayDevice,
        interval_ms: u64,
        active_exam_id: Option<String>,
    ) -> Result<(), NativeMonitorError> {
        let mut shared = self.shared.lock().map_err(|_| {
            NativeMonitorError::screen("state_lock_failed", "Screen capture state lock failed.")
        })?;
        shared.latest_frame = None;
        shared.status = NativeScreenCaptureStatus {
            module: "screen".to_string(),
            state: NativeMonitorState::Starting,
            error_code: None,
            message: "Native screen capture is starting.".to_string(),
            active_exam_id,
            selected_display_id: Some(display.id.clone()),
            selected_display_label: Some(display.label.clone()),
            width: Some(display.width),
            height: Some(display.height),
            frame_count: 0,
            capture_started_at: Some(unix_timestamp()),
            latest_frame_timestamp: None,
            latest_frame_sequence: None,
            sample_interval_ms: interval_ms,
            last_error: None,
        };
        Ok(())
    }

    fn set_failed(
        &self,
        error_code: Option<String>,
        message: String,
        active_exam_id: Option<String>,
        display: Option<&DisplayDevice>,
        interval_ms: u64,
    ) {
        if let Ok(mut shared) = self.shared.lock() {
            shared.latest_frame = None;
            shared.stop_signal = None;
            shared.status = NativeScreenCaptureStatus {
                module: "screen".to_string(),
                state: NativeMonitorState::Failed,
                error_code,
                message: message.clone(),
                active_exam_id,
                selected_display_id: display.map(|display| display.id.clone()),
                selected_display_label: display.map(|display| display.label.clone()),
                width: display.map(|display| display.width),
                height: display.map(|display| display.height),
                frame_count: 0,
                capture_started_at: None,
                latest_frame_timestamp: None,
                latest_frame_sequence: None,
                sample_interval_ms: interval_ms,
                last_error: Some(message),
            };
        }
    }

    fn reap_finished_worker(&self) {
        let handle = self.worker.lock().ok().and_then(|mut worker| {
            if worker.as_ref().is_some_and(JoinHandle::is_finished) {
                worker.take()
            } else {
                None
            }
        });
        if let Some(handle) = handle {
            let _ = handle.join();
        }
    }
}

impl Drop for ScreenManager {
    fn drop(&mut self) {
        let _ = self.stop_capture();
    }
}

fn normalize_interval(value: Option<u64>) -> u64 {
    value
        .unwrap_or(DEFAULT_SAMPLE_INTERVAL_MS)
        .clamp(MIN_SAMPLE_INTERVAL_MS, MAX_SAMPLE_INTERVAL_MS)
}

fn idle_capture_status() -> NativeScreenCaptureStatus {
    NativeScreenCaptureStatus {
        module: "screen".to_string(),
        state: NativeMonitorState::Idle,
        error_code: None,
        message: "Native screen monitor is idle.".to_string(),
        active_exam_id: None,
        selected_display_id: None,
        selected_display_label: None,
        width: None,
        height: None,
        frame_count: 0,
        capture_started_at: None,
        latest_frame_timestamp: None,
        latest_frame_sequence: None,
        sample_interval_ms: DEFAULT_SAMPLE_INTERVAL_MS,
        last_error: None,
    }
}

fn active_capture_status(
    display: &DisplayDevice,
    interval_ms: u64,
    active_exam_id: Option<String>,
    sequence_number: u64,
    captured_at: String,
    started_at: String,
) -> NativeScreenCaptureStatus {
    NativeScreenCaptureStatus {
        module: "screen".to_string(),
        state: NativeMonitorState::Active,
        error_code: None,
        message: "Native screen capture is active.".to_string(),
        active_exam_id,
        selected_display_id: Some(display.id.clone()),
        selected_display_label: Some(display.label.clone()),
        width: Some(display.width),
        height: Some(display.height),
        frame_count: sequence_number,
        capture_started_at: Some(started_at),
        latest_frame_timestamp: Some(captured_at),
        latest_frame_sequence: Some(sequence_number),
        sample_interval_ms: interval_ms,
        last_error: None,
    }
}

fn unix_timestamp() -> String {
    format!("unix-ms:{}", unix_millis())
}

fn unix_millis() -> u128 {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    millis
}

fn parse_unix_millis(value: &str) -> Option<u128> {
    value.strip_prefix("unix-ms:")?.parse::<u128>().ok()
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn current_windows_session_id(process_id: u32) -> (Option<u32>, Option<String>) {
    let mut session_id = 0_u32;
    let ok = unsafe { ProcessIdToSessionId(process_id, &mut session_id as *mut u32) };
    if ok == 0 {
        return (
            None,
            Some(format!(
                "ProcessIdToSessionId failed with Win32 error {}.",
                last_windows_error()
            )),
        );
    }
    (Some(session_id), None)
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn active_console_windows_session_id() -> Option<u32> {
    let session_id = unsafe { WTSGetActiveConsoleSessionId() };
    if session_id == u32::MAX {
        None
    } else {
        Some(session_id)
    }
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn can_open_input_desktop() -> (bool, Option<String>) {
    const DESKTOP_READOBJECTS: u32 = 0x0001;
    let desktop = unsafe { OpenInputDesktop(0, 0, DESKTOP_READOBJECTS) };
    if desktop == 0 {
        return (
            false,
            Some(format!(
                "OpenInputDesktop failed with Win32 error {}.",
                last_windows_error()
            )),
        );
    }
    let closed = unsafe { CloseDesktop(desktop) };
    if closed == 0 {
        return (
            true,
            Some(format!(
                "CloseDesktop failed with Win32 error {} after opening the input desktop.",
                last_windows_error()
            )),
        );
    }
    (true, None)
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn is_process_elevated() -> (Option<bool>, Option<String>) {
    let is_admin = unsafe { IsUserAnAdmin() };
    (Some(is_admin != 0), None)
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
fn last_windows_error() -> u32 {
    unsafe { GetLastError() }
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
#[link(name = "kernel32")]
extern "system" {
    fn ProcessIdToSessionId(dwProcessId: u32, pSessionId: *mut u32) -> i32;
    fn WTSGetActiveConsoleSessionId() -> u32;
    fn GetLastError() -> u32;
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
#[link(name = "user32")]
extern "system" {
    fn OpenInputDesktop(dwFlags: u32, fInherit: i32, dwDesiredAccess: u32) -> isize;
    fn CloseDesktop(hDesktop: isize) -> i32;
}

#[cfg(all(target_os = "windows", any(test, debug_assertions)))]
#[link(name = "shell32")]
extern "system" {
    fn IsUserAnAdmin() -> i32;
}

fn expected_frame_size(
    width: u32,
    height: u32,
    bytes_per_pixel: usize,
) -> Result<usize, NativeMonitorError> {
    let pixels = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| {
            NativeMonitorError::screen("invalid_display_size", "Display dimensions overflow.")
        })?;
    let size = pixels.checked_mul(bytes_per_pixel).ok_or_else(|| {
        NativeMonitorError::screen("invalid_display_size", "Display frame size overflows.")
    })?;
    if width == 0 || height == 0 || size > MAX_CAPTURE_BYTES {
        return Err(NativeMonitorError::screen(
            "invalid_display_size",
            format!("Unsupported capture dimensions {width}x{height}."),
        ));
    }
    Ok(size)
}

fn validate_bgra_frame(frame: &ScreenFrameSample) -> Result<(), NativeMonitorError> {
    let expected = expected_frame_size(frame.width, frame.height, 4)?;
    if frame.stride != frame.width * 4 {
        return Err(NativeMonitorError::screen(
            "invalid_frame_stride",
            format!(
                "Unexpected BGRA stride {} for width {}.",
                frame.stride, frame.width
            ),
        ));
    }
    if frame.size_bytes != expected || frame.bgra.len() != expected {
        return Err(NativeMonitorError::screen(
            "invalid_frame_size",
            format!(
                "Unexpected BGRA buffer length: metadata={}, actual={}, expected={expected}.",
                frame.size_bytes,
                frame.bgra.len()
            ),
        ));
    }
    Ok(())
}

fn encode_png_sample(
    frame: &ScreenFrameSample,
) -> Result<CompressedScreenSample, NativeMonitorError> {
    validate_bgra_frame(frame)?;
    let mut rgba = Vec::with_capacity(frame.bgra.len());
    for chunk in frame.bgra.chunks_exact(4) {
        rgba.extend_from_slice(&[chunk[2], chunk[1], chunk[0], 255]);
    }

    let mut data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut data, frame.width, frame.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|error| {
            NativeMonitorError::screen(
                "sample_compression_failed",
                format!("PNG header failed: {error}"),
            )
        })?;
        writer.write_image_data(&rgba).map_err(|error| {
            NativeMonitorError::screen(
                "sample_compression_failed",
                format!("PNG encode failed: {error}"),
            )
        })?;
    }

    Ok(CompressedScreenSample {
        display_id: frame.display_id.clone(),
        width: frame.width,
        height: frame.height,
        encoding: "image/png".to_string(),
        pixel_source_format: frame.pixel_format.clone(),
        sequence_number: frame.sequence_number,
        captured_at: frame.captured_at.clone(),
        size_bytes: data.len(),
        data,
    })
}

#[cfg(target_os = "windows")]
impl ScreenCaptureBackend for NativeScreenCaptureBackend {
    fn capture_frame(
        &self,
        display: &DisplayDevice,
        sequence_number: u64,
    ) -> Result<ScreenFrameSample, NativeMonitorError> {
        windows_capture_frame(display, sequence_number)
    }
}

#[cfg(not(target_os = "windows"))]
impl ScreenCaptureBackend for NativeScreenCaptureBackend {
    fn capture_frame(
        &self,
        _display: &DisplayDevice,
        _sequence_number: u64,
    ) -> Result<ScreenFrameSample, NativeMonitorError> {
        Err(NativeMonitorError::not_implemented(
            "screen",
            "Native screen capture is implemented only for Windows.",
        ))
    }
}

#[cfg(target_os = "windows")]
fn windows_capture_frame(
    display: &DisplayDevice,
    sequence_number: u64,
) -> Result<ScreenFrameSample, NativeMonitorError> {
    use std::mem::{size_of, zeroed};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GetLastError, HWND};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetDeviceCaps,
        ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
        HBITMAP, HDC, HGDIOBJ, RASTERCAPS, RC_BITBLT, RGBQUAD, SRCCOPY,
    };

    let width = display.width;
    let height = display.height;
    let size_bytes = expected_frame_size(width, height, 4).map_err(|error| NativeMonitorError {
        message: format!("Display '{}': {}", display.label, error.message),
        ..error
    })?;

    struct WindowDeviceContext {
        hwnd: HWND,
        hdc: HDC,
    }
    impl Drop for WindowDeviceContext {
        fn drop(&mut self) {
            unsafe {
                let _ = ReleaseDC(self.hwnd, self.hdc);
            }
        }
    }

    struct CompatibleDeviceContext(HDC);
    impl Drop for CompatibleDeviceContext {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteDC(self.0);
            }
        }
    }

    struct Bitmap(HBITMAP);
    impl Drop for Bitmap {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteObject(self.0);
            }
        }
    }

    struct SelectedObject {
        dc: HDC,
        previous: HGDIOBJ,
    }
    impl Drop for SelectedObject {
        fn drop(&mut self) {
            if !self.previous.is_null() {
                unsafe {
                    let _ = SelectObject(self.dc, self.previous);
                }
            }
        }
    }

    unsafe {
        let screen_dc = GetDC(null_mut());
        if screen_dc.is_null() {
            return Err(NativeMonitorError::screen(
                "capture_backend_failed",
                "GetDC(NULL) returned a null source DC.",
            ));
        }
        let screen_dc = WindowDeviceContext {
            hwnd: null_mut(),
            hdc: screen_dc,
        };
        let source_caps = GetDeviceCaps(screen_dc.hdc, RASTERCAPS as i32);
        if source_caps & RC_BITBLT as i32 == 0 {
            return Err(NativeMonitorError::screen(
                "capture_backend_failed",
                "GetDC(NULL) source DC does not support BitBlt.",
            ));
        }

        let memory_dc = CreateCompatibleDC(screen_dc.hdc);
        if memory_dc.is_null() {
            return Err(NativeMonitorError::screen(
                "capture_backend_failed",
                "Could not create compatible memory DC for screen capture.",
            ));
        }
        let memory_dc = CompatibleDeviceContext(memory_dc);

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: size_bytes as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [zeroed::<RGBQUAD>(); 1],
        };
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(
            screen_dc.hdc,
            &mut bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            null_mut(),
            0,
        );
        if bitmap.is_null() || bits.is_null() {
            return Err(NativeMonitorError::screen(
                "capture_backend_failed",
                "Could not allocate screen capture bitmap.",
            ));
        }
        let bitmap = Bitmap(bitmap);

        let previous = SelectObject(memory_dc.0, bitmap.0);
        if previous.is_null() {
            return Err(NativeMonitorError::screen(
                "capture_backend_failed",
                "Could not select screen capture bitmap into the memory DC.",
            ));
        }
        let _selected = SelectedObject {
            dc: memory_dc.0,
            previous,
        };
        let mut ok = BitBlt(
            memory_dc.0,
            0,
            0,
            width as i32,
            height as i32,
            screen_dc.hdc,
            display.x,
            display.y,
            SRCCOPY | CAPTUREBLT,
        );
        if ok == 0 {
            ok = BitBlt(
                memory_dc.0,
                0,
                0,
                width as i32,
                height as i32,
                screen_dc.hdc,
                display.x,
                display.y,
                SRCCOPY,
            );
        }
        if ok == 0 {
            let last_error = GetLastError();
            return Err(NativeMonitorError::screen(
                "frame_acquisition_failed",
                format!("Windows BitBlt failed while acquiring a screen frame. GetLastError={last_error}."),
            ));
        }

        let data = std::slice::from_raw_parts(bits.cast::<u8>(), size_bytes).to_vec();
        let frame = ScreenFrameSample {
            display_id: display.id.clone(),
            width,
            height,
            stride: width * 4,
            pixel_format: "bgra8".to_string(),
            sequence_number,
            captured_at: unix_timestamp(),
            size_bytes,
            bgra: data,
        };
        validate_bgra_frame(&frame)?;
        Ok(frame)
    }
}

#[cfg(all(debug_assertions, not(target_os = "windows")))]
fn diagnose_display_capture(
    display: &DisplayDevice,
) -> Result<NativeScreenCaptureDiagnostic, NativeMonitorError> {
    Ok(NativeScreenCaptureDiagnostic {
        display_id: Some(display.id.clone()),
        display_label: Some(display.label.clone()),
        display_x: display.x,
        display_y: display.y,
        width: display.width,
        height: display.height,
        expected_bgra_size: expected_frame_size(display.width, display.height, 4)?,
        attempts: vec![GdiCaptureAttemptDiagnostic {
            source_strategy: "unsupported_platform".to_string(),
            source_dc_acquired: false,
            source_dc_handle: 0,
            source_object_type: 0,
            source_raster_caps: 0,
            source_supports_bitblt: false,
            memory_dc_created: false,
            memory_dc_handle: 0,
            memory_object_type: 0,
            bitmap_created: false,
            bitmap_handle: 0,
            object_selected: false,
            previous_object_handle: 0,
            capture_blt_succeeded: false,
            capture_blt_error: None,
            srccopy_succeeded: false,
            srccopy_error: None,
            frame_byte_length: None,
            png_byte_length: None,
            error_stage: Some("unsupported_platform".to_string()),
            win32_error: None,
        }],
    })
}

#[cfg(all(debug_assertions, target_os = "windows"))]
fn diagnose_display_capture(
    display: &DisplayDevice,
) -> Result<NativeScreenCaptureDiagnostic, NativeMonitorError> {
    let expected_bgra_size = expected_frame_size(display.width, display.height, 4)?;
    let attempts = [
        "GetDC(NULL)",
        "GetWindowDC(GetDesktopWindow())",
        "CreateDC(display)",
    ]
    .into_iter()
    .map(|strategy| diagnose_gdi_attempt(display, strategy, expected_bgra_size))
    .collect();

    Ok(NativeScreenCaptureDiagnostic {
        display_id: Some(display.id.clone()),
        display_label: Some(display.label.clone()),
        display_x: display.x,
        display_y: display.y,
        width: display.width,
        height: display.height,
        expected_bgra_size,
        attempts,
    })
}

#[cfg(all(debug_assertions, target_os = "windows"))]
fn diagnose_gdi_attempt(
    display: &DisplayDevice,
    strategy: &str,
    expected_bgra_size: usize,
) -> GdiCaptureAttemptDiagnostic {
    use std::mem::{size_of, zeroed};
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDCW, CreateDIBSection, DeleteDC, DeleteObject, GetDC,
        GetDeviceCaps, GetObjectType, GetWindowDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, RASTERCAPS, RC_BITBLT, RGBQUAD, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::GetDesktopWindow;

    let mut diagnostic = GdiCaptureAttemptDiagnostic {
        source_strategy: strategy.to_string(),
        source_dc_acquired: false,
        source_dc_handle: 0,
        source_object_type: 0,
        source_raster_caps: 0,
        source_supports_bitblt: false,
        memory_dc_created: false,
        memory_dc_handle: 0,
        memory_object_type: 0,
        bitmap_created: false,
        bitmap_handle: 0,
        object_selected: false,
        previous_object_handle: 0,
        capture_blt_succeeded: false,
        capture_blt_error: None,
        srccopy_succeeded: false,
        srccopy_error: None,
        frame_byte_length: None,
        png_byte_length: None,
        error_stage: None,
        win32_error: None,
    };

    unsafe {
        let desktop = GetDesktopWindow();
        let (source_dc, release_hwnd, delete_source_dc) = match strategy {
            "GetDC(NULL)" => (GetDC(null_mut()), null_mut(), false),
            "GetWindowDC(GetDesktopWindow())" => (GetWindowDC(desktop), desktop, false),
            _ => {
                let driver = wide_null("DISPLAY");
                let device = wide_null(&display.label);
                (
                    CreateDCW(driver.as_ptr(), device.as_ptr(), null(), null()),
                    null_mut(),
                    true,
                )
            }
        };

        diagnostic.source_dc_handle = source_dc as usize;
        diagnostic.source_dc_acquired = !source_dc.is_null();
        if source_dc.is_null() {
            diagnostic.error_stage = Some("source_dc".to_string());
            diagnostic.win32_error = Some(GetLastError());
            return diagnostic;
        }

        diagnostic.source_object_type = GetObjectType(source_dc.cast());
        diagnostic.source_raster_caps = GetDeviceCaps(source_dc, RASTERCAPS as i32);
        diagnostic.source_supports_bitblt = diagnostic.source_raster_caps & RC_BITBLT as i32 != 0;

        let memory_dc = CreateCompatibleDC(source_dc);
        diagnostic.memory_dc_handle = memory_dc as usize;
        diagnostic.memory_dc_created = !memory_dc.is_null();
        if !memory_dc.is_null() {
            diagnostic.memory_object_type = GetObjectType(memory_dc.cast());
        }
        if memory_dc.is_null() {
            diagnostic.error_stage = Some("memory_dc".to_string());
            diagnostic.win32_error = Some(GetLastError());
            release_source_dc(source_dc, release_hwnd, delete_source_dc);
            return diagnostic;
        }

        let mut bitmap_info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: display.width as i32,
                biHeight: -(display.height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB,
                biSizeImage: expected_bgra_size as u32,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [zeroed::<RGBQUAD>(); 1],
        };
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(
            source_dc,
            &mut bitmap_info,
            DIB_RGB_COLORS,
            &mut bits,
            null_mut(),
            0,
        );
        diagnostic.bitmap_handle = bitmap as usize;
        diagnostic.bitmap_created = !bitmap.is_null() && !bits.is_null();
        if bitmap.is_null() || bits.is_null() {
            diagnostic.error_stage = Some("bitmap".to_string());
            diagnostic.win32_error = Some(GetLastError());
            DeleteDC(memory_dc);
            release_source_dc(source_dc, release_hwnd, delete_source_dc);
            return diagnostic;
        }

        let previous = SelectObject(memory_dc, bitmap);
        diagnostic.previous_object_handle = previous as usize;
        diagnostic.object_selected = !previous.is_null();
        if previous.is_null() {
            diagnostic.error_stage = Some("select_object".to_string());
            diagnostic.win32_error = Some(GetLastError());
            DeleteObject(bitmap);
            DeleteDC(memory_dc);
            release_source_dc(source_dc, release_hwnd, delete_source_dc);
            return diagnostic;
        }

        let capture_ok = BitBlt(
            memory_dc,
            0,
            0,
            display.width as i32,
            display.height as i32,
            source_dc,
            display.x,
            display.y,
            SRCCOPY | CAPTUREBLT,
        );
        diagnostic.capture_blt_succeeded = capture_ok != 0;
        if capture_ok == 0 {
            diagnostic.capture_blt_error = Some(GetLastError());
        }

        let srccopy_ok = BitBlt(
            memory_dc,
            0,
            0,
            display.width as i32,
            display.height as i32,
            source_dc,
            display.x,
            display.y,
            SRCCOPY,
        );
        diagnostic.srccopy_succeeded = srccopy_ok != 0;
        if srccopy_ok == 0 {
            diagnostic.srccopy_error = Some(GetLastError());
        }

        if capture_ok != 0 || srccopy_ok != 0 {
            let data = std::slice::from_raw_parts(bits.cast::<u8>(), expected_bgra_size).to_vec();
            diagnostic.frame_byte_length = Some(data.len());
            let frame = ScreenFrameSample {
                display_id: display.id.clone(),
                width: display.width,
                height: display.height,
                stride: display.width * 4,
                pixel_format: "bgra8".to_string(),
                sequence_number: 1,
                captured_at: unix_timestamp(),
                size_bytes: data.len(),
                bgra: data,
            };
            if let Ok(sample) = encode_png_sample(&frame) {
                diagnostic.png_byte_length = Some(sample.size_bytes);
            } else {
                diagnostic.error_stage = Some("png".to_string());
            }
        } else {
            diagnostic.error_stage = Some("bitblt".to_string());
            diagnostic.win32_error = diagnostic.srccopy_error.or(diagnostic.capture_blt_error);
        }

        SelectObject(memory_dc, previous);
        DeleteObject(bitmap);
        DeleteDC(memory_dc);
        release_source_dc(source_dc, release_hwnd, delete_source_dc);
    }

    diagnostic
}

#[cfg(all(debug_assertions, target_os = "windows"))]
unsafe fn release_source_dc(
    source_dc: windows_sys::Win32::Graphics::Gdi::HDC,
    hwnd: windows_sys::Win32::Foundation::HWND,
    delete_source_dc: bool,
) {
    use windows_sys::Win32::Graphics::Gdi::{DeleteDC, ReleaseDC};
    if delete_source_dc {
        let _ = DeleteDC(source_dc);
    } else {
        let _ = ReleaseDC(hwnd, source_dc);
    }
}

#[cfg(all(debug_assertions, target_os = "windows"))]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    #[derive(Clone)]
    struct FakeBackend {
        calls: Arc<AtomicU64>,
        fail_after: Option<u64>,
    }

    impl ScreenCaptureBackend for FakeBackend {
        fn capture_frame(
            &self,
            display: &DisplayDevice,
            sequence_number: u64,
        ) -> Result<ScreenFrameSample, NativeMonitorError> {
            let call = self.calls.fetch_add(1, Ordering::SeqCst) + 1;
            if self.fail_after.is_some_and(|limit| call > limit) {
                return Err(NativeMonitorError::screen(
                    "frame_acquisition_failed",
                    "fake capture failed",
                ));
            }
            Ok(ScreenFrameSample {
                display_id: display.id.clone(),
                width: display.width,
                height: display.height,
                stride: display.width * 4,
                pixel_format: "bgra8".to_string(),
                sequence_number,
                captured_at: unix_timestamp(),
                size_bytes: (display.width * display.height * 4) as usize,
                bgra: vec![sequence_number as u8; (display.width * display.height * 4) as usize],
            })
        }
    }

    #[test]
    fn stop_is_idempotent() {
        let manager = ScreenManager::with_backend(Arc::new(FakeBackend {
            calls: Arc::new(AtomicU64::new(0)),
            fail_after: None,
        }));

        manager.stop_capture().expect("first stop");
        manager.stop_capture().expect("second stop");

        assert_eq!(manager.capture_status().state, NativeMonitorState::Idle);
        assert!(!manager.is_monitoring());
    }

    #[test]
    fn duplicate_start_does_not_create_second_worker() {
        let calls = Arc::new(AtomicU64::new(0));
        let manager = ScreenManager::with_backend(Arc::new(FakeBackend {
            calls: calls.clone(),
            fail_after: None,
        }));
        let config = ScreenCaptureConfig {
            display_id: None,
            sample_interval_ms: Some(30_000),
            active_exam_id: Some("exam-1".to_string()),
        };

        manager
            .start_capture_for_display_test(test_display(), config.clone())
            .expect("first start");
        manager
            .start_capture_for_display_test(test_display(), config)
            .expect("duplicate start");

        assert_eq!(calls.load(Ordering::SeqCst), 1);
        assert_eq!(manager.capture_status().state, NativeMonitorState::Active);
        manager.stop_capture().expect("stop");
    }

    #[test]
    fn worker_failure_moves_status_to_failed() {
        let manager = ScreenManager::with_backend(Arc::new(FakeBackend {
            calls: Arc::new(AtomicU64::new(0)),
            fail_after: Some(1),
        }));
        manager
            .start_capture_for_display_test(
                test_display(),
                ScreenCaptureConfig {
                    display_id: None,
                    sample_interval_ms: Some(250),
                    active_exam_id: Some("exam-1".to_string()),
                },
            )
            .expect("start");

        let mut status = manager.capture_status();
        for _ in 0..10 {
            if status.state == NativeMonitorState::Failed {
                break;
            }
            std::thread::sleep(Duration::from_millis(250));
            status = manager.capture_status();
        }

        assert_eq!(status.state, NativeMonitorState::Failed);
        assert_eq!(
            status.error_code.as_deref(),
            Some("frame_acquisition_failed")
        );
        assert!(!manager.is_monitoring());
        manager.stop_capture().expect("cleanup failed worker");
    }

    #[test]
    fn latest_frame_storage_replaces_previous_frame() {
        let display = test_display();
        let shared = Arc::new(Mutex::new(ScreenShared {
            status: idle_capture_status(),
            latest_frame: None,
            stop_signal: None,
        }));
        {
            let mut guard = shared.lock().unwrap();
            guard.latest_frame = Some(test_frame(&display, 1));
            guard.latest_frame = Some(test_frame(&display, 2));
        }

        let latest = shared.lock().unwrap().latest_frame.clone().unwrap();
        assert_eq!(latest.sequence_number, 2);
        assert_eq!(latest.bgra, vec![2; latest.size_bytes]);
    }

    #[test]
    fn status_serializes_capture_diagnostics() {
        let display = test_display();
        let status = active_capture_status(
            &display,
            1_000,
            Some("exam-1".to_string()),
            7,
            "unix-ms:7".to_string(),
            "unix-ms:1".to_string(),
        );
        let value = serde_json::to_value(status).expect("serialize");

        assert_eq!(value["state"], "active");
        assert_eq!(value["selectedDisplayId"], "display-test");
        assert_eq!(value["latestFrameSequence"], 7);
        assert_eq!(value["sampleIntervalMs"], 1_000);
    }

    #[test]
    fn failed_status_does_not_report_healthy() {
        let manager = ScreenManager::with_backend(Arc::new(FakeBackend {
            calls: Arc::new(AtomicU64::new(0)),
            fail_after: None,
        }));
        manager.set_failed(
            Some("frame_acquisition_failed".to_string()),
            "failed".to_string(),
            Some("exam-1".to_string()),
            Some(&test_display()),
            1_000,
        );

        let health = manager.health_check();
        assert_eq!(health.state, NativeMonitorState::Failed);
        assert!(!manager.is_monitoring());
    }

    #[test]
    fn active_capture_with_stale_frame_reports_degraded_health() {
        let manager = ScreenManager::with_backend(Arc::new(FakeBackend {
            calls: Arc::new(AtomicU64::new(0)),
            fail_after: None,
        }));
        {
            let mut shared = manager.shared.lock().unwrap();
            shared.status = active_capture_status(
                &test_display(),
                250,
                Some("exam-1".to_string()),
                1,
                "unix-ms:1".to_string(),
                "unix-ms:1".to_string(),
            );
        }

        let health = manager.health_check();

        assert_eq!(health.state, NativeMonitorState::Degraded);
        assert_eq!(health.error_code.as_deref(), Some("stale_frame"));
    }

    #[test]
    fn validates_bgra_frame_size_and_stride() {
        let display = test_display();
        let valid = test_frame(&display, 1);
        validate_bgra_frame(&valid).expect("valid frame");

        let mut invalid = valid.clone();
        invalid.stride = 99;
        assert_eq!(
            validate_bgra_frame(&invalid).unwrap_err().code,
            "invalid_frame_stride"
        );

        let mut invalid = valid;
        invalid.bgra.pop();
        assert_eq!(
            validate_bgra_frame(&invalid).unwrap_err().code,
            "invalid_frame_size"
        );
    }

    #[test]
    fn compressed_sample_has_metadata_and_non_empty_png_bytes() {
        let sample = encode_png_sample(&test_frame(&test_display(), 9)).expect("png sample");

        assert_eq!(sample.encoding, "image/png");
        assert_eq!(sample.pixel_source_format, "bgra8");
        assert_eq!(sample.sequence_number, 9);
        assert_eq!(sample.width, 2);
        assert_eq!(sample.height, 2);
        assert!(sample.size_bytes > 8);
        assert_eq!(&sample.data[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);
    }

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "requires an interactive Windows desktop"]
    fn live_native_screen_capture_smoke() {
        let manager = ScreenManager::new();
        manager
            .start_capture_with_config(ScreenCaptureConfig {
                display_id: None,
                sample_interval_ms: Some(250),
                active_exam_id: Some("live-smoke-test".to_string()),
            })
            .expect("start native capture");

        std::thread::sleep(Duration::from_millis(500));
        let sample = manager
            .latest_compressed_sample()
            .expect("compress sample")
            .expect("sample available");

        assert_eq!(sample.encoding, "image/png");
        assert!(sample.width > 0);
        assert!(sample.height > 0);
        assert!(sample.size_bytes > 8);
        assert_eq!(&sample.data[0..8], &[137, 80, 78, 71, 13, 10, 26, 10]);

        manager.stop_capture().expect("stop native capture");
        assert_eq!(manager.capture_status().state, NativeMonitorState::Idle);

        manager
            .start_capture_with_config(ScreenCaptureConfig {
                display_id: None,
                sample_interval_ms: Some(250),
                active_exam_id: Some("live-smoke-test-restart".to_string()),
            })
            .expect("restart native capture");
        manager
            .stop_capture()
            .expect("stop restarted native capture");
        assert_eq!(manager.capture_status().state, NativeMonitorState::Idle);
    }

    #[cfg(target_os = "windows")]
    #[test]
    #[ignore = "requires an interactive Windows desktop"]
    fn live_native_screen_capture_diagnostics() {
        let manager = ScreenManager::new();
        let diagnostic = manager.diagnose_capture().expect("diagnostic");
        println!(
            "{}",
            serde_json::to_string_pretty(&diagnostic).expect("diagnostic json")
        );

        assert!(diagnostic.width > 0);
        assert!(diagnostic.height > 0);
        assert_eq!(
            diagnostic.expected_bgra_size,
            diagnostic.width as usize * diagnostic.height as usize * 4
        );
    }

    #[test]
    fn sample_interval_is_bounded() {
        assert_eq!(normalize_interval(Some(1)), MIN_SAMPLE_INTERVAL_MS);
        assert_eq!(normalize_interval(Some(100_000)), MAX_SAMPLE_INTERVAL_MS);
        assert_eq!(normalize_interval(None), DEFAULT_SAMPLE_INTERVAL_MS);
    }

    fn test_display() -> DisplayDevice {
        DisplayDevice {
            id: "display-test".to_string(),
            label: "DISPLAY_TEST".to_string(),
            is_primary: true,
            width: 2,
            height: 2,
            x: 0,
            y: 0,
        }
    }

    fn test_frame(display: &DisplayDevice, sequence_number: u64) -> ScreenFrameSample {
        ScreenFrameSample {
            display_id: display.id.clone(),
            width: display.width,
            height: display.height,
            stride: display.width * 4,
            pixel_format: "bgra8".to_string(),
            sequence_number,
            captured_at: unix_timestamp(),
            size_bytes: (display.width * display.height * 4) as usize,
            bgra: vec![sequence_number as u8; (display.width * display.height * 4) as usize],
        }
    }
}
