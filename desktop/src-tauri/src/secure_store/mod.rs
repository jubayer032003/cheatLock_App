const SERVICE_NAME: &str = "com.cheatlock.desktop";

pub fn set_secret(key: &str, value: &str) -> Result<(), String> {
    validate_key(key)?;
    keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|e| format!("Secure storage entry failed: {e}"))?
        .set_password(value)
        .map_err(|e| format!("Secure storage write failed: {e}"))
}

pub fn get_secret(key: &str) -> Result<Option<String>, String> {
    validate_key(key)?;
    match keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|e| format!("Secure storage entry failed: {e}"))?
        .get_password()
    {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(format!("Secure storage read failed: {error}")),
    }
}

pub fn delete_secret(key: &str) -> Result<(), String> {
    validate_key(key)?;
    match keyring::Entry::new(SERVICE_NAME, key)
        .map_err(|e| format!("Secure storage entry failed: {e}"))?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!("Secure storage delete failed: {error}")),
    }
}

fn validate_key(key: &str) -> Result<(), String> {
    let valid = !key.is_empty()
        && key.len() <= 128
        && key.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | ':')
        });
    if valid {
        Ok(())
    } else {
        Err("Secure storage key is invalid.".to_string())
    }
}
