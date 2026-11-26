//! Dimension-checked elementary models. Rational coefficients are exact within the model.

use crate::{Computation, Exactness, MathError, converter};
use num_rational::BigRational as Q;
use num_traits::{Signed, ToPrimitive, Zero};
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

type Checked<T> = Result<T, MathError>;

struct Model {
    domain: &'static str,
    formula: &'static str,
    conditions: &'static [&'static str],
    precision: Option<u32>,
}

impl Model {
    fn exact(
        domain: &'static str,
        formula: &'static str,
        conditions: &'static [&'static str],
    ) -> Self {
        Self {
            domain,
            formula,
            conditions,
            precision: None,
        }
    }

    fn approximate(mut self, digits: u32) -> Self {
        self.precision = Some(digits);
        self
    }
}

fn extended_scale(unit: &str, canonical: &str) -> Checked<Q> {
    let aliases: &[(&str, &str)] = match canonical {
        "ohm" => &[
            ("Ω", "1"),
            ("kohm", "1000"),
            ("kΩ", "1000"),
            ("Mohm", "1e6"),
            ("MΩ", "1e6"),
            ("mohm", "1e-3"),
        ],
        "V" => &[("mV", "1e-3"), ("kV", "1000")],
        "A" => &[("mA", "1e-3"), ("uA", "1e-6"), ("µA", "1e-6")],
        "F" => &[
            ("mF", "1e-3"),
            ("uF", "1e-6"),
            ("µF", "1e-6"),
            ("nF", "1e-9"),
            ("pF", "1e-12"),
        ],
        "H" => &[("mH", "1e-3"), ("uH", "1e-6"), ("µH", "1e-6")],
        "Hz" => &[("kHz", "1000"), ("MHz", "1e6"), ("GHz", "1e9")],
        "mol" => &[("mmol", "1e-3")],
        "J/(kg*K)" => &[("kJ/(kg*K)", "1000"), ("J/(g*K)", "1000")],
        "kg/m^3" => &[("g/cm^3", "1000"), ("g/L", "1")],
        "W/(m*K)" => &[("mW/(m*K)", "1e-3")],
        "1" => &[("%", "1e-2")],
        _ => &[],
    };
    if unit == canonical {
        return Ok(Q::from_integer(1.into()));
    }
    aliases
        .iter()
        .find(|(code, _)| *code == unit)
        .ok_or(MathError::Domain)
        .and_then(|(_, scale)| converter::parse_quantity(scale))
}

fn safe(value: Q) -> Checked<Q> {
    (value.numer().bits().max(value.denom().bits()) <= 4096)
        .then_some(value)
        .ok_or(MathError::Limit)
}

fn positive(value: Q) -> Checked<Q> {
    value
        .is_positive()
        .then_some(value)
        .ok_or(MathError::Domain)
}

fn nonnegative(value: Q) -> Checked<Q> {
    (!value.is_negative())
        .then_some(value)
        .ok_or(MathError::Domain)
}

fn decimal(value: &str) -> Q {
    converter::parse_quantity(value).expect("trusted fixed model coefficient")
}

fn g0() -> Q {
    decimal("9.80665")
}

struct Calculation {
    input: Map<String, Value>,
    provided_units: Map<String, Value>,
    variables: BTreeMap<String, String>,
    units: BTreeMap<String, String>,
    values: Map<String, Value>,
}

impl Calculation {
    fn parse(input: &str) -> Checked<Self> {
        // Deserialize directly into a visitor so repeated JSON fields fail closed.
        let mut fields: UniqueFields =
            serde_json::from_str(input).map_err(|_| MathError::InvalidInput)?;
        let provided_units = match fields.0.remove("units") {
            None => Map::new(),
            Some(Value::Object(units)) => units,
            _ => return Err(MathError::InvalidInput),
        };
        Ok(Self {
            input: fields.0,
            provided_units,
            variables: BTreeMap::new(),
            units: BTreeMap::new(),
            values: Map::new(),
        })
    }

    fn value(&mut self, name: &str, canonical: &str) -> Checked<Q> {
        let original = self.input.remove(name).ok_or(MathError::InvalidInput)?;
        let text = original.as_str().ok_or(MathError::InvalidInput)?;
        let unit = self.take_unit(name, canonical)?;
        let value = Self::convert(text, &unit, canonical)?;
        let normalized = value.to_string();
        if normalized.len() <= 256 {
            self.variables.insert(name.to_owned(), normalized);
        }
        self.units.insert(name.to_owned(), canonical.to_owned());
        Ok(value)
    }

    fn take_unit(&mut self, name: &str, canonical: &str) -> Checked<String> {
        match self.provided_units.remove(name) {
            None => Ok(canonical.to_owned()),
            Some(Value::String(unit)) if unit.len() <= 24 => Ok(unit),
            _ => Err(MathError::InvalidInput),
        }
    }

    fn convert(text: &str, unit: &str, canonical: &str) -> Checked<Q> {
        let value = converter::parse_quantity(text)?;
        match canonical {
            "m" | "m^2" | "m^3" | "kg" | "s" | "K" | "delta_K" | "m/s" | "m/s^2" | "Pa" | "J"
            | "W" | "N" => converter::convert_exact(&value, unit, canonical),
            _ => safe(value * extended_scale(unit, canonical)?),
        }
    }

    fn resistances(&mut self) -> Checked<Vec<Q>> {
        let raw = self
            .input
            .remove("resistances")
            .ok_or(MathError::InvalidInput)?;
        let rows = raw.as_array().ok_or(MathError::InvalidInput)?;
        if !(1..=32).contains(&rows.len()) {
            return Err(MathError::Limit);
        }
        let unit = self.take_unit("resistances", "ohm")?;
        let values = rows
            .iter()
            .map(|value| {
                let text = value.as_str().ok_or(MathError::InvalidInput)?;
                nonnegative(Self::convert(text, &unit, "ohm")?)
            })
            .collect::<Checked<Vec<_>>>()?;
        self.units.insert("resistances".to_owned(), unit);
        self.variables
            .insert("count".to_owned(), values.len().to_string());
        Ok(values)
    }

    fn output(&mut self, name: &str, value: Q, unit: &str) -> Checked<()> {
        self.output_text(name, safe(value)?.to_string(), unit);
        Ok(())
    }

    fn output_text(&mut self, name: &str, value: String, unit: &str) {
        self.units.insert(name.to_owned(), unit.to_owned());
        self.values
            .insert(name.to_owned(), json!({"value":value,"unit":unit}));
    }

    fn constant(&mut self, key: &str, value: &str, unit: &str) {
        self.variables.insert(key.to_owned(), value.to_owned());
        self.units.insert(key.to_owned(), unit.to_owned());
    }

    fn standard_gravity(&mut self) -> Q {
        self.constant("standard_gravity", "9.80665", "m/s^2");
        g0()
    }

    fn finish(self, input: &str, model: Model) -> Checked<Computation> {
        if !self.input.is_empty() || !self.provided_units.is_empty() {
            return Err(MathError::InvalidInput);
        }
        let approximate = model.precision.is_some();
        Ok(Computation {
            result: json!({"values":self.values}).to_string(),
            exactness: if approximate {
                Exactness::Approximate
            } else {
                Exactness::Exact
            },
            normalized: input.trim().to_owned(),
            method: if approximate {
                "dimension_checked_approximate_model"
            } else {
                "dimension_checked_rational_model"
            },
            domain: model.domain,
            formula: Some(model.formula),
            precision: model.precision,
            tolerance: None,
            error_bound: None,
            constraints: model
                .conditions
                .iter()
                .map(|condition| (*condition).to_owned())
                .collect(),
            variables: self.variables,
            units: self.units,
        })
    }
}

struct UniqueFields(Map<String, Value>);

impl<'de> serde::Deserialize<'de> for UniqueFields {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Object;
        impl<'de> serde::de::Visitor<'de> for Object {
            type Value = UniqueFields;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an object with unique physical quantities")
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> Result<Self::Value, A::Error> {
                let mut fields = Map::new();
                while let Some(key) = map.next_key::<String>()? {
                    let value = if key == "units" {
                        Value::Object(map.next_value::<UniqueFields>()?.0)
                    } else {
                        map.next_value()?
                    };
                    if fields.len() == 12 || fields.insert(key, value).is_some() {
                        return Err(serde::de::Error::custom("too many or duplicate fields"));
                    }
                }
                Ok(UniqueFields(fields))
            }
        }
        deserializer.deserialize_map(Object)
    }
}

const GRAVITY: &str = "Conventional standard gravity g0 = 9.80665 m/s^2, exact as a convention";
const RIGID: &str =
    "Elementary idealized model; structural and critical-system validation is outside its scope";

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    if !options.is_empty() {
        return Err(MathError::InvalidInput);
    }
    let mut model = Calculation::parse(input)?;
    let definition = match operation {
        "uniform_motion" | "accelerated_motion" | "force" | "work" | "energy" | "power"
        | "momentum" | "impulse" | "circular_motion" | "gravitation" => {
            mechanics(operation, &mut model)
        }
        "ohm" | "electrical_power" | "electrical_energy" | "resistors_series"
        | "resistors_parallel" | "capacitance" | "inductance" | "rlc_series" => {
            electricity(operation, &mut model)
        }
        "temperature" | "heat" | "heat_conduction" | "ideal_gas" | "pressure"
        | "thermodynamic_work" | "efficiency" => thermodynamics(operation, &mut model),
        "density"
        | "hydrostatic_pressure"
        | "buoyancy"
        | "flow_rate"
        | "continuity"
        | "bernoulli" => fluids(operation, &mut model),
        "stress_strain" | "elasticity" | "torque" | "wave" => engineering(operation, &mut model),
        _ => Err(MathError::Unsupported),
    }?;
    model.finish(input, definition)
}

fn mechanics(op: &str, m: &mut Calculation) -> Checked<Model> {
    let (formula, limits): (_, &[&str]) = match op {
        "uniform_motion" => {
            let x = m.value("initial_position", "m")?;
            let v = m.value("velocity", "m/s")?;
            let t = nonnegative(m.value("time", "s")?)?;
            m.output("position", x + &v * t, "m")?;
            m.output("final_velocity", v, "m/s")?;
            ("x=x0+v*t", &["One-dimensional constant velocity"])
        }
        "accelerated_motion" => {
            let x = m.value("initial_position", "m")?;
            let v = m.value("initial_velocity", "m/s")?;
            let a = m.value("acceleration", "m/s^2")?;
            let t = nonnegative(m.value("time", "s")?)?;
            m.output("position", x + &v * &t + decimal("0.5") * &a * &t * &t, "m")?;
            m.output("final_velocity", v + a * t, "m/s")?;
            (
                "x=x0+v0*t+a*t^2/2; v=v0+a*t",
                &["One-dimensional constant acceleration"],
            )
        }
        "force" => {
            let mass = positive(m.value("mass", "kg")?)?;
            let a = m.value("acceleration", "m/s^2")?;
            m.output("net_force", mass * a, "N")?;
            ("F=m*a", &["Newtonian inertial frame"])
        }
        "work" => {
            let force = m.value("force", "N")?;
            let displacement = m.value("displacement", "m")?;
            m.output("work", force * displacement, "J")?;
            (
                "W=F*d",
                &["Constant force component parallel to displacement"],
            )
        }
        "energy" => {
            let mass = positive(m.value("mass", "kg")?)?;
            let speed = nonnegative(m.value("speed", "m/s")?)?;
            let height = m.value("height", "m")?;
            let kinetic = decimal("0.5") * &mass * &speed * speed;
            let potential = mass * m.standard_gravity() * height;
            m.output("kinetic_energy", kinetic.clone(), "J")?;
            m.output("potential_energy", potential.clone(), "J")?;
            m.output("mechanical_energy", kinetic + potential, "J")?;
            (
                "Ek=m*v^2/2; Ep=m*g0*h; E=Ek+Ep",
                &[
                    GRAVITY,
                    "Nonrelativistic motion, uniform gravity and stated height datum",
                ],
            )
        }
        "power" => {
            let work = m.value("work", "J")?;
            let time = positive(m.value("time", "s")?)?;
            m.output("average_power", work / time, "W")?;
            ("P=W/t", &["Average over a strictly positive elapsed time"])
        }
        "momentum" => {
            let mass = positive(m.value("mass", "kg")?)?;
            let v = m.value("velocity", "m/s")?;
            m.output("momentum", mass * v, "kg*m/s")?;
            ("p=m*v", &["One Newtonian momentum component"])
        }
        "impulse" => {
            let force = m.value("force", "N")?;
            let time = nonnegative(m.value("time", "s")?)?;
            m.output("impulse", force * time, "N*s")?;
            ("J=F*t", &["Constant or time-averaged force component"])
        }
        "circular_motion" => {
            let mass = positive(m.value("mass", "kg")?)?;
            let speed = nonnegative(m.value("speed", "m/s")?)?;
            let radius = positive(m.value("radius", "m")?)?;
            let angular = &speed / &radius;
            let acceleration = &speed * &angular;
            m.output("angular_speed", angular, "rad/s")?;
            m.output("centripetal_acceleration", acceleration.clone(), "m/s^2")?;
            m.output("centripetal_force", mass * acceleration, "N")?;
            (
                "omega=v/r; a=v^2/r; F=m*a",
                &["Uniform circular motion; magnitudes"],
            )
        }
        "gravitation" => {
            let a = positive(m.value("mass_a", "kg")?)?;
            let b = positive(m.value("mass_b", "kg")?)?;
            let r = positive(m.value("distance", "m")?)?;
            let factor = a * b / (&r * &r);
            let force = safe(&factor * decimal("6.67430e-11"))?;
            let uncertainty = safe(factor * decimal("1.5e-15"))?;
            m.constant("G", "6.67430e-11", "m^3/(kg*s^2)");
            m.constant("G_standard_uncertainty", "1.5e-15", "m^3/(kg*s^2)");
            m.output_text("force", converter::round_quantity(&force, 6), "N");
            m.output_text(
                "standard_uncertainty",
                converter::round_quantity(&uncertainty, 2),
                "N",
            );
            return Ok(Model::exact("mechanics", "F=G*m1*m2/r^2", &[
                "Point masses or nonoverlapping spherically symmetric bodies in the Newtonian model",
                "CODATA 2022 measured G; standard uncertainty propagated for G only; no absolute error bound",
            ]).approximate(6));
        }
        _ => return Err(MathError::Unsupported),
    };
    Ok(Model::exact("mechanics", formula, limits))
}

fn electricity(op: &str, m: &mut Calculation) -> Checked<Model> {
    let (formula, limits): (_, &[&str]) = match op {
        "ohm" => {
            let v = m.value("voltage", "V")?;
            let r = positive(m.value("resistance", "ohm")?)?;
            let i = &v / r;
            m.output("current", i.clone(), "A")?;
            m.output("power", v * i, "W")?;
            (
                "I=V/R; P=V*I",
                &["Ohmic resistance, steady DC; sign of current follows voltage"],
            )
        }
        "electrical_power" => {
            let v = m.value("voltage", "V")?;
            let i = m.value("current", "A")?;
            m.output("power", v * i, "W")?;
            ("P=V*I", &["Steady DC; passive sign convention"])
        }
        "electrical_energy" => {
            let power = m.value("power", "W")?;
            let time = nonnegative(m.value("time", "s")?)?;
            m.output("energy", power * time, "J")?;
            ("E=P*t", &["Constant power over elapsed time"])
        }
        "resistors_series" => {
            let values = m.resistances()?;
            m.output(
                "equivalent_resistance",
                values
                    .into_iter()
                    .try_fold(Q::zero(), |sum, v| safe(sum + v))?,
                "ohm",
            )?;
            (
                "R=sum(R_i)",
                &["Ideal nonnegative resistors connected in series"],
            )
        }
        "resistors_parallel" => {
            let values = m.resistances()?;
            let equivalent = if values.iter().any(Zero::is_zero) {
                Q::zero()
            } else {
                values
                    .into_iter()
                    .try_fold(Q::zero(), |sum, v| safe(sum + v.recip()))?
                    .recip()
            };
            m.output("equivalent_resistance", equivalent, "ohm")?;
            (
                "R=1/sum(1/R_i); R=0 if any R_i=0",
                &["Ideal nonnegative resistors connected in parallel"],
            )
        }
        "capacitance" => {
            let c = positive(m.value("capacitance", "F")?)?;
            let v = m.value("voltage", "V")?;
            let charge = c * &v;
            m.output("charge", charge.clone(), "C")?;
            m.output("energy", decimal("0.5") * charge * v, "J")?;
            ("Q=C*V; E=C*V^2/2", &["Ideal linear capacitor"])
        }
        "inductance" => {
            let l = positive(m.value("inductance", "H")?)?;
            let i = m.value("current", "A")?;
            let flux = l * &i;
            m.output("flux_linkage", flux.clone(), "Wb")?;
            m.output("energy", decimal("0.5") * flux * i, "J")?;
            (
                "lambda=L*I; E=L*I^2/2",
                &["Ideal linear inductor; flux linkage includes turns"],
            )
        }
        "rlc_series" => {
            let r = approximate(nonnegative(m.value("resistance", "ohm")?)?)?;
            let l = approximate(positive(m.value("inductance", "H")?)?)?;
            let c = approximate(positive(m.value("capacitance", "F")?)?)?;
            let f = approximate(positive(m.value("frequency", "Hz")?)?)?;
            let omega = std::f64::consts::TAU * f;
            let reactance = omega * l - (omega * c).recip();
            m.output_text("real_impedance", formatted(r)?, "ohm");
            m.output_text("reactance", formatted(reactance)?, "ohm");
            m.output_text("impedance_magnitude", formatted(r.hypot(reactance))?, "ohm");
            return Ok(Model::exact("electricity", "Z=R+i*(2*pi*f*L-1/(2*pi*f*C))", &[
                "Ideal linear series RLC components in sinusoidal steady state", "Binary64 working arithmetic; near resonance the small reactance has no relative accuracy guarantee",
            ]).approximate(15));
        }
        _ => return Err(MathError::Unsupported),
    };
    Ok(Model::exact("electricity", formula, limits))
}

fn approximate(value: Q) -> Checked<f64> {
    value
        .to_f64()
        .filter(|n| n.is_finite() && (*n != 0.0 || value.is_zero()))
        .ok_or(MathError::Limit)
}

fn formatted(value: f64) -> Checked<String> {
    value
        .is_finite()
        .then(|| format!("{value:.14e}"))
        .ok_or(MathError::Limit)
}

fn thermodynamics(op: &str, m: &mut Calculation) -> Checked<Model> {
    let (formula, limits): (_, &[&str]) = match op {
        "temperature" => {
            let k = m.value("temperature", "K")?;
            m.output("kelvin", k.clone(), "K")?;
            m.output(
                "celsius",
                converter::convert_exact(&k, "K", "degC")?,
                "degC",
            )?;
            m.output(
                "fahrenheit",
                converter::convert_exact(&k, "K", "degF")?,
                "degF",
            )?;
            (
                "K=degC+273.15; degF=(9/5)*degC+32",
                &["Absolute temperature scale; at least 0 K"],
            )
        }
        "heat" => {
            let mass = positive(m.value("mass", "kg")?)?;
            let c = positive(m.value("specific_heat", "J/(kg*K)")?)?;
            let delta = m.value("temperature_change", "delta_K")?;
            m.output("heat", mass * c * delta, "J")?;
            ("Q=m*c*deltaT", &["Constant specific heat; no phase change"])
        }
        "heat_conduction" => {
            let k = positive(m.value("conductivity", "W/(m*K)")?)?;
            let a = positive(m.value("area", "m^2")?)?;
            let delta = m.value("temperature_change", "delta_K")?;
            let length = positive(m.value("thickness", "m")?)?;
            m.output("heat_rate", k * a * delta / length, "W")?;
            (
                "Qdot=k*A*deltaT/L",
                &["Steady one-dimensional conduction, plane wall and constant conductivity"],
            )
        }
        "ideal_gas" => {
            let moles = positive(m.value("amount", "mol")?)?;
            let temperature = positive(m.value("temperature", "K")?)?;
            let volume = positive(m.value("volume", "m^3")?)?;
            let r = "8.31446261815324";
            m.constant("molar_gas_constant", r, "J/(mol*K)");
            m.output("pressure", moles * decimal(r) * temperature / volume, "Pa")?;
            (
                "p=n*R*T/V",
                &[
                    "Ideal gas, equilibrium, positive amount, absolute temperature and volume",
                    "R=N_A*k=8.31446261815324 J/(mol*K), exactly from SI defining constants",
                ],
            )
        }
        "pressure" => {
            let force = nonnegative(m.value("force", "N")?)?;
            let area = positive(m.value("area", "m^2")?)?;
            m.output("pressure", force / area, "Pa")?;
            ("p=F_normal/A", &["Average compressive normal pressure"])
        }
        "thermodynamic_work" => {
            let p = nonnegative(m.value("pressure", "Pa")?)?;
            let volume = m.value("volume_change", "m^3")?;
            m.output("work", p * volume, "J")?;
            (
                "W_by_system=p_ext*deltaV",
                &["Constant external pressure; positive work for expansion"],
            )
        }
        "efficiency" => {
            let useful = nonnegative(m.value("useful_energy", "J")?)?;
            let supplied = positive(m.value("input_energy", "J")?)?;
            if useful > supplied {
                return Err(MathError::Domain);
            }
            let ratio = useful / supplied;
            m.output("efficiency", ratio.clone(), "1")?;
            m.output("efficiency_percent", ratio * decimal("100"), "%")?;
            (
                "eta=E_useful/E_input",
                &["Both energies refer to the same analysis boundary and duration"],
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    Ok(Model::exact("thermodynamics", formula, limits))
}

fn fluids(op: &str, m: &mut Calculation) -> Checked<Model> {
    let (formula, limits): (_, &[&str]) = match op {
        "density" => {
            let mass = nonnegative(m.value("mass", "kg")?)?;
            let volume = positive(m.value("volume", "m^3")?)?;
            m.output("density", mass / volume, "kg/m^3")?;
            ("rho=m/V", &["Average mass density over measured volume"])
        }
        "hydrostatic_pressure" => {
            let rho = positive(m.value("density", "kg/m^3")?)?;
            let depth = nonnegative(m.value("depth", "m")?)?;
            let g = m.standard_gravity();
            m.output("gauge_pressure", rho * g * depth, "Pa")?;
            (
                "delta_p=rho*g0*h",
                &[
                    GRAVITY,
                    "Fluid at rest, uniform density; relative to the surface",
                ],
            )
        }
        "buoyancy" => {
            let rho = positive(m.value("density", "kg/m^3")?)?;
            let volume = nonnegative(m.value("volume", "m^3")?)?;
            let g = m.standard_gravity();
            m.output("buoyant_force", rho * g * volume, "N")?;
            (
                "F_b=rho*g0*V_displaced",
                &[
                    GRAVITY,
                    "Uniform static fluid density; upward force magnitude",
                ],
            )
        }
        "flow_rate" => {
            let a = positive(m.value("area", "m^2")?)?;
            let speed = nonnegative(m.value("speed", "m/s")?)?;
            m.output("volume_flow", a * speed, "m^3/s")?;
            ("Q=A*v_bar", &["Mean normal speed across a section"])
        }
        "continuity" => {
            let a = positive(m.value("area_a", "m^2")?)?;
            let v = nonnegative(m.value("speed_a", "m/s")?)?;
            let b = positive(m.value("area_b", "m^2")?)?;
            let flow = a * v;
            m.output("volume_flow", flow.clone(), "m^3/s")?;
            m.output("speed_b", flow / b, "m/s")?;
            (
                "A1*v1=A2*v2",
                &["Steady incompressible flow, no branches or accumulation"],
            )
        }
        "bernoulli" => {
            let rho = positive(m.value("density", "kg/m^3")?)?;
            let p = m.value("pressure_a", "Pa")?;
            let v1 = nonnegative(m.value("speed_a", "m/s")?)?;
            let h1 = m.value("height_a", "m")?;
            let v2 = nonnegative(m.value("speed_b", "m/s")?)?;
            let h2 = m.value("height_b", "m")?;
            let g = m.standard_gravity();
            m.output(
                "pressure_b",
                p + rho * (decimal("0.5") * (&v1 * &v1 - &v2 * &v2) + g * (h1 - h2)),
                "Pa",
            )?;
            (
                "p1+rho*v1^2/2+rho*g0*h1=p2+rho*v2^2/2+rho*g0*h2",
                &[
                    GRAVITY,
                    "Steady incompressible inviscid flow on one streamline without pumps or losses",
                    "Both pressures use the same reference; phase changes and cavitation are outside the model",
                ],
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    Ok(Model::exact("fluids", formula, limits))
}

fn engineering(op: &str, m: &mut Calculation) -> Checked<Model> {
    let (formula, limits): (_, &[&str]) = match op {
        "stress_strain" => {
            let force = m.value("force", "N")?;
            let area = positive(m.value("area", "m^2")?)?;
            let length = positive(m.value("length", "m")?)?;
            let change = m.value("length_change", "m")?;
            if change <= -&length {
                return Err(MathError::Domain);
            }
            m.output("normal_stress", force / area, "Pa")?;
            m.output("engineering_strain", change / length, "1")?;
            (
                "sigma=F/A0; epsilon=deltaL/L0",
                &[RIGID, "Uniaxial mean normal stress, original dimensions"],
            )
        }
        "elasticity" => {
            let modulus = positive(m.value("modulus", "Pa")?)?;
            let strain = m.value("strain", "1")?;
            m.output("normal_stress", modulus * strain, "Pa")?;
            (
                "sigma=E*epsilon",
                &[
                    RIGID,
                    "Uniaxial linear elastic regime; confirm material's proportional range independently",
                ],
            )
        }
        "torque" => {
            let force = m.value("force", "N")?;
            let lever = nonnegative(m.value("lever_arm", "m")?)?;
            m.output("torque", force * lever, "N*m")?;
            (
                "tau=F*d_perpendicular",
                &[RIGID, "Signed force with perpendicular lever arm"],
            )
        }
        "wave" => {
            let length = positive(m.value("wavelength", "m")?)?;
            let frequency = positive(m.value("frequency", "Hz")?)?;
            m.output("phase_speed", length * &frequency, "m/s")?;
            m.output("period", frequency.recip(), "s")?;
            (
                "v_phase=lambda*f; T=1/f",
                &["Monochromatic wave; phase speed distinct from group speed"],
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    Ok(Model::exact("engineering", formula, limits))
}
