//! Bounded mathematical sampling. Domain checks split paths before interpolation.

use crate::calculus::numerical_expression::{Bindings, Expression, PARAMETERS, number};
use crate::{Computation, Exactness, MathError};
use serde::Deserialize;
use serde_json::{Map, Value, json};
use std::collections::{BTreeMap, BTreeSet};

type Checked<T> = Result<T, MathError>;
const SEARCH_PANELS: usize = 128;
const SEARCH_STEPS: usize = 50;
const SEARCH_LIMIT: usize = 12;
const SEARCH_RESIDUAL: f64 = 1e-8;
const MAX_SEGMENTS: usize = 240;
const MAX_COORDINATE: f64 = 1e12;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Explicit {
    expressions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Parametric {
    x: String,
    y: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Polar {
    r: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Spatial {
    x: String,
    y: String,
    z: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Single {
    expression: String,
}

struct Plot {
    series: Vec<Value>,
    grid: Value,
    warnings: BTreeSet<&'static str>,
    roots: Vec<(usize, f64)>,
    intersections: Vec<(usize, usize, f64)>,
}

impl Plot {
    fn new() -> Self {
        Self {
            series: Vec::new(),
            grid: Value::Null,
            warnings: BTreeSet::new(),
            roots: Vec::new(),
            intersections: Vec::new(),
        }
    }

    fn series(&mut self, label: &str, points: Vec<Option<Vec<f64>>>) {
        self.series.push(json!({"label":label,"points":points}));
    }

    fn render(&self, kind: &str) -> String {
        json!({"kind":kind,"series":self.series,"grid":self.grid,"warnings":self.warnings,
            "roots":self.roots,"intersections":self.intersections})
        .to_string()
    }
}

struct Options<'a> {
    values: &'a Map<String, Value>,
    coordinates: Bindings,
    xs: Vec<f64>,
    ys: Vec<f64>,
}

impl<'a> Options<'a> {
    fn parse(operation: &str, values: &'a Map<String, Value>) -> Checked<Self> {
        let grid = matches!(operation, "surface" | "implicit");
        for name in values.keys() {
            match name.as_str() {
                "lower" | "upper" | "samples" | "a" | "b" | "c" => {}
                "y_lower" | "y_upper" if grid => {}
                "find_roots" | "find_intersections" if operation == "explicit" => {}
                _ => return Err(MathError::InvalidInput),
            }
        }
        let parametric = matches!(operation, "parametric" | "polar" | "space_curve");
        let (min, max, default) = if grid { (8, 32, 24) } else { (16, 256, 96) };
        let count = match values.get("samples") {
            Some(value) => value.as_u64().ok_or(MathError::InvalidInput)?,
            None => default,
        };
        if !(min..=max).contains(&count) {
            return Err(MathError::Limit);
        }
        let coordinate = |name, default| -> Checked<f64> {
            let value = match values.get(name) {
                None => default,
                Some(value) => number(value.as_str().ok_or(MathError::InvalidInput)?)?,
            };
            (value.abs() <= MAX_COORDINATE)
                .then_some(value)
                .ok_or(MathError::Limit)
        };
        let axis = |low, high, lower, upper| -> Checked<Vec<f64>> {
            let (lower, upper) = (coordinate(low, lower)?, coordinate(high, upper)?);
            let points = coordinates(lower, upper, count as usize);
            if lower >= upper || points.windows(2).any(|pair| pair[0] >= pair[1]) {
                return Err(MathError::Domain);
            }
            Ok(points)
        };
        let xs = if parametric {
            axis("lower", "upper", 0.0, std::f64::consts::TAU)?
        } else {
            axis("lower", "upper", -5.0, 5.0)?
        };
        let ys = if grid {
            axis("y_lower", "y_upper", -5.0, 5.0)?
        } else {
            Vec::new()
        };
        let coordinates = [
            0.0,
            0.0,
            0.0,
            0.0,
            coordinate("a", 1.0)?,
            coordinate("b", 0.0)?,
            coordinate("c", 0.0)?,
        ];
        Ok(Self {
            values,
            coordinates,
            xs,
            ys,
        })
    }

    fn flag(&self, name: &str) -> Checked<bool> {
        self.values.get(name).map_or(Ok(false), |value| {
            value.as_bool().ok_or(MathError::InvalidInput)
        })
    }

    fn at(&self, axis: usize, value: f64) -> Bindings {
        let mut point = self.coordinates;
        point[axis] = value;
        point
    }

    fn at_xy(&self, x: f64, y: f64) -> Bindings {
        let mut point = self.at(0, x);
        point[1] = y;
        point
    }
}

fn coordinates(lower: f64, upper: f64, count: usize) -> Vec<f64> {
    let n = (count - 1) as f64;
    (0..count)
        .map(|i| {
            if i == count - 1 {
                upper
            } else {
                lower + (upper - lower) * (i as f64 / n)
            }
        })
        .collect()
}

fn request<T: serde::de::DeserializeOwned>(input: &str) -> Checked<T> {
    serde_json::from_str(input).map_err(|_| MathError::InvalidInput)
}

fn compile(text: &str, variables: u8) -> Checked<Expression> {
    if text.len() > 256 {
        return Err(MathError::Limit);
    }
    Expression::parse(text, variables | PARAMETERS)
}

fn segment(
    expressions: &[Expression],
    from: &Bindings,
    to: &Bindings,
    warnings: &mut BTreeSet<&'static str>,
) -> bool {
    let mut continuous = true;
    for expression in expressions {
        match expression.segment(from, to) {
            Ok(true) => {}
            Ok(false) => {
                warnings.insert("resolution_insufficient");
                continuous = false;
            }
            Err(_) => {
                warnings.insert("domain_gap");
                continuous = false;
            }
        }
    }
    continuous
}

fn sample_path(
    opts: &Options<'_>,
    axis: usize,
    expressions: &[Expression],
    polar_angle: bool,
    warnings: &mut BTreeSet<&'static str>,
    point: impl Fn(f64, &[f64]) -> Vec<f64>,
) -> Vec<Option<Vec<f64>>> {
    let mut points = Vec::with_capacity(opts.xs.len());
    let mut previous: Option<Bindings> = None;
    for &x in &opts.xs {
        let current = opts.at(axis, x);
        let values = expressions
            .iter()
            .map(|expr| expr.value(&current))
            .collect::<Checked<Vec<_>>>();
        match values {
            Ok(values) => {
                let display = point(x, &values);
                if display.iter().any(|coord| coord.abs() > MAX_COORDINATE) {
                    warnings.insert("domain_gap");
                    if previous.take().is_some() {
                        points.push(None);
                    }
                    continue;
                }
                if let Some(last) = previous {
                    let angle_too_wide =
                        polar_angle && x - last[axis] > std::f64::consts::FRAC_PI_2;
                    if angle_too_wide {
                        warnings.insert("resolution_insufficient");
                    }
                    if !segment(expressions, &last, &current, warnings) || angle_too_wide {
                        points.push(None);
                    }
                }
                points.push(Some(display));
                previous = Some(current);
            }
            Err(_) => {
                warnings.insert("domain_gap");
                if previous.take().is_some() {
                    points.push(None);
                }
            }
        }
    }
    points
}

fn explicit(input: &str, opts: &Options<'_>, plot: &mut Plot) -> Checked<()> {
    let Explicit { expressions } = request(input)?;
    if !(1..=4).contains(&expressions.len()) || expressions.len() * opts.xs.len() > 512 {
        return Err(MathError::Limit);
    }
    let roots = opts.flag("find_roots")?;
    let intersections = opts.flag("find_intersections")?;
    let compiled = expressions
        .iter()
        .map(|expression| compile(expression, 1))
        .collect::<Checked<Vec<_>>>()?;
    for (label, expression) in expressions.iter().zip(&compiled) {
        let points = sample_path(
            opts,
            0,
            std::slice::from_ref(expression),
            false,
            &mut plot.warnings,
            |x, values| vec![x, values[0]],
        );
        plot.series(label, points);
    }
    if roots || intersections {
        let fixed = coordinates(opts.xs[0], opts.xs[opts.xs.len() - 1], SEARCH_PANELS + 1);
        if roots {
            for (i, expr) in compiled.iter().enumerate() {
                plot.roots.extend(
                    search(opts, &fixed, expr, None, &mut plot.warnings)
                        .into_iter()
                        .map(|x| (i, x)),
                );
            }
        }
        if intersections {
            for (i, a) in compiled.iter().enumerate() {
                for (j, b) in compiled.iter().enumerate().skip(i + 1) {
                    plot.intersections.extend(
                        search(opts, &fixed, a, Some(b), &mut plot.warnings)
                            .into_iter()
                            .map(|x| (i, j, x)),
                    );
                }
            }
        }
    }
    Ok(())
}

fn search(
    opts: &Options<'_>,
    axis: &[f64],
    a: &Expression,
    b: Option<&Expression>,
    warnings: &mut BTreeSet<&'static str>,
) -> Vec<f64> {
    let value = |x| -> Checked<f64> {
        let p = opts.at(0, x);
        let left = a.value(&p)?;
        let right = b.map_or(Ok(0.0), |expr| expr.value(&p))?;
        let difference = left - right;
        difference
            .is_finite()
            .then_some(difference)
            .ok_or(MathError::Limit)
    };
    let residual_resolved = |x| -> Checked<bool> {
        let point = opts.at(0, x);
        let (low, high) = a.point_range(&point)?;
        let (right_low, right_high) = b.map_or(Ok((0.0, 0.0)), |expr| expr.point_range(&point))?;
        Ok((low - right_high).abs().max((high - right_low).abs()) <= SEARCH_RESIDUAL)
    };
    let values: Vec<_> = axis.iter().map(|&x| value(x).ok()).collect();
    if values.iter().all(|value| *value == Some(0.0))
        && axis.iter().all(|x| residual_resolved(*x) == Ok(true))
    {
        warnings.insert(if b.is_some() {
            "coincident_curves"
        } else {
            "flat_zero_function"
        });
        return Vec::new();
    }
    let mut candidates = Vec::new();
    for (xs, fs) in axis.windows(2).zip(values.windows(2)) {
        let (Some(left), Some(right)) = (fs[0], fs[1]) else {
            warnings.insert("search_incomplete");
            continue;
        };
        if left == 0.0 {
            if residual_resolved(xs[0]) == Ok(true) {
                candidates.push(xs[0]);
            } else {
                warnings.insert("search_incomplete");
            }
        }
        if left != 0.0 && right != 0.0 && left.is_sign_positive() != right.is_sign_positive() {
            let p = opts.at(0, xs[0]);
            let q = opts.at(0, xs[1]);
            let resolved = |e: &Expression| e.segment(&p, &q) == Ok(true);
            if resolved(a) && b.is_none_or(resolved) {
                if let Some(root) =
                    refine(xs[0], xs[1], left, &value).filter(|x| residual_resolved(*x) == Ok(true))
                {
                    candidates.push(root);
                } else {
                    warnings.insert("search_incomplete");
                }
            } else {
                warnings.insert("search_incomplete");
            }
        }
        if candidates.len() >= SEARCH_LIMIT {
            warnings.insert("search_incomplete");
            break;
        }
    }
    if candidates.len() < SEARCH_LIMIT
        && values.last().copied().flatten() == Some(0.0)
        && residual_resolved(axis[axis.len() - 1]) == Ok(true)
    {
        candidates.push(axis[axis.len() - 1]);
    }
    candidates
}

fn refine(
    mut lower: f64,
    mut upper: f64,
    mut left: f64,
    value: &impl Fn(f64) -> Checked<f64>,
) -> Option<f64> {
    let scale = lower.abs().max(upper.abs()).max(1.0);
    for _ in 0..SEARCH_STEPS {
        let middle = lower.midpoint(upper);
        let f = value(middle).ok()?;
        if f == 0.0 || (f.abs() <= SEARCH_RESIDUAL && upper - lower <= 1e-10 * scale) {
            return Some(middle);
        }
        if middle == lower || middle == upper {
            return None;
        }
        if f.is_sign_positive() == left.is_sign_positive() {
            lower = middle;
            left = f;
        } else {
            upper = middle;
        }
    }
    None
}

fn parametric_graph(op: &str, input: &str, opts: &Options<'_>, plot: &mut Plot) -> Checked<()> {
    let vars = 1 << 3;
    let (label, expressions) = match op {
        "parametric" => {
            let Parametric { x, y } = request(input)?;
            ("t", vec![compile(&x, vars)?, compile(&y, vars)?])
        }
        "polar" => {
            let Polar { r } = request(input)?;
            ("r(t)", vec![compile(&r, vars)?])
        }
        "space_curve" => {
            let Spatial { x, y, z } = request(input)?;
            (
                "(x(t),y(t),z(t))",
                vec![compile(&x, vars)?, compile(&y, vars)?, compile(&z, vars)?],
            )
        }
        _ => return Err(MathError::Unsupported),
    };
    let polar = op == "polar";
    let points = sample_path(
        opts,
        3,
        &expressions,
        polar,
        &mut plot.warnings,
        |t, values| {
            if polar {
                let (sin, cos) = t.sin_cos();
                vec![values[0] * cos, values[0] * sin]
            } else {
                values.to_vec()
            }
        },
    );
    plot.series(label, points);
    Ok(())
}

fn sample_grid(
    opts: &Options<'_>,
    expression: &Expression,
    warnings: &mut BTreeSet<&'static str>,
) -> Vec<Vec<Option<f64>>> {
    opts.ys
        .iter()
        .map(|&y| {
            opts.xs
                .iter()
                .map(|&x| match expression.value(&opts.at_xy(x, y)) {
                    Ok(z) if z.abs() <= MAX_COORDINATE => Some(z),
                    _ => {
                        warnings.insert("domain_gap");
                        None
                    }
                })
                .collect()
        })
        .collect()
}

fn grid_cell_valid(
    opts: &Options<'_>,
    col: usize,
    row: usize,
    expression: &Expression,
    warnings: &mut BTreeSet<&'static str>,
) -> bool {
    let low = opts.at_xy(opts.xs[col], opts.ys[row]);
    let high = opts.at_xy(opts.xs[col + 1], opts.ys[row + 1]);
    segment(std::slice::from_ref(expression), &low, &high, warnings)
}

fn surface(input: &str, opts: &Options<'_>, plot: &mut Plot) -> Checked<()> {
    let Single { expression } = request(input)?;
    let expression = compile(&expression, 3)?;
    let mut grid = sample_grid(opts, &expression, &mut plot.warnings);
    // A Cartesian cell spans two rows and columns. Mask all vertices of an unresolved
    // cell so even a renderer using only the z null mask cannot bridge the gap.
    for row in 0..opts.ys.len() - 1 {
        for col in 0..opts.xs.len() - 1 {
            if !grid_cell_valid(opts, col, row, &expression, &mut plot.warnings) {
                for line in &mut grid[row..=row + 1] {
                    line[col..=col + 1].fill(None);
                }
            }
        }
    }
    plot.grid = json!({"x":opts.xs,"y":opts.ys,"z":grid});
    Ok(())
}

fn implicit(input: &str, opts: &Options<'_>, plot: &mut Plot) -> Checked<()> {
    let Single { expression } = request(input)?;
    let field = compile(&expression, 3)?;
    let grid = sample_grid(opts, &field, &mut plot.warnings);
    if grid.iter().flatten().all(|value| *value == Some(0.0)) {
        plot.warnings.insert("flat_contour");
        plot.series(&expression, Vec::new());
        return Ok(());
    }
    let mut points = Vec::new();
    'rows: for row in 0..opts.ys.len() - 1 {
        for col in 0..opts.xs.len() - 1 {
            let corners = [
                grid[row][col],
                grid[row][col + 1],
                grid[row + 1][col + 1],
                grid[row + 1][col],
            ];
            let [Some(bl), Some(br), Some(tr), Some(tl)] = corners else {
                continue;
            };
            if !grid_cell_valid(opts, col, row, &field, &mut plot.warnings) {
                continue;
            }
            let values = [bl, br, tr, tl];
            let (x1, x2, y1, y2) = (
                opts.xs[col],
                opts.xs[col + 1],
                opts.ys[row],
                opts.ys[row + 1],
            );
            let xy = [(x1, y1), (x2, y1), (x2, y2), (x1, y2)];
            let mut ends = Vec::new();
            for i in 0..4 {
                let j = (i + 1) % 4;
                let (u, v) = (values[i], values[j]);
                if (u >= 0.0) != (v >= 0.0) {
                    let t = u / (u - v);
                    ends.push([
                        xy[i].0 + (xy[j].0 - xy[i].0) * t,
                        xy[i].1 + (xy[j].1 - xy[i].1) * t,
                    ]);
                }
            }
            let mut append = |a: [f64; 2], b: [f64; 2]| {
                if a != b {
                    points.extend([Some(a.to_vec()), Some(b.to_vec()), None]);
                }
            };
            match *ends.as_slice() {
                [a, b] => append(a, b),
                [a, b, c, d] => {
                    let middle = field.value(&opts.at_xy(x1.midpoint(x2), y1.midpoint(y2)))?;
                    if (middle >= 0.0) == (bl >= 0.0) {
                        append(a, b);
                        append(c, d);
                    } else {
                        append(a, d);
                        append(b, c);
                    }
                }
                _ => {}
            }
            if points.len() / 3 >= MAX_SEGMENTS {
                plot.warnings.insert("partial_contour");
                break 'rows;
            }
        }
    }
    plot.series(&expression, points);
    Ok(())
}

pub(super) fn evaluate(
    operation: &str,
    input: &str,
    options: &Map<String, Value>,
) -> Checked<Computation> {
    let opts = Options::parse(operation, options)?;
    let mut plot = Plot::new();
    let (method, formula) = match operation {
        "explicit" => {
            explicit(input, &opts, &mut plot)?;
            ("bounded_explicit_sampling", "y=f(x)")
        }
        "parametric" | "polar" | "space_curve" => {
            parametric_graph(operation, input, &opts, &mut plot)?;
            let formula = match operation {
                "polar" => "x=r(t)*cos(t); y=r(t)*sin(t)",
                "space_curve" => "p=(x(t),y(t),z(t))",
                _ => "p=(x(t),y(t))",
            };
            ("bounded_parametric_sampling", formula)
        }
        "surface" => {
            surface(input, &opts, &mut plot)?;
            ("bounded_rectangular_grid", "z=f(x,y)")
        }
        "implicit" => {
            implicit(input, &opts, &mut plot)?;
            ("marching_squares_center_decider", "F(x,y)=0")
        }
        _ => return Err(MathError::Unsupported),
    };
    let mut constraints = vec![
        "Binary64 bounded visualization; finite grid spacing can omit features below its resolution".to_owned(),
        "Null coordinates separate samples across detected poles, domain gaps or unresolved oscillation".to_owned(),
    ];
    let searched = opts.flag("find_roots")? || opts.flag("find_intersections")?;
    if searched {
        constraints.push(format!("Candidate search uses {SEARCH_PANELS} fixed sign-change panels, up to {SEARCH_STEPS} bisections per candidate and {SEARCH_LIMIT} candidates per pair or curve"));
        constraints.push("Candidate residual tolerance is not a certified error bound; isolated tangencies and features between panels can be missed".to_owned());
    }
    let result = plot.render(operation);
    if result.len() > 32 * 1024 {
        return Err(MathError::Limit);
    }
    Ok(Computation {
        result,
        exactness: Exactness::Approximate,
        normalized: input.trim().to_owned(),
        method,
        domain: "real_graph",
        formula: Some(formula),
        precision: Some(15),
        tolerance: searched.then(|| SEARCH_RESIDUAL.to_string()),
        error_bound: None,
        constraints,
        variables: BTreeMap::from([
            ("samples".to_owned(), opts.xs.len().to_string()),
            ("lower".to_owned(), opts.xs[0].to_string()),
            ("upper".to_owned(), opts.xs[opts.xs.len() - 1].to_string()),
            ("a".to_owned(), opts.coordinates[4].to_string()),
            ("b".to_owned(), opts.coordinates[5].to_string()),
            ("c".to_owned(), opts.coordinates[6].to_string()),
        ]),
        units: BTreeMap::new(),
    })
}
