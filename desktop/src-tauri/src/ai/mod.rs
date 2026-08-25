use crate::screen::{NativeMonitorError, NativeMonitorState, NativeMonitorStatus};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct AiPipeline {
    state: Arc<Mutex<NativeMonitorStatus>>,
}

impl AiPipeline {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(NativeMonitorStatus {
                module: "ai".to_string(),
                state: NativeMonitorState::Idle,
                error_code: None,
                message: "Native AI pipeline is idle.".to_string(),
                active_exam_id: None,
            })),
        }
    }

    pub fn load_models(&self) -> Result<(), NativeMonitorError> {
        let error = NativeMonitorError::not_implemented(
      "ai",
      "Native AI model loading is not implemented. Model assets, checksum validation, runtime initialization, shape validation, and test inference are required.",
    );
        self.set_status(
            NativeMonitorState::Unsupported,
            Some(error.code.clone()),
            error.message.clone(),
        );
        Err(error)
    }

    pub fn unload_models(&self) -> Result<(), NativeMonitorError> {
        self.set_status(
            NativeMonitorState::Idle,
            None,
            "Native AI pipeline is stopped.".to_string(),
        );
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        self.status().state == NativeMonitorState::Active
    }

    pub fn status(&self) -> NativeMonitorStatus {
        self.state
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| NativeMonitorStatus {
                module: "ai".to_string(),
                state: NativeMonitorState::Failed,
                error_code: Some("state_lock_failed".to_string()),
                message: "Native AI pipeline state could not be read.".to_string(),
                active_exam_id: None,
            })
    }

    pub fn health_check(&self) -> NativeMonitorStatus {
        let status = self.status();
        if status.state == NativeMonitorState::Active {
            NativeMonitorStatus {
                state: NativeMonitorState::Failed,
                error_code: Some("resource_lost".to_string()),
                message: "Native AI runtime has no initialized model handle to verify.".to_string(),
                ..status
            }
        } else {
            status
        }
    }

    fn set_status(&self, state: NativeMonitorState, error_code: Option<String>, message: String) {
        if let Ok(mut status) = self.state.lock() {
            *status = NativeMonitorStatus {
                module: "ai".to_string(),
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
    fn ai_load_fails_closed_without_verified_model_runtime() {
        let pipeline = AiPipeline::new();
        let error = pipeline
            .load_models()
            .expect_err("placeholder AI must not load");

        assert_eq!(error.code, "not_implemented");
        assert_eq!(pipeline.status().state, NativeMonitorState::Unsupported);
        assert!(!pipeline.is_ready());
    }

    #[test]
    fn ai_unload_is_idempotent() {
        let pipeline = AiPipeline::new();
        pipeline
            .unload_models()
            .expect("unload should be safe before load");

        assert_eq!(pipeline.status().state, NativeMonitorState::Idle);
    }
}
