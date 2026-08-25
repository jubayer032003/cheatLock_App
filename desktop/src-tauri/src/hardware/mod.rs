#[cfg(target_os = "windows")]
use std::collections::hash_map::DefaultHasher;
#[cfg(target_os = "windows")]
use std::hash::{Hash, Hasher};
#[cfg(target_os = "windows")]
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MediaDevice {
    pub id: String,
    pub label: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DisplayDevice {
    pub id: String,
    pub label: String,
    pub is_primary: bool,
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityState {
    Available,
    Unavailable,
    PermissionDenied,
    Unsupported,
    Failed,
    Unknown,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Allowed,
    Denied,
    Restricted,
    NotDetermined,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDiagnostic {
    pub state: CapabilityState,
    pub error_code: Option<String>,
    pub message: Option<String>,
    pub permission_state: Option<PermissionState>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeHardwareDiagnostics {
    pub os_name: String,
    pub cameras: Vec<MediaDevice>,
    pub microphones: Vec<MediaDevice>,
    pub displays: Vec<DisplayDevice>,
    pub camera: CapabilityDiagnostic,
    pub microphone: CapabilityDiagnostic,
    pub screen_capture: CapabilityDiagnostic,
    pub display_configuration: CapabilityDiagnostic,
    pub camera_permission: CapabilityDiagnostic,
    pub microphone_permission: CapabilityDiagnostic,
    pub screen_capture_permission: CapabilityDiagnostic,
    pub checked_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HardwareError {
    pub code: String,
    pub message: String,
}

pub trait HardwareEnumerator {
    fn enumerate_cameras(&self) -> Result<Vec<MediaDevice>, HardwareError>;
    fn enumerate_microphones(&self) -> Result<Vec<MediaDevice>, HardwareError>;
    fn enumerate_displays(&self) -> Result<Vec<DisplayDevice>, HardwareError>;
    fn screen_capture_capability(&self) -> CapabilityDiagnostic;
    fn camera_permission(&self) -> CapabilityDiagnostic;
    fn microphone_permission(&self) -> CapabilityDiagnostic;
    fn screen_capture_permission(&self) -> CapabilityDiagnostic;
}

pub fn collect_hardware_diagnostics() -> NativeHardwareDiagnostics {
    #[cfg(target_os = "windows")]
    {
        collect_hardware_diagnostics_with(&WindowsHardwareEnumerator)
    }

    #[cfg(not(target_os = "windows"))]
    {
        collect_hardware_diagnostics_with(&UnsupportedHardwareEnumerator)
    }
}

pub fn collect_hardware_diagnostics_with(
    enumerator: &impl HardwareEnumerator,
) -> NativeHardwareDiagnostics {
    let cameras = enumerator.enumerate_cameras();
    let microphones = enumerator.enumerate_microphones();
    let displays = enumerator.enumerate_displays();

    let (cameras, camera) = devices_to_diagnostic(cameras, "camera");
    let (microphones, microphone) = devices_to_diagnostic(microphones, "microphone");
    let (displays, display_configuration) = displays_to_diagnostic(displays);

    NativeHardwareDiagnostics {
        os_name: std::env::consts::OS.to_string(),
        cameras,
        microphones,
        displays,
        camera,
        microphone,
        screen_capture: enumerator.screen_capture_capability(),
        display_configuration,
        camera_permission: enumerator.camera_permission(),
        microphone_permission: enumerator.microphone_permission(),
        screen_capture_permission: enumerator.screen_capture_permission(),
        checked_at: checked_timestamp(),
    }
}

fn displays_to_diagnostic(
    result: Result<Vec<DisplayDevice>, HardwareError>,
) -> (Vec<DisplayDevice>, CapabilityDiagnostic) {
    match result {
        Ok(displays) if displays.is_empty() => (
            displays,
            diagnostic(
                CapabilityState::Unavailable,
                Some("not_found"),
                Some("No display was detected by the native display enumerator.".to_string()),
                None,
            ),
        ),
        Ok(displays) => {
            let message = if displays.len() == 1 {
                "One active display detected.".to_string()
            } else {
                format!("{} active displays detected.", displays.len())
            };
            (
                displays,
                diagnostic(CapabilityState::Available, None, Some(message), None),
            )
        }
        Err(error) => {
            let HardwareError { code, message } = error;
            (
                Vec::new(),
                diagnostic(
                    CapabilityState::Failed,
                    Some(code.as_str()),
                    Some(message),
                    None,
                ),
            )
        }
    }
}

fn devices_to_diagnostic(
    result: Result<Vec<MediaDevice>, HardwareError>,
    label: &str,
) -> (Vec<MediaDevice>, CapabilityDiagnostic) {
    match result {
        Ok(devices) if devices.is_empty() => (
            devices,
            diagnostic(
                CapabilityState::Unavailable,
                Some("not_found"),
                Some(format!("No {label} device was detected.")),
                None,
            ),
        ),
        Ok(devices) => (
            devices,
            diagnostic(
                CapabilityState::Available,
                None,
                Some(format!("{label} device detected.")),
                None,
            ),
        ),
        Err(error) => {
            let HardwareError { code, message } = error;
            (
                Vec::new(),
                diagnostic(
                    CapabilityState::Failed,
                    Some(code.as_str()),
                    Some(message),
                    None,
                ),
            )
        }
    }
}

fn diagnostic(
    state: CapabilityState,
    error_code: Option<&str>,
    message: Option<String>,
    permission_state: Option<PermissionState>,
) -> CapabilityDiagnostic {
    CapabilityDiagnostic {
        state,
        error_code: error_code.map(str::to_string),
        message,
        permission_state,
    }
}

fn checked_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms:{millis}")
}

#[cfg(target_os = "windows")]
struct WindowsHardwareEnumerator;

#[cfg(target_os = "windows")]
impl HardwareEnumerator for WindowsHardwareEnumerator {
    fn enumerate_cameras(&self) -> Result<Vec<MediaDevice>, HardwareError> {
        windows_pnp_devices("Camera", None)
    }

    fn enumerate_microphones(&self) -> Result<Vec<MediaDevice>, HardwareError> {
        windows_pnp_devices("AudioEndpoint", Some("Microphone"))
    }

    fn enumerate_displays(&self) -> Result<Vec<DisplayDevice>, HardwareError> {
        windows_displays()
    }

    fn screen_capture_capability(&self) -> CapabilityDiagnostic {
        match windows_build_number() {
            Ok(build) if build >= 18362 => diagnostic(
                CapabilityState::Available,
                None,
                Some("Windows Graphics Capture capability is available.".to_string()),
                None,
            ),
            Ok(build) => diagnostic(
                CapabilityState::Unsupported,
                Some("windows_build_unsupported"),
                Some(format!(
                    "Windows build {build} does not support the planned screen-capture API."
                )),
                None,
            ),
            Err(error) => diagnostic(
                CapabilityState::Failed,
                Some(&error.code),
                Some(error.message),
                None,
            ),
        }
    }

    fn camera_permission(&self) -> CapabilityDiagnostic {
        windows_permission_state("webcam", "camera")
    }

    fn microphone_permission(&self) -> CapabilityDiagnostic {
        windows_permission_state("microphone", "microphone")
    }

    fn screen_capture_permission(&self) -> CapabilityDiagnostic {
        diagnostic(
            CapabilityState::Unknown,
            Some("permission_not_queryable"),
            Some(
                "Screen-capture permission cannot be determined before requesting capture."
                    .to_string(),
            ),
            Some(PermissionState::Unknown),
        )
    }
}

#[cfg(target_os = "windows")]
fn windows_displays() -> Result<Vec<DisplayDevice>, HardwareError> {
    let script = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{ DeviceName = $_.DeviceName; Primary = $_.Primary; Width = $_.Bounds.Width; Height = $_.Bounds.Height; X = $_.Bounds.X; Y = $_.Bounds.Y } } | ConvertTo-Json -Compress";
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| HardwareError {
            code: "native_api_failed".to_string(),
            message: format!("Windows display discovery could not start: {error}"),
        })?;

    if !output.status.success() {
        return Err(HardwareError {
            code: "native_api_failed".to_string(),
            message: "Windows display discovery command failed.".to_string(),
        });
    }

    parse_display_json(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn parse_display_json(raw: &str) -> Result<Vec<DisplayDevice>, HardwareError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| HardwareError {
        code: "native_response_invalid".to_string(),
        message: "Windows display discovery returned invalid JSON.".to_string(),
    })?;
    let entries = match value {
        serde_json::Value::Array(entries) => entries,
        serde_json::Value::Object(_) => vec![value],
        serde_json::Value::Null => Vec::new(),
        _ => {
            return Err(HardwareError {
                code: "native_response_invalid".to_string(),
                message: "Windows display discovery returned an unexpected JSON shape.".to_string(),
            })
        }
    };

    Ok(entries
        .into_iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            let label = entry
                .get("DeviceName")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Detected display")
                .trim()
                .to_string();
            if label.is_empty() {
                return None;
            }
            Some(DisplayDevice {
                id: stable_safe_id(&label),
                label,
                is_primary: entry
                    .get("Primary")
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(index == 0),
                width: json_u32(&entry, "Width"),
                height: json_u32(&entry, "Height"),
                x: json_i32(&entry, "X"),
                y: json_i32(&entry, "Y"),
            })
        })
        .collect())
}

#[cfg(target_os = "windows")]
fn json_u32(value: &serde_json::Value, key: &str) -> u32 {
    value
        .get(key)
        .and_then(serde_json::Value::as_u64)
        .and_then(|raw| u32::try_from(raw).ok())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn json_i32(value: &serde_json::Value, key: &str) -> i32 {
    value
        .get(key)
        .and_then(serde_json::Value::as_i64)
        .and_then(|raw| i32::try_from(raw).ok())
        .unwrap_or_default()
}

#[cfg(target_os = "windows")]
fn windows_pnp_devices(
    class_name: &str,
    name_filter: Option<&str>,
) -> Result<Vec<MediaDevice>, HardwareError> {
    let filter = name_filter
        .map(|value| {
            format!(
                " | Where-Object {{$_.FriendlyName -match '{}'}}",
                value.replace('\'', "''")
            )
        })
        .unwrap_or_default();
    let script = format!(
        "Get-PnpDevice -Class {} -Status OK{} | Select-Object FriendlyName,InstanceId | ConvertTo-Json -Compress",
        class_name, filter
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|error| HardwareError {
            code: "native_api_failed".to_string(),
            message: format!("Windows hardware discovery could not start: {error}"),
        })?;

    if !output.status.success() {
        return Err(HardwareError {
            code: "native_api_failed".to_string(),
            message: "Windows hardware discovery command failed.".to_string(),
        });
    }

    parse_pnp_json(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "windows")]
fn parse_pnp_json(raw: &str) -> Result<Vec<MediaDevice>, HardwareError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed).map_err(|_| HardwareError {
        code: "native_response_invalid".to_string(),
        message: "Windows hardware discovery returned invalid JSON.".to_string(),
    })?;
    let entries = match value {
        serde_json::Value::Array(entries) => entries,
        serde_json::Value::Object(_) => vec![value],
        serde_json::Value::Null => Vec::new(),
        _ => {
            return Err(HardwareError {
                code: "native_response_invalid".to_string(),
                message: "Windows hardware discovery returned an unexpected JSON shape."
                    .to_string(),
            })
        }
    };

    Ok(entries
        .into_iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            let label = entry
                .get("FriendlyName")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Detected media device")
                .trim()
                .to_string();
            let instance_id = entry
                .get("InstanceId")
                .and_then(serde_json::Value::as_str)
                .unwrap_or(&label);
            if label.is_empty() {
                return None;
            }
            Some(MediaDevice {
                id: stable_safe_id(instance_id),
                label,
                is_default: index == 0,
            })
        })
        .collect())
}

#[cfg(target_os = "windows")]
fn stable_safe_id(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("device-{:016x}", hasher.finish())
}

#[cfg(target_os = "windows")]
fn windows_build_number() -> Result<u32, HardwareError> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Environment]::OSVersion.Version.Build",
        ])
        .output()
        .map_err(|error| HardwareError {
            code: "native_api_failed".to_string(),
            message: format!("Windows version check could not start: {error}"),
        })?;
    if !output.status.success() {
        return Err(HardwareError {
            code: "native_api_failed".to_string(),
            message: "Windows version check failed.".to_string(),
        });
    }
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u32>()
        .map_err(|_| HardwareError {
            code: "native_response_invalid".to_string(),
            message: "Windows version check returned an invalid build number.".to_string(),
        })
}

#[cfg(target_os = "windows")]
fn windows_permission_state(capability: &str, label: &str) -> CapabilityDiagnostic {
    let script = format!(
        "$path = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\{}'; if (Test-Path $path) {{ (Get-ItemProperty -Path $path -Name Value -ErrorAction SilentlyContinue).Value }}",
        capability
    );
    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output();
    let Ok(output) = output else {
        return diagnostic(
            CapabilityState::Unknown,
            Some("permission_query_failed"),
            Some(format!("{label} permission state could not be queried.")),
            Some(PermissionState::Unknown),
        );
    };
    if !output.status.success() {
        return diagnostic(
            CapabilityState::Unknown,
            Some("permission_query_failed"),
            Some(format!("{label} permission state could not be queried.")),
            Some(PermissionState::Unknown),
        );
    }
    match String::from_utf8_lossy(&output.stdout).trim() {
        "Allow" => diagnostic(
            CapabilityState::Available,
            None,
            Some(format!("{label} permission is allowed.")),
            Some(PermissionState::Allowed),
        ),
        "Deny" => diagnostic(
            CapabilityState::PermissionDenied,
            Some("permission_denied"),
            Some(format!("{label} permission is denied in Windows settings.")),
            Some(PermissionState::Denied),
        ),
        "" => diagnostic(
            CapabilityState::Unknown,
            Some("permission_not_determined"),
            Some(format!("{label} permission state is not determined.")),
            Some(PermissionState::NotDetermined),
        ),
        _ => diagnostic(
            CapabilityState::Unknown,
            Some("permission_unknown"),
            Some(format!("{label} permission state is unknown.")),
            Some(PermissionState::Unknown),
        ),
    }
}

#[cfg(not(target_os = "windows"))]
struct UnsupportedHardwareEnumerator;

#[cfg(not(target_os = "windows"))]
impl HardwareEnumerator for UnsupportedHardwareEnumerator {
    fn enumerate_cameras(&self) -> Result<Vec<MediaDevice>, HardwareError> {
        Err(unsupported_platform_error("camera"))
    }

    fn enumerate_microphones(&self) -> Result<Vec<MediaDevice>, HardwareError> {
        Err(unsupported_platform_error("microphone"))
    }

    fn enumerate_displays(&self) -> Result<Vec<DisplayDevice>, HardwareError> {
        Err(unsupported_platform_error("display"))
    }

    fn screen_capture_capability(&self) -> CapabilityDiagnostic {
        unsupported_diagnostic("screen capture")
    }

    fn camera_permission(&self) -> CapabilityDiagnostic {
        unsupported_diagnostic("camera permission")
    }

    fn microphone_permission(&self) -> CapabilityDiagnostic {
        unsupported_diagnostic("microphone permission")
    }

    fn screen_capture_permission(&self) -> CapabilityDiagnostic {
        unsupported_diagnostic("screen-capture permission")
    }
}

#[cfg(not(target_os = "windows"))]
fn unsupported_platform_error(label: &str) -> HardwareError {
    HardwareError {
        code: "unsupported_platform".to_string(),
        message: format!("Native {label} discovery is not implemented for this platform."),
    }
}

#[cfg(not(target_os = "windows"))]
fn unsupported_diagnostic(label: &str) -> CapabilityDiagnostic {
    diagnostic(
        CapabilityState::Unsupported,
        Some("unsupported_platform"),
        Some(format!(
            "Native {label} detection is not implemented for this platform."
        )),
        Some(PermissionState::Unsupported),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeEnumerator {
        cameras: Result<Vec<MediaDevice>, HardwareError>,
        microphones: Result<Vec<MediaDevice>, HardwareError>,
        displays: Result<Vec<DisplayDevice>, HardwareError>,
        screen: CapabilityDiagnostic,
        camera_permission: CapabilityDiagnostic,
        microphone_permission: CapabilityDiagnostic,
    }

    impl HardwareEnumerator for FakeEnumerator {
        fn enumerate_cameras(&self) -> Result<Vec<MediaDevice>, HardwareError> {
            self.cameras.clone()
        }

        fn enumerate_microphones(&self) -> Result<Vec<MediaDevice>, HardwareError> {
            self.microphones.clone()
        }

        fn enumerate_displays(&self) -> Result<Vec<DisplayDevice>, HardwareError> {
            self.displays.clone()
        }

        fn screen_capture_capability(&self) -> CapabilityDiagnostic {
            self.screen.clone()
        }

        fn camera_permission(&self) -> CapabilityDiagnostic {
            self.camera_permission.clone()
        }

        fn microphone_permission(&self) -> CapabilityDiagnostic {
            self.microphone_permission.clone()
        }

        fn screen_capture_permission(&self) -> CapabilityDiagnostic {
            diagnostic(
                CapabilityState::Unknown,
                Some("permission_not_queryable"),
                Some("screen permission unknown".to_string()),
                Some(PermissionState::Unknown),
            )
        }
    }

    #[test]
    fn zero_cameras_are_unavailable() {
        let diagnostics =
            collect_hardware_diagnostics_with(&fake(Ok(vec![]), Ok(vec![device("mic")])));
        assert_eq!(diagnostics.camera.state, CapabilityState::Unavailable);
        assert_eq!(diagnostics.camera.error_code.as_deref(), Some("not_found"));
    }

    #[test]
    fn one_camera_is_available() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam")]),
            Ok(vec![device("mic")]),
        ));
        assert_eq!(diagnostics.cameras.len(), 1);
        assert_eq!(diagnostics.camera.state, CapabilityState::Available);
    }

    #[test]
    fn multiple_cameras_are_returned() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam-a"), device("cam-b")]),
            Ok(vec![device("mic")]),
        ));
        assert_eq!(diagnostics.cameras.len(), 2);
        assert!(diagnostics
            .cameras
            .iter()
            .all(|device| !device.id.is_empty()));
    }

    #[test]
    fn camera_enumeration_failure_fails_closed() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Err(HardwareError {
                code: "native_api_failed".to_string(),
                message: "boom".to_string(),
            }),
            Ok(vec![device("mic")]),
        ));
        assert_eq!(diagnostics.camera.state, CapabilityState::Failed);
        assert_eq!(diagnostics.cameras.len(), 0);
    }

    #[test]
    fn zero_microphones_are_unavailable() {
        let diagnostics =
            collect_hardware_diagnostics_with(&fake(Ok(vec![device("cam")]), Ok(vec![])));
        assert_eq!(diagnostics.microphone.state, CapabilityState::Unavailable);
        assert_eq!(
            diagnostics.microphone.error_code.as_deref(),
            Some("not_found")
        );
    }

    #[test]
    fn microphone_enumeration_failure_fails_closed() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam")]),
            Err(HardwareError {
                code: "native_api_failed".to_string(),
                message: "boom".to_string(),
            }),
        ));
        assert_eq!(diagnostics.microphone.state, CapabilityState::Failed);
        assert_eq!(diagnostics.microphones.len(), 0);
    }

    #[test]
    fn screen_capability_available_is_preserved() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam")]),
            Ok(vec![device("mic")]),
        ));
        assert_eq!(diagnostics.screen_capture.state, CapabilityState::Available);
    }

    #[test]
    fn permission_denied_mapping_is_preserved() {
        let mut enumerator = fake(Ok(vec![device("cam")]), Ok(vec![device("mic")]));
        enumerator.camera_permission = diagnostic(
            CapabilityState::PermissionDenied,
            Some("permission_denied"),
            Some("denied".to_string()),
            Some(PermissionState::Denied),
        );
        let diagnostics = collect_hardware_diagnostics_with(&enumerator);
        assert_eq!(
            diagnostics.camera_permission.state,
            CapabilityState::PermissionDenied
        );
        assert_eq!(
            diagnostics.camera_permission.permission_state,
            Some(PermissionState::Denied)
        );
    }

    #[test]
    fn unknown_permission_mapping_is_preserved() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam")]),
            Ok(vec![device("mic")]),
        ));
        assert_eq!(
            diagnostics.microphone_permission.state,
            CapabilityState::Unknown
        );
    }

    #[test]
    fn serialization_shape_uses_camel_case() {
        let diagnostics = collect_hardware_diagnostics_with(&fake(
            Ok(vec![device("cam")]),
            Ok(vec![device("mic")]),
        ));
        let value = serde_json::to_value(diagnostics).expect("serialize diagnostics");
        assert!(value.get("screenCapture").is_some());
        assert!(value.get("displayConfiguration").is_some());
        assert!(value.get("displays").is_some());
        assert!(value.get("cameraPermission").is_some());
        assert!(value.get("checkedAt").is_some());
    }

    #[test]
    fn multiple_displays_are_reported_without_faking_readiness_policy() {
        let mut enumerator = fake(Ok(vec![device("cam")]), Ok(vec![device("mic")]));
        enumerator.displays = Ok(vec![
            display("display-a", true),
            display("display-b", false),
        ]);
        let diagnostics = collect_hardware_diagnostics_with(&enumerator);

        assert_eq!(diagnostics.displays.len(), 2);
        assert_eq!(
            diagnostics.display_configuration.state,
            CapabilityState::Available
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parses_windows_single_device_json() {
        let devices =
            parse_pnp_json(r#"{"FriendlyName":"Integrated Camera","InstanceId":"USB\\VID_1"}"#)
                .expect("parse single device");
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].label, "Integrated Camera");
        assert!(devices[0].id.starts_with("device-"));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn parses_windows_multiple_device_json() {
        let devices = parse_pnp_json(
            r#"[{"FriendlyName":"Camera A","InstanceId":"A"},{"FriendlyName":"Camera B","InstanceId":"B"}]"#,
        )
        .expect("parse multiple devices");
        assert_eq!(devices.len(), 2);
    }

    fn fake(
        cameras: Result<Vec<MediaDevice>, HardwareError>,
        microphones: Result<Vec<MediaDevice>, HardwareError>,
    ) -> FakeEnumerator {
        FakeEnumerator {
            cameras,
            microphones,
            displays: Ok(vec![display("display-1", true)]),
            screen: diagnostic(
                CapabilityState::Available,
                None,
                Some("screen available".to_string()),
                None,
            ),
            camera_permission: diagnostic(
                CapabilityState::Unknown,
                Some("permission_not_determined"),
                Some("camera permission unknown".to_string()),
                Some(PermissionState::Unknown),
            ),
            microphone_permission: diagnostic(
                CapabilityState::Unknown,
                Some("permission_not_determined"),
                Some("microphone permission unknown".to_string()),
                Some(PermissionState::Unknown),
            ),
        }
    }

    fn device(label: &str) -> MediaDevice {
        MediaDevice {
            id: format!("device-{label}"),
            label: label.to_string(),
            is_default: false,
        }
    }

    fn display(label: &str, is_primary: bool) -> DisplayDevice {
        DisplayDevice {
            id: format!("display-{label}"),
            label: label.to_string(),
            is_primary,
            width: 1920,
            height: 1080,
            x: 0,
            y: 0,
        }
    }
}
