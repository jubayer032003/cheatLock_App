use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct ScreenManager {
    is_capturing: Arc<AtomicBool>,
}

impl ScreenManager {
    pub fn new() -> Self {
        Self {
            is_capturing: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start_capture(&self) -> Result<(), String> {
        self.is_capturing.store(true, Ordering::SeqCst);
        log::info!("[Screen] Screen mirroring started (placeholder).");
        Ok(())
    }

    pub fn stop_capture(&self) -> Result<(), String> {
        self.is_capturing.store(false, Ordering::SeqCst);
        log::info!("[Screen] Screen mirroring stopped (placeholder).");
        Ok(())
    }

    pub fn is_monitoring(&self) -> bool {
        self.is_capturing.load(Ordering::SeqCst)
    }
}
