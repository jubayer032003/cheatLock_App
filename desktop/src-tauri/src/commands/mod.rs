use crate::ai::AiPipeline;
use crate::audio::AudioManager;
use crate::camera::CameraManager;
use crate::device::{DeviceIdentity, DeviceIdentityManager};
use crate::hardware::{collect_hardware_diagnostics, HardwareError, NativeHardwareDiagnostics};
use crate::network::{probe_backend_health, probe_latency, NetworkProbeResult};
use crate::screen::ScreenManager;
use crate::screen::{
    CompressedScreenSample, NativeMonitorStatus, NativeScreenCaptureDiagnostic,
    NativeScreenCaptureStatus, NativeScreenSessionDiagnostics, ScreenCaptureConfig,
};
use crate::secure_store;
use crate::security::SecurityManager;
use std::process::Command;
use tauri::{Manager, State};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeMonitoringStatus {
    pub screen: NativeMonitorStatus,
    pub camera: NativeMonitorStatus,
    pub audio: NativeMonitorStatus,
    pub ai: NativeMonitorStatus,
    pub application_security_active: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeScreenCaptureSmokeResult {
    pub started: bool,
    pub sample_received: bool,
    pub width: u32,
    pub height: u32,
    pub encoding: String,
    pub size_bytes: usize,
    pub sequence_number: u64,
    pub stopped: bool,
    pub cleanup_state: String,
}

#[tauri::command]
pub fn toggle_kiosk(enabled: bool, security: State<'_, SecurityManager>) -> Result<(), String> {
    security.set_kiosk_enabled(enabled)
}

#[tauri::command]
pub fn is_kiosk_active(security: State<'_, SecurityManager>) -> bool {
    security.is_kiosk_active()
}

fn validate_teacher_dashboard_url(url: &str) -> Result<&str, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("Teacher dashboard URL is required.".to_string());
    }
    if trimmed.len() > 2048 {
        return Err("Teacher dashboard URL is too long.".to_string());
    }
    if trimmed.bytes().any(|byte| byte < 0x20 || byte == 0x7f) {
        return Err("Teacher dashboard URL contains invalid control characters.".to_string());
    }
    let is_https = trimmed.starts_with("https://");
    let is_local_dev =
        trimmed.starts_with("http://127.0.0.1:") || trimmed.starts_with("http://localhost:");
    if !is_https && !is_local_dev {
        return Err("Teacher dashboard URL must use HTTPS or local development HTTP.".to_string());
    }
    Ok(trimmed)
}

#[cfg(target_os = "windows")]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn()
        .map_err(|error| format!("Failed to open teacher dashboard: {error}"))?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|error| format!("Failed to open teacher dashboard: {error}"))?;
    Ok(())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url_with_system_handler(url: &str) -> Result<(), String> {
    Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|error| format!("Failed to open teacher dashboard: {error}"))?;
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
fn open_url_with_system_handler(_url: &str) -> Result<(), String> {
    Err("Opening the teacher dashboard is unsupported on this platform.".to_string())
}

#[tauri::command]
pub fn open_teacher_web_dashboard(url: String) -> Result<(), String> {
    let validated = validate_teacher_dashboard_url(&url)?;
    open_url_with_system_handler(validated)
}

#[tauri::command]
pub async fn check_network_latency(url: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || probe_latency(&url))
        .await
        .map_err(|e| format!("Network latency task failed: {e}"))?
}

#[tauri::command]
pub async fn probe_backend_health_command(
    origin: String,
    timeout_ms: Option<u64>,
) -> NetworkProbeResult {
    tauri::async_runtime::spawn_blocking(move || {
        probe_backend_health(&origin, timeout_ms.unwrap_or(8_000))
    })
    .await
    .unwrap_or_else(|e| NetworkProbeResult {
        reachable: false,
        latency_ms: None,
        status_code: None,
        checked_at: "unavailable".to_string(),
        error_code: Some("probe_task_failed".to_string()),
        message: Some(format!("Network probe task failed: {e}")),
    })
}

#[tauri::command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    secure_store::get_secret(&key)
}

#[tauri::command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    secure_store::set_secret(&key, &value)
}

#[tauri::command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    secure_store::delete_secret(&key)
}

#[tauri::command]
pub fn get_installation_device_identity(app: tauri::AppHandle) -> Result<DeviceIdentity, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve application config directory: {e}"))?;
    let manager = DeviceIdentityManager::new(config_dir.join("device_identity"));
    let identity = manager.get_or_create()?;
    if identity.was_created {
        log::info!(
            "[Device] Installation device identity {}.",
            if identity.recovered_from_corruption {
                "recovered"
            } else {
                "created"
            }
        );
    }
    Ok(identity)
}

#[tauri::command]
pub async fn get_native_hardware_diagnostics() -> Result<NativeHardwareDiagnostics, HardwareError> {
    tauri::async_runtime::spawn_blocking(collect_hardware_diagnostics)
        .await
        .map_err(|error| HardwareError {
            code: "hardware_task_failed".to_string(),
            message: format!("Native hardware diagnostics task failed: {error}"),
        })
}

#[tauri::command]
pub fn get_native_monitoring_status(
    security: State<'_, SecurityManager>,
    screen: State<'_, ScreenManager>,
    camera: State<'_, CameraManager>,
    audio: State<'_, AudioManager>,
    ai: State<'_, AiPipeline>,
) -> NativeMonitoringStatus {
    NativeMonitoringStatus {
        screen: screen.health_check(),
        camera: camera.health_check(),
        audio: audio.health_check(),
        ai: ai.health_check(),
        application_security_active: security.is_kiosk_active(),
    }
}

#[tauri::command]
pub fn start_native_screen_capture(
    config: Option<ScreenCaptureConfig>,
    screen: State<'_, ScreenManager>,
) -> Result<(), String> {
    screen
        .start_capture_with_config(config.unwrap_or_default())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn stop_native_screen_capture(screen: State<'_, ScreenManager>) -> Result<(), String> {
    screen.stop_capture().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_native_screen_capture_status(
    screen: State<'_, ScreenManager>,
) -> NativeScreenCaptureStatus {
    screen.capture_status()
}

#[tauri::command]
pub fn capture_native_screen_sample(
    screen: State<'_, ScreenManager>,
) -> Result<Option<CompressedScreenSample>, String> {
    screen
        .latest_compressed_sample()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_native_screen_capture_smoke_test(
    screen: State<'_, ScreenManager>,
) -> Result<NativeScreenCaptureSmokeResult, String> {
    #[cfg(not(debug_assertions))]
    {
        let _ = screen;
        return Err(
            "Native screen capture smoke test is available only in debug builds.".to_string(),
        );
    }

    #[cfg(debug_assertions)]
    {
        let _ = screen.stop_capture();
        screen
            .start_capture_with_config(ScreenCaptureConfig {
                display_id: None,
                sample_interval_ms: Some(250),
                active_exam_id: Some("debug-smoke-test".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let mut sample = None;
        for _ in 0..10 {
            sample = screen
                .latest_compressed_sample()
                .map_err(|error| error.to_string())?;
            if sample.is_some() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(250));
        }

        let Some(sample) = sample else {
            let _ = screen.stop_capture();
            return Err("Native screen capture smoke test did not receive a sample.".to_string());
        };

        if sample.width == 0 || sample.height == 0 || sample.size_bytes == 0 {
            let _ = screen.stop_capture();
            return Err(
                "Native screen capture smoke test received invalid sample metadata.".to_string(),
            );
        }
        if sample.encoding != "image/png"
            || sample.data.len() < 8
            || sample.data[0..8] != [137, 80, 78, 71, 13, 10, 26, 10]
        {
            let _ = screen.stop_capture();
            return Err("Native screen capture smoke test received invalid PNG data.".to_string());
        }

        screen.stop_capture().map_err(|error| error.to_string())?;
        let cleanup = screen.capture_status();
        Ok(NativeScreenCaptureSmokeResult {
            started: true,
            sample_received: true,
            width: sample.width,
            height: sample.height,
            encoding: sample.encoding,
            size_bytes: sample.size_bytes,
            sequence_number: sample.sequence_number,
            stopped: cleanup.state == crate::screen::NativeMonitorState::Idle,
            cleanup_state: format!("{:?}", cleanup.state),
        })
    }
}

#[tauri::command]
pub fn diagnose_native_screen_capture(
    screen: State<'_, ScreenManager>,
) -> Result<NativeScreenCaptureDiagnostic, String> {
    #[cfg(not(debug_assertions))]
    {
        let _ = screen;
        return Err(
            "Native screen capture diagnostics are available only in debug builds.".to_string(),
        );
    }

    #[cfg(debug_assertions)]
    {
        screen.diagnose_capture().map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn get_native_screen_session_diagnostics() -> Result<NativeScreenSessionDiagnostics, String> {
    #[cfg(not(debug_assertions))]
    {
        return Err(
            "Native screen session diagnostics are available only in debug builds.".to_string(),
        );
    }

    #[cfg(debug_assertions)]
    {
        Ok(crate::screen::collect_screen_session_diagnostics())
    }
}

#[tauri::command]
pub async fn get_hardware_status() -> Result<NativeHardwareDiagnostics, HardwareError> {
    get_native_hardware_diagnostics().await
}

#[tauri::command]
pub fn set_screenshot_prevention(
    enabled: bool,
    window: tauri::Window,
    security: State<'_, SecurityManager>,
) -> Result<(), String> {
    security.set_capture_affinity(&window, enabled)
}

#[tauri::command]
pub fn check_monitors(
    window: tauri::Window,
    security: State<'_, SecurityManager>,
) -> Result<usize, String> {
    security.get_monitor_count(&window)
}

#[tauri::command]
pub fn enforce_window_kiosk(
    enabled: bool,
    window: tauri::Window,
    security: State<'_, SecurityManager>,
) -> Result<(), String> {
    security.set_kiosk_enabled(enabled)?;
    if enabled {
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        let _ = security.set_capture_affinity(&window, true);
    } else {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
        window.set_resizable(true).map_err(|e| e.to_string())?;
        let _ = security.set_capture_affinity(&window, false);
    }
    Ok(())
}

#[tauri::command]
pub fn lock_camera_device(
    device_id: String,
    camera: State<'_, CameraManager>,
) -> Result<(), String> {
    camera.lock_device(device_id)
}

#[tauri::command]
pub fn unlock_camera_device(camera: State<'_, CameraManager>) -> Result<(), String> {
    camera.unlock_device()
}

#[tauri::command]
pub fn get_locked_camera(camera: State<'_, CameraManager>) -> Result<Option<String>, String> {
    camera.get_locked_device()
}

#[tauri::command]
pub fn start_exam_monitoring(
    window: tauri::Window,
    security: State<'_, SecurityManager>,
    screen: State<'_, ScreenManager>,
    camera: State<'_, CameraManager>,
    audio: State<'_, AudioManager>,
    ai: State<'_, AiPipeline>,
) -> Result<(), String> {
    let result = (|| -> Result<(), String> {
        screen.start_capture().map_err(|error| error.to_string())?;
        camera.start_preview().map_err(|error| error.to_string())?;
        audio
            .start_monitoring()
            .map_err(|error| error.to_string())?;
        ai.load_models().map_err(|error| error.to_string())?;
        security.set_kiosk_enabled(true)?;
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
        window.set_resizable(false).map_err(|e| e.to_string())?;
        let _ = security.set_capture_affinity(&window, true);
        Ok(())
    })();

    if result.is_err() {
        let _ = ai.unload_models();
        let _ = audio.stop_monitoring();
        let _ = camera.stop_preview();
        let _ = screen.stop_capture();
        let _ = security.set_capture_affinity(&window, false);
        let _ = security.set_kiosk_enabled(false);
        let _ = window.set_resizable(true);
    }

    result
}

#[tauri::command]
pub fn stop_exam_monitoring(
    window: tauri::Window,
    security: State<'_, SecurityManager>,
    screen: State<'_, ScreenManager>,
    camera: State<'_, CameraManager>,
    audio: State<'_, AudioManager>,
    ai: State<'_, AiPipeline>,
) -> Result<(), String> {
    security.set_kiosk_enabled(false)?;
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_resizable(true).map_err(|e| e.to_string())?;
    let _ = security.set_capture_affinity(&window, false);
    screen.stop_capture().map_err(|error| error.to_string())?;
    camera.stop_preview().map_err(|error| error.to_string())?;
    audio.stop_monitoring().map_err(|error| error.to_string())?;
    ai.unload_models().map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(serde::Serialize)]
pub struct SecurityViolations {
    pub virtual_machine_detected: bool,
    pub blacklisted_processes: Vec<String>,
    pub debugger_attached: bool,
}

#[tauri::command]
pub fn check_security_violations(
    security: State<'_, SecurityManager>,
) -> Result<SecurityViolations, String> {
    Ok(SecurityViolations {
        virtual_machine_detected: security.detect_virtual_machine(),
        blacklisted_processes: security.scan_blacklisted_processes(),
        debugger_attached: security.is_debugger_attached(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hardware::{CapabilityDiagnostic, CapabilityState, MediaDevice};

    #[test]
    fn hardware_status_shape_keeps_unavailable_devices_separate_from_permissions() {
        let status = NativeHardwareDiagnostics {
            os_name: "test-os".to_string(),
            cameras: Vec::<MediaDevice>::new(),
            microphones: Vec::<MediaDevice>::new(),
            displays: Vec::new(),
            camera: diagnostic(CapabilityState::Unavailable),
            microphone: diagnostic(CapabilityState::Unavailable),
            screen_capture: diagnostic(CapabilityState::Unsupported),
            display_configuration: diagnostic(CapabilityState::Unavailable),
            camera_permission: diagnostic(CapabilityState::Unknown),
            microphone_permission: diagnostic(CapabilityState::Unknown),
            screen_capture_permission: diagnostic(CapabilityState::Unknown),
            checked_at: "unix-ms:1".to_string(),
        };

        assert!(status.cameras.is_empty());
        assert_eq!(status.camera.state, CapabilityState::Unavailable);
        assert_eq!(status.camera_permission.state, CapabilityState::Unknown);
        assert_eq!(status.os_name, "test-os");
    }

    fn diagnostic(state: CapabilityState) -> CapabilityDiagnostic {
        CapabilityDiagnostic {
            state,
            error_code: Some("test".to_string()),
            message: Some("test diagnostic".to_string()),
            permission_state: None,
        }
    }

    #[test]
    fn teacher_dashboard_url_accepts_https_and_local_dev_only() {
        assert!(validate_teacher_dashboard_url("https://dashboard.cheatlock.example").is_ok());
        assert!(validate_teacher_dashboard_url("http://127.0.0.1:5174").is_ok());
        assert!(validate_teacher_dashboard_url("http://localhost:5174").is_ok());
        assert!(validate_teacher_dashboard_url("http://dashboard.cheatlock.example").is_err());
        assert!(validate_teacher_dashboard_url("javascript:alert(1)").is_err());
        assert!(
            validate_teacher_dashboard_url("https://dashboard.cheatlock.example/\nnext").is_err()
        );
    }
}
