"""Independent Fraction, Decimal and SymPy references for the Converter CLI.

SI definitions come from the BIPM SI Brochure. The customary factors use
the NIST Guide to the SI, and the information unit factors follow the NIST
binary-prefix reference. Currency rates here are synthetic manual fixtures.

https://www.bipm.org/en/publications/si-brochure
https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors
https://www.nist.gov/pml/special-publication-811/nist-guide-si-footnotes
https://pml.nist.gov/cuu/Units/binary.html
"""

import ast
from collections import Counter
from datetime import date
from decimal import Decimal, ROUND_HALF_EVEN, localcontext
from fractions import Fraction
import json
from pathlib import Path
import re
import subprocess
import sys

import sympy as sp


F = Fraction
NUMBER = r"(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"

# Derive compound customary units from the international inch, pound and g0.
INCH = F("0.0254")
FOOT = 12 * INCH
YARD = 3 * FOOT
MILE = 5280 * FOOT
POUND = F("0.45359237")
GRAVITY = F("9.80665")
POUND_FORCE = POUND * GRAVITY
US_GALLON = 231 * INCH**3
IMPERIAL_GALLON = F("0.00454609")
HOUR = 60**2
DAY = 24 * HOUR
SCALES = {
    "m": {"nm": F(1, 10**9), "um": F(1, 10**6), "mm": F(1, 1000), "cm": F(1, 100), "m": 1,
          "km": 1000, "in": INCH, "ft": FOOT, "yd": YARD, "mi": MILE, "nmi": 1852},
    "m^2": {"mm^2": F(1, 1000)**2, "cm^2": F(1, 100)**2, "m^2": 1, "km^2": 1000**2,
            "in^2": INCH**2, "ft^2": FOOT**2, "yd^2": YARD**2, "mi^2": MILE**2,
            "ha": 100**2, "acre": 43_560 * FOOT**2},
    "m^3": {"mL": F(1, 10**6), "cL": F(1, 10**5), "dL": F(1, 10**4), "L": F(1, 1000),
            "cm^3": F("0.01")**3, "m^3": 1, "in^3": INCH**3, "ft^3": FOOT**3,
            "gal_us": US_GALLON, "gal_imp": IMPERIAL_GALLON, "qt_us": US_GALLON/4,
            "pt_us": US_GALLON/8, "fl_oz_us": US_GALLON/128},
    "kg": {"mg": F(1, 10**6), "g": F(1, 1000), "kg": 1, "t": 1000, "oz": POUND/16,
           "lb": POUND, "st": 14*POUND},
    "s": {"ns": F(1, 10**9), "us": F(1, 10**6), "ms": F(1, 1000), "s": 1, "min": 60,
          "h": HOUR, "d": DAY, "wk": 7*DAY},
    "m/s": {"m/s": 1, "km/h": F(1000, HOUR), "cm/s": F(1, 100), "ft/s": FOOT,
            "mph": MILE/HOUR, "kn": F(1852, HOUR)},
    "m/s^2": {"m/s^2": 1, "cm/s^2": F(1, 100), "ft/s^2": FOOT, "g0": GRAVITY},
    "Pa": {"Pa": 1, "kPa": 1000, "MPa": 10**6, "bar": 10**5, "mbar": 100, "atm": 101325,
           "psi": POUND_FORCE / INCH**2, "Torr": F(101325, 760)},
    "J": {"J": 1, "kJ": 1000, "MJ": 10**6, "Wh": HOUR, "kWh": 1000*HOUR,
          "cal_th": F("4.184"), "kcal_th": 1000*F("4.184"), "eV": F("1.602176634e-19"),
          "BTU_IT": F("4.1868")*POUND*1000*F(5, 9)},
    "W": {"W": 1, "kW": 1000, "MW": 10**6, "hp_mech": 550*FOOT*POUND_FORCE,
          "hp_metric": 75*GRAVITY},
    "N": {"N": 1, "kN": 1000, "MN": 10**6, "dyn": F(1, 10**5), "kgf": GRAVITY, "lbf": POUND_FORCE},
}
STORAGE = {"bit": 1, "B": 8}
for exponent, decimal, binary in ((1, "k", "Ki"), (2, "M", "Mi"), (3, "G", "Gi"), (4, "T", "Ti")):
    for unit, bits in (("bit", 1), ("B", 8)):
        STORAGE[decimal+unit] = bits * 1000**exponent
        STORAGE[binary+unit] = bits * 1024**exponent
SCALES["bit"] = STORAGE
SCALES["bit/s"] = {name+"/s": scale for name, scale in STORAGE.items()}

TEMP = {"K": (F(1), F(0)), "degC": (F(1), F("273.15")),
        "degF": (F(5, 9), F("273.15")-32*F(5, 9)), "degR": (F(5, 9), F(0))}
TURNS = {"turn": sp.S.One, "rad": 1/(2*sp.pi), "deg": sp.Rational(1, 360),
         "grad": sp.Rational(1, 400), "arcmin": sp.Rational(1, 360*60),
         "arcsec": sp.Rational(1, 360*3600)}
FUEL_EFFICIENCY = {"km/L": F(1), "mpg_us": MILE/(10**6*US_GALLON),
                   "mpg_imp": MILE/(10**6*IMPERIAL_GALLON)}
FUEL_CONSUMPTION = {"L/km": F(1), "L/100km": F(1, 100)}
MMHG_NOMINAL_PA = F("133.3224")


def read_math(text):
    """Decode only rational arithmetic and pi, without evaluating emitted code."""
    source = text.strip().replace("π", "pi").replace("−", "-").replace("^", "**")
    assert len(source) <= 32768, text[:80]
    tree = ast.parse(source, mode="eval")
    assert sum(1 for _ in ast.walk(tree)) <= 256, text[:80]

    def read(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            literal = ast.get_source_segment(source, node)
            assert literal and re.fullmatch(NUMBER, literal), literal
            exponent = re.search(r"e([+-]?\d+)$", literal, re.I)
            assert not exponent or abs(int(exponent[1])) <= 4096, literal
            return sp.Rational(literal)
        if isinstance(node, ast.Name) and node.id == "pi":
            return sp.pi
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = read(node.operand)
            return -value if isinstance(node.op, ast.USub) else value
        if isinstance(node, ast.BinOp):
            a, b = read(node.left), read(node.right)
            if isinstance(node.op, ast.Mult):
                return a * b
            if isinstance(node.op, ast.Div):
                assert b != 0, text
                return a / b
        raise AssertionError(f"Unexpected converter notation: {text!r}")

    return read(tree.body)


def equivalent(actual, expected):
    if isinstance(expected, Fraction):
        expected = sp.Rational(expected.numerator, expected.denominator)
    difference = sp.simplify(actual - expected)
    assert difference == 0, (actual, expected, difference)


def rounded_significant(value, digits):
    with localcontext() as context:
        context.prec = 180
        expanded = Decimal(value.numerator) / Decimal(value.denominator)
        context.prec = digits
        context.rounding = ROUND_HALF_EVEN
        return F(+expanded)


def from_sympy(value):
    assert isinstance(value, sp.Rational), value
    return F(int(value.p), int(value.q))


def temperature_reference(value, source, destination):
    magnitude, zero = TEMP[source]
    dest_magnitude, dest_zero = TEMP[destination]
    return (F(str(value))*magnitude + zero - dest_zero) / dest_magnitude


def fuel_reference(value, source, destination):
    units = FUEL_EFFICIENCY | FUEL_CONSUMPTION
    scaled = F(str(value)) * units[source]
    if (source in FUEL_EFFICIENCY) == (destination in FUEL_EFFICIENCY):
        return scaled / units[destination]
    return 1 / (scaled*units[destination])


class Oracle:
    def __init__(self, executable):
        self.executable = executable
        self.checks = Counter()

    def invoke(self, payload):
        process = subprocess.run([self.executable, "tool", payload], capture_output=True,
                                 encoding="utf-8", timeout=12)
        assert process.stdout.strip(), (payload, process.returncode, process.stderr)
        response = json.loads(process.stdout)
        assert process.returncode == (0 if response["ok"] else 1), (payload, response, process.stderr)
        return response

    def request(self, operation, value, options, *, original=None):
        request = {"schema": 1, "module": "converter", "operation": operation, "input": value,
                   "options": options}
        if original is not None:
            request["original_input"] = original
        return self.invoke(json.dumps(request, ensure_ascii=False))

    def record(self, operation, value, options, *, original=None):
        response = self.request(operation, value, options, original=original)
        assert response["ok"], (operation, value[:100], options, response)
        proof = response["proof"]
        assert (proof["schema"], proof["module"], proof["operation"]) == (1, "converter", operation), proof
        assert proof["expression"] == (value if original is None else original), proof
        assert proof["options"] == options and proof["algorithm_version"].startswith("converter/"), proof
        assert all(proof[field] for field in ("result", "normalized", "method", "formula", "domain", "references")), proof
        assert set(proof["units"]) == {"from", "to"}, proof
        return proof

    def quantity(self, value, source, destination, expected, *, original=None, approximate=False, canonical=None):
        proof = self.record("convert", str(value), {"from": source, "to": destination}, original=original)
        canonical_from, canonical_to = canonical or (source, destination)
        assert proof["units"] == {"from": canonical_from, "to": canonical_to}, proof
        result = read_math(proof["result"])
        if approximate:
            assert proof["exactness"] == "approximate" and proof["precision"] == 7, proof
            assert proof["tolerance"] is None and proof["error_bound"] is None, proof
            assert proof["rounding"] == "nearest, ties to even", proof
            assert "Nominal result rounded to seven significant digits, ties to even" in proof["constraints"], proof
            observed_expected = rounded_significant(F(expected), 7)
        else:
            exactness = "symbolic" if isinstance(expected, sp.Expr) and not expected.is_Rational else "exact"
            assert proof["exactness"] == exactness, proof
            assert all(proof[field] is None for field in ("precision", "rounding", "error_bound", "tolerance")), proof
            observed_expected = expected
        equivalent(result, observed_expected)
        if original is not None:
            self.checks["untrusted display text"] += 1
        else:
            self.checks["approximate " + proof["domain"] if approximate else proof["domain"]] += 1
        return result

    def currency(self, amount, options):
        proof = self.record("currency", str(amount), options)
        as_of = date.fromisoformat(options["as_of"])
        reference = date.fromisoformat(options["reference_date"])
        expires = date.fromisoformat(options["valid_until"]) if "valid_until" in options else None
        if reference < as_of:
            status = "not_yet_valid"
        elif expires is None:
            status = "unverified_validity"
        elif reference > expires:
            status = "expired"
        else:
            status = "within_validity"
        condition = {"not_yet_valid": "Quote starts after the selected reference date",
                     "unverified_validity": "Quote validity date was not supplied",
                     "expired": "Quote expired at the selected reference date",
                     "within_validity": "Quote within stated validity at the selected reference date"}[status]
        assert condition in proof["constraints"], proof
        lhs, rhs = proof["result"].split("; ")
        assert lhs.startswith("amount=") and rhs == "status=" + status, (proof, status)
        equivalent(read_math(lhs.removeprefix("amount=")), F(str(amount)) * F(options["rate"]))
        assert proof["exactness"] == "exact" and proof["domain"] == "currency", proof
        assert all(proof[field] is None for field in ("precision", "rounding", "error_bound", "tolerance")), proof
        assert F(proof["variables"]["rate"]) == F(options["rate"]), proof
        assert proof["units"] == {name: options[name] for name in ("from", "to")}, proof
        assert proof["variables"]["source"] == options["source"].strip(), proof
        for name in ("as_of", "valid_until", "reference_date"):
            assert proof["variables"].get(name) == options.get(name), proof
        self.checks["currency " + status] += 1
        return read_math(lhs.removeprefix("amount="))

    def replay(self, operation, value, options):
        first = self.record(operation, value, options)
        replayed = self.record(operation, first["normalized"], options, original=value)
        assert replayed == first, (first, replayed)
        self.checks["normalized replay"] += 1

    def reject(self, operation, value, options, code, *, original=None):
        response = self.request(operation, value, options, original=original)
        assert response == {"ok": False, "code": code}, (operation, value[:100], options, code, response)
        self.checks["rejected"] += 1


def linear_conversions(oracle):
    sample = F(7, 11)
    for anchor, family in SCALES.items():
        for unit, factor in family.items():
            oracle.quantity(sample, unit, anchor, sample * factor)
        # Two engine calls check reciprocity while the Fraction reference fixes both expected values.
        side = next(name for name, scale in family.items() if scale != 1)
        forward = oracle.quantity("-1.25", anchor, side, F(-5, 4) / family[side])
        reverse = oracle.quantity(from_sympy(forward), side, anchor, F(-5, 4))
        equivalent(reverse, F(-5, 4))

    for value, source, destination, expected in [
        ("-2.5e-20", "km", "m", F("-2.5e-17")),
        ("9007199254740993", "m", "cm", F(900719925474099300)),
        ("+0", "kWh", "J", F(0)), (".25", "yd", "in", F(9)),
        ("  5/7  ", "L", "mL", F(5000, 7)), ("1", "MB", "MiB", F(10**6, 2**20)),
        ("1", "MiB/s", "Mbit/s", F(8*2**20, 10**6)),
        ("1", "kbit/s", "KiB/s", F(1000, 8*1024)),
        ("12", "in", "ft", F(1)), ("128", "fl_oz_us", "gal_us", F(1)),
        ("10000", "cm^2", "m^2", F(1)), ("1000000", "cm^3", "m^3", F(1)),
    ]:
        oracle.quantity(value, source, destination, expected)

    for value, source, destination, expected, canonical in [
        ("1", "μm", "mm", F(1, 1000), ("um", "mm")),
        ("1", "m²", "cm2", F(10000), ("m^2", "cm^2")),
        ("1", "m³", "L", F(1000), ("m^3", "L")),
        ("1", "KB", "b", F(8000), ("kB", "bit")),
        ("1", "Mbps", "B/s", F(125000), ("Mbit/s", "B/s")),
        ("1", "m/s²", "cm/s²", F(100), ("m/s^2", "cm/s^2")),
        ("0", "°C", "K", F("273.15"), ("degC", "K")),
        ("18", "Δ°F", "ΔK", F(10), ("delta_degF", "delta_K")),
        ("180", "°", "rad", sp.pi, ("deg", "rad")),
        ("5", "L/100 km", "km/L", F(20), ("L/100km", "km/L")),
        ("1", "μs", "ns", F(1000), ("us", "ns")),
        ("1e12", "mm²", "km2", F(1), ("mm^2", "km^2")),
        ("144", "in²", "ft2", F(1), ("in^2", "ft^2")),
        (str(1760**2), "yd²", "mi2", F(1), ("yd^2", "mi^2")),
        ("16.387064", "cm³", "in3", F(1), ("cm^3", "in^3")),
        ("1", "ft³", "L", F("0.3048")**3 * 1000, ("ft^3", "L")),
        ("32", "F", "°R", F("491.67"), ("degF", "degR")),
        ("18", "Δ°R", "ΔK", F(10), ("delta_degR", "delta_K")),
        ("1", "ft/s²", "m/s²", F("0.3048"), ("ft/s^2", "m/s^2")),
        ("1", "mi/h", "m/s", F("1609.344")/3600, ("mph", "m/s")),
        ("1", "kbps", "bps", F(1000), ("kbit/s", "bit/s")),
        ("1", "Tbps", "Gbps", F(1000), ("Tbit/s", "Gbit/s")),
    ]:
        oracle.quantity(value, source, destination, expected, canonical=canonical)


def temperature_and_angle(oracle):
    for value, source, destination in [
        ("0", "K", "degC"), ("0", "K", "degF"), ("0", "degR", "K"),
        ("-273.15", "degC", "K"), ("-459.67", "degF", "degR"),
        ("-273.149999999999999999999999", "degC", "K"),
        ("-459.669999999999999999999999", "degF", "K"),
        ("0", "degC", "degF"), ("100", "degC", "degF"), ("-40", "degF", "degC"),
        ("152/9", "degR", "degC"), ("3/7", "K", "degR"),
        ("5.5", "degC", "degC"), ("-0.1", "degF", "degF"),
    ]:
        expected = temperature_reference(value, source, destination)
        observed = oracle.quantity(value, source, destination, expected)
        if (source, destination) in (("degC", "degF"), ("degR", "degC"), ("degF", "K")):
            oracle.quantity(from_sympy(observed), destination, source, F(str(value)))

    for source, destination in [("K", "degC"), ("degC", "degF"), ("degF", "K"), ("degR", "degC"),
                                ("degF", "degR"), ("degR", "degR")]:
        value = F(-73, 11)
        src, dst = "delta_"+source, "delta_"+destination
        expected = value * TEMP[source][0] / TEMP[destination][0]
        oracle.quantity(value, src, dst, expected)
    affine_span = (temperature_reference(-95, "degC", "degF") - temperature_reference(13, "degC", "degF"))
    assert affine_span < 0
    oracle.quantity("-108", "delta_degC", "delta_degF", affine_span)

    for value, source, destination in [
        ("180", "deg", "rad"), ("-90", "deg", "rad"), ("1", "rad", "deg"),
        ("7/5", "rad", "turn"), ("0", "rad", "deg"), ("1/4", "turn", "rad"),
        ("1", "turn", "grad"), ("100", "grad", "deg"), ("1", "deg", "arcsec"),
        ("1", "arcmin", "deg"), ("15", "arcsec", "arcmin"), ("1", "rad", "rad"),
    ]:
        expected = sp.Rational(value) * TURNS[source] / TURNS[destination]
        oracle.quantity(value, source, destination, expected)


def fuel_and_pressure(oracle):
    for value, source, destination in [
        ("30", "mpg_us", "L/100km"), ("30", "mpg_imp", "L/100km"),
        ("5", "L/100km", "mpg_us"), ("12", "km/L", "L/km"), ("0.04", "L/km", "mpg_imp"),
        ("7/13", "mpg_us", "mpg_imp"), ("1", "mpg_imp", "km/L"),
        ("0", "mpg_us", "mpg_imp"), ("0", "L/100km", "L/km"),
        ("0", "mpg_us", "mpg_us"), ("1e-30", "km/L", "L/100km"),
    ]:
        first = oracle.quantity(value, source, destination, fuel_reference(value, source, destination))
        if value == "30" or (source, destination) in (("km/L", "L/km"), ("L/km", "mpg_imp")):
            reverse = oracle.quantity(from_sympy(first), destination, source, F(str(value)))
            equivalent(reverse, F(str(value)))
    for value, source, destination, expected in [
        ("1", "mmHg", "Pa", MMHG_NOMINAL_PA), ("760", "mmHg", "Pa", 760*MMHG_NOMINAL_PA),
        ("760", "mmHg", "Torr", 760*MMHG_NOMINAL_PA/F(101325, 760)),
        ("101325", "Pa", "mmHg", 101325/MMHG_NOMINAL_PA),
        ("-9.7", "mmHg", "bar", F("-9.7")*MMHG_NOMINAL_PA/10**5),
        ("1e-80", "mmHg", "Pa", F("1e-80")*MMHG_NOMINAL_PA),
        ("1e50", "mmHg", "Pa", F("1e50")*MMHG_NOMINAL_PA),
    ]:
        oracle.quantity(value, source, destination, expected, approximate=True)
    # Generate halfway values before rounding, exactly and without binary floats.
    for exact_pa in map(F, ("1.0000005", "1.0000015", "-1.0000005", "9.9999995")):
        oracle.quantity(exact_pa/MMHG_NOMINAL_PA, "mmHg", "Pa", exact_pa, approximate=True)
    oracle.quantity("0", "mmHg", "Pa", F(0))
    oracle.quantity("0", "Pa", "mmHg", F(0))
    oracle.quantity("-7/11", "mmHg", "mmHg", F(-7, 11))


def currency_cases(oracle):
    manual = {"from": "USD", "to": "BRL", "rate": "21/4", "source": "Synthetic manual quote",
              "as_of": "2024-02-29", "valid_until": "2024-03-03", "reference_date": "2024-03-01"}
    for reference in ("2024-02-28", "2024-02-29", "2024-03-01", "2024-03-03", "2024-03-04"):
        oracle.currency("-17.5", manual | {"reference_date": reference})
    no_end = {key: value for key, value in manual.items() if key != "valid_until"}
    oracle.currency("1/3", no_end)
    oracle.currency("0", no_end | {"reference_date": "2024-02-28"})
    oracle.currency("9007199254740993", manual | {"rate": "0.0125", "from": "JPY", "to": "EUR"})
    oracle.currency("17/13", manual | {"rate": "1.00", "from": "BRL", "to": "BRL"})
    oracle.currency("100", manual | {"source": "é"*40, "rate": "1.005e-2"})
    oracle.currency("10", manual | {"source": "  Synthetic printed rate  "})
    for boundary in ("0001-01-01", "2000-02-29", "9999-12-31"):
        oracle.currency("1", manual | {name: boundary for name in ("as_of", "valid_until", "reference_date")})
    reverse = manual | {"from": manual["to"], "to": manual["from"], "rate": "4/21"}
    converted = oracle.currency("53/11", manual)
    equivalent(oracle.currency(from_sympy(converted), reverse), F(53, 11))
    return manual


def failures_and_replays(oracle, manual):
    length = {"from": "m", "to": "cm"}
    for source, destination in (("m", "m^2"), ("N", "J"), ("km/L", "m/s"), ("degC", "delta_degC"),
                                ("delta_degR", "degR"), ("MiB", "MiB/s"), ("L", "kg"), ("rad", "bit")):
        oracle.reject("convert", "0", {"from": source, "to": destination}, "domain")
    for value, source, destination in [
        ("-1e-50", "K", "K"), ("-1e-50", "degR", "K"),
        ("-273.150000000000000000000001", "degC", "K"),
        ("-459.670000000000000000000001", "degF", "degF"),
        ("-1", "mpg_us", "mpg_imp"), ("-1", "L/km", "L/km"),
        ("0", "L/100km", "mpg_us"), ("0", "mpg_us", "L/100km"),
    ]:
        oracle.reject("convert", value, {"from": source, "to": destination}, "domain")
    for options in ({}, {"from": "m"}, {"from": "m", "to": 100}, {"from": "meter", "to": "m"},
                    {"from": "USD", "to": "BRL"}, {"from": "kbyte", "to": "B"},
                    {"from": "MiB", "to": "mb"}, length | {"precision": 10}):
        oracle.reject("convert", "1", options, "invalid_input")
    for value, code in [
        ("", "invalid_input"), ("x+1", "invalid_input"), ("1,25", "invalid_input"),
        ("1/0", "domain"), ("1/2/3", "invalid_input"), ("1 2", "invalid_input"),
        (".", "invalid_input"), ("1e2567", "limit"), ("1e-257", "limit"),
        ("9"*129, "limit"), ("1"+" "*4096, "limit"), ("1\u202e", "invalid_input"),
        ("__import__('os')", "invalid_input"), ("globalThis.Math.PI", "invalid_input"),
    ]:
        oracle.reject("convert", value, length, code)
    oracle.reject("unit_formula", "1", length, "unsupported")

    for changes, code in [
        ({"from": "usd"}, "invalid_input"), ({"to": "ZZZ"}, "invalid_input"),
        ({"as_of": "2023-02-29"}, "invalid_input"), ({"as_of": "1900-02-29"}, "invalid_input"),
        ({"as_of": "2100-02-29"}, "invalid_input"), ({"as_of": "0000-01-01"}, "invalid_input"),
        ({"valid_until": "10000-01-01"}, "invalid_input"), ({"reference_date": "2024-3-01"}, "invalid_input"),
        ({"reference_date": "2024-W09-5"}, "invalid_input"),
        ({"reference_date": "2024-03-01T00:00:00Z"}, "invalid_input"),
        ({"valid_until": "2024-02-28"}, "domain"),
        ({"rate": "0"}, "domain"), ({"rate": "-0.001"}, "domain"),
        ({"rate": "1/0"}, "domain"), ({"rate": 5}, "invalid_input"),
        ({"source": ""}, "invalid_input"), ({"source": "\u202eManual"}, "invalid_input"),
        ({"source": "é"*41}, "invalid_input"), ({"to": "USD"}, "domain"),
        ({"precision": 7}, "invalid_input"),
    ]:
        oracle.reject("currency", "1", manual | changes, code)
    for field in ("from", "to", "rate", "source", "as_of", "reference_date"):
        missing = {key: value for key, value in manual.items() if key != field}
        oracle.reject("currency", "1", missing, "invalid_input")
    oracle.reject("convert", "1", length, "invalid_input", original="1\u202e")
    oracle.reject("convert", "1", length, "limit", original="9"*4097)
    oracle.reject("convert", "globalThis.Math.PI", length, "invalid_input", original="1")
    oracle.quantity("0.5", "m", "cm", F(50), original="٠٫٥ <script>display text</script>")

    oracle.replay("convert", " 1.25 ", {"from": "in", "to": "cm"})
    oracle.replay("convert", " -273.1499999999999999 ", {"from": "degC", "to": "K"})
    oracle.replay("convert", " 7/11 ", {"from": "mmHg", "to": "Pa"})
    oracle.replay("convert", " +90 ", {"from": "deg", "to": "rad"})
    oracle.replay("convert", " 33 ", {"from": "mpg_imp", "to": "L/100km"})
    oracle.replay("convert", " 1 ", {"from": "MiB/s", "to": "Mbit/s"})
    oracle.replay("currency", " -2.50 ", manual | {"reference_date": "2024-03-05"})
    oracle.replay("currency", " 1/3 ", manual)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: verify-converter.py RELEASE_CLI")
    oracle = Oracle(Path(sys.argv[1]).resolve(strict=True))
    linear_conversions(oracle)
    temperature_and_angle(oracle)
    fuel_and_pressure(oracle)
    manual = currency_cases(oracle)
    failures_and_replays(oracle, manual)
    print(json.dumps({"suite": "converter-fraction-decimal-sympy", "passed": sum(oracle.checks.values()), "failed": 0,
                      "sympy": sp.__version__, "cases": dict(sorted(oracle.checks.items()))}))


if __name__ == "__main__":
    main()
