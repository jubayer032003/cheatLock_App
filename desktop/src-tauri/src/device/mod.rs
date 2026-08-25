use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub device_id: String,
    pub was_created: bool,
    pub recovered_from_corruption: bool,
}

#[derive(Debug, Clone)]
pub struct DeviceIdentityManager {
    storage_path: PathBuf,
}

impl DeviceIdentityManager {
    pub fn new(storage_path: PathBuf) -> Self {
        Self { storage_path }
    }

    pub fn get_or_create(&self) -> Result<DeviceIdentity, String> {
        if let Ok(raw) = fs::read_to_string(&self.storage_path) {
            let candidate = raw.trim();
            if is_valid_public_device_id(candidate) {
                return Ok(DeviceIdentity {
                    device_id: candidate.to_string(),
                    was_created: false,
                    recovered_from_corruption: false,
                });
            }
        }

        let existed = self.storage_path.exists();
        let device_id = generate_public_device_id();
        self.persist(&device_id)?;
        Ok(DeviceIdentity {
            device_id,
            was_created: true,
            recovered_from_corruption: existed,
        })
    }

    fn persist(&self, device_id: &str) -> Result<(), String> {
        if let Some(parent) = self.storage_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create device identity storage: {e}"))?;
        }
        fs::write(&self.storage_path, device_id.as_bytes())
            .map_err(|e| format!("Failed to persist device identity: {e}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let permissions = fs::Permissions::from_mode(0o600);
            fs::set_permissions(&self.storage_path, permissions)
                .map_err(|e| format!("Failed to restrict device identity permissions: {e}"))?;
        }

        Ok(())
    }
}

pub fn is_valid_public_device_id(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("cld-") else {
        return false;
    };
    let parts: Vec<&str> = rest.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    let lengths = [8, 4, 4, 4, 12];
    parts
        .iter()
        .zip(lengths)
        .all(|(part, len)| part.len() == len && part.chars().all(|c| c.is_ascii_hexdigit()))
}

fn generate_public_device_id() -> String {
    let mut bytes = randomish_bytes();
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    format!(
    "cld-{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
    bytes[0],
    bytes[1],
    bytes[2],
    bytes[3],
    bytes[4],
    bytes[5],
    bytes[6],
    bytes[7],
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
    bytes[12],
    bytes[13],
    bytes[14],
    bytes[15]
  )
}

fn randomish_bytes() -> [u8; 16] {
    #[cfg(unix)]
    {
        use std::io::Read;
        if let Ok(mut file) = fs::File::open("/dev/urandom") {
            let mut bytes = [0u8; 16];
            if file.read_exact(&mut bytes).is_ok() {
                return bytes;
            }
        }
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let pid = std::process::id() as u128;
    let stack_value = (&now as *const u128 as usize) as u128;
    let mut seed = now ^ (pid << 64) ^ stack_value;
    let mut bytes = [0u8; 16];
    for byte in &mut bytes {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        *byte = (seed & 0xff) as u8;
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("cheatlock-{name}-{}", std::process::id()))
    }

    #[test]
    fn creates_new_device_id() {
        let path = temp_file("new-device-id");
        let _ = fs::remove_file(&path);
        let manager = DeviceIdentityManager::new(path.clone());
        let identity = manager.get_or_create().expect("device id");
        assert!(identity.was_created);
        assert!(is_valid_public_device_id(&identity.device_id));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reuses_persisted_device_id() {
        let path = temp_file("persisted-device-id");
        let _ = fs::remove_file(&path);
        let manager = DeviceIdentityManager::new(path.clone());
        let first = manager.get_or_create().expect("first");
        let second = manager.get_or_create().expect("second");
        assert_eq!(first.device_id, second.device_id);
        assert!(!second.was_created);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn recovers_corrupted_stored_id() {
        let path = temp_file("corrupted-device-id");
        let _ = fs::write(&path, "raw-hardware-serial-number");
        let manager = DeviceIdentityManager::new(path.clone());
        let identity = manager.get_or_create().expect("recovered");
        assert!(identity.was_created);
        assert!(identity.recovered_from_corruption);
        assert!(is_valid_public_device_id(&identity.device_id));
        let _ = fs::remove_file(path);
    }
}
