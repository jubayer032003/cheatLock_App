use crate::screen::{NativeMonitorError, NativeMonitorState, NativeMonitorStatus};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AudioManager {
    state: Arc<Mutex<NativeMonitorStatus>>,
}

impl AudioManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(NativeMonitorStatus {
                module: "audio".to_string(),
                state: NativeMonitorState::Idle,
                error_code: None,
                message: "Native audio monitor is idle.".to_string(),
                active_exam_id: None,
            })),
        }
    }

    pub fn start_monitoring(&self) -> Result<(), NativeMonitorError> {
        let error = NativeMonitorError::not_implemented(
            "audio",
            "Native microphone capture is not implemented. Browser MediaStream audio is the only current audio pipeline.",
        );
        self.set_status(
            NativeMonitorState::Unsupported,
            Some(error.code.clone()),
            error.message.clone(),
        );
        Err(error)
    }

    pub fn stop_monitoring(&self) -> Result<(), NativeMonitorError> {
        self.set_status(
            NativeMonitorState::Idle,
            None,
            "Native audio monitor is stopped.".to_string(),
        );
        Ok(())
    }

    pub fn is_monitoring(&self) -> bool {
        self.status().state == NativeMonitorState::Active
    }

    pub fn status(&self) -> NativeMonitorStatus {
        self.state
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| NativeMonitorStatus {
                module: "audio".to_string(),
                state: NativeMonitorState::Failed,
                error_code: Some("state_lock_failed".to_string()),
                message: "Native audio monitor state could not be read.".to_string(),
                active_exam_id: None,
            })
    }

    pub fn health_check(&self) -> NativeMonitorStatus {
        let status = self.status();
        if status.state == NativeMonitorState::Active {
            NativeMonitorStatus {
                state: NativeMonitorState::Failed,
                error_code: Some("resource_lost".to_string()),
                message: "Native audio capture has no resource handle to verify.".to_string(),
                ..status
            }
        } else {
            status
        }
    }

    fn set_status(&self, state: NativeMonitorState, error_code: Option<String>, message: String) {
        if let Ok(mut status) = self.state.lock() {
            *status = NativeMonitorStatus {
                module: "audio".to_string(),
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
    fn audio_start_fails_closed_when_native_capture_is_not_implemented() {
        let manager = AudioManager::new();
        let error = manager
            .start_monitoring()
            .expect_err("placeholder audio must not start");

        assert_eq!(error.code, "not_implemented");
        assert_eq!(manager.status().state, NativeMonitorState::Unsupported);
        assert!(!manager.is_monitoring());
    }

    #[test]
    fn audio_stop_is_idempotent() {
        let manager = AudioManager::new();
        manager
            .stop_monitoring()
            .expect("stop should not require an active recording");

        assert_eq!(manager.status().state, NativeMonitorState::Idle);
    }
}
