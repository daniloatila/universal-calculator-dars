use super::*;
use num_bigint::BigInt;
use num_traits::{Signed, ToPrimitive};

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Analysis {
    x: String,
    #[serde(default)]
    y: Option<String>,
}

fn quartile(values: &[BigRational], k: usize) -> BigRational {
    let position = (values.len() - 1) * k;
    let first = position / 4;
    let frac = position % 4;
    if frac == 0 {
        return values[first].clone();
    }
    &values[first] + (&values[first + 1] - &values[first]) * BigRational::new(frac.into(), 4.into())
}
fn index(t: &Table, n: &str) -> Checked<usize> {
    let i = t.index(n)?;
    if !matches!(t.columns[i].kind, Kind::Decimal | Kind::Integer) {
        return Err(MathError::Domain);
    }
    Ok(i)
}
pub(super) fn report(t: &Table, c: &Config, meter: &mut Meter<'_>) -> Checked<Value> {
    let Some(a) = &c.analysis else {
        return Ok(Value::Null);
    };
    let i = index(t, &a.x)?;
    let j = a.y.as_ref().map(|y| index(t, y)).transpose()?;
    meter.reserve(8192)?;
    let mut v = Vec::new();
    let mut sums: [BigRational; 5] = std::array::from_fn(|_| BigRational::zero());
    let mut pairs = 0usize;
    for row in &t.rows {
        if !row[i].usable() {
            continue;
        }
        let x = row[i].numeric(c.decimal)?;
        meter.reserve(256 + 4 * ((x.numer().bits() + x.denom().bits()) as usize).div_ceil(8))?;
        if let Some(j) = j
            && row[j].usable()
        {
            let y = row[j].numeric(c.decimal)?;
            for (acc, add) in sums
                .iter_mut()
                .zip([x.clone(), y.clone(), &x * &x, &y * &y, &x * &y])
            {
                *acc += add;
                if acc.numer().bits().max(acc.denom().bits()) > 4096 {
                    return Err(MathError::Limit);
                }
            }
            pairs += 1;
        }
        v.push(x);
    }
    if v.is_empty() {
        return Ok(json!({"n":0,"histogram":[],"pearson":null}));
    }
    v.sort();
    let q1 = quartile(&v, 1);
    let q3 = quartile(&v, 3);
    let fence = (&q3 - &q1) * BigRational::new(3.into(), 2.into());
    let (low, high) = (&q1 - &fence, &q3 + &fence);
    let min = &v[0];
    let max = &v[v.len() - 1];
    let span = max - min;
    let mut bins = [0usize; 8];
    for n in &v {
        let b = if span.is_zero() {
            0
        } else {
            (((n - min) * BigInt::from(8)) / &span)
                .to_integer()
                .to_usize()
                .ok_or(MathError::Limit)?
                .min(7)
        };
        bins[b] += 1;
    }
    let pearson = if j.is_some() && pairs >= 2 {
        let [x, y, xx, yy, xy] = sums;
        let n = BigRational::from_integer(pairs.into());
        let cross = &n * xy - &x * &y;
        let variance = (&n * xx - &x * &x) * (&n * yy - &y * &y);
        if variance.is_positive() {
            let squared = (&cross * &cross) / variance;
            meter.reserve(budget::text(budget::rational_text_bytes(&squared)))?;
            Some(
                json!({"sign":if cross.is_zero(){0}else if cross.is_positive(){1}else{-1},"r_squared":squared.to_string(),"n":pairs}),
            )
        } else {
            None
        }
    } else {
        None
    };
    let middle = quartile(&v, 2);
    for value in [&q1, &q3, &middle, &low, &high, min, max] {
        meter.reserve(budget::text(budget::rational_text_bytes(value)))?;
    }
    Ok(
        json!({"n":v.len(),"q1":q1.to_string(),"median":middle.to_string(),"q3":q3.to_string(),
        "outliers":v.iter().filter(|n|*n<&low || *n>&high).count(),"fences":[low.to_string(),high.to_string()],
        "range":[min.to_string(),max.to_string()],"histogram":bins,"pearson":pearson}),
    )
}
