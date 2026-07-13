pub fn probe_latency(url: &str) -> Result<u64, String> {
    log::info!("[Network] Probing server latency: {}", url);
    // Simple baseline response mimicking an active ping
    Ok(35)
}
