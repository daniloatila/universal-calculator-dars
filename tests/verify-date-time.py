"""Independent civil, business, time-zone and elapsed-time references for the CLI.

Civil references use Python's proleptic Gregorian calendar. Named time zones
are loaded directly from the approved wheel, bypassing the host zone database.
The duration oracle folds signed integer nanoseconds into UTC arithmetic.

https://www.iana.org/time-zones/releases/2026f
https://data.iana.org/time-zones/tzdb-2026f/europe
https://pypi.org/project/tzdata/2026.6/
https://docs.python.org/3/library/zoneinfo.html
https://www.rfc-editor.org/rfc/rfc3339
"""

import calendar
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from functools import cache
from importlib.resources import files
import json
from pathlib import Path
import re
import subprocess
import sys
from zoneinfo import ZoneInfo

import tzdata


DAY = timedelta(days=1)
UTC = timezone.utc
NANO = 10**9
NANO_DAY = 86_400 * NANO
IANA_VERSION = "2026f"
TZDATA_VERSION = "2026.6"
METHODS = {
    "difference": "gregorian_civil_day_difference",
    "age": "clamped_gregorian_age",
    "period": "gregorian_period_arithmetic",
    "calendar": "iso_week_calendar",
    "business_days": "custom_business_day_count",
    "deadline": "custom_business_deadline",
    "timezone": "iana_bundled_timezone_conversion",
    "duration": "rfc3339_nanosecond_duration",
}
# The IANA 2026f Europe/Dublin Rearguard block uses the EU rules: standard
# time in January and DST in July. The wheel uses the main Eire representation.
DUBLIN_CLASSIFICATIONS = {
    date(2024, 1, 1): (timedelta(hours=-1), False),
    date(2024, 7, 1): (timedelta(), True),
}


def shift_months(day, months):
    """Keep the day when present, otherwise use the destination month's last day."""
    year, month = divmod(day.year * 12 + day.month - 1 + months, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def business_count(begin, end, weekdays, holidays):
    lower, upper = sorted((begin, end))
    candidates = (lower + timedelta(days=offset) for offset in range(1, (upper - lower).days + 1))
    count = sum(day.isoweekday() in weekdays and day not in holidays for day in candidates)
    return count if begin <= end else -count


def business_deadline(start, amount, weekdays, holidays):
    candidate = start
    increment = DAY if amount >= 0 else -DAY
    for _ in range(abs(amount)):
        candidate += increment
        while candidate.isoweekday() not in weekdays or candidate in holidays:
            candidate += increment
    return candidate


@cache
def zone_from_wheel(key):
    resource = files("tzdata.zoneinfo").joinpath(*key.split("/"))
    with resource.open("rb") as tzif:
        return ZoneInfo.from_file(tzif, key=key)


def valid_instants(local, source):
    """Round trips distinguish missing wall times from repeated wall times."""
    zone = zone_from_wheel(source)
    candidates = set()
    for fold in (0, 1):
        instant = local.replace(tzinfo=zone, fold=fold).astimezone(UTC)
        if instant.astimezone(zone).replace(tzinfo=None) == local:
            candidates.add(instant)
    return sorted(candidates)


def parse_wall_with_nanos(value):
    wall, dot, fraction = value.partition(".")
    return datetime.fromisoformat(wall), int(fraction.ljust(9, "0")) if dot else 0


def instant_to_nanos(value):
    match = re.fullmatch(r"(.{19})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2})", value)
    assert match, value
    wall, fraction, offset = match.groups()
    instant = datetime.fromisoformat(wall + ("+00:00" if offset == "Z" else offset)).astimezone(UTC)
    epoch = datetime(1970, 1, 1, tzinfo=UTC)
    difference = instant - epoch
    return difference.days * NANO_DAY + difference.seconds * NANO + int((fraction or "").ljust(9, "0"))


def wall_text(value, nanos):
    fraction = (f".{nanos:09d}").rstrip("0") if nanos else ""
    return value.replace(tzinfo=None).isoformat(timespec="seconds") + fraction


def offset_text(value):
    seconds = value.utcoffset() // timedelta(seconds=1)
    hours, remainder = divmod(abs(seconds), 3600)
    minutes, seconds_remainder = divmod(remainder, 60)
    suffix = f":{seconds_remainder:02d}" if seconds_remainder else ""
    return f"{'+' if seconds >= 0 else '-'}{hours:02d}:{minutes:02d}{suffix}"


def daylight_flag(value):
    zone = value.tzinfo.key
    if zone == "Europe/Dublin" and value.date() in DUBLIN_CLASSIFICATIONS:
        wheel_delta, rearguard_flag = DUBLIN_CLASSIFICATIONS[value.date()]
        assert value.dst() == wheel_delta, (value, value.dst(), wheel_delta)
        return rearguard_flag
    return bool(value.dst())


def result_text(**fields):
    return "; ".join(f"{key}={str(value).lower() if isinstance(value, bool) else value}"
                     for key, value in fields.items())


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def request(self, operation, value, options=None, *, original=None):
        payload = {"schema": 1, "module": "date-time", "operation": operation, "input": value,
                   "options": options if options is not None else {}}
        if original is not None:
            payload["original_input"] = original
        process = subprocess.run([self.executable, "tool", json.dumps(payload, ensure_ascii=False)],
                                 capture_output=True, encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def record(self, operation, value, options=None, *, original=None):
        response = self.request(operation, value, options, original=original)
        assert response["ok"], (operation, value, options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "date-time", operation), proof
        assert proof["expression"] == (value if original is None else original), proof
        assert proof["options"] == (options if options is not None else {}), proof
        assert proof["algorithm_version"].startswith("date-time/"), proof
        assert all(proof[field] for field in ("result", "normalized", "formula", "references")), proof
        method = "gregorian_civil_deadline" if operation == "deadline" and (options or {}).get("basis") == "civil" else METHODS[operation]
        domain = {"timezone": "zoned_datetime", "duration": "absolute_time"}.get(operation, "civil_date")
        assert (proof["method"], proof["domain"]) == (method, domain), proof
        if method in ("custom_business_deadline", "custom_business_day_count"):
            weekdays, holidays = business_reference_options(options or {})
            assert proof["variables"]["calendar_version"] == "custom-weekdays-holidays-v1", proof
            assert proof["variables"]["weekdays"] == ",".join(str(day) for day in sorted(weekdays)), proof
            canonical_holidays = ",".join(day.isoformat() for day in sorted(holidays))
            assert proof["variables"].get("holidays", "") == canonical_holidays, proof
        elif domain == "civil_date":
            assert proof["variables"]["calendar_version"] == "proleptic-gregorian-v1", proof
        if operation == "duration":
            assert proof["units"] == {"seconds": "s"}, proof
            assert (proof["variables"]["start"], proof["variables"]["end"]) == tuple(
                item.strip() for item in value.split("|")), proof
        assert proof["exactness"] == "exact", proof
        assert all(proof[field] is None for field in ("precision", "rounding", "error_bound", "tolerance")), proof
        return proof

    def check(self, operation, value, expected, options=None, *, original=None, category=None):
        proof = self.record(operation, value, options, original=original)
        assert proof["result"] == expected, (operation, value, options, expected, proof)
        self.checks[category or operation] += 1
        return proof

    def reject(self, operation, value, code, options=None, *, original=None, category="structured rejections"):
        response = self.request(operation, value, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, value[:120], options, code, response)
        self.checks[category] += 1

    def replay(self, operation, value, options=None):
        first = self.record(operation, value, options)
        second = self.record(first["operation"], first["normalized"], first["options"], original=first["expression"])
        assert first == second, (first, second)
        self.checks["identical full record replays"] += 1


def verify_difference(oracle):
    for first, last in (
        ("2024-02-28", "2024-03-01"), ("2023-02-28", "2023-03-01"),
        ("2000-02-28", "2000-03-01"), ("1900-02-28", "1900-03-01"),
        ("2100-02-28", "2100-03-01"), ("1582-10-04", "1582-10-15"),
        ("1752-09-02", "1752-09-14"), ("0001-01-01", "9999-12-31"),
        ("1492-10-12", "1492-10-12"), ("2024-02-24", "2024-03-02"),
        ("2024-02-24", "2024-03-03"), ("1999-12-31", "2000-01-01"),
        ("2000-01-01", "2400-01-01"), ("1970-01-01", "1970-02-13"),
    ):
        endpoints = [(first, last), (last, first)] if first != last else [(first, last)]
        for begin, end in endpoints:
            span = (date.fromisoformat(end) - date.fromisoformat(begin)).days
            magnitude, extra = divmod(abs(span), 7)
            sign = -1 if span < 0 else 1
            expected = result_text(days=span, weeks=sign*magnitude, remaining_days=sign*extra)
            oracle.check("difference", f"{begin}|{end}", expected)


def verify_age(oracle):
    for birth, reference in (
        ("2000-02-29", "2023-02-27"), ("2000-02-29", "2023-02-28"),
        ("2000-02-29", "2023-03-28"), ("2000-02-29", "2023-03-29"),
        ("2000-02-29", "2024-02-29"), ("2000-01-31", "2000-02-29"),
        ("2001-01-31", "2001-03-30"), ("2001-01-31", "2001-03-31"),
        ("2000-01-31", "2024-02-29"), ("2020-02-29", "2020-03-01"),
        ("1999-12-31", "2000-12-30"), ("2024-03-31", "2024-04-30"),
        ("1984-01-03", "2026-11-25"), ("2024-11-01", "2024-11-01"),
        ("0001-01-01", "9999-12-31"), ("9999-12-31", "9999-12-31"),
        ("0001-01-30", "0001-02-28"), ("1896-02-29", "1900-02-28"),
    ):
        begin, end = date.fromisoformat(birth), date.fromisoformat(reference)
        next_month_index = (end.year - begin.year) * 12 + end.month - begin.month
        full_months = max(candidate for candidate in range(max(0, next_month_index - 1), next_month_index + 1)
                          if shift_months(begin, candidate) <= end)
        years, months = divmod(full_months, 12)
        expected = result_text(years=years, months=months, days=(end-shift_months(begin, full_months)).days,
                               total_days=(end-begin).days)
        oracle.check("age", f"{birth}|{reference}", expected)


def verify_period(oracle):
    for value, options in (
        ("2024-01-31", {"months": "1"}), ("2023-01-31", {"months": "1"}),
        ("2024-03-31", {"months": "-1"}), ("2024-05-31", {"months": "-1"}),
        ("2024-08-31", {"months": "-2"}), ("2024-12-31", {"months": "1"}),
        ("2000-02-29", {"years": "1", "months": "1"}),
        ("2000-02-29", {"years": "100", "overflow": "clamp"}),
        ("2000-02-29", {"years": "400", "overflow": "reject"}),
        ("2024-02-29", {"years": "-4", "months": "-2", "weeks": "-1", "days": "-13"}),
        ("2024-01-31", {"months": "1", "days": "1"}),
        ("2024-03-01", {"weeks": "-1", "days": "7"}),
        ("2024-01-15", {"years": "12", "months": "-144", "overflow": "reject"}),
        ("2024-01-15", {"days": "+0", "weeks": "-0"}),
        ("2000-01-31", {"months": "25", "weeks": "-1", "days": "2"}),
        ("1582-10-04", {"days": "1"}), ("2024-09-25", {"weeks": "52"}),
        ("0001-01-01", {"years": "9998", "months": "11", "days": "30"}),
        ("9999-12-31", {"years": "-9998", "months": "-11", "days": "-30"}),
        ("1970-01-01", {}), ("2024-01-31", {"months": "12", "overflow": "reject"}),
    ):
        begin = date.fromisoformat(value)
        months = int(options.get("years", "0")) * 12 + int(options.get("months", "0"))
        month_end = shift_months(begin, months)
        elapsed = timedelta(weeks=int(options.get("weeks", "0")), days=int(options.get("days", "0")))
        oracle.check("period", value, result_text(date=(month_end+elapsed).isoformat()), options)


def verify_calendar(oracle):
    for value in (
        "0001-01-01", "0001-12-31", "0004-02-29", "0099-12-31", "0100-02-28", "0400-02-29",
        "1582-10-04", "1582-10-15", "1899-12-31", "1900-01-01", "1900-02-28", "1900-03-01",
        "1999-12-31", "2000-02-29", "2004-12-31", "2005-01-01", "2015-12-31", "2016-01-03",
        "2016-01-04", "2018-12-31", "2019-12-30", "2020-02-29", "2020-12-31", "2021-01-01",
        "2024-02-29", "2024-12-30", "2100-02-28", "2400-02-29", "9999-01-01", "9999-12-31",
    ):
        current = date.fromisoformat(value)
        iso_year, week, weekday = current.isocalendar()
        index = (current-date(current.year, 1, 1)).days + 1
        expected = result_text(weekday=weekday, day_of_year=index, iso_year=f"{iso_year:04d}", iso_week=week,
                               leap_year=calendar.isleap(current.year),
                               days_in_month=calendar.monthrange(current.year, current.month)[1])
        oracle.check("calendar", value, expected)


def business_reference_options(options):
    weekdays = {int(value) for value in options.get("weekdays", "1,2,3,4,5").split(",")}
    holiday_text = options.get("holidays", "")
    holidays = {date.fromisoformat(value) for value in holiday_text.split(",")} if holiday_text else set()
    return weekdays, holidays


def verify_business_days(oracle):
    listed = {"holidays": "2024-02-28,2024-02-26,2024-02-25,2024-02-28,2024-03-04"}
    sundays = {"weekdays": "7", "holidays": "2024-02-25"}
    all_days = {"weekdays": "7,6,5,4,3,2,1", "holidays": "2024-02-29,2024-03-01"}
    custom_order = {"weekdays": "6,2,4,2", "holidays": "2024-02-29,2024-03-02"}
    max_holidays = {"holidays": ",".join(f"2024-01-{day:02d}" for day in range(1, 24))}
    for begin, end, options in (
        ("2024-02-23", "2024-02-26", {}), ("2024-02-24", "2024-02-25", {}),
        ("2024-02-25", "2024-02-26", {}), ("2024-02-26", "2024-02-26", {}),
        ("2024-01-01", "2024-01-02", {}), ("2023-12-31", "2024-01-01", {}),
        ("2024-02-23", "2024-03-01", listed), ("2024-02-24", "2024-03-04", listed),
        ("2024-02-23", "2024-03-31", sundays), ("2024-02-28", "2024-03-06", all_days),
        ("2024-02-23", "2024-03-15", custom_order), ("2024-01-01", "2024-01-25", max_holidays),
        ("2024-01-01", "2024-03-01", {"holidays": "2023-12-31,2024-03-02"}),
        ("1970-01-01", "2025-01-01", {"weekdays": "2,4,6,7", "holidays": "2000-02-29"}),
        ("0001-01-01", "0001-02-01", {}), ("9999-12-14", "9999-12-31", {"weekdays": "3,4,5,6,7"}),
    ):
        weekdays, holidays = business_reference_options(options)
        endpoints = [(begin, end), (end, begin)] if begin != end else [(begin, end)]
        for start, last in endpoints:
            expected = business_count(date.fromisoformat(start), date.fromisoformat(last), weekdays, holidays)
            oracle.check("business_days", f"{start}|{last}", result_text(business_days=expected), options)


def verify_deadline(oracle):
    listed = {"holidays": "2024-02-26,2024-02-24,2024-02-29,2024-02-26"}
    max_holidays = {"holidays": ",".join(f"2024-01-{day:02d}" for day in range(1, 24))}
    for value, count, options in (
        ("2024-02-23", "1", {}), ("2024-02-24", "1", {}), ("2024-02-25", "1", {}),
        ("2024-02-26", "-1", {}), ("2024-02-24", "-1", {}), ("2024-02-25", "-1", {}),
        ("2024-01-01", "+1", {}), ("2023-12-29", "1", {}), ("2024-02-24", "0", {}),
        ("2024-02-25", "-0", listed), ("2024-02-23", "1", listed), ("2024-03-04", "-5", listed),
        ("2024-02-26", "7", {"weekdays": "7", "holidays": "2024-03-03,2024-03-10"}),
        ("2024-02-26", "-3", {"weekdays": "1,6,7", "holidays": "2024-02-24"}),
        ("2024-02-23", "70", {"weekdays": "7,6,5,4,3,2,1", "holidays": "2024-02-29"}),
        ("2024-02-23", "-70", {"weekdays": "7,6,5,4,3,2,1", "holidays": "2024-02-23"}),
        ("2023-12-31", "1", max_holidays), ("2024-01-26", "-3", max_holidays),
        ("2000-02-28", "1000", {"basis": "business"}), ("2000-02-28", "-1000", {"basis": "business"}),
        ("2024-02-29", "1", {"basis": "civil"}), ("2024-03-01", "-1", {"basis": "civil"}),
        ("2024-02-24", "+1", {"basis": "civil"}), ("1582-10-04", "1", {"basis": "civil"}),
        ("2024-03-30", "-0", {"basis": "civil"}), ("0001-01-02", "-1", {"basis": "civil"}),
        ("9999-12-30", "1", {"basis": "civil"}), ("0001-01-01", "1", {"weekdays": "2"}),
        ("9999-12-31", "-1", {"weekdays": "4"}),
    ):
        start = date.fromisoformat(value)
        if options.get("basis") == "civil":
            expected = start + timedelta(days=int(count))
        else:
            expected = business_deadline(start, int(count), *business_reference_options(options))
        oracle.check("deadline", value, result_text(date=expected.isoformat()), options | {"count": count})


def timezone_reference(value, source, target, policy):
    local, nanos = parse_wall_with_nanos(value)
    candidates = valid_instants(local, source)
    if not candidates:
        return "nonexistent_local_time", None
    if len(candidates) == 2:
        if policy == "reject":
            return "ambiguous_local_time", None
        instant = candidates[-1] if policy == "later" else candidates[0]
        resolution = policy
    else:
        instant = candidates[0]
        resolution = "unambiguous"
    source_local = instant.astimezone(zone_from_wheel(source))
    target_local = instant.astimezone(zone_from_wheel(target))
    expected = result_text(local=wall_text(target_local, nanos), utc=wall_text(instant, nanos)+"Z",
                           from_offset=offset_text(source_local), to_offset=offset_text(target_local),
                           from_dst=daylight_flag(source_local), to_dst=daylight_flag(target_local), resolution=resolution)
    return None, expected


def verify_timezones(oracle):
    for value, source, target, policies in (
        ("2024-02-29T23:59", "UTC", "Asia/Kathmandu", [None, "earlier", "later"]),
        ("2024-07-01T00:00:00.123456789", "Asia/Kathmandu", "America/Los_Angeles", [None]),
        ("2024-01-01T12:00:00.123400000", "America/St_Johns", "Pacific/Kiritimati", [None]),
        ("2024-10-25T00:00:00.100000000", "Pacific/Kiritimati", "Pacific/Honolulu", [None]),
        ("2024-02-29T00:00:00.000000000", "UTC", "Etc/UTC", [None]),
        ("2024-03-10T01:59:59.999999999", "America/New_York", "UTC", [None]),
        ("2024-03-10T02:00:00", "America/New_York", "UTC", [None, "earlier", "later"]),
        ("2024-03-10T02:59:59.999999999", "America/New_York", "Europe/Berlin", ["reject"]),
        ("2024-03-10T03:00:00", "America/New_York", "UTC", [None]),
        ("2024-11-03T00:59:59.999999999", "America/New_York", "UTC", [None]),
        ("2024-11-03T01:00:00", "America/New_York", "UTC", [None, "earlier", "later"]),
        ("2024-11-03T01:30:00", "America/New_York", "UTC", ["earlier", "later"]),
        ("2024-11-03T01:59:59.999999999", "America/New_York", "Pacific/Auckland", ["reject", "earlier", "later"]),
        ("2024-11-03T02:00:00", "America/New_York", "UTC", [None]),
        ("2024-11-03T05:30:00", "UTC", "America/New_York", [None]),
        ("2024-11-03T06:30:00", "UTC", "America/New_York", [None]),
        ("2024-03-31T02:30:00", "Europe/Berlin", "UTC", [None]),
        ("2024-10-27T02:30:00", "Europe/Berlin", "UTC", [None, "earlier", "later"]),
        ("2024-10-06T02:15:00", "Australia/Lord_Howe", "UTC", [None, "earlier", "later"]),
        ("2024-10-06T02:30:00", "Australia/Lord_Howe", "UTC", [None]),
        ("2024-04-07T01:45:00", "Australia/Lord_Howe", "Asia/Kathmandu", [None, "earlier", "later"]),
        ("2011-12-30T12:00:00", "Pacific/Apia", "UTC", [None, "earlier", "later"]),
        ("2011-12-31T00:00:00", "Pacific/Apia", "UTC", [None]),
        ("2018-11-04T00:15:00", "America/Sao_Paulo", "UTC", [None, "earlier", "later"]),
        ("2019-02-16T23:30:00", "America/Sao_Paulo", "UTC", [None, "earlier", "later"]),
        ("2024-11-03T00:15:00", "America/Sao_Paulo", "UTC", [None]),
        ("1965-03-31T12:00:00", "America/Sao_Paulo", "UTC", [None]),
        ("1965-03-31T23:30:00", "America/Sao_Paulo", "UTC", [None, "earlier", "later"]),
        ("1966-03-01T00:30:00", "America/Sao_Paulo", "UTC", [None, "earlier", "later"]),
        ("2026-11-15T12:00:00", "America/Havana", "UTC", [None]),
        ("2027-12-01T12:00:00", "America/Havana", "UTC", [None]),
        ("2024-01-01T12:00:00", "Europe/Dublin", "Europe/London", [None]),
        ("2024-07-01T12:00:00", "Europe/Dublin", "Europe/London", [None]),
        ("2024-01-01T12:00:00", "Europe/London", "Europe/Dublin", [None]),
        ("2024-07-01T12:00:00", "Europe/London", "Europe/Dublin", [None]),
        ("1890-02-11T12:00:00", "Europe/Paris", "Asia/Kathmandu", [None]),
        ("1900-01-01T00:00:01", "Asia/Kolkata", "America/Sao_Paulo", [None]),
        ("0001-01-01T12:00:00", "UTC", "Etc/UTC", [None]),
        ("9999-12-29T12:00:00", "Etc/UTC", "UTC", [None]),
        ("9999-12-30T22:00:00.999999999", "UTC", "UTC", [None]),
    ):
        for policy in policies:
            options = {"from": source, "to": target}
            if policy is not None:
                options["disambiguation"] = policy
            error, expected = timezone_reference(value, source, target, policy or "reject")
            if error is not None:
                oracle.reject("timezone", value, error, options, category="zone gaps and overlaps rejected")
            else:
                proof = oracle.check("timezone", value, expected, options)
                assert proof["variables"] == {"from": source, "to": target, "local": value,
                                              "disambiguation": policy or "reject", "tzdb_version": IANA_VERSION,
                                              "tzdb_format": "rearguard"}, proof
                assert f"Bundled IANA tzdb: {IANA_VERSION}" in proof["constraints"], proof
                assert "IANA rearguard daylight-saving flags" in proof["constraints"], proof


def verify_durations(oracle):
    for first, last in (
        ("1970-01-01T00:00:00Z", "1970-01-01T00:00:00.000000001Z"),
        ("1969-12-31T23:59:59.999999999Z", "1970-01-01T00:00:00Z"),
        ("1969-12-31T23:59:59.000000001Z", "1970-01-01T00:00:00.000000002Z"),
        ("2024-02-28T23:59:59.123456789Z", "2024-03-01T00:00:00.123456788Z"),
        ("2024-01-01T23:59:59.1-03:30", "2024-01-02T09:00:00.100000001+05:30"),
        ("2024-01-01T00:00:00Z", "2024-01-01T14:00:00+14:00"),
        ("2024-01-01T00:00:00+00:00", "2024-01-01T00:00:00.000000000Z"),
        ("2024-03-10T01:30:00-05:00", "2024-03-10T03:30:00-04:00"),
        ("2024-11-03T01:30:00-04:00", "2024-11-03T01:30:00-05:00"),
        ("2024-04-07T01:45:00+11:00", "2024-04-07T01:45:00+10:30"),
        ("2024-01-01T00:00:00-23:59", "2024-01-01T00:00:00+23:59"),
        ("2024-01-01T00:00:00-00:01", "2024-01-01T00:00:00+00:01"),
        ("0001-01-01T00:00:00.000000001Z", "9999-12-31T23:59:59.999999999Z"),
        ("1582-10-04T12:00:00Z", "1582-10-15T12:00:00Z"),
        ("2000-01-01T00:00:00.001Z", "2000-01-01T00:00:00.001Z"),
    ):
        endpoints = [(first, last), (last, first)] if first != last else [(first, last)]
        for begin, end in endpoints:
            duration = instant_to_nanos(end) - instant_to_nanos(begin)
            seconds, nanos = divmod(abs(duration), NANO)
            expected = result_text(seconds=f"{'-' if duration < 0 else ''}{seconds}.{nanos:09d}")
            oracle.check("duration", f"{begin}|{end}", expected)


def failures_and_replays(oracle):
    sample = "2024-02-29"
    for value in (
        "", "0000-01-01", "10000-01-01", "-001-01-01", "2024-00-01", "2024-13-01", "2024-01-00",
        "2024-04-31", "2023-02-29", "1900-02-29", "2100-02-29", "2024-2-29", "2024-02-9",
        "20240229", "2024-W09-4", "2024-060", "29/02/2024", "2024-02-29T00:00:00Z",
        "２０２４-０２-２９", "2024-02-29\u202e", "__import__('datetime').date.today()", "now()",
    ):
        oracle.reject("calendar", value, "invalid_input")
    for op in ("difference", "age", "business_days"):
        for value in (f"{sample}", f"{sample}|", f"|{sample}", f"{sample}|2024-03-01|2024-03-02"):
            oracle.reject(op, value, "invalid_input")
    for op in ("difference", "calendar", "age", "duration"):
        value = sample if op == "calendar" else f"{sample}|{sample}"
        oracle.reject(op, value, "invalid_input", {"week_start": 1})
    oracle.reject("today", sample, "unsupported")
    oracle.reject("calendar", sample+" "*4096, "limit")
    oracle.reject("calendar", sample, "limit", original="8"*4097)
    oracle.reject("calendar", sample, "invalid_input", original=sample+"\u200f")
    oracle.reject("calendar", "process.env.TZ", "invalid_input", original=sample)
    oracle.check("calendar", sample, "weekday=4; day_of_year=60; iso_year=2024; iso_week=9; leap_year=true; days_in_month=29",
                 original="٢٩/٠٢/٢٠٢٤ <em>literal</em>", category="untrusted display text")
    oracle.reject("age", "2024-02-29|2024-02-28", "domain")

    for value, options, code in (
        ("2023-01-31", {"months": "1", "overflow": "reject"}, "domain"),
        ("2024-03-31", {"months": "-1", "overflow": "reject"}, "domain"),
        ("2000-02-29", {"years": "100", "overflow": "reject"}, "domain"),
        ("9999-12-31", {"days": "1"}, "domain"), ("0001-01-01", {"weeks": "-1"}, "domain"),
        ("0001-02-28", {"months": "-2"}, "domain"), ("9999-11-30", {"months": "2"}, "domain"),
        (sample, {"years": 1}, "invalid_input"), (sample, {"days": "1.5"}, "invalid_input"),
        (sample, {"days": "1e1"}, "invalid_input"), (sample, {"months": "--1"}, "invalid_input"),
        (sample, {"weeks": ""}, "invalid_input"), (sample, {"weeks": "-"}, "invalid_input"),
        (sample, {"days": "4_000_001"}, "invalid_input"), (sample, {"overflow": "carry"}, "invalid_input"),
        (sample, {"days": "4000001"}, "limit"), (sample, {"months": "-4000001"}, "limit"),
        (sample, {"years": "99999999999999999999999999999999999"}, "limit"),
    ):
        oracle.reject("period", value, code, options)

    maximum_holidays = ",".join(f"2024-01-{day:02d}" for day in range(1, 24))
    for opts, code in (
        ({"weekdays": ""}, "invalid_input"), ({"weekdays": "0,1,2"}, "invalid_input"),
        ({"weekdays": "1,8"}, "invalid_input"), ({"weekdays": "Mon,Fri"}, "invalid_input"),
        ({"weekdays": "1,,5"}, "invalid_input"), ({"weekdays": "1,2,"}, "invalid_input"),
        ({"weekdays": 5}, "invalid_input"), ({"holidays": "2024-02-30"}, "invalid_input"),
        ({"holidays": "2024-02-29,2024-02-30"}, "invalid_input"),
        ({"holidays": "2024-02-29,"}, "invalid_input"), ({"holidays": maximum_holidays+","}, "limit"),
        ({"holidays": maximum_holidays+",2024-01-24"}, "invalid_input"),
        ({"holidays": ["2024-02-29"]}, "invalid_input"), ({"country": "BR"}, "invalid_input"),
    ):
        oracle.reject("business_days", "2024-02-23|2024-03-04", code, opts)
    oracle.check("business_days", "2024-02-23|2024-02-26", "business_days=1", {"holidays": ""})

    for value, options, code in (
        (sample, {}, "invalid_input"), (sample, {"count": 1}, "invalid_input"),
        (sample, {"count": "1/2"}, "invalid_input"), (sample, {"count": "1", "basis": "days"}, "invalid_input"),
        (sample, {"count": "1", "basis": "civil", "holidays": ""}, "invalid_input"),
        (sample, {"count": "1", "basis": "civil", "weekdays": "1"}, "invalid_input"),
        (sample, {"count": "4000001"}, "limit"),
        ("0001-01-01", {"count": "-1", "basis": "civil"}, "domain"),
        ("9999-12-31", {"count": "1", "basis": "civil"}, "domain"),
        ("0001-01-01", {"count": "-1"}, "domain"),
        ("9999-12-31", {"count": "1"}, "domain"),
        ("9999-12-27", {"count": "40"}, "domain"),
        ("0001-01-20", {"count": "-40", "weekdays": "2"}, "domain"),
    ):
        oracle.reject("deadline", value, code, options)

    zoned = {"from": "America/New_York", "to": "UTC"}
    for value in (
        sample, "2024-02-29t12:00:00", "2024-02-29 12:00:00", "2024-02-29T12",
        "2024-02-29T12:00.1", "2024-02-29T12:00:00.", "2024-02-29T12:00:00.1234567890",
        "2024-02-29T12:00:00,1", "2024-02-29T24:00", "2024-02-29T23:60", "2024-02-29T23:59:60",
        "2024-02-29T12:00:00Z", "2024-02-29T12:00:00-05:00", "2024-02-29T12:00:00[America/New_York]",
    ):
        oracle.reject("timezone", value, "invalid_input", zoned)
    for options in (
        {}, {"from": "America/New_York"}, {"to": "UTC"}, {"from": "utc", "to": "UTC"},
        zoned | {"to": "Mars/Olympus"}, zoned | {"to": "../Europe/Paris"}, zoned | {"to": "+03:30"},
        zoned | {"from": "/Europe/Paris"}, zoned | {"from": "Europe\\Paris"}, zoned | {"from": 1},
        zoned | {"disambiguation": "compatible"}, zoned | {"disambiguation": False},
        zoned | {"time_zone": "Europe/Paris"},
    ):
        oracle.reject("timezone", "2024-02-29T12:00:00", "invalid_input", options)
    for value, source, target in (
        ("9999-12-30T22:00:01", "UTC", "UTC"),
        ("0001-01-01T00:00:00", "Asia/Kathmandu", "UTC"),
        ("0001-01-01T00:00:00", "UTC", "America/New_York"),
    ):
        oracle.reject("timezone", value, "domain", {"from": source, "to": target})

    instant = "2024-02-29T12:00:00Z"
    for value in (
        sample, "2024-02-29T12:00:00", "2024-02-29T12:00Z", "2024-02-29t12:00:00Z",
        "2024-02-29T12:00:00z", "2024-02-29 12:00:00Z", "2024-02-29T24:00:00Z",
        "2016-12-31T23:59:60Z", "2024-02-29T12:00:00.0000000001Z", "2024-02-29T12:00:00.Z",
        "2024-02-29T12:00:00,1Z", "2024-02-29T12:00:00-00:00", "2024-02-29T12:00:00+2400",
        "2024-02-29T12:00:00+24:00", "2024-02-29T12:00:00+10:60", "2024-02-29T12:00:00+03:00:01",
        "2024-02-29T12:00:00+0300", "2024-02-29T12:00:00[UTC]", "2023-02-29T12:00:00Z",
    ):
        oracle.reject("duration", f"{value}|{instant}", "invalid_input")
    for value in (instant, f"{instant}|", f"{instant}|{instant}|{instant}"):
        oracle.reject("duration", value, "invalid_input")
    for value in ("0001-01-01T00:00:00+01:00", "9999-12-31T23:59:59.999999999-01:00"):
        oracle.reject("duration", f"{value}|{instant}", "domain")

    oracle.replay("difference", " 2024-03-05 | 2024-02-13 ")
    oracle.replay("age", " 2000-02-29 | 2023-02-28 ")
    oracle.replay("period", " 2024-01-31 ", {"months": "+1", "days": "-0"})
    oracle.replay("calendar", " 2018-12-31 ")
    oracle.replay("business_days", " 2024-03-01 | 2024-02-25 ", {"holidays": "2024-02-28,2024-02-26,2024-02-28"})
    oracle.replay("deadline", " 2024-02-24 ", {"count": "-3", "weekdays": "6,2,4,2"})
    oracle.replay("timezone", " 2024-11-03T01:30:00.012300000 ", zoned | {"disambiguation": "later"})
    oracle.replay("duration", " 2024-03-10T01:30:00.123456789-05:00 | 2024-03-10T03:30:00.1-04:00 ")


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-date-time.py RELEASE_CLI")
    assert (tzdata.__version__, tzdata.IANA_VERSION) == (TZDATA_VERSION, IANA_VERSION), (tzdata.__version__, tzdata.IANA_VERSION)
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    verify_difference(oracle)
    verify_age(oracle)
    verify_period(oracle)
    verify_calendar(oracle)
    verify_business_days(oracle)
    verify_deadline(oracle)
    verify_timezones(oracle)
    verify_durations(oracle)
    failures_and_replays(oracle)
    print(json.dumps({"suite": "date-time-datetime-calendar-zoneinfo", "passed": sum(oracle.checks.values()), "failed": 0,
                      "tzdata": TZDATA_VERSION, "iana_tzdb": IANA_VERSION, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
