# Converter units, methods and bounds

[Português brasileiro](limits.pt-BR.md)

`convert` takes one signed rational value and the options `from` and `to`. Enter an integer, decimal, scientific literal or fraction, such as `2`, `-1.25e-2` or `3/7`. The engine sends both units to a typed registry and returns a scalar result with the canonical unit codes in `proof.units`. Units are case-sensitive, including `bit` and `B`. The registry also accepts explicit aliases such as `μm`, `m²`, `°C`, `Δ°F`, `Mbps` and `L/100 km`. [Registry and aliases](../../../crates/dars-universal/src/converter/units.rs) · [Input grammar](../../../crates/dars-universal/src/converter/scalar.rs)

| Family | Canonical unit codes |
| --- | --- |
| Length | `nm` `um` `mm` `cm` `m` `km` `in` `ft` `yd` `mi` `nmi` |
| Area | `mm^2` `cm^2` `m^2` `km^2` `in^2` `ft^2` `yd^2` `mi^2` `ha` `acre` |
| Volume | `mL` `cL` `dL` `L` `cm^3` `m^3` `in^3` `ft^3` `gal_us` `gal_imp` `qt_us` `pt_us` `fl_oz_us` |
| Mass | `mg` `g` `kg` `t` `oz` `lb` `st` |
| Time | `ns` `us` `ms` `s` `min` `h` `d` `wk` |
| Temperature | Absolute `K` `degC` `degF` `degR`. Differences `delta_K` `delta_degC` `delta_degF` `delta_degR`. |
| Speed | `m/s` `km/h` `cm/s` `ft/s` `mph` `kn` |
| Acceleration | `m/s^2` `cm/s^2` `ft/s^2` `g0` |
| Pressure | `Pa` `kPa` `MPa` `bar` `mbar` `atm` `psi` `Torr` `mmHg` |
| Energy | `J` `kJ` `MJ` `Wh` `kWh` `cal_th` `kcal_th` `eV` `BTU_IT` |
| Power | `W` `kW` `MW` `hp_mech` `hp_metric` |
| Force | `N` `kN` `MN` `dyn` `kgf` `lbf` |
| Angle | `rad` `deg` `grad` `turn` `arcmin` `arcsec` |
| Data storage | `bit` `B` `kbit` `Mbit` `Gbit` `Tbit` `kB` `MB` `GB` `TB` `Kibit` `Mibit` `Gibit` `Tibit` `KiB` `MiB` `GiB` `TiB` |
| Transfer rate | The same data storage codes followed by `/s`. |
| Fuel economy and consumption | Economy `km/L` `mpg_us` `mpg_imp`. Consumption `L/km` `L/100km`. |

## Compatibility and exactness

- Linear quantities use an exact ratio of factors through a canonical reference unit. The international inch is exactly `0.0254 m`; customary area and volume factors derive from powers of the corresponding length. The US liquid gallon uses `231 in^3` and the Imperial gallon uses `4.54609 L`. Pound-force uses the international pound times standard gravity. These factors, and the International Table BTU, are represented as rationals. [SI Brochure](https://www.bipm.org/en/publications/si-brochure) · [NIST factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [Imperial capacity definition](https://www.legislation.gov.uk/ukpga/1985/72/schedule/1/part/IV/enacted) · [International Table BTU](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nbsir82-2401.pdf)
- Absolute temperatures convert through kelvin with exact scale and offset. Results below absolute zero are rejected, including for same-unit requests. Temperature differences form a separate family, use scale alone and allow negative differences. As an example, `0 degC` converts to `32 degF`, while `0 delta_degC` converts to `0 delta_degF`. [Temperature definitions](https://www.bipm.org/en/publications/si-brochure) · [Affine implementation](../../../crates/dars-universal/src/converter.rs)
- Angles use an exact rational coefficient with an integer power of π. For example, `90 deg` gives `pi/2` radians, `1 rad` gives `180/pi` degrees, and `200 grad` gives `180` degrees after the factors of π cancel. Radian cross-conversions with nonzero π exponents are symbolic. [Non-SI units and angular definitions](https://www.bipm.org/en/publications/si-brochure)
- Decimal data prefixes use powers of 1,000 and binary prefixes use powers of 1,024. One byte is eight bits. Data storage and transfer rate are distinct families. The alias `KB` resolves to decimal `kB`. [IEC unit notation](https://styleguide.iec.ch/?docs=iec%2Ftypographic%2Funits-and-symbols)
- Within fuel economy or within fuel consumption, scaling is linear and admits zero. Crossing between the two forms takes the reciprocal and requires positive input. For example, `8 L/100km` becomes `25/2 km/L`. The two MPG units use their separate gallon definitions and exact factors. [Fuel conversion](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [Fuel implementation](../../../crates/dars-universal/src/converter.rs)
- `mmHg` uses the published NIST rounded nominal coefficient `133.3224 Pa`. Crossing to or from a distinct pressure unit at a nonzero value uses that coefficient and reports `approximate`. The output is rounded to seven significant digits, ties to even, with integer arithmetic. The recorded precision describes that rounding target and the certified error bound remains empty. `Torr` is expressed exactly as `101325/760 Pa`. Zero and identity conversions stay exact. [NIST pressure factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8) · [Rounding implementation](../../../crates/dars-universal/src/converter/scalar.rs)

## Manual currency quotes

`currency` accepts a signed amount and manual fields `from`, `to`, `rate`, `source`, `as_of` and `reference_date`, with optional `valid_until`. The currencies available are `USD`, `EUR`, `BRL`, `GBP`, `JPY`, `CHF`, `CAD`, `AUD`, `CNY`, `ARS`, `MXN`, `INR`, `KRW`, `NZD`, `ZAR` and `PLN`. The rate is a positive rational number of target-currency units per one source-currency unit. The same currency requires rate one. The returned amount is the exact product relative to that entered rate and can retain a fraction. A signed amount supports reversals. [ISO currency code authority](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html) · [Manual quote implementation](../../../crates/dars-universal/src/converter/currency.rs)

Dates use Gregorian calendar dates in `YYYY-MM-DD` from years 0001 through 9999. Month lengths and century leap-year rules are validated. The starting and, if given, ending dates are inclusive. The source is nonempty plain text up to 80 UTF-8 bytes. The record preserves the amount, rate, reported source and supplied dates. The result uses `amount=...; status=...`. Status is calculated relative to the explicitly selected reference date. [Date format](https://www.w3.org/TR/NOTE-datetime)

| Status | Reported quote dates |
| --- | --- |
| `within_validity` | Reference date falls within the stated inclusive period. |
| `expired` | Reference date is after the supplied end. |
| `not_yet_valid` | Reference date is before the quote starts. |
| `unverified_validity` | Reference date is at or after the start and the end was omitted. |

The engine performs this calculation offline, using the manually supplied quote. The chosen reference date determines the status for replay, including historical, expired and future-effective quotes.

## Bounds and dependency choice

Incompatible families, a nonpositive rate, an end date before the start, a zero denominator or unsupported mathematical domain report `domain`. Unknown identifiers, invalid dates and malformed expressions report `invalid_input`. Scalar literals are limited to 256 UTF-8 bytes and 128 mantissa digits per decimal component, with exponent magnitude at most 256. Reduced rational numerator and denominator sizes are capped at 4,096 bits. [Parser and scalar bounds](../../../crates/dars-universal/src/converter/scalar.rs) · [Compatibility checks](../../../crates/dars-universal/src/converter.rs)

`uom` 0.38 provides compile-time dimensional analysis, a `bigrational` storage option and types for both absolute temperature and temperature intervals. This module selects a bounded runtime unit registry of exact Num rationals, with an explicit separate model for offsets, π factors, reciprocals and nominal precision. This keeps the runtime unit strings and proof metadata tied to the same reviewed table. The independent oracle uses Python fractions and symbolic calculations for the conversions and independent calendar checks for quote validity. [uom API and storage types](https://docs.rs/uom/latest/uom/) · [uom temperature model](https://docs.rs/uom/latest/src/uom/si/thermodynamic_temperature.rs.html) · [Independent oracle](../../../tests/verify-converter.py)
