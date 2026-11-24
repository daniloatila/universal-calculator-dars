#[derive(Debug, PartialEq, Eq)]
pub enum CredentialError {
    InvalidName,
    InvalidSize,
    Unavailable,
    Platform(u32),
}

pub struct CredentialId(String);

impl CredentialId {
    pub fn new(name: &str) -> Result<Self, CredentialError> {
        if name.is_empty()
            || name.len() > 96
            || !name.bytes().all(|byte| {
                byte.is_ascii_lowercase()
                    || byte.is_ascii_digit()
                    || matches!(byte, b'.' | b'-' | b'_')
            })
        {
            return Err(CredentialError::InvalidName);
        }
        Ok(Self(format!("io.github.daniloatila.dars/{name}")))
    }
}

pub fn save(id: &CredentialId, secret: &[u8]) -> Result<(), CredentialError> {
    if secret.is_empty() || secret.len() > 2560 {
        return Err(CredentialError::InvalidSize);
    }
    platform::save(&id.0, secret)
}

pub fn read(id: &CredentialId) -> Result<Option<Vec<u8>>, CredentialError> {
    platform::read(&id.0)
}

pub fn delete(id: &CredentialId) -> Result<(), CredentialError> {
    platform::delete(&id.0)
}

#[cfg(windows)]
mod platform {
    use super::CredentialError;
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::{ERROR_NOT_FOUND, GetLastError},
        Security::Credentials::{
            CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC, CREDENTIALW, CredDeleteW, CredFree,
            CredReadW, CredWriteW,
        },
    };

    fn target(name: &str) -> Vec<u16> {
        name.encode_utf16().chain([0]).collect()
    }

    pub(super) fn save(name: &str, secret: &[u8]) -> Result<(), CredentialError> {
        let mut target = target(name);
        let record = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_mut_ptr(),
            CredentialBlobSize: secret.len() as u32,
            CredentialBlob: secret.as_ptr().cast_mut(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            ..Default::default()
        };
        // The input pointers remain valid for this call. CredWriteW reads the value.
        if unsafe { CredWriteW(&record, 0) } != 0 {
            Ok(())
        } else {
            Err(CredentialError::Platform(unsafe { GetLastError() }))
        }
    }

    struct ReadRecord(*mut CREDENTIALW);

    impl Drop for ReadRecord {
        fn drop(&mut self) {
            // Windows returns a single allocation containing the credential and its blob.
            unsafe { CredFree(self.0.cast()) };
        }
    }

    pub(super) fn read(name: &str) -> Result<Option<Vec<u8>>, CredentialError> {
        let target = target(name);
        let mut raw = ptr::null_mut();
        if unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut raw) } == 0 {
            let error = unsafe { GetLastError() };
            return if error == ERROR_NOT_FOUND {
                Ok(None)
            } else {
                Err(CredentialError::Platform(error))
            };
        }
        if raw.is_null() {
            return Err(CredentialError::Unavailable);
        }
        let record = ReadRecord(raw);
        // On success the allocation remains live until ReadRecord is dropped.
        let value = unsafe { &*record.0 };
        let size = value.CredentialBlobSize as usize;
        if value.CredentialBlob.is_null() || !(1..=2560).contains(&size) {
            return Err(CredentialError::InvalidSize);
        }
        Ok(Some(
            unsafe { slice::from_raw_parts(value.CredentialBlob, size) }.to_vec(),
        ))
    }

    pub(super) fn delete(name: &str) -> Result<(), CredentialError> {
        let target = target(name);
        if unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) } != 0 {
            return Ok(());
        }
        let error = unsafe { GetLastError() };
        if error == ERROR_NOT_FOUND {
            Ok(())
        } else {
            Err(CredentialError::Platform(error))
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::CredentialError;

    pub(super) fn save(_: &str, _: &[u8]) -> Result<(), CredentialError> {
        Err(CredentialError::Unavailable)
    }

    pub(super) fn read(_: &str) -> Result<Option<Vec<u8>>, CredentialError> {
        Err(CredentialError::Unavailable)
    }

    pub(super) fn delete(_: &str) -> Result<(), CredentialError> {
        Err(CredentialError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_bounded_ids_and_blobs() {
        for invalid in ["", "../outside", "foreign/target", "CAPITAL", "null\0byte"] {
            assert!(matches!(
                CredentialId::new(invalid),
                Err(CredentialError::InvalidName)
            ));
        }
        let id = CredentialId::new("example-provider.v1").unwrap();
        assert_eq!(save(&id, &[]), Err(CredentialError::InvalidSize));
        assert_eq!(save(&id, &[0; 2561]), Err(CredentialError::InvalidSize));
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Uses an isolated synthetic entry in an interactive Windows user's Credential Manager"]
    fn windows_credential_manager_round_trip() {
        use std::time::{SystemTime, UNIX_EPOCH};

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let id = CredentialId::new(&format!("test-{}-{unique}", std::process::id())).unwrap();

        struct Cleanup<'a>(&'a CredentialId);
        impl Drop for Cleanup<'_> {
            fn drop(&mut self) {
                let _ = delete(self.0);
            }
        }

        assert!(read(&id).unwrap().is_none());
        let _cleanup = Cleanup(&id);
        let test_value = [0xde, 0x25, 0x61, 0x00];
        save(&id, &test_value).unwrap();
        assert!(read(&id).unwrap().as_deref() == Some(test_value.as_slice()));
        delete(&id).unwrap();
        assert!(read(&id).unwrap().is_none());
    }

    #[cfg(not(windows))]
    #[test]
    fn unavailable_platform_refuses_storage() {
        let id = CredentialId::new("example-provider").unwrap();
        assert_eq!(save(&id, &[1]), Err(CredentialError::Unavailable));
        assert_eq!(read(&id), Err(CredentialError::Unavailable));
        assert_eq!(delete(&id), Err(CredentialError::Unavailable));
    }
}
