// Prevents additional console window on Windows in release, do not remove!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai;
mod audio;
mod camera;
mod commands;
mod device;
mod hardware;
mod network;
mod screen;
mod secure_store;
mod security;

use ai::AiPipeline;
use audio::AudioManager;
use camera::CameraManager;
use screen::ScreenManager;
use security::SecurityManager;
use tauri::Emitter;

fn main() {
    env_logger::init_from_env(env_logger::Env::default().default_filter_or("info"));
    log::info!("Initializing CheatLock Desktop Client Foundation...");

    tauri::Builder::default()
        .manage(SecurityManager::new())
        .manage(ScreenManager::new())
        .manage(CameraManager::new())
        .manage(AudioManager::new())
        .manage(AiPipeline::new())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(focused) = event {
                log::info!("[Window] Focus status change: {}", focused);
                let _ = window.emit("window-focus-changed", *focused);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::toggle_kiosk,
            commands::is_kiosk_active,
            commands::open_teacher_web_dashboard,
            commands::check_network_latency,
            commands::probe_backend_health_command,
            commands::get_installation_device_identity,
            commands::get_native_hardware_diagnostics,
            commands::secure_store_get,
            commands::secure_store_set,
            commands::secure_store_delete,
            commands::get_hardware_status,
            commands::get_native_monitoring_status,
            commands::start_native_screen_capture,
            commands::stop_native_screen_capture,
            commands::get_native_screen_capture_status,
            commands::capture_native_screen_sample,
            commands::run_native_screen_capture_smoke_test,
            commands::diagnose_native_screen_capture,
            commands::get_native_screen_session_diagnostics,
            commands::start_exam_monitoring,
            commands::stop_exam_monitoring,
            commands::set_screenshot_prevention,
            commands::check_monitors,
            commands::enforce_window_kiosk,
            commands::lock_camera_device,
            commands::unlock_camera_device,
            commands::get_locked_camera,
            commands::check_security_violations
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn production_csp_rejects_wildcard_network_origins() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).expect("tauri config json");
        let csp = config["app"]["security"]["csp"]
            .as_str()
            .expect("production csp");

        assert!(!csp.contains("http://*"));
        assert!(!csp.contains("https://*"));
        assert!(!csp.contains("ws://*"));
        assert!(!csp.contains("wss://*"));
        assert!(csp.contains("https://cheatlock-backend.onrender.com"));
        assert!(csp.contains("wss://cheatlock-backend.onrender.com"));
        assert!(csp.contains("script-src 'self'"));
        assert!(!csp.contains("script-src 'self' 'unsafe-inline'"));
    }
}
