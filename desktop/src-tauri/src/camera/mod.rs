use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Clone)]
pub struct CameraManager {
  is_active: Arc<AtomicBool>,
  locked_device_id: Arc<Mutex<Option<String>>>,
}

impl CameraManager {
  pub fn new() -> Self {
    Self {
      is_active: Arc::new(AtomicBool::new(false)),
      locked_device_id: Arc::new(Mutex::new(None)),
    }
  }

  pub fn start_preview(&self) -> Result<(), String> {
    self.is_active.store(true, Ordering::SeqCst);
    log::info!("[Camera] Camera feed connected.");
    Ok(())
  }

  pub fn stop_preview(&self) -> Result<(), String> {
    self.is_active.store(false, Ordering::SeqCst);
    log::info!("[Camera] Camera feed disconnected.");
    Ok(())
  }

  pub fn is_active(&self) -> bool {
    self.is_active.load(Ordering::SeqCst)
  }

  pub fn lock_device(&self, device_id: String) -> Result<(), String> {
    let mut locked = self.locked_device_id.lock().map_err(|e| e.to_string())?;
    *locked = Some(device_id);
    log::info!("[Camera] Selected camera device locked.");
    Ok(())
  }

  pub fn unlock_device(&self) -> Result<(), String> {
    let mut locked = self.locked_device_id.lock().map_err(|e| e.to_string())?;
    *locked = None;
    log::info!("[Camera] Camera device lock released.");
    Ok(())
  }

  pub fn get_locked_device(&self) -> Result<Option<String>, String> {
    let locked = self.locked_device_id.lock().map_err(|e| e.to_string())?;
    Ok(locked.clone())
  }
}
