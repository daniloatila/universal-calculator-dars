use serde::Serialize;
use std::sync::Mutex;
#[cfg(windows)]
use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::ipc::{InvokeBody, Request};
use tauri::{State, Url, WebviewWindow};

#[cfg(windows)]
mod windows;

const SAMPLE_MINIMUM: Duration = Duration::from_secs(2);
#[cfg(windows)]
const CPU_INTERVAL_LIMIT: Duration = Duration::from_secs(120);

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CapabilitySnapshot {
    schema: u32,
    source: &'static str,
    platform: &'static str,
    architecture: Option<&'static str>,
    hardware_threads: Option<u32>,
    native_physical_total_bytes: Option<u64>,
    native_physical_available_bytes: Option<u64>,
    native_memory_pressure: Option<f64>,
    native_low_memory: Option<bool>,
    native_cpu_load: Option<f64>,
    native_host_cpu_one_core: Option<f64>,
    native_cpu_interval_ms: Option<u64>,
    native_host_working_set_bytes: Option<u64>,
    native_host_private_bytes: Option<u64>,
    power_source: Option<&'static str>,
    battery_present: Option<bool>,
    battery_level: Option<f64>,
    charging: Option<bool>,
    battery_saver: Option<bool>,
    native_window_state: Option<&'static str>,
    native_webview_memory_target: Option<&'static str>,
    thermal_state: Option<&'static str>,
    gpu_available: Option<bool>,
    native_monitor_cost_us: u64,
    native_sample_count: u32,
    native_sample_age_ms: u64,
}

fn base_snapshot() -> CapabilitySnapshot {
    let platform = match std::env::consts::OS {
        "windows" => "Windows",
        "macos" => "macOS",
        "linux" => "Linux",
        "android" => "Android",
        "ios" => "iOS",
        _ => std::env::consts::OS,
    };
    CapabilitySnapshot {
        schema: 1,
        source: if cfg!(windows) { "windows" } else { "desktop" },
        platform,
        ..Default::default()
    }
}

#[derive(Default)]
struct Sampler {
    last: Option<(Instant, CapabilitySnapshot)>,
    #[cfg(windows)]
    windows: windows::WindowsSensors,
}

impl Sampler {
    fn sample(&mut self, now: Instant, window_state: Option<&'static str>) -> CapabilitySnapshot {
        if let Some((observable_at, cached)) = &self.last
            && now.saturating_duration_since(*observable_at) < SAMPLE_MINIMUM
        {
            let mut result = cached.clone();
            result.native_window_state = window_state;
            result.native_sample_age_ms =
                milliseconds(now.saturating_duration_since(*observable_at));
            return result;
        }

        let started = Instant::now();
        let mut snapshot = base_snapshot();
        #[cfg(windows)]
        self.windows.sample(now, &mut snapshot);
        snapshot.native_window_state = window_state;
        snapshot.native_sample_count = self.last.as_ref().map_or(1, |(_, previous)| {
            previous.native_sample_count.saturating_add(1)
        });
        snapshot.native_monitor_cost_us =
            started.elapsed().as_micros().min(u64::MAX as u128) as u64;
        self.last = Some((now, snapshot.clone()));
        snapshot
    }
}

fn milliseconds(duration: Duration) -> u64 {
    duration.as_millis().min(u64::MAX as u128) as u64
}

#[derive(Default)]
pub(crate) struct NativeSensorState {
    sampler: Mutex<Sampler>,
    #[cfg(windows)]
    pub(crate) webview_target_generation: AtomicU64,
    #[cfg(windows)]
    pub(crate) webview_target_readback: AtomicU8,
}

fn allowed_origin(url: &Url) -> bool {
    matches!(
        (url.scheme(), url.host_str()),
        ("tauri", Some("localhost")) | ("http" | "https", Some("tauri.localhost"))
    ) && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

fn window_state(window: &WebviewWindow) -> Option<&'static str> {
    if window.is_minimized().ok()? {
        return Some("minimized");
    }
    window
        .is_visible()
        .ok()
        .map(|visible| if visible { "visible" } else { "hidden" })
}

#[tauri::command]
pub(crate) fn dars_native_capabilities(
    window: WebviewWindow,
    request: Request<'_>,
    state: State<'_, NativeSensorState>,
) -> Result<CapabilitySnapshot, &'static str> {
    if window.label() != "main" || !window.url().is_ok_and(|url| allowed_origin(&url)) {
        return Err("native_sensors_denied");
    }
    if !matches!(request.body(), InvokeBody::Json(value) if value.as_object().is_some_and(|object| object.is_empty()))
    {
        return Err("native_sensors_invalid_request");
    }

    let observed_window = window_state(&window);
    let snapshot = state
        .sampler
        .lock()
        .map_err(|_| "native_sensors_unavailable")?
        .sample(Instant::now(), observed_window);
    #[cfg(windows)]
    let snapshot = {
        let mut snapshot = snapshot;
        snapshot.native_webview_memory_target =
            match state.webview_target_readback.load(Ordering::Acquire) {
                1 => Some("normal"),
                2 => Some("low"),
                _ => None,
            };
        snapshot
    };
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_origin_is_local_to_the_packaged_origin() {
        for origin in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/",
            "https://tauri.localhost/",
        ] {
            assert!(allowed_origin(&Url::parse(origin).unwrap()));
        }
        for origin in [
            "https://tauri.localhost.example.com",
            "http://localhost:4174",
            "https://example.com/?tauri.localhost",
            "http://tauri.localhost:12345",
            "file:///index.html",
            "https://user@tauri.localhost/",
        ] {
            assert!(!allowed_origin(&Url::parse(origin).unwrap()));
        }
    }

    #[test]
    fn cached_sample_is_bounded_and_current_window_state_is_reported() {
        let mut sampler = Sampler::default();
        let now = Instant::now();
        let first = sampler.sample(now, Some("visible"));
        let cached = sampler.sample(now + Duration::from_millis(350), Some("minimized"));
        assert_eq!(first.native_sample_count, 1);
        assert_eq!(cached.native_sample_count, 1);
        assert_eq!(cached.native_sample_age_ms, 350);
        assert_eq!(cached.native_window_state, Some("minimized"));
        let next = sampler.sample(now + SAMPLE_MINIMUM, Some("visible"));
        assert_eq!(next.native_sample_count, 2);
        assert_eq!(next.native_sample_age_ms, 0);
        assert_eq!(next.schema, 1);
    }

    #[cfg(windows)]
    #[test]
    fn win32_counters_observe_the_local_host_with_normal_permissions() {
        let mut monitor = windows::WindowsSensors::default();
        let mut first = base_snapshot();
        monitor.sample(Instant::now(), &mut first);
        assert_eq!(first.platform, "Windows");
        assert!(first.architecture.is_some());
        assert!(first.hardware_threads.is_some_and(|number| number > 0));
        let memory = first.native_physical_total_bytes.unwrap();
        assert!(memory > 0 && first.native_physical_available_bytes.unwrap() <= memory);
        assert!(first.native_low_memory.is_some());
        assert!(
            first
                .native_host_working_set_bytes
                .is_some_and(|bytes| bytes > 0)
        );
        assert!(
            first
                .native_host_private_bytes
                .is_some_and(|bytes| bytes > 0)
        );
        assert!(first.native_cpu_load.is_none() && first.native_host_cpu_one_core.is_none());

        std::thread::sleep(Duration::from_millis(140));
        let mut second = base_snapshot();
        monitor.sample(Instant::now(), &mut second);
        if first.hardware_threads.is_some_and(|threads| threads <= 64) {
            assert!(
                second
                    .native_cpu_load
                    .is_some_and(|fraction| (0.0..=1.0).contains(&fraction))
            );
        }
        assert!(
            second
                .native_host_cpu_one_core
                .is_some_and(|fraction| fraction >= 0.0)
        );
        assert!(second.native_cpu_interval_ms.unwrap_or_default() >= 100);
        assert!(second.thermal_state.is_none() && second.gpu_available.is_none());
    }
}
