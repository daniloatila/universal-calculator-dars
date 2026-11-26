//! Portable accounting for the live data and workspaces of one Data Lab dataset.

use super::{Cell, Checked, MAX_FILE};
use crate::MathError;
use serde_json::json;
use std::io::{self, Write};
use std::sync::atomic::{AtomicUsize, Ordering};

pub(super) const MODEL: &str = "data-lab-estimated-live-v1";
pub(super) const MAX_SETTINGS: usize = 16 * 1024;
pub(super) const DEFAULT_BUDGET: usize = 192 * 1024 * 1024;
const MIN_BUDGET: usize = 64 * 1024;
const MAX_BUDGET: usize = 256 * 1024 * 1024;
const BASE: usize = 32 * 1024;
pub(super) const CELL: usize = 256;
pub(super) const ROW: usize = 80;
pub(super) const COLUMN: usize = 192;
pub(super) const RATIONAL_SCRATCH: usize = 16 * 1024;
pub(super) const PAGE_MAX: usize = 4 * 1024 * 1024;
pub(super) const EXPORT_MAX: usize = 32 * 1024 * 1024;

pub(super) fn text(bytes: usize) -> usize {
    if bytes == 0 {
        0
    } else {
        bytes.saturating_mul(3).saturating_add(32)
    }
}

pub(super) fn cell_storage(cell: &Cell) -> usize {
    text(cell.value.len())
        .saturating_add(cell.formula.as_ref().map_or(0, |s| text(s.len())))
        .saturating_add(cell.metadata_storage_bytes())
}

pub(super) fn rational_text_bytes(value: &num_rational::BigRational) -> usize {
    // ceil(bits * log10(2)) with an integer upper approximation and room for sign/slash.
    let digits = |bits: u64| (bits as usize).saturating_mul(310).div_ceil(1024).max(1);
    digits(value.numer().bits()) + digits(value.denom().bits()) + 2
}

pub(super) fn checked_limit(configured: Option<usize>) -> Checked<usize> {
    let value = configured.unwrap_or(DEFAULT_BUDGET);
    if !(MIN_BUDGET..=MAX_BUDGET).contains(&value) {
        return Err(MathError::Limit);
    }
    Ok(value)
}

fn fixed(settings: usize) -> usize {
    BASE.saturating_add(settings.saturating_mul(8))
}

pub(super) fn input_limit(configured: Option<usize>, settings: usize) -> Checked<usize> {
    let limit = checked_limit(configured)?;
    let bytes = limit
        .checked_sub(fixed(settings))
        .ok_or(MathError::ResourceBudget)?;
    Ok(MAX_FILE.min(bytes / 3))
}

#[derive(Clone, Copy)]
pub(super) enum Stage {
    Import,
    Cast,
    Transform,
    Analysis,
    Page,
    Proof,
    Export,
    BrowserBoundary,
}

const STAGES: [&str; 8] = [
    "import",
    "cast",
    "transform",
    "analysis",
    "page",
    "proof",
    "export",
    "browser_boundary",
];

pub(super) struct Budget {
    limit: usize,
    base: usize,
    peak: [AtomicUsize; STAGES.len()],
    browser_response: AtomicUsize,
}

impl Budget {
    pub(super) fn new(configured: Option<usize>, input: usize, settings: usize) -> Checked<Self> {
        if input > MAX_FILE || settings > MAX_SETTINGS {
            return Err(MathError::Limit);
        }
        let limit = checked_limit(configured)?;
        let base = fixed(settings).saturating_add(input.saturating_mul(3));
        if base > limit {
            return Err(MathError::ResourceBudget);
        }
        Ok(Self {
            limit,
            base,
            peak: std::array::from_fn(|_| AtomicUsize::new(0)),
            browser_response: AtomicUsize::new(0),
        })
    }

    pub(super) fn limit(&self) -> usize {
        self.limit
    }

    pub(super) fn reserve_browser_response(&self, resident: usize, bytes: usize) -> Checked<()> {
        let peak = &self.peak[Stage::BrowserBoundary as usize];
        let current = self.browser_response.load(Ordering::Relaxed);
        let projected = self
            .base
            .saturating_add(resident)
            .saturating_add(current.max(bytes));
        if projected > self.limit {
            return Err(MathError::ResourceBudget);
        }
        self.browser_response.fetch_max(bytes, Ordering::Relaxed);
        peak.fetch_max(projected, Ordering::Relaxed);
        Ok(())
    }

    pub(super) fn stage(&self, stage: Stage, resident: usize) -> Checked<Meter<'_>> {
        let mut meter = Meter {
            budget: self,
            stage,
            taken: 0,
        };
        meter.reserve(resident)?;
        Ok(meter)
    }

    pub(super) fn diagnostics(&self) -> String {
        let peaks = self
            .peak
            .each_ref()
            .map(|peak| peak.load(Ordering::Relaxed));
        let values = std::collections::BTreeMap::from_iter(STAGES.into_iter().zip(peaks));
        let largest = STAGES
            .into_iter()
            .zip(peaks)
            .max_by_key(|(name, peak)| (*peak, *name));
        json!({"model":MODEL,"configured_bytes":self.limit,"base_bytes":self.base,
            "browser_response_reserve_bytes":self.browser_response.load(Ordering::Relaxed),
            "estimated_high_water_bytes":largest.map(|(_, peak)|peak).unwrap_or(self.base).max(self.base),
            "largest_stage":largest.filter(|(_,peak)|*peak>0).map(|(name,_)|name),
            "stage_estimated_high_water_bytes":values}).to_string()
    }
}

pub(super) struct Meter<'a> {
    budget: &'a Budget,
    stage: Stage,
    taken: usize,
}

impl Meter<'_> {
    pub(super) fn reserve(&mut self, additional: usize) -> Checked<()> {
        let taken = self.taken.saturating_add(additional);
        let total = self
            .budget
            .base
            .saturating_add(taken)
            .saturating_add(self.budget.browser_response.load(Ordering::Relaxed));
        if total > self.budget.limit {
            return Err(MathError::ResourceBudget);
        }
        self.budget.peak[self.stage as usize].fetch_max(total, Ordering::Relaxed);
        self.taken = taken;
        Ok(())
    }

    pub(super) fn release(&mut self, bytes: usize) {
        self.taken = self
            .taken
            .checked_sub(bytes)
            .expect("balanced Data Lab accounting");
    }
}

pub(super) struct Output<'a> {
    meter: Meter<'a>,
    bytes: Vec<u8>,
    maximum: usize,
    charged_capacity: usize,
    failure: Option<MathError>,
}

impl<'a> Output<'a> {
    pub(super) fn new(meter: Meter<'a>, maximum: usize) -> Self {
        Self {
            meter,
            bytes: Vec::new(),
            maximum,
            charged_capacity: 0,
            failure: None,
        }
    }

    pub(super) fn fail(&self) -> MathError {
        self.failure.unwrap_or(MathError::InvalidInput)
    }

    pub(super) fn finish(self) -> Vec<u8> {
        self.bytes
    }

    fn append(&mut self, data: &[u8]) -> Checked<()> {
        let total = self.bytes.len().saturating_add(data.len());
        if total > self.maximum {
            return Err(MathError::Limit);
        }
        if total > self.charged_capacity {
            let capacity = total.next_power_of_two().min(self.maximum);
            // Old and replacement storage can overlap. A UTF-16 boundary copy can use two bytes per source byte.
            let charge = capacity.saturating_mul(3);
            self.meter.reserve(charge)?;
            self.bytes
                .try_reserve_exact(capacity - self.bytes.len())
                .map_err(|_| MathError::ResourceBudget)?;
            self.meter.release(self.charged_capacity.saturating_mul(3));
            self.charged_capacity = capacity;
        }
        self.bytes.extend_from_slice(data);
        Ok(())
    }
}

impl Write for Output<'_> {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        self.append(data).map_err(|error| {
            self.failure = Some(error);
            io::Error::other(error.as_str())
        })?;
        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

pub(super) fn serialize<T: serde::Serialize>(
    meter: Meter<'_>,
    maximum: usize,
    value: &T,
) -> Checked<String> {
    let mut output = Output::new(meter, maximum);
    serde_json::to_writer(&mut output, value).map_err(|_| output.fail())?;
    String::from_utf8(output.finish()).map_err(|_| MathError::InvalidInput)
}
