mod cartesian;
mod value;

use crate::{Computation, Exactness, MathError};
use cartesian::{Contact, Point2};
use num_traits::{Signed, Zero};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeMap;
use value::{Checked, RadicalSum, Rational, checked, dimensions, pi_coefficient, power, rational};

struct Options {
    unit: &'static str,
    angle: &'static str,
}

impl Options {
    fn parse(value: &Value, angular: bool) -> Checked<Self> {
        let value = value.as_object().ok_or(MathError::InvalidInput)?;
        if value
            .keys()
            .any(|key| key != "unit" && !(angular && key == "angle"))
        {
            return Err(MathError::InvalidInput);
        }
        let unit = match value.get("unit").map(Value::as_str) {
            None | Some(Some("u")) => "u",
            Some(Some("mm")) => "mm",
            Some(Some("cm")) => "cm",
            Some(Some("m")) => "m",
            Some(Some("km")) => "km",
            Some(Some("in")) => "in",
            Some(Some("ft")) => "ft",
            Some(Some("yd")) => "yd",
            Some(Some("mi")) => "mi",
            _ => return Err(MathError::InvalidInput),
        };
        let angle = match value.get("angle").map(Value::as_str) {
            None | Some(Some("deg")) => "deg",
            Some(Some("rad")) => "rad",
            _ => return Err(MathError::InvalidInput),
        };
        Ok(Self { unit, angle })
    }

    fn measure_unit(&self, power: u8) -> String {
        if power == 1 {
            self.unit.to_owned()
        } else {
            format!("{}^{power}", self.unit)
        }
    }
}

struct Answer<'a> {
    options: &'a Options,
    fields: Vec<String>,
    symbols: bool,
    method: &'static str,
    formula: &'static str,
    constraints: Vec<String>,
    variables: BTreeMap<String, String>,
    units: BTreeMap<String, String>,
}

impl<'a> Answer<'a> {
    fn new(options: &'a Options, method: &'static str, formula: &'static str) -> Self {
        Self {
            options,
            fields: Vec::new(),
            symbols: false,
            method,
            formula,
            constraints: Vec::new(),
            variables: BTreeMap::new(),
            units: BTreeMap::new(),
        }
    }

    fn field(&mut self, name: &str, value: impl std::fmt::Display) {
        self.fields.push(format!("{name}={value}"));
    }

    fn quantity(&mut self, name: &str, value: impl std::fmt::Display, exponent: u8) {
        self.field(name, value);
        self.units
            .insert(name.to_owned(), self.options.measure_unit(exponent));
    }

    fn radical(&mut self, name: &str, value: &RadicalSum, exponent: u8) {
        self.symbols |= value.symbolic();
        self.quantity(name, value.text(), exponent);
    }

    fn circular(&mut self, name: &str, coefficient: &Rational, exponent: u8) {
        self.symbols |= !coefficient.is_zero();
        self.quantity(name, pi_coefficient(coefficient), exponent);
    }

    fn binding(&mut self, name: &str, value: String, summary: &str) {
        let value = if value.len() <= 256 {
            value
        } else {
            summary.to_owned()
        };
        self.variables.insert(name.to_owned(), value);
    }

    fn positive_lengths<const N: usize>(&mut self, names: [&str; N], values: [&Rational; N]) {
        self.constraints
            .push("Dimensions are strictly positive".to_owned());
        for (name, value) in names.into_iter().zip(values) {
            self.binding(
                name,
                value.to_string(),
                "Positive rational length from input",
            );
        }
    }

    fn points<const N: usize>(&mut self, names: [&str; N], points: [&[Rational]; N]) {
        for (name, point) in names.into_iter().zip(points) {
            self.binding(name, cartesian::text(point), "Rational point from input");
        }
    }

    fn finish(self, input: &str) -> Computation {
        Computation {
            result: self.fields.join("; "),
            exactness: if self.symbols {
                Exactness::Symbolic
            } else {
                Exactness::Exact
            },
            normalized: input.trim().to_owned(),
            method: self.method,
            domain: "real",
            formula: Some(self.formula),
            precision: None,
            tolerance: None,
            error_bound: None,
            constraints: self.constraints,
            variables: self.variables,
            units: self.units,
        }
    }
}

fn rectangle<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let [w, h] = dimensions::<2>(input)?;
    let mut answer = Answer::new(
        options,
        "exact_rectangle_measures",
        "A=w*h, P=2*(w+h), d=sqrt(w^2+h^2)",
    );
    answer.positive_lengths(["width", "height"], [&w, &h]);
    answer.quantity("area", checked(&w * &h)?, 2);
    answer.quantity("perimeter", checked(rational(2) * checked(&w + &h)?)?, 1);
    let diagonal = RadicalSum::sqrt(checked(power(&w, 2)? + power(&h, 2)?)?)?;
    answer.radical("diagonal", &diagonal, 1);
    Ok(answer)
}

fn circle<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let [r] = dimensions::<1>(input)?;
    let diameter = checked(rational(2) * &r)?;
    let mut answer = Answer::new(
        options,
        "exact_circle_measures",
        "d=2*r, C=2*pi*r, A=pi*r^2",
    );
    answer.positive_lengths(["radius"], [&r]);
    answer.quantity("diameter", &diameter, 1);
    answer.circular("circumference", &diameter, 1);
    answer.circular("area", &power(&r, 2)?, 2);
    Ok(answer)
}

fn triangle<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let [a, b, c] = dimensions::<3>(input)?;
    let mut ordered = [&a, &b, &c];
    ordered.sort();
    let [shortest, middle, longest] = ordered;
    if checked(shortest + middle)? <= *longest {
        return Err(MathError::Domain);
    }
    let perimeter = checked(checked(&a + &b)? + &c)?;
    let semi = checked(&perimeter / rational(2))?;
    let mut area_squared = semi.clone();
    for side in [&a, &b, &c] {
        area_squared = checked(area_squared * checked(&semi - side)?)?;
    }
    let sides = if shortest == longest {
        "equilateral"
    } else if shortest == middle || middle == longest {
        "isosceles"
    } else {
        "scalene"
    };
    let opposite = checked(power(shortest, 2)? + power(middle, 2)?)?;
    let angles = match power(longest, 2)?.cmp(&opposite) {
        Ordering::Less => "acute",
        Ordering::Equal => "right",
        Ordering::Greater => "obtuse",
    };
    let mut answer = Answer::new(
        options,
        "exact_triangle_heron",
        "s=(a+b+c)/2, A=sqrt(s*(s-a)*(s-b)*(s-c))",
    );
    answer.positive_lengths(["a", "b", "c"], [&a, &b, &c]);
    answer
        .constraints
        .push("Strict triangle inequality".to_owned());
    answer.quantity("perimeter", perimeter, 1);
    answer.radical("area", &RadicalSum::sqrt(area_squared)?, 2);
    answer.field("sides", sides);
    answer.field("angles", angles);
    Ok(answer)
}

fn polygon<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let base = cartesian::polygon(input)?;
    let mut answer = Answer::new(
        options,
        "exact_polygon_shoelace",
        "A=abs(sum(x_i*y_(i+1)-y_i*x_(i+1)))/2",
    );
    answer
        .constraints
        .push("Simple nonzero-area polygon".to_owned());
    answer.binding(
        "vertices",
        format!("{} planar vertices", base.count),
        "Planar vertices",
    );
    answer.quantity("area", base.area, 2);
    answer.radical("perimeter", &base.perimeter, 1);
    answer.field("orientation", base.orientation);
    Ok(answer)
}

fn sphere<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let [r] = dimensions::<1>(input)?;
    let mut answer = Answer::new(options, "exact_sphere_measures", "S=4*pi*r^2, V=4*pi*r^3/3");
    answer.positive_lengths(["radius"], [&r]);
    answer.circular("surface_area", &checked(rational(4) * power(&r, 2)?)?, 2);
    answer.circular(
        "volume",
        &checked(rational(4) * power(&r, 3)? / rational(3))?,
        3,
    );
    Ok(answer)
}

fn circular_solid<'a>(input: &str, options: &'a Options, cone: bool) -> Checked<Answer<'a>> {
    let [r, h] = dimensions::<2>(input)?;
    let area = power(&r, 2)?;
    let volume = checked(&area * &h)?;
    let mut answer = if cone {
        Answer::new(
            options,
            "exact_right_cone_measures",
            "s=sqrt(r^2+h^2), L=pi*r*s, S=pi*r^2+L, V=pi*r^2*h/3",
        )
    } else {
        Answer::new(
            options,
            "exact_right_cylinder_measures",
            "B=pi*r^2, L=2*pi*r*h, S=2*B+L, V=B*h",
        )
    };
    answer.positive_lengths(["radius", "height"], [&r, &h]);
    if cone {
        let slant = RadicalSum::sqrt(checked(area.clone() + power(&h, 2)?)?)?;
        answer.radical("slant_height", &slant, 1);
        answer.circular("base_area", &area, 2);
        let lateral = slant.scale(&r)?;
        answer.quantity("lateral_area", lateral.times_pi(), 2);
        let surface = lateral.add(RadicalSum::constant(area))?;
        answer.quantity("surface_area", surface.times_pi(), 2);
        answer.circular("volume", &checked(volume / rational(3))?, 3);
    } else {
        let lateral = checked(rational(2) * checked(&r * &h)?)?;
        let surface = checked(checked(rational(2) * &area)? + &lateral)?;
        answer.circular("base_area", &area, 2);
        answer.circular("lateral_area", &lateral, 2);
        answer.circular("surface_area", &surface, 2);
        answer.circular("volume", &volume, 3);
    }
    Ok(answer)
}

fn prism<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let (vertices, height) = input.split_once('|').ok_or(MathError::InvalidInput)?;
    let [height] = dimensions::<1>(height)?;
    let base = cartesian::polygon(vertices)?;
    let mut answer = Answer::new(
        options,
        "exact_right_prism_measures",
        "L=P_base*h, S=2*A_base+L, V=A_base*h",
    );
    answer.positive_lengths(["height"], [&height]);
    answer
        .constraints
        .push("Simple nonzero-area polygon".to_owned());
    answer.binding(
        "vertices",
        format!("{} planar vertices", base.count),
        "Planar vertices",
    );
    answer.quantity("base_area", &base.area, 2);
    answer.radical("base_perimeter", &base.perimeter, 1);
    let lateral = base.perimeter.scale(&height)?;
    answer.radical("lateral_area", &lateral, 2);
    let surface = lateral.add(RadicalSum::constant(checked(rational(2) * &base.area)?))?;
    answer.radical("surface_area", &surface, 2);
    answer.quantity("volume", checked(base.area * height)?, 3);
    Ok(answer)
}

fn distance<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let points = cartesian::points(input, cartesian::MAX_VERTICES + 1)?;
    let [a, b] = points.as_slice() else {
        return Err(MathError::InvalidInput);
    };
    let mut answer = Answer::new(
        options,
        "exact_cartesian_distance",
        "d=sqrt(sum((A_i-B_i)^2))",
    );
    answer.points(["A", "B"], [a, b]);
    answer.radical("distance", &cartesian::distance(a, b)?, 1);
    Ok(answer)
}

fn angle<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let points = cartesian::points(input, cartesian::MAX_VERTICES + 1)?;
    let [a, b, c] = points.as_slice() else {
        return Err(MathError::InvalidInput);
    };
    let ba = cartesian::displacement(a, b)?;
    let bc = cartesian::displacement(c, b)?;
    let dot = cartesian::dot(&ba, &bc)?;
    let norm_squared = checked(cartesian::dot(&ba, &ba)? * cartesian::dot(&bc, &bc)?)?;
    if norm_squared.is_zero() {
        return Err(MathError::Domain);
    }
    let cosine_squared = checked(power(&dot, 2)? / norm_squared)?;
    let familiar = [(0, 1, 90), (1, 4, 60), (1, 2, 45), (3, 4, 30), (1, 1, 0)]
        .into_iter()
        .find(|&(n, d, _)| cosine_squared == rational(n) / rational(d))
        .map(|(_, _, degrees)| {
            if dot.is_negative() {
                180 - degrees
            } else {
                degrees
            }
        });
    let mut answer = Answer::new(
        options,
        "exact_vector_angle",
        "theta=acos((BA·BC)/(||BA||*||BC||))",
    );
    answer.points(["A", "B", "C"], [a, b, c]);
    answer.constraints.push("Both rays are nonzero".to_owned());
    answer
        .units
        .insert("angle".to_owned(), options.angle.to_owned());
    let result = if let Some(degrees) = familiar {
        if options.angle == "deg" {
            degrees.to_string()
        } else {
            answer.symbols = degrees != 0;
            pi_coefficient(&(rational(degrees) / rational(180)))
        }
    } else {
        answer.symbols = true;
        let cosine = RadicalSum::sqrt(cosine_squared)?.text();
        let sign = if dot.is_negative() { "-" } else { "" };
        let radians = format!("acos({sign}{cosine})");
        if options.angle == "deg" {
            format!("180*{radians}/pi")
        } else {
            radians
        }
    };
    answer.field("angle", result);
    Ok(answer)
}

fn segment_points(input: &str) -> Checked<[Point2; 4]> {
    let cap = cartesian::MAX_VERTICES + 1;
    let points = if let Some((left, right)) = input.split_once('|') {
        let left = cartesian::points(left, cap)?;
        let right = cartesian::points(right, cap)?;
        if left.len() != 2 || right.len() != 2 {
            return Err(MathError::InvalidInput);
        }
        left.into_iter().chain(right).collect()
    } else {
        cartesian::points(input, cap)?
    };
    cartesian::planar(points)?
        .try_into()
        .map_err(|_| MathError::InvalidInput)
}

fn segments<'a>(input: &str, options: &'a Options) -> Checked<Answer<'a>> {
    let [a, b, c, d] = segment_points(input)?;
    let mut answer = Answer::new(
        options,
        "exact_segment_orientation",
        "orient(A,B,C)=det(B-A,C-A)",
    );
    answer.points(["A", "B", "C", "D"], [&a, &b, &c, &d]);
    answer
        .constraints
        .push("Each segment has distinct endpoints".to_owned());
    match cartesian::contact(&a, &b, &c, &d)? {
        Contact::Disjoint => answer.field("relation", "disjoint"),
        Contact::Cross => {
            answer.field("relation", "cross");
            answer.quantity(
                "point",
                cartesian::text(&cartesian::crossing_point(&a, &b, &c, &d)?),
                1,
            );
        }
        Contact::Touch(point) => {
            answer.field("relation", "touch");
            answer.quantity("point", cartesian::text(point), 1);
        }
        Contact::Overlap(first, last) => {
            answer.field("relation", "overlap");
            answer.quantity("from", cartesian::text(first), 1);
            answer.quantity("to", cartesian::text(last), 1);
        }
    }
    Ok(answer)
}

pub(super) fn evaluate(operation: &str, input: &str, options: &Value) -> Checked<Computation> {
    if input.len() > 4096 {
        return Err(MathError::Limit);
    }
    let options = Options::parse(options, operation == "angle")?;
    let answer = match operation {
        "rectangle" => rectangle(input, &options),
        "circle" => circle(input, &options),
        "triangle" => triangle(input, &options),
        "polygon" => polygon(input, &options),
        "sphere" => sphere(input, &options),
        "cylinder" => circular_solid(input, &options, false),
        "cone" => circular_solid(input, &options, true),
        "prism" => prism(input, &options),
        "distance" => distance(input, &options),
        "angle" => angle(input, &options),
        "segments" => segments(input, &options),
        _ => return Err(MathError::Unsupported),
    }?;
    Ok(answer.finish(input))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn calculate(operation: &str, input: &str) -> Computation {
        evaluate(operation, input, &json!({})).unwrap()
    }

    #[test]
    fn planar_measures_keep_exact_values_and_dimensional_units() {
        let rectangle = evaluate("rectangle", "  3/2 2  ", &json!({"unit":"cm"})).unwrap();
        assert_eq!(rectangle.result, "area=3; perimeter=7; diagonal=5/2");
        assert_eq!(rectangle.exactness, Exactness::Exact);
        assert_eq!(rectangle.normalized, "3/2 2");
        assert_eq!(rectangle.variables["width"], "3/2");
        assert_eq!(rectangle.units["area"], "cm^2");
        assert_eq!(rectangle.units["diagonal"], "cm");
        let circle = calculate("circle", "2.5e-1");
        assert_eq!(
            circle.result,
            "diameter=1/2; circumference=pi/2; area=pi/16"
        );
        assert_eq!(circle.exactness, Exactness::Symbolic);
        assert_eq!(circle.error_bound, None);
    }

    #[test]
    fn triangle_classification_uses_exact_side_comparison() {
        for (input, result) in [
            ("5 3 4", "perimeter=12; area=6; sides=scalene; angles=right"),
            (
                "5 6 5",
                "perimeter=16; area=12; sides=isosceles; angles=acute",
            ),
            (
                "4 2 3",
                "perimeter=9; area=sqrt(135/16); sides=scalene; angles=obtuse",
            ),
            (
                "1 1 1",
                "perimeter=3; area=sqrt(3/16); sides=equilateral; angles=acute",
            ),
        ] {
            assert_eq!(calculate("triangle", input).result, result);
        }
        let thin = calculate("triangle", "1 1 1.9999999999999999999999999999");
        assert!(thin.result.contains("angles=obtuse"));
        assert_eq!(
            evaluate("triangle", "1 1 2", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn polygon_closure_orientation_and_invalid_contacts() {
        let concave = calculate("polygon", "0 0;4 0;4 4;2 2;0 4;0 0");
        assert_eq!(
            concave.result,
            "area=12; perimeter=12+2*sqrt(8); orientation=counterclockwise"
        );
        let reversed = calculate("polygon", "0 4\n2 2\n4 4\n4 0\n0 0");
        assert_eq!(
            reversed.result,
            "area=12; perimeter=12+2*sqrt(8); orientation=clockwise"
        );
        assert_eq!(
            calculate("polygon", "0 0;1 0;2 0;2 3;0 3").result,
            "area=6; perimeter=10; orientation=counterclockwise"
        );
        for input in [
            "0 0;2 2;0 2;2 0",
            "0 0;4 0;4 4;2 0;0 4",
            "0 0;4 0;2 0;2 2;0 2",
            "0 0;4 0;4 3;0 3;2 0",
            "0 0;2 0;2 2;2 0;0 2",
            "0 0;1 0;2 0",
        ] {
            assert_eq!(
                evaluate("polygon", input, &json!({})).err(),
                Some(MathError::Domain),
                "{input}"
            );
        }
    }

    #[test]
    fn surfaces_volumes_and_slant_measures_are_consistent() {
        assert_eq!(
            calculate("sphere", "2").result,
            "surface_area=16*pi; volume=32*pi/3"
        );
        assert_eq!(
            calculate("cylinder", "2 5").result,
            "base_area=4*pi; lateral_area=20*pi; surface_area=28*pi; volume=20*pi"
        );
        assert_eq!(
            calculate("cone", "3 4").result,
            "slant_height=5; base_area=9*pi; lateral_area=15*pi; surface_area=24*pi; volume=12*pi"
        );
        assert_eq!(
            calculate("cone", "2 3").result,
            "slant_height=sqrt(13); base_area=4*pi; lateral_area=pi*(2*sqrt(13)); surface_area=pi*(4+2*sqrt(13)); volume=4*pi"
        );
        let prism = evaluate("prism", "0 0;3 0;3 2;0 2|5", &json!({"unit":"ft"})).unwrap();
        assert_eq!(
            prism.result,
            "base_area=6; base_perimeter=10; lateral_area=50; surface_area=62; volume=30"
        );
        assert_eq!(prism.units["volume"], "ft^3");
        assert_eq!(prism.units["base_perimeter"], "ft");
    }

    #[test]
    fn distance_and_angles_cover_planes_and_space() {
        assert_eq!(calculate("distance", "0 0 0;2 3 6").result, "distance=7");
        assert_eq!(calculate("distance", "3/2 −1;3/2 −1").result, "distance=0");
        assert_eq!(calculate("angle", "1 0;0 0;1 0").result, "angle=0");
        assert_eq!(calculate("angle", "1 0;0 0;-1 0").result, "angle=180");
        assert_eq!(calculate("angle", "0 0 1;0 0 0;3 4 0").result, "angle=90");
        let radians = evaluate("angle", "1 0 0;0 0 0;1 1 0", &json!({"angle":"rad"})).unwrap();
        assert_eq!(radians.result, "angle=pi/4");
        assert_eq!(radians.units["angle"], "rad");
        let obtuse = calculate("angle", "-1 0;0 0;1 2");
        assert_eq!(obtuse.result, "angle=180*acos(-sqrt(1/5))/pi");
        assert_eq!(obtuse.exactness, Exactness::Symbolic);
        assert_eq!(
            evaluate("angle", "0 0;0 0;2 0", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn segment_topology_distinguishes_proper_and_boundary_contacts() {
        for (input, result) in [
            ("0 0;2 2|0 1;2 0", "relation=cross; point=[2/3,2/3]"),
            ("0 0;1 1;1 1;1 2", "relation=touch; point=[1,1]"),
            ("0 0;1 0;1 0;2 0", "relation=touch; point=[1,0]"),
            ("0 3;0 0;0 4;0 1", "relation=overlap; from=[0,1]; to=[0,3]"),
            ("0 1;1 0;1 0;0 1", "relation=overlap; from=[0,1]; to=[1,0]"),
            ("0 0;1 1;2 2;3 3", "relation=disjoint"),
            ("0 0;0 1;1 0;1 1", "relation=disjoint"),
            ("0 0;1 0;2 0;2 3", "relation=disjoint"),
            (
                "0 0;1 1e-30;0 1e-30;1 0",
                "relation=cross; point=[1/2,1/2000000000000000000000000000000]",
            ),
        ] {
            assert_eq!(calculate("segments", input).result, result, "{input}");
        }
        let overlap = evaluate("segments", "0 0;3 3|1 1;2 2", &json!({"unit":"mm"})).unwrap();
        assert_eq!(overlap.units["from"], "mm");
        assert_eq!(overlap.units["to"], "mm");
        assert_eq!(
            evaluate("segments", "0 0;0 0;1 1;2 2", &json!({})).err(),
            Some(MathError::Domain)
        );
    }

    #[test]
    fn rejects_outside_domain_malformed_and_oversize_requests() {
        let cases = [
            ("rectangle", "0 1", json!({}), MathError::Domain),
            ("sphere", "1.5cm", json!({}), MathError::InvalidInput),
            ("circle", "1/0", json!({}), MathError::Domain),
            ("prism", "0 0;2 0;0 2|-1", json!({}), MathError::Domain),
            ("distance", "0 0;1 1 1", json!({}), MathError::Domain),
            (
                "distance",
                "0 0;1 1;2 2",
                json!({}),
                MathError::InvalidInput,
            ),
            ("polygon", "0 0 0;1 0 0;0 1 0", json!({}), MathError::Domain),
            (
                "polygon",
                "0 0;;1 0;0 1",
                json!({}),
                MathError::InvalidInput,
            ),
            (
                "segments",
                "0 0|1 1;2 2;3 3",
                json!({}),
                MathError::InvalidInput,
            ),
            ("sphere", "1e-256/1e256", json!({}), MathError::Limit),
            ("sphere", "1e257", json!({}), MathError::Limit),
            (
                "sphere",
                "1",
                json!({"unit":"cm^2"}),
                MathError::InvalidInput,
            ),
            (
                "sphere",
                "1",
                json!({"angle":"deg"}),
                MathError::InvalidInput,
            ),
            (
                "angle",
                "1 0;0 0;0 1",
                json!({"angle":"grad"}),
                MathError::InvalidInput,
            ),
        ];
        for (operation, input, options, error) in cases {
            assert_eq!(
                evaluate(operation, input, &options).err(),
                Some(error),
                "{operation}: {input}"
            );
        }
    }
}
