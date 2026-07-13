use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[derive(Clone)]
pub struct AiPipeline {
  models_loaded: Arc<AtomicBool>,
}

impl AiPipeline {
  pub fn new() -> Self {
    Self {
      models_loaded: Arc::new(AtomicBool::new(false)),
    }
  }

  pub fn load_models(&self) -> Result<(), String> {
    self.models_loaded.store(true, Ordering::SeqCst);
    log::info!("[AI] Face Recognition Engine activated.");
    Ok(())
  }

  pub fn unload_models(&self) -> Result<(), String> {
    self.models_loaded.store(false, Ordering::SeqCst);
    log::info!("[AI] Face Recognition Engine released.");
    Ok(())
  }

  pub fn is_ready(&self) -> bool {
    self.models_loaded.load(Ordering::SeqCst)
  }
}
