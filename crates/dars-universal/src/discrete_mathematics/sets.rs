use super::integer::{self, Checked};
use crate::MathError;
use num_bigint::BigInt;
use std::collections::BTreeSet;

const MAX_ATOMS: usize = 128;

#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Element<'a> {
    Integer(BigInt),
    Name(&'a str),
}

impl std::fmt::Display for Element<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Integer(value) => write!(formatter, "{value}"),
            Self::Name(value) => write!(formatter, "\"{value}\""),
        }
    }
}

fn parse(input: &str) -> Checked<BTreeSet<Element<'_>>> {
    let mut values = BTreeSet::new();
    for (index, value) in input.split_whitespace().enumerate() {
        if index == MAX_ATOMS {
            return Err(MathError::Limit);
        }
        let element = if value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic)
        {
            if value.len() > 32 {
                return Err(MathError::Limit);
            }
            if !value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
            {
                return Err(MathError::InvalidInput);
            }
            Element::Name(value)
        } else {
            Element::Integer(integer::parse(value)?)
        };
        values.insert(element);
    }
    Ok(values)
}

fn text<'a>(items: impl Iterator<Item = &'a Element<'a>>) -> String {
    format!(
        "[{}]",
        items.map(Element::to_string).collect::<Vec<_>>().join(",")
    )
}

pub(super) fn evaluate(operation: &str, input: &str) -> Checked<(String, usize, usize)> {
    let (left, right) = input.split_once('|').ok_or(MathError::InvalidInput)?;
    if right.contains('|') {
        return Err(MathError::InvalidInput);
    }
    let left = parse(left)?;
    let right = parse(right)?;
    let result = match operation {
        "set_union" => text(left.union(&right)),
        "set_intersection" => text(left.intersection(&right)),
        "set_difference" => text(left.difference(&right)),
        "set_symmetric_difference" => text(left.symmetric_difference(&right)),
        "set_subset" => left.is_subset(&right).to_string(),
        _ => return Err(MathError::Unsupported),
    };
    Ok((result, left.len(), right.len()))
}
