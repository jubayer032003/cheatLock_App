// Prevents additional console window on Windows in release, do not remove!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod security;
mod screen;
mod camera;
mod audio;
mod ai;
mod network;
mod commands;

use security::SecurityManager;
use screen::ScreenManager;
use camera::CameraManager;
use audio::AudioManager;
use ai::AiPipeline;
use tauri::Listener;

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
      commands::check_network_latency,
      commands::get_hardware_status,
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
