use crate::screen::{NativeMonitorError, NativeMonitorState, NativeMonitorStatus};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct CameraManager {
    state: Arc<Mutex<NativeMonitorStatus>>,
    locked_device_id: Arc<Mutex<Option<String>>>,
}

impl CameraManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(NativeMonitorStatus {
                module: "camera".to_string(),
                state: NativeMonitorState::Idle,
                error_code: None,
                message: "Native camera monitor is idle.".to_string(),
                active_exam_id: None,
            })),
            locked_device_id: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start_preview(&self) -> Result<(), NativeMonitorError> {
        let error = NativeMonitorError::not_implemented(
      "camera",
      "Native camera preview is not implemented. Browser MediaStream camera is the only current camera pipeline.",
    );
        self.set_status(
            NativeMonitorState::Unsupported,
            Some(error.code.clone()),
            error.message.clone(),
        );
        Err(error)
    }

    pub fn stop_preview(&self) -> Result<(), NativeMonitorError> {
        self.set_status(
            NativeMonitorState::Idle,
            None,
            "Native camera monitor is stopped.".to_string(),
        );
        Ok(())
    }

    pub fn is_active(&self) -> bool {
        self.status().state == NativeMonitorState::Active
    }

    pub fn status(&self) -> NativeMonitorStatus {
        self.state
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| NativeMonitorStatus {
                module: "camera".to_string(),
                state: NativeMonitorState::Failed,
                error_code: Some("state_lock_failed".to_string()),
                message: "Native camera monitor state could not be read.".to_string(),
                active_exam_id: None,
            })
    }

    pub fn health_check(&self) -> NativeMonitorStatus {
        let status = self.status();
        if status.state == NativeMonitorState::Active {
            NativeMonitorStatus {
                state: NativeMonitorState::Failed,
                error_code: Some("resource_lost".to_string()),
                message: "Native camera capture has no resource handle to verify.".to_string(),
                ..status
            }
        } else {
            status
        }
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

    fn set_status(&self, state: NativeMonitorState, error_code: Option<String>, message: String) {
        if let Ok(mut status) = self.state.lock() {
            *status = NativeMonitorStatus {
                module: "camera".to_string(),
                state,
                error_code,
                message,
                active_exam_id: None,
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn camera_start_fails_closed_when_native_preview_is_not_implemented() {
        let manager = CameraManager::new();
        let error = manager
            .start_preview()
            .expect_err("placeholder camera must not start");

        assert_eq!(error.code, "not_implemented");
        assert_eq!(manager.status().state, NativeMonitorState::Unsupported);
        assert!(!manager.is_active());
    }

    #[test]
    fn camera_lock_does_not_mark_camera_active() {
        let manager = CameraManager::new();
        manager
            .lock_device("camera-1".to_string())
            .expect("device lock should be recorded");

        assert_eq!(
            manager.get_locked_device().unwrap(),
            Some("camera-1".to_string())
        );
        assert_eq!(manager.status().state, NativeMonitorState::Idle);
        assert!(!manager.is_active());
    }
}
