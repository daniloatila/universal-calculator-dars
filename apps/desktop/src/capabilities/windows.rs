use std::mem::size_of;
use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
use std::time::{Duration, Instant};
use windows_sys::Win32::Foundation::{FILETIME, HANDLE};
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress};
use windows_sys::Win32::System::Memory::{
    CreateMemoryResourceNotification, LowMemoryResourceNotification,
    QueryMemoryResourceNotification,
};
use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
use windows_sys::Win32::System::ProcessStatus::{
    K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX,
};
use windows_sys::Win32::System::SystemInformation::{
    GlobalMemoryStatusEx, IMAGE_FILE_MACHINE, IMAGE_FILE_MACHINE_AMD64, IMAGE_FILE_MACHINE_ARM64,
    IMAGE_FILE_MACHINE_ARMNT, IMAGE_FILE_MACHINE_I386, MEMORYSTATUSEX,
};
use windows_sys::Win32::System::Threading::{
    ALL_PROCESSOR_GROUPS, GetActiveProcessorCount, GetActiveProcessorGroupCount, GetCurrentProcess,
    GetProcessTimes, GetSystemTimes,
};

use super::{CPU_INTERVAL_LIMIT, CapabilitySnapshot, milliseconds};

pub(super) struct WindowsSensors {
    memory_notification: Option<OwnedHandle>,
    architecture: Option<&'static str>,
    logical_threads: Option<u32>,
    system_cpu_supported: bool,
    previous: Option<CounterReading>,
}

impl Default for WindowsSensors {
    fn default() -> Self {
        let architecture = native_architecture();
        let threads = unsafe { GetActiveProcessorCount(ALL_PROCESSOR_GROUPS) };
        let handle = unsafe { CreateMemoryResourceNotification(LowMemoryResourceNotification) };
        let memory_notification = if handle.is_null() {
            None
        } else {
            // Creation returns a new handle owned by the caller.
            Some(unsafe { OwnedHandle::from_raw_handle(handle) })
        };
        Self {
            memory_notification,
            architecture,
            logical_threads: (threads > 0).then_some(threads),
            // GetSystemTimes reports just the calling processor group on multi-group hosts.
            system_cpu_supported: unsafe { GetActiveProcessorGroupCount() } == 1,
            previous: None,
        }
    }
}

fn native_architecture() -> Option<&'static str> {
    let module = unsafe { GetModuleHandleW(windows_sys::w!("kernel32.dll")) };
    if module.is_null() {
        return None;
    }
    // Resolve this optional Windows 10 1709+ export without changing the launch requirements.
    let symbol = unsafe { GetProcAddress(module, windows_sys::s!("IsWow64Process2")) }?;
    type QueryMachine = unsafe extern "system" fn(
        HANDLE,
        *mut IMAGE_FILE_MACHINE,
        *mut IMAGE_FILE_MACHINE,
    ) -> windows_sys::core::BOOL;
    // The named Kernel32 export uses the documented IsWow64Process2 signature.
    let query = unsafe {
        std::mem::transmute::<unsafe extern "system" fn() -> isize, QueryMachine>(symbol)
    };
    let mut process = 0;
    let mut native = 0;
    if unsafe { query(GetCurrentProcess(), &mut process, &mut native) } == 0 {
        return None;
    }
    match native {
        IMAGE_FILE_MACHINE_AMD64 => Some("x86_64"),
        IMAGE_FILE_MACHINE_ARM64 => Some("aarch64"),
        IMAGE_FILE_MACHINE_I386 => Some("x86"),
        IMAGE_FILE_MACHINE_ARMNT => Some("arm"),
        _ => None,
    }
}

impl WindowsSensors {
    pub(super) fn sample(&mut self, now: Instant, record: &mut CapabilitySnapshot) {
        record.architecture = self.architecture;
        record.hardware_threads = self.logical_threads;
        if let Some((total, available)) = physical_memory() {
            record.native_physical_total_bytes = Some(total);
            record.native_physical_available_bytes = Some(available);
            record.native_memory_pressure = Some((total - available) as f64 / total as f64);
        }
        if let Some(handle) = &self.memory_notification {
            let mut low = 0;
            let sampled =
                unsafe { QueryMemoryResourceNotification(handle.as_raw_handle(), &mut low) };
            record.native_low_memory = (sampled != 0).then_some(low != 0);
        }

        let counters = CounterReading::observe(now, self.system_cpu_supported);
        if let Some(prior) = self.previous.replace(counters) {
            publish_cpu(prior, counters, record);
        }
        if let Some((resident, commit)) = host_memory() {
            record.native_host_working_set_bytes = Some(resident);
            record.native_host_private_bytes = Some(commit);
        }
        let mut power = SYSTEM_POWER_STATUS::default();
        if unsafe { GetSystemPowerStatus(&mut power) } != 0 {
            publish_power(power, record);
        }
    }
}

#[derive(Clone, Copy)]
struct CounterReading {
    at: Instant,
    system: Option<(u64, u64)>,
    host: Option<u64>,
}

impl CounterReading {
    fn observe(at: Instant, system_cpu_supported: bool) -> Self {
        let mut idle = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        let system = if system_cpu_supported
            && unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) } != 0
        {
            ticks(kernel)
                .checked_add(ticks(user))
                .map(|total| (ticks(idle), total))
        } else {
            None
        };

        // A current-process pseudo-handle needs neither elevation nor a close operation.
        let host = if unsafe {
            GetProcessTimes(
                GetCurrentProcess(),
                &mut FILETIME::default(),
                &mut FILETIME::default(),
                &mut kernel,
                &mut user,
            )
        } != 0
        {
            ticks(kernel).checked_add(ticks(user))
        } else {
            None
        };
        Self { at, system, host }
    }
}

fn ticks(value: FILETIME) -> u64 {
    (u64::from(value.dwHighDateTime) << 32) | u64::from(value.dwLowDateTime)
}

fn publish_cpu(previous: CounterReading, current: CounterReading, record: &mut CapabilitySnapshot) {
    let elapsed = current.at.saturating_duration_since(previous.at);
    if !(Duration::from_millis(100)..=CPU_INTERVAL_LIMIT).contains(&elapsed) {
        return;
    }
    record.native_cpu_interval_ms = Some(milliseconds(elapsed));
    if let (Some((before_idle, before_total)), Some((after_idle, after_total))) =
        (previous.system, current.system)
        && let (Some(idle), Some(total)) = (
            after_idle.checked_sub(before_idle),
            after_total.checked_sub(before_total),
        )
        && total > 0
        && idle <= total
    {
        record.native_cpu_load = Some((total - idle) as f64 / total as f64);
    }
    if let (Some(before), Some(after)) = (previous.host, current.host)
        && let Some(busy) = after.checked_sub(before)
    {
        record.native_host_cpu_one_core =
            Some(busy as f64 / (elapsed.as_secs_f64() * 10_000_000.0));
    }
}

fn physical_memory() -> Option<(u64, u64)> {
    let mut metrics = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    if unsafe { GlobalMemoryStatusEx(&mut metrics) } != 0
        && metrics.ullTotalPhys > 0
        && metrics.ullAvailPhys <= metrics.ullTotalPhys
    {
        return Some((metrics.ullTotalPhys, metrics.ullAvailPhys));
    }
    None
}

fn host_memory() -> Option<(u64, u64)> {
    let mut metrics = PROCESS_MEMORY_COUNTERS_EX {
        cb: size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
        ..Default::default()
    };
    // This API uses the base counter type and cb to select the requested extended structure.
    let pointer: *mut PROCESS_MEMORY_COUNTERS =
        (&mut metrics as *mut PROCESS_MEMORY_COUNTERS_EX).cast();
    if unsafe { K32GetProcessMemoryInfo(GetCurrentProcess(), pointer, metrics.cb) } == 0 {
        return None;
    }
    Some((metrics.WorkingSetSize as u64, metrics.PrivateUsage as u64))
}

fn publish_power(power: SYSTEM_POWER_STATUS, record: &mut CapabilitySnapshot) {
    record.power_source = match power.ACLineStatus {
        0 => Some("battery"),
        1 => Some("ac"),
        _ => None,
    };
    record.battery_saver = match power.SystemStatusFlag {
        0 => Some(false),
        1 => Some(true),
        _ => None,
    };
    if power.BatteryFlag == 255 {
        return;
    }

    let battery_present = power.BatteryFlag & 128 == 0;
    record.battery_present = Some(battery_present);
    if battery_present {
        record.charging = Some(power.BatteryFlag & 8 != 0);
        if power.BatteryLifePercent <= 100 {
            record.battery_level = Some(f64::from(power.BatteryLifePercent) / 100.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::base_snapshot;

    #[test]
    fn windows_idle_is_excluded_and_invalid_counters_remain_unavailable() {
        let at = Instant::now();
        let first = CounterReading {
            at,
            system: Some((300, 500)),
            host: Some(100),
        };
        let second = CounterReading {
            at: at + Duration::from_secs(2),
            system: Some((475, 750)),
            host: Some(10_000_100),
        };
        let mut snapshot = base_snapshot();
        publish_cpu(first, second, &mut snapshot);
        assert_eq!(snapshot.native_cpu_load, Some(0.3));
        assert_eq!(snapshot.native_host_cpu_one_core, Some(0.5));
        let mut invalid = base_snapshot();
        publish_cpu(
            first,
            CounterReading {
                at: second.at,
                system: Some((600, 750)),
                host: Some(20),
            },
            &mut invalid,
        );
        assert_eq!(invalid.native_cpu_load, None);
        assert_eq!(invalid.native_host_cpu_one_core, None);
    }

    #[test]
    fn unavailable_and_absent_battery_are_not_reported_as_charged() {
        for flag in [128, 255] {
            let mut snapshot = base_snapshot();
            publish_power(
                SYSTEM_POWER_STATUS {
                    ACLineStatus: 1,
                    BatteryFlag: flag,
                    BatteryLifePercent: 255,
                    ..Default::default()
                },
                &mut snapshot,
            );
            assert_eq!(snapshot.power_source, Some("ac"));
            assert_eq!(snapshot.battery_present, (flag == 128).then_some(false));
            assert!(snapshot.battery_level.is_none() && snapshot.charging.is_none());
        }
        let mut snapshot = base_snapshot();
        publish_power(
            SYSTEM_POWER_STATUS {
                ACLineStatus: 0,
                BatteryFlag: 4,
                BatteryLifePercent: 12,
                SystemStatusFlag: 1,
                ..Default::default()
            },
            &mut snapshot,
        );
        assert_eq!(snapshot.power_source, Some("battery"));
        assert_eq!(snapshot.battery_level, Some(0.12));
        assert_eq!(snapshot.charging, Some(false));
        assert_eq!(snapshot.battery_saver, Some(true));
    }
}
