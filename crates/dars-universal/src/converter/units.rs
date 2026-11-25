use num_bigint::BigInt;
use num_rational::BigRational;

#[derive(Clone, Copy)]
pub(super) struct Ratio(i128, i128);

impl Ratio {
    const ONE: Self = Self(1, 1);

    const fn times(self, other: Self) -> Self {
        Self(self.0 * other.0, self.1 * other.1)
    }

    const fn over(self, other: Self) -> Self {
        Self(self.0 * other.1, self.1 * other.0)
    }

    const fn power(self, exponent: u32) -> Self {
        Self(self.0.pow(exponent), self.1.pow(exponent))
    }

    pub(super) fn rational(self) -> BigRational {
        BigRational::new(BigInt::from(self.0), BigInt::from(self.1))
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum Family {
    Length,
    Area,
    Volume,
    Mass,
    Time,
    AbsoluteTemperature,
    TemperatureDifference,
    Speed,
    Acceleration,
    Pressure,
    Energy,
    Power,
    Force,
    Angle,
    DigitalStorage,
    TransferRate,
    Fuel,
}

impl Family {
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Length => "length",
            Self::Area => "area",
            Self::Volume => "volume",
            Self::Mass => "mass",
            Self::Time => "time",
            Self::AbsoluteTemperature => "absolute_temperature",
            Self::TemperatureDifference => "temperature_difference",
            Self::Speed => "speed",
            Self::Acceleration => "acceleration",
            Self::Pressure => "pressure",
            Self::Energy => "energy",
            Self::Power => "power",
            Self::Force => "force",
            Self::Angle => "angle",
            Self::DigitalStorage => "digital_storage",
            Self::TransferRate => "transfer_rate",
            Self::Fuel => "fuel",
        }
    }
}

#[derive(Clone, Copy)]
pub(super) enum Model {
    Linear(Ratio),
    Approximate(Ratio),
    Affine { scale: Ratio, offset: Ratio },
    Angle { scale: Ratio, pi: i8 },
    Fuel { scale: Ratio, consumption: bool },
}

#[derive(Clone, Copy)]
struct Entry {
    code: &'static str,
    family: Family,
    model: Model,
}

impl Entry {
    const fn linear(code: &'static str, family: Family, scale: Ratio) -> Self {
        Self {
            code,
            family,
            model: Model::Linear(scale),
        }
    }

    const fn affine(code: &'static str, scale: Ratio, offset: Ratio) -> Self {
        Self {
            code,
            family: Family::AbsoluteTemperature,
            model: Model::Affine { scale, offset },
        }
    }

    const fn angle(code: &'static str, scale: Ratio, pi: i8) -> Self {
        Self {
            code,
            family: Family::Angle,
            model: Model::Angle { scale, pi },
        }
    }

    const fn fuel(code: &'static str, scale: Ratio, consumption: bool) -> Self {
        Self {
            code,
            family: Family::Fuel,
            model: Model::Fuel { scale, consumption },
        }
    }
}

pub(super) struct Unit {
    pub(super) code: String,
    pub(super) family: Family,
    pub(super) model: Model,
}

impl From<Entry> for Unit {
    fn from(entry: Entry) -> Self {
        Self {
            code: entry.code.to_owned(),
            family: entry.family,
            model: entry.model,
        }
    }
}

use Family::*;
const ONE: Ratio = Ratio::ONE;
const ZERO: Ratio = Ratio(0, 1);
const MM: Ratio = Ratio(1, 1000);
const CM: Ratio = Ratio(1, 100);
const KM: Ratio = Ratio(1000, 1);
const INCH: Ratio = Ratio(254, 10_000);
const FOOT: Ratio = INCH.times(Ratio(12, 1));
const YARD: Ratio = FOOT.times(Ratio(3, 1));
const MILE: Ratio = FOOT.times(Ratio(5280, 1));
const NAUTICAL_MILE: Ratio = Ratio(1852, 1);
const GALLON_US: Ratio = INCH.power(3).times(Ratio(231, 1));
const GALLON_IMPERIAL: Ratio = Ratio(454_609, 100_000_000);
const POUND: Ratio = Ratio(45_359_237, 100_000_000);
const STANDARD_GRAVITY: Ratio = Ratio(196_133, 20_000);
const POUND_FORCE: Ratio = POUND.times(STANDARD_GRAVITY);
const HOUR: Ratio = Ratio(3600, 1);
const FAHRENHEIT_STEP: Ratio = Ratio(5, 9);
const FUEL_SCALE: Ratio = Ratio(1, 1_000_000);

const PHYSICAL: &[Entry] = &[
    Entry::linear("nm", Length, Ratio(1, 1_000_000_000)),
    Entry::linear("um", Length, Ratio(1, 1_000_000)),
    Entry::linear("mm", Length, MM),
    Entry::linear("cm", Length, CM),
    Entry::linear("m", Length, ONE),
    Entry::linear("km", Length, KM),
    Entry::linear("in", Length, INCH),
    Entry::linear("ft", Length, FOOT),
    Entry::linear("yd", Length, YARD),
    Entry::linear("mi", Length, MILE),
    Entry::linear("nmi", Length, NAUTICAL_MILE),
    Entry::linear("mm^2", Area, MM.power(2)),
    Entry::linear("cm^2", Area, CM.power(2)),
    Entry::linear("m^2", Area, ONE),
    Entry::linear("km^2", Area, KM.power(2)),
    Entry::linear("in^2", Area, INCH.power(2)),
    Entry::linear("ft^2", Area, FOOT.power(2)),
    Entry::linear("yd^2", Area, YARD.power(2)),
    Entry::linear("mi^2", Area, MILE.power(2)),
    Entry::linear("ha", Area, Ratio(10_000, 1)),
    Entry::linear("acre", Area, FOOT.power(2).times(Ratio(43_560, 1))),
    Entry::linear("mL", Volume, Ratio(1, 1_000_000)),
    Entry::linear("cL", Volume, Ratio(1, 100_000)),
    Entry::linear("dL", Volume, Ratio(1, 10_000)),
    Entry::linear("L", Volume, Ratio(1, 1000)),
    Entry::linear("cm^3", Volume, CM.power(3)),
    Entry::linear("m^3", Volume, ONE),
    Entry::linear("in^3", Volume, INCH.power(3)),
    Entry::linear("ft^3", Volume, FOOT.power(3)),
    Entry::linear("gal_us", Volume, GALLON_US),
    Entry::linear("gal_imp", Volume, GALLON_IMPERIAL),
    Entry::linear("qt_us", Volume, GALLON_US.over(Ratio(4, 1))),
    Entry::linear("pt_us", Volume, GALLON_US.over(Ratio(8, 1))),
    Entry::linear("fl_oz_us", Volume, GALLON_US.over(Ratio(128, 1))),
    Entry::linear("mg", Mass, Ratio(1, 1_000_000)),
    Entry::linear("g", Mass, Ratio(1, 1000)),
    Entry::linear("kg", Mass, ONE),
    Entry::linear("t", Mass, Ratio(1000, 1)),
    Entry::linear("oz", Mass, POUND.over(Ratio(16, 1))),
    Entry::linear("lb", Mass, POUND),
    Entry::linear("st", Mass, POUND.times(Ratio(14, 1))),
    Entry::linear("ns", Time, Ratio(1, 1_000_000_000)),
    Entry::linear("us", Time, Ratio(1, 1_000_000)),
    Entry::linear("ms", Time, Ratio(1, 1000)),
    Entry::linear("s", Time, ONE),
    Entry::linear("min", Time, Ratio(60, 1)),
    Entry::linear("h", Time, HOUR),
    Entry::linear("d", Time, Ratio(86_400, 1)),
    Entry::linear("wk", Time, Ratio(604_800, 1)),
    Entry::affine("K", ONE, ZERO),
    Entry::affine("degC", ONE, Ratio(27_315, 100)),
    Entry::affine(
        "degF",
        FAHRENHEIT_STEP,
        Ratio(45_967, 100).times(FAHRENHEIT_STEP),
    ),
    Entry::affine("degR", FAHRENHEIT_STEP, ZERO),
    Entry::linear("delta_K", TemperatureDifference, ONE),
    Entry::linear("delta_degC", TemperatureDifference, ONE),
    Entry::linear("delta_degF", TemperatureDifference, FAHRENHEIT_STEP),
    Entry::linear("delta_degR", TemperatureDifference, FAHRENHEIT_STEP),
    Entry::linear("m/s", Speed, ONE),
    Entry::linear("km/h", Speed, KM.over(HOUR)),
    Entry::linear("cm/s", Speed, CM),
    Entry::linear("ft/s", Speed, FOOT),
    Entry::linear("mph", Speed, MILE.over(HOUR)),
    Entry::linear("kn", Speed, NAUTICAL_MILE.over(HOUR)),
    Entry::linear("m/s^2", Acceleration, ONE),
    Entry::linear("cm/s^2", Acceleration, CM),
    Entry::linear("ft/s^2", Acceleration, FOOT),
    Entry::linear("g0", Acceleration, STANDARD_GRAVITY),
    Entry::linear("Pa", Pressure, ONE),
    Entry::linear("kPa", Pressure, Ratio(1000, 1)),
    Entry::linear("MPa", Pressure, Ratio(1_000_000, 1)),
    Entry::linear("bar", Pressure, Ratio(100_000, 1)),
    Entry::linear("mbar", Pressure, Ratio(100, 1)),
    Entry::linear("atm", Pressure, Ratio(101_325, 1)),
    Entry::linear("psi", Pressure, POUND_FORCE.over(INCH.power(2))),
    Entry::linear("Torr", Pressure, Ratio(101_325, 760)),
    Entry {
        code: "mmHg",
        family: Pressure,
        model: Model::Approximate(Ratio(1_333_224, 10_000)),
    },
    Entry::linear("J", Energy, ONE),
    Entry::linear("kJ", Energy, Ratio(1000, 1)),
    Entry::linear("MJ", Energy, Ratio(1_000_000, 1)),
    Entry::linear("Wh", Energy, HOUR),
    Entry::linear("kWh", Energy, HOUR.times(Ratio(1000, 1))),
    Entry::linear("cal_th", Energy, Ratio(4184, 1000)),
    Entry::linear("kcal_th", Energy, Ratio(4184, 1)),
    Entry::linear("eV", Energy, Ratio(1_602_176_634, 10i128.pow(28))),
    Entry::linear("BTU_IT", Energy, Ratio(105_505_585_262, 100_000_000)),
    Entry::linear("W", Power, ONE),
    Entry::linear("kW", Power, Ratio(1000, 1)),
    Entry::linear("MW", Power, Ratio(1_000_000, 1)),
    Entry::linear(
        "hp_mech",
        Power,
        FOOT.times(POUND_FORCE).times(Ratio(550, 1)),
    ),
    Entry::linear("hp_metric", Power, STANDARD_GRAVITY.times(Ratio(75, 1))),
    Entry::linear("N", Force, ONE),
    Entry::linear("kN", Force, Ratio(1000, 1)),
    Entry::linear("MN", Force, Ratio(1_000_000, 1)),
    Entry::linear("dyn", Force, Ratio(1, 100_000)),
    Entry::linear("kgf", Force, STANDARD_GRAVITY),
    Entry::linear("lbf", Force, POUND_FORCE),
    Entry::angle("rad", ONE, 0),
    Entry::angle("deg", Ratio(1, 180), 1),
    Entry::angle("grad", Ratio(1, 200), 1),
    Entry::angle("turn", Ratio(2, 1), 1),
    Entry::angle("arcmin", Ratio(1, 10_800), 1),
    Entry::angle("arcsec", Ratio(1, 648_000), 1),
    Entry::fuel("km/L", ONE, false),
    Entry::fuel("mpg_us", MILE.over(GALLON_US).times(FUEL_SCALE), false),
    Entry::fuel(
        "mpg_imp",
        MILE.over(GALLON_IMPERIAL).times(FUEL_SCALE),
        false,
    ),
    Entry::fuel("L/km", ONE, true),
    Entry::fuel("L/100km", Ratio(1, 100), true),
];

const DIGITAL: &[(&str, i128)] = &[
    ("bit", 1),
    ("B", 8),
    ("kbit", 1000),
    ("Mbit", 1000i128.pow(2)),
    ("Gbit", 1000i128.pow(3)),
    ("Tbit", 1000i128.pow(4)),
    ("kB", 8 * 1000),
    ("MB", 8 * 1000i128.pow(2)),
    ("GB", 8 * 1000i128.pow(3)),
    ("TB", 8 * 1000i128.pow(4)),
    ("Kibit", 1024),
    ("Mibit", 1024i128.pow(2)),
    ("Gibit", 1024i128.pow(3)),
    ("Tibit", 1024i128.pow(4)),
    ("KiB", 8 * 1024),
    ("MiB", 8 * 1024i128.pow(2)),
    ("GiB", 8 * 1024i128.pow(3)),
    ("TiB", 8 * 1024i128.pow(4)),
];

fn common_alias(code: &str) -> &str {
    match code {
        "μm" | "µm" => "um",
        "μs" | "µs" => "us",
        "mm2" | "mm²" => "mm^2",
        "cm2" | "cm²" => "cm^2",
        "m2" | "m²" => "m^2",
        "km2" | "km²" => "km^2",
        "in2" | "in²" => "in^2",
        "ft2" | "ft²" => "ft^2",
        "yd2" | "yd²" => "yd^2",
        "mi2" | "mi²" => "mi^2",
        "cm3" | "cm³" => "cm^3",
        "m3" | "m³" => "m^3",
        "in3" | "in³" => "in^3",
        "ft3" | "ft³" => "ft^3",
        "C" | "°C" => "degC",
        "F" | "°F" => "degF",
        "R" | "°R" => "degR",
        "delta_C" | "Δ°C" => "delta_degC",
        "delta_F" | "Δ°F" => "delta_degF",
        "delta_R" | "Δ°R" => "delta_degR",
        "ΔK" => "delta_K",
        "m/s²" => "m/s^2",
        "cm/s²" => "cm/s^2",
        "ft/s²" => "ft/s^2",
        "mi/h" => "mph",
        "°" => "deg",
        "L/100 km" => "L/100km",
        "bps" => "bit/s",
        "kbps" => "kbit/s",
        "Mbps" => "Mbit/s",
        "Gbps" => "Gbit/s",
        "Tbps" => "Tbit/s",
        _ => code,
    }
}

fn digital(code: &str) -> Option<Unit> {
    let (storage, rate) = code
        .strip_suffix("/s")
        .map_or((code, false), |unit| (unit, true));
    let storage = match storage {
        "b" => "bit",
        "KB" => "kB",
        _ => storage,
    };
    let &(code, power) = DIGITAL.iter().find(|entry| entry.0 == storage)?;
    Some(Unit {
        code: if rate {
            format!("{code}/s")
        } else {
            code.to_owned()
        },
        family: if rate { TransferRate } else { DigitalStorage },
        model: Model::Linear(Ratio(power, 1)),
    })
}

pub(super) fn find(code: &str) -> Option<Unit> {
    let canonical = common_alias(code);
    PHYSICAL
        .iter()
        .find(|entry| entry.code == canonical)
        .copied()
        .map(Unit::from)
        .or_else(|| digital(canonical))
}
