use crate::security::SecurityManager;
use crate::screen::ScreenManager;
use crate::camera::CameraManager;
use crate::audio::AudioManager;
use crate::ai::AiPipeline;
use crate::network::probe_latency;
use tauri::State;

#[derive(serde::Serialize)]
pub struct HardwareStatus {
  pub has_camera: bool,
  pub has_microphone: bool,
  pub os_name: String,
}

#[tauri::command]
pub fn toggle_kiosk(enabled: bool, security: State<'_, SecurityManager>) -> Result<(), String> {
  security.set_kiosk_enabled(enabled)
}

#[tauri::command]
pub fn is_kiosk_active(security: State<'_, SecurityManager>) -> bool {
  security.is_kiosk_active()
}

#[tauri::command]
pub fn check_network_latency(url: String) -> Result<u64, String> {
  probe_latency(&url)
}

#[tauri::command]
pub fn get_hardware_status() -> Result<HardwareStatus, String> {
  Ok(HardwareStatus {
    has_camera: true,
    has_microphone: true,
    os_name: std::env::consts::OS.to_string(),
  })
}

#[tauri::command]
pub fn set_screenshot_prevention(enabled: bool, window: tauri::Window, security: State<'_, SecurityManager>) -> Result<(), String> {
  security.set_capture_affinity(&window, enabled)
}

#[tauri::command]
pub fn check_monitors(window: tauri::Window, security: State<'_, SecurityManager>) -> Result<usize, String> {
  security.get_monitor_count(&window)
}

#[tauri::command]
pub fn enforce_window_kiosk(enabled: bool, window: tauri::Window, security: State<'_, SecurityManager>) -> Result<(), String> {
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
pub fn lock_camera_device(device_id: String, camera: State<'_, CameraManager>) -> Result<(), String> {
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
  security: State<'_, SecurityManager>,
  screen: State<'_, ScreenManager>,
  camera: State<'_, CameraManager>,
  audio: State<'_, AudioManager>,
  ai: State<'_, AiPipeline>,
) -> Result<(), String> {
  security.set_kiosk_enabled(true)?;
  screen.start_capture()?;
  camera.start_preview()?;
  audio.start_monitoring()?;
  ai.load_models()?;
  Ok(())
}

#[tauri::command]
pub fn stop_exam_monitoring(
  security: State<'_, SecurityManager>,
  screen: State<'_, ScreenManager>,
  camera: State<'_, CameraManager>,
  audio: State<'_, AudioManager>,
  ai: State<'_, AiPipeline>,
) -> Result<(), String> {
  security.set_kiosk_enabled(false)?;
  screen.stop_capture()?;
  camera.stop_preview()?;
  audio.stop_monitoring()?;
  ai.unload_models()?;
  Ok(())
}

#[derive(serde::Serialize)]
pub struct SecurityViolations {
  pub virtual_machine_detected: bool,
  pub blacklisted_processes: Vec<String>,
  pub debugger_attached: bool,
}

#[tauri::command]
pub fn check_security_violations(security: State<'_, SecurityManager>) -> Result<SecurityViolations, String> {
  Ok(SecurityViolations {
    virtual_machine_detected: security.detect_virtual_machine(),
    blacklisted_processes: security.scan_blacklisted_processes(),
    debugger_attached: security.is_debugger_attached(),
  })
}
