#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

fn main() {
    let minimized_before = AtomicBool::new(false);
    tauri::Builder::default()
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
            }
        })
        .on_page_load(|webview, _| {
            if webview.label() == "main"
                && let Ok(minimized) = webview.window().is_minimized()
            {
                let _ = webview.eval(visibility_script(minimized));
            }
        })
        .run(tauri::generate_context!())
        .expect("DARS desktop failed to start");
}
