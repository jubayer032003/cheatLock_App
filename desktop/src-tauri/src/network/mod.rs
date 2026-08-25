use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkProbeResult {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub checked_at: String,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

pub fn probe_backend_health(origin: &str, timeout_ms: u64) -> NetworkProbeResult {
    let checked_at = checked_timestamp();
    let trimmed = origin.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return failure(
            "configuration_missing",
            "Backend origin is not configured.",
            checked_at,
            None,
        );
    }

    let url = format!("{}/health?probe={}", trimmed, cache_buster());
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(timeout_ms.max(1)))
        .build()
    {
        Ok(client) => client,
        Err(_) => {
            return failure(
                "configuration_invalid",
                "Network probe client could not be created.",
                checked_at,
                None,
            )
        }
    };

    let started = Instant::now();
    match client
        .get(url)
        .header("cache-control", "no-cache")
        .header("pragma", "no-cache")
        .send()
    {
        Ok(response) => {
            let status = response.status();
            let status_code = status.as_u16();
            if status == reqwest::StatusCode::UNAUTHORIZED {
                return failure(
                    "unauthorized",
                    "Backend health endpoint requires authorization.",
                    checked_at,
                    Some(status_code),
                );
            }
            if status.is_server_error() {
                return failure(
                    "server_unavailable",
                    "Backend server is unavailable.",
                    checked_at,
                    Some(status_code),
                );
            }
            if !status.is_success() {
                return failure(
                    "http_failure",
                    "Backend health endpoint returned an unsuccessful status.",
                    checked_at,
                    Some(status_code),
                );
            }

            NetworkProbeResult {
                reachable: true,
                latency_ms: Some(started.elapsed().as_millis() as u64),
                status_code: Some(status_code),
                checked_at,
                error_code: None,
                message: Some("Backend health endpoint is reachable.".to_string()),
            }
        }
        Err(error) => {
            let code = classify_reqwest_error(&error);
            failure(code, "Backend health probe failed.", checked_at, None)
        }
    }
}

pub fn probe_latency(origin: &str) -> Result<u64, String> {
    let result = probe_backend_health(origin, 8_000);
    result
        .latency_ms
        .filter(|_| result.reachable)
        .ok_or_else(|| {
            result
                .error_code
                .unwrap_or_else(|| "network_error".to_string())
        })
}

fn classify_reqwest_error(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        return "timeout";
    }
    if error.is_status() {
        return "http_failure";
    }
    let text = error.to_string().to_lowercase();
    if text.contains("dns") || text.contains("name resolution") || text.contains("resolve") {
        return "dns_resolution";
    }
    if text.contains("refused") {
        return "connection_refused";
    }
    if text.contains("certificate") || text.contains("tls") {
        return "tls_failure";
    }
    "network_error"
}

fn failure(
    error_code: &str,
    message: &str,
    checked_at: String,
    status_code: Option<u16>,
) -> NetworkProbeResult {
    NetworkProbeResult {
        reachable: false,
        latency_ms: None,
        status_code,
        checked_at,
        error_code: Some(error_code.to_string()),
        message: Some(message.to_string()),
    }
}

fn checked_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}

fn cache_buster() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    #[test]
    fn missing_configuration_fails() {
        let result = probe_backend_health("", 100);
        assert!(!result.reachable);
        assert_eq!(result.error_code.as_deref(), Some("configuration_missing"));
    }

    #[test]
    fn successful_health_probe_returns_latency_and_status() {
        let origin = serve_once("HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n{\"ok\":true}");

        let result = probe_backend_health(&origin, 1_000);

        assert!(result.reachable);
        assert_eq!(result.status_code, Some(200));
        assert!(result.latency_ms.is_some());
        assert!(result.error_code.is_none());
    }

    #[test]
    fn unauthorized_health_probe_is_classified() {
        let origin = serve_once("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");

        let result = probe_backend_health(&origin, 1_000);

        assert!(!result.reachable);
        assert_eq!(result.status_code, Some(401));
        assert_eq!(result.error_code.as_deref(), Some("unauthorized"));
    }

    #[test]
    fn server_unavailable_health_probe_is_classified() {
        let origin = serve_once("HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\n\r\n");

        let result = probe_backend_health(&origin, 1_000);

        assert!(!result.reachable);
        assert_eq!(result.status_code, Some(503));
        assert_eq!(result.error_code.as_deref(), Some("server_unavailable"));
    }

    fn serve_once(response: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("test server should bind");
        let origin = format!("http://{}", listener.local_addr().expect("local addr"));
        thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut buffer = [0; 1024];
                let _ = stream.read(&mut buffer);
                let _ = stream.write_all(response.as_bytes());
            }
        });
        origin
    }
}
