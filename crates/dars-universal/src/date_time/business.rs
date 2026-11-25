use super::{Checked, civil};
use crate::MathError;
use jiff::civil::Date;
use std::collections::BTreeSet;

pub(super) const CALENDAR_VERSION: &str = "custom-weekdays-holidays-v1";
const MAX_HOLIDAYS: usize = 23;

pub(super) struct Calendar {
    weekdays: [bool; 7],
    holidays: BTreeSet<Date>,
}

impl Calendar {
    pub(super) fn read(weekdays: &str, holidays: &str) -> Checked<Self> {
        let mut active = [false; 7];
        for day in weekdays.split(',') {
            let day = day.trim();
            if day.len() != 1 {
                return Err(MathError::InvalidInput);
            }
            let weekday = civil::digits(day)?;
            if !(1..=7).contains(&weekday) {
                return Err(MathError::InvalidInput);
            }
            active[(weekday - 1) as usize] = true;
        }
        let mut excluded = BTreeSet::new();
        if !holidays.trim().is_empty() {
            for (index, holiday) in holidays.split(',').enumerate() {
                if index == MAX_HOLIDAYS {
                    return Err(MathError::Limit);
                }
                excluded.insert(civil::parse(holiday.trim())?);
            }
        }
        Ok(Self {
            weekdays: active,
            holidays: excluded,
        })
    }

    pub(super) fn weekday_text(&self) -> String {
        self.weekdays
            .iter()
            .enumerate()
            .filter(|(_, active)| **active)
            .map(|(index, _)| (index + 1).to_string())
            .collect::<Vec<_>>()
            .join(",")
    }

    pub(super) fn holiday_text(&self) -> String {
        self.holidays
            .iter()
            .map(Date::to_string)
            .collect::<Vec<_>>()
            .join(",")
    }

    fn inclusive(&self, first: Date, last: Date) -> i64 {
        let total = civil::distance(first, last) + 1;
        let active_per_week = self.weekdays.iter().filter(|active| **active).count() as i64;
        let mut count = (total / 7) * active_per_week;
        let offset = i64::from(first.weekday().to_monday_zero_offset());
        for step in 0..total % 7 {
            count += i64::from(self.weekdays[((offset + step) % 7) as usize]);
        }
        for date in self.holidays.range(first..=last) {
            count -= i64::from(self.weekdays[date.weekday().to_monday_zero_offset() as usize]);
        }
        count
    }

    pub(super) fn difference(&self, start: Date, end: Date) -> Checked<i64> {
        if start == end {
            return Ok(0);
        }
        let earlier = start.min(end);
        let later = start.max(end);
        let count = self.inclusive(civil::add_days(earlier, 1)?, later);
        Ok(if start < end { count } else { -count })
    }

    pub(super) fn deadline(&self, start: Date, count: i64) -> Checked<Date> {
        if count == 0 {
            return Ok(start);
        }
        let sign = count.signum();
        let target = count.abs();
        let adjacent = civil::add_days(start, sign)?;
        let boundary = if count > 0 { civil::MAX } else { civil::MIN };
        let range_count = |other: Date| self.inclusive(adjacent.min(other), adjacent.max(other));
        if range_count(boundary) < target {
            return Err(MathError::Domain);
        }
        let mut left = 1;
        let mut right = civil::distance(start, boundary).abs();
        while left < right {
            let middle = left + (right - left) / 2;
            if range_count(civil::add_days(start, sign * middle)?) < target {
                left = middle + 1;
            } else {
                right = middle;
            }
        }
        civil::add_days(start, sign * left)
    }
}
