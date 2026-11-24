#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capabilities;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};

fn visibility_script(minimized: bool) -> &'static str {
    // These two fixed snippets transmit a window flag and accept no web input.
    if minimized {
        "globalThis.__DARS_WINDOW_MINIMIZED__ = true; window.dispatchEvent(new Event('dars-window-visibility'));"
    } else {
        "globalThis.__DARS_WINDOW_MINIMIZED__ = false; window.dispatchEvent(new Event('dars-window-visibility'));"
    }
}

#[cfg(windows)]
fn update_webview_memory_target(app: &tauri::AppHandle, minimized: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        ICoreWebView2_19,
    };
    use windows_core::Interface;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let state = app.state::<capabilities::NativeSensorState>();
    let generation = state
        .webview_target_generation
        .fetch_add(1, Ordering::AcqRel)
        + 1;
    state.webview_target_readback.store(0, Ordering::Release);
    let app = app.clone();
    let _ = window.with_webview(move |platform| {
        let state = app.state::<capabilities::NativeSensorState>();
        if state.webview_target_generation.load(Ordering::Acquire) != generation {
            return;
        }
        // Tauri runs this closure on the webview's UI thread. The optional COM interface
        // leaves older runtimes unchanged, and the target neither suspends nor trims processes.
        let readback = (|| {
            let core = unsafe { platform.controller().CoreWebView2() }.ok()?;
            let memory = core.cast::<ICoreWebView2_19>().ok()?;
            let desired = if minimized {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            };
            let mut observed = COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL;
            unsafe { memory.MemoryUsageTargetLevel(&mut observed) }.ok()?;
            if observed != desired {
                unsafe { memory.SetMemoryUsageTargetLevel(desired) }.ok()?;
                unsafe { memory.MemoryUsageTargetLevel(&mut observed) }.ok()?;
            }
            match observed {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL => Some(1),
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW => Some(2),
                _ => None,
            }
        })();
        if state.webview_target_generation.load(Ordering::Acquire) == generation {
            state
                .webview_target_readback
                .store(readback.unwrap_or_default(), Ordering::Release);
        }
    });
}

fn main() {
    let minimized_before = AtomicBool::new(false);
    tauri::Builder::default()
        .manage(capabilities::NativeSensorState::default())
        .invoke_handler(tauri::generate_handler![
            capabilities::dars_native_capabilities
        ])
        .on_window_event(move |window, event| {
            if window.label() != "main"
                || !matches!(
                    event,
                    WindowEvent::Resized(_) | WindowEvent::Moved(_) | WindowEvent::Focused(_)
                )
            {
                return;
            }
            let Ok(minimized) = window.is_minimized() else {
                return;
            };
            if minimized != minimized_before.swap(minimized, Ordering::Relaxed)
                && let Some(webview) = window.get_webview_window("main")
            {
                let _ = webview.eval(visibility_script(minimized));
                #[cfg(windows)]
                update_webview_memory_target(webview.app_handle(), minimized);
            }
        })
        .on_page_load(|webview, _| {
            if webview.label() == "main"
                && let Ok(minimized) = webview.window().is_minimized()
            {
                let _ = webview.eval(visibility_script(minimized));
                #[cfg(windows)]
                update_webview_memory_target(webview.app_handle(), minimized);
            }
        })
        .run(tauri::generate_context!())
        .expect("DARS desktop failed to start");
}
