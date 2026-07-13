use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::process::Command;

#[derive(Clone)]
pub struct SecurityManager {
  kiosk_active: Arc<AtomicBool>,
}

impl SecurityManager {
  pub fn new() -> Self {
    Self {
      kiosk_active: Arc::new(AtomicBool::new(false)),
    }
  }

  pub fn set_kiosk_enabled(&self, enabled: bool) -> Result<(), String> {
    self.kiosk_active.store(enabled, Ordering::SeqCst);
    if enabled {
      log::info!("[Security] Kiosk mode activated.");
    } else {
      log::info!("[Security] Kiosk mode deactivated.");
    }
    Ok(())
  }

  pub fn is_kiosk_active(&self) -> bool {
    self.kiosk_active.load(Ordering::SeqCst)
  }

  #[cfg(target_os = "windows")]
  pub fn set_capture_affinity(&self, window: &tauri::Window, enabled: bool) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    let hwnd_ptr = hwnd.0 as isize;

    extern "system" {
      fn SetWindowDisplayAffinity(hwnd: isize, affinity: u32) -> i32;
    }

    unsafe {
      // 0x00000011 WDA_EXCLUDEFROMCAPTURE blocks printscreen/mirroring
      let affinity_mode = if enabled { 0x00000011 } else { 0 };
      let res = SetWindowDisplayAffinity(hwnd_ptr, affinity_mode);
      if res == 0 {
        return Err("SetWindowDisplayAffinity failed".to_string());
      }
    }
    Ok(())
  }

  #[cfg(not(target_os = "windows"))]
  pub fn set_capture_affinity(&self, _window: &tauri::Window, _enabled: bool) -> Result<(), String> {
    Ok(())
  }

  pub fn get_monitor_count(&self, window: &tauri::Window) -> Result<usize, String> {
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    Ok(monitors.len())
  }

  /**
   * Scans running processes for prohibited remote control and cheating applications.
   */
  pub fn scan_blacklisted_processes(&self) -> Vec<String> {
    let blacklisted = vec![
      "anydesk", "teamviewer", "parsec", "mstsc", "rdpsclip",
      "cheatengine", "autohotkey", "autoit", "obs32", "obs64",
      "discord", "zoom", "skype"
    ];
    let mut detected = Vec::new();

    #[cfg(target_os = "windows")]
    {
      if let Ok(output) = Command::new("tasklist").output() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
        for process in blacklisted {
          if stdout.contains(process) {
            detected.push(process.to_string());
          }
        }
      }
    }

    #[cfg(not(target_os = "windows"))]
    {
      if let Ok(output) = Command::new("ps").args(&["-ax"]).output() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
        for process in blacklisted {
          if stdout.contains(process) {
            detected.push(process.to_string());
          }
        }
      }
    }

    detected
  }

  /**
   * Performs hardware and bios query to check if the application is running inside a VM.
   */
  pub fn detect_virtual_machine(&self) -> bool {
    #[cfg(target_os = "windows")]
    {
      if let Ok(output) = Command::new("wmic").args(&["computersystem", "get", "model"]).output() {
        let model = String::from_utf8_lossy(&output.stdout).to_lowercase();
        if model.contains("virtualbox") || model.contains("vmware") || model.contains("virtual machine") || model.contains("qemu") || model.contains("hyper-v") {
          return true;
        }
      }
      if let Ok(output) = Command::new("wmic").args(&["bios", "get", "serialnumber"]).output() {
        let serial = String::from_utf8_lossy(&output.stdout).to_lowercase();
        if serial.contains("vmware") || serial.contains("vbox") {
          return true;
        }
      }
    }

    #[cfg(target_os = "macos")]
    {
      if let Ok(output) = Command::new("sysctl").arg("hw.model").output() {
        let model = String::from_utf8_lossy(&output.stdout).to_lowercase();
        if model.contains("virtualbox") || model.contains("vmware") || model.contains("qemu") {
          return true;
        }
      }
    }

    false
  }

  /**
   * Native debugger check.
   */
  pub fn is_debugger_attached(&self) -> bool {
    #[cfg(target_os = "windows")]
    {
      extern "system" {
        fn IsDebuggerPresent() -> i32;
      }
      unsafe { IsDebuggerPresent() != 0 }
    }
    #[cfg(not(target_os = "windows"))]
    {
      false
    }
  }
}
