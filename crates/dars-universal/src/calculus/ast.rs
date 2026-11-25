use crate::MathError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, ToPrimitive, Zero};
use std::collections::{BTreeMap, BTreeSet};

pub(super) type Rational = BigRational;
pub(super) type Checked<T> = Result<T, MathError>;
pub(super) const NAMES: [&str; 3] = ["x", "y", "z"];
const MAX_NODES: usize = 2048;
const MAX_POWER: i16 = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Function {
    Sin,
    Cos,
    Exp,
    Ln,
    Abs,
}

impl Function {
    pub(super) fn name(self) -> &'static str {
        match self {
            Self::Sin => "sin",
            Self::Cos => "cos",
            Self::Exp => "exp",
            Self::Ln => "ln",
            Self::Abs => "abs",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Expr {
    Num(Rational),
    Var(u8),
    Add(Vec<Self>),
    Mul(Vec<Self>),
    Pow(Box<Self>, i16),
    Call(Function, Box<Self>),
}

pub(super) fn rat(value: i64) -> Rational {
    Rational::from_integer(value.into())
}

pub(super) fn num(value: i64) -> Expr {
    Expr::Num(rat(value))
}

pub(super) fn checked(value: Rational) -> Checked<Rational> {
    if value.numer().bits().max(value.denom().bits()) > 4096 {
        return Err(MathError::Limit);
    }
    Ok(value)
}

impl Expr {
    pub(super) fn fraction(&self) -> Option<&Rational> {
        if let Self::Num(value) = self {
            Some(value)
        } else {
            None
        }
    }

    pub(super) fn is_zero(&self) -> bool {
        self.fraction().is_some_and(Zero::is_zero)
    }

    pub(super) fn variables(&self) -> u8 {
        match self {
            Self::Num(_) => 0,
            Self::Var(index) => 1 << index,
            Self::Add(items) | Self::Mul(items) => {
                items.iter().fold(0, |mask, item| mask | item.variables())
            }
            Self::Pow(base, _) | Self::Call(_, base) => base.variables(),
        }
    }

    fn size(&self) -> usize {
        1 + match self {
            Self::Add(items) | Self::Mul(items) => items.iter().map(Self::size).sum(),
            Self::Pow(base, _) | Self::Call(_, base) => base.size(),
            _ => 0,
        }
    }

    pub(super) fn bounded(self) -> Checked<Self> {
        if self.size() > MAX_NODES {
            Err(MathError::Limit)
        } else {
            Ok(self)
        }
    }

    pub(super) fn normalize(self) -> Checked<Self> {
        match self {
            Self::Add(items) => add(items
                .into_iter()
                .map(Self::normalize)
                .collect::<Checked<Vec<_>>>()?),
            Self::Mul(items) => mul(items
                .into_iter()
                .map(Self::normalize)
                .collect::<Checked<Vec<_>>>()?),
            Self::Pow(base, degree) => pow(base.normalize()?, degree),
            Self::Call(function, argument) => call(function, argument.normalize()?),
            value => Ok(value),
        }
    }

    pub(super) fn substitute(&self, variable: u8, value: &Rational) -> Checked<Self> {
        match self {
            Self::Var(index) if *index == variable => Ok(Self::Num(value.clone())),
            Self::Add(items) => add(items
                .iter()
                .map(|item| item.substitute(variable, value))
                .collect::<Checked<Vec<_>>>()?),
            Self::Mul(items) => mul(items
                .iter()
                .map(|item| item.substitute(variable, value))
                .collect::<Checked<Vec<_>>>()?),
            Self::Pow(base, degree) => pow(base.substitute(variable, value)?, *degree),
            Self::Call(function, argument) => {
                call(*function, argument.substitute(variable, value)?)
            }
            _ => Ok(self.clone()),
        }
    }

    fn render(&self, context: u8) -> String {
        let (text, precedence) = match self {
            Self::Num(value) => {
                let precedence = if value.is_negative() || !value.is_integer() {
                    3
                } else {
                    5
                };
                (value.to_string(), precedence)
            }
            Self::Var(index) => (NAMES[usize::from(*index)].to_owned(), 5),
            Self::Call(function, argument) => {
                (format!("{}({})", function.name(), argument.text()), 5)
            }
            Self::Pow(base, degree) => (format!("{}^{degree}", base.render(5)), 4),
            Self::Mul(items) => {
                let mut items = items.iter();
                let first = items.next().expect("normalized product has factors");
                let mut text = if first.fraction().is_some_and(|value| *value == rat(-1)) {
                    "-".to_owned()
                } else {
                    format!("{}*", first.render(2))
                };
                text.push_str(
                    &items
                        .map(|item| item.render(2))
                        .collect::<Vec<_>>()
                        .join("*"),
                );
                (text, 2)
            }
            Self::Add(items) => {
                let mut text = String::new();
                for item in items {
                    let term = item.render(1);
                    if !text.is_empty() && !term.starts_with('-') {
                        text.push('+');
                    }
                    text.push_str(&term);
                }
                (text, 1)
            }
        };
        if precedence < context {
            format!("({text})")
        } else {
            text
        }
    }

    pub(super) fn text(&self) -> String {
        self.render(0)
    }
}

fn single(items: Vec<Expr>, empty: i64, build: fn(Vec<Expr>) -> Expr) -> Expr {
    match items.len() {
        0 => num(empty),
        1 => items.into_iter().next().expect("one expression"),
        _ => build(items),
    }
}

fn split_term(term: Expr) -> (Expr, Rational) {
    match term {
        Expr::Num(value) => (num(1), value),
        Expr::Mul(mut factors) if matches!(factors.first(), Some(Expr::Num(_))) => {
            let Expr::Num(coefficient) = factors.remove(0) else {
                unreachable!()
            };
            (single(factors, 1, Expr::Mul), coefficient)
        }
        value => (value, rat(1)),
    }
}

pub(super) fn add(items: impl IntoIterator<Item = Expr>) -> Checked<Expr> {
    let mut terms = BTreeMap::<Expr, Rational>::new();
    for item in items {
        let nested = match item {
            Expr::Add(items) => items,
            item => vec![item],
        };
        for item in nested {
            let (term, coefficient) = split_term(item);
            let current = terms.entry(term).or_default();
            *current = checked(&*current + coefficient)?;
        }
    }
    let mut result = Vec::new();
    for (term, coefficient) in terms.into_iter().rev() {
        if !coefficient.is_zero() {
            result.push(mul([Expr::Num(coefficient), term])?);
        }
    }
    single(result, 0, Expr::Add).bounded()
}

pub(super) fn neg(item: Expr) -> Checked<Expr> {
    if let Expr::Add(terms) = item {
        return add(terms.into_iter().map(neg).collect::<Checked<Vec<_>>>()?);
    }
    mul([num(-1), item])
}

pub(super) fn mul(items: impl IntoIterator<Item = Expr>) -> Checked<Expr> {
    let mut coefficient = rat(1);
    let mut powers = BTreeMap::<Expr, i16>::new();
    for item in items {
        let nested = match item {
            Expr::Mul(items) => items,
            item => vec![item],
        };
        for item in nested {
            match item {
                Expr::Num(value) => coefficient = checked(coefficient * value)?,
                Expr::Pow(base, power) => {
                    let current = powers.entry(*base).or_default();
                    *current = current.checked_add(power).ok_or(MathError::Limit)?;
                }
                atom => {
                    let current = powers.entry(atom).or_default();
                    *current = current.checked_add(1).ok_or(MathError::Limit)?;
                }
            }
        }
    }
    if coefficient.is_zero() {
        return Ok(num(0));
    }
    let mut result = Vec::new();
    if !coefficient.is_one() {
        result.push(Expr::Num(coefficient));
    }
    for (base, exponent) in powers {
        if exponent != 0 {
            result.push(pow(base, exponent)?);
        }
    }
    single(result, 1, Expr::Mul).bounded()
}

pub(super) fn pow(base: Expr, power: i16) -> Checked<Expr> {
    if power.unsigned_abs() > MAX_POWER as u16 {
        return Err(MathError::Limit);
    }
    if base.is_zero() && power <= 0 {
        return Err(MathError::Domain);
    }
    match (base, power) {
        (_, 0) => Ok(num(1)),
        (base, 1) => Ok(base),
        (Expr::Num(value), degree) => Ok(Expr::Num(checked(value.pow(i32::from(degree)))?)),
        (Expr::Pow(base, previous), degree) => {
            pow(*base, previous.checked_mul(degree).ok_or(MathError::Limit)?)
        }
        (base, degree) => Expr::Pow(Box::new(base), degree).bounded(),
    }
}

pub(super) fn call(function: Function, argument: Expr) -> Checked<Expr> {
    if let Some(value) = argument.fraction() {
        match function {
            Function::Ln if !value.is_positive() => return Err(MathError::Domain),
            Function::Ln if value.is_one() => return Ok(num(0)),
            Function::Sin if value.is_zero() => return Ok(num(0)),
            Function::Cos | Function::Exp if value.is_zero() => return Ok(num(1)),
            Function::Abs => return Ok(Expr::Num(value.abs())),
            _ => {}
        }
    }
    Expr::Call(function, Box::new(argument)).bounded()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum Condition {
    Nonzero,
    Positive,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct Guard(pub(super) Expr, pub(super) Condition);

impl Guard {
    pub(super) fn text(&self) -> String {
        let relation = match self.1 {
            Condition::Nonzero => "!=",
            Condition::Positive => ">",
        };
        format!("{} {relation} 0", self.0.text())
    }

    pub(super) fn accepts(&self, value: &Rational) -> bool {
        match self.1 {
            Condition::Nonzero => !value.is_zero(),
            Condition::Positive => value.is_positive(),
        }
    }
}

pub(super) fn guards(expression: &Expr, smooth_abs: bool) -> Checked<BTreeSet<Guard>> {
    fn collect(expression: &Expr, smooth_abs: bool, found: &mut BTreeSet<Guard>) -> Checked<()> {
        let requirement = match expression {
            Expr::Add(items) | Expr::Mul(items) => {
                for item in items {
                    collect(item, smooth_abs, found)?;
                }
                None
            }
            Expr::Pow(base, degree) => {
                collect(base, smooth_abs, found)?;
                (*degree <= 0).then_some((base, Condition::Nonzero))
            }
            Expr::Call(function, argument) => {
                collect(argument, smooth_abs, found)?;
                match function {
                    Function::Ln => Some((argument, Condition::Positive)),
                    Function::Abs if smooth_abs && argument.variables() != 0 => {
                        Some((argument, Condition::Nonzero))
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        if let Some((base, condition)) = requirement {
            let normalized = base.as_ref().clone().normalize()?;
            let guard = Guard(normalized, condition);
            if let Some(value) = guard.0.fraction() {
                if !guard.accepts(value) {
                    return Err(MathError::Domain);
                }
            } else {
                found.insert(guard);
                if found.len() > 16 {
                    return Err(MathError::Limit);
                }
            }
        }
        Ok(())
    }
    let mut found = BTreeSet::new();
    collect(expression, smooth_abs, &mut found)?;
    Ok(found)
}

#[derive(Clone, Copy)]
enum Token {
    Number,
    Var(u8),
    Function(Function),
    Add,
    Sub,
    Mul,
    Div,
    Power,
    Open,
    Close,
    End,
}

fn digits(text: &[u8], mut end: usize) -> usize {
    while text.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    end
}

fn number_end(text: &[u8], start: usize) -> usize {
    let mut end = digits(text, start);
    if text.get(end) == Some(&b'.') {
        end = digits(text, end + 1);
    }
    if matches!(text.get(end), Some(b'e' | b'E')) {
        let mut begin = end + 1;
        if matches!(text.get(begin), Some(b'+' | b'-')) {
            begin += 1;
        }
        let after = digits(text, begin);
        if after > begin {
            return after;
        }
    }
    end
}

fn decimal(input: &str) -> Checked<Rational> {
    let (body, exponent) = if let Some((body, exponent)) = input.split_once(['e', 'E']) {
        (body, exponent.parse::<i32>().map_err(|_| MathError::Limit)?)
    } else {
        (input, 0)
    };
    let (negative, value) = match body.as_bytes().first() {
        Some(b'-') => (true, &body[1..]),
        Some(b'+') => (false, &body[1..]),
        _ => (false, body),
    };
    let (whole, fraction) = value.split_once('.').unwrap_or((value, ""));
    if whole.len() + fraction.len() > 128 || exponent.unsigned_abs() > 256 {
        return Err(MathError::Limit);
    }
    let all = format!("{whole}{fraction}");
    if all.is_empty() || !all.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(MathError::InvalidInput);
    }
    let value = BigInt::parse_bytes(all.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let numerator = if negative { -value } else { value };
    let scale = exponent - fraction.len() as i32;
    let factor = BigInt::from(10).pow(scale.unsigned_abs());
    checked(if scale >= 0 {
        Rational::from_integer(numerator * factor)
    } else {
        Rational::new(numerator, factor)
    })
}

pub(super) fn binding(input: &str) -> Checked<Rational> {
    if input.len() > 256 {
        return Err(MathError::Limit);
    }
    let input = input.trim();
    let Some((left, right)) = input.split_once('/') else {
        return decimal(input);
    };
    let denominator = decimal(right.trim())?;
    if denominator.is_zero() {
        return Err(MathError::Domain);
    }
    checked(decimal(left.trim())? / denominator)
}

pub(super) fn variable(name: &str) -> Option<u8> {
    NAMES
        .iter()
        .position(|item| *item == name)
        .and_then(|index| index.try_into().ok())
}

struct Parser<'a> {
    tokens: Vec<(Token, &'a str)>,
    index: usize,
}

impl<'a> Parser<'a> {
    fn scan(text: &'a str) -> Checked<Self> {
        if text.len() > 4096 {
            return Err(MathError::Limit);
        }
        let mut index = 0;
        let mut tokens = Vec::new();
        while let Some(character) = text[index..].chars().next() {
            let start = index;
            index += character.len_utf8();
            if character.is_whitespace() {
                continue;
            }
            if tokens.len() == 256 {
                return Err(MathError::Limit);
            }
            let token = match character {
                '0'..='9' | '.' => {
                    index = number_end(text.as_bytes(), start);
                    Token::Number
                }
                '+' => Token::Add,
                '-' | '−' => Token::Sub,
                '*' | '×' | '·' => Token::Mul,
                '/' | '÷' => Token::Div,
                '^' => Token::Power,
                '(' => Token::Open,
                ')' => Token::Close,
                'x' | 'y' | 'z' => {
                    Token::Var(variable(&text[start..index]).ok_or(MathError::InvalidInput)?)
                }
                letter if letter.is_ascii_alphabetic() => {
                    while text
                        .as_bytes()
                        .get(index)
                        .is_some_and(u8::is_ascii_alphabetic)
                    {
                        index += 1;
                    }
                    Token::Function(match &text[start..index] {
                        "sin" => Function::Sin,
                        "cos" => Function::Cos,
                        "exp" => Function::Exp,
                        "ln" => Function::Ln,
                        "abs" => Function::Abs,
                        _ => return Err(MathError::Unsupported),
                    })
                }
                _ => return Err(MathError::InvalidInput),
            };
            tokens.push((token, &text[start..index]));
        }
        Ok(Self { tokens, index: 0 })
    }

    fn peek(&self) -> (Token, &'a str) {
        self.tokens
            .get(self.index)
            .copied()
            .unwrap_or((Token::End, ""))
    }

    fn take(&mut self) -> (Token, &'a str) {
        let token = self.peek();
        self.index += 1;
        token
    }

    fn parentheses(&mut self, depth: u8) -> Checked<Expr> {
        let expression = self.expression(0, depth + 1)?;
        if !matches!(self.take().0, Token::Close) {
            return Err(MathError::InvalidInput);
        }
        Ok(expression)
    }

    fn expression(&mut self, precedence: u8, depth: u8) -> Checked<Expr> {
        if depth > 32 {
            return Err(MathError::Limit);
        }
        let mut left = match self.take() {
            (Token::Number, text) => Expr::Num(decimal(text)?),
            (Token::Var(index), _) => Expr::Var(index),
            (Token::Add, _) => self.expression(5, depth + 1)?,
            (Token::Sub, _) => Expr::Mul(vec![num(-1), self.expression(5, depth + 1)?]),
            (Token::Open, _) => self.parentheses(depth)?,
            (Token::Function(function), _) => {
                if !matches!(self.take().0, Token::Open) {
                    return Err(MathError::InvalidInput);
                }
                Expr::Call(function, Box::new(self.parentheses(depth)?))
            }
            _ => return Err(MathError::InvalidInput),
        };
        loop {
            let (operation, lower, higher, explicit) = match self.peek().0 {
                Token::Add => (Token::Add, 1, 2, true),
                Token::Sub => (Token::Sub, 1, 2, true),
                Token::Mul => (Token::Mul, 3, 4, true),
                Token::Div => (Token::Div, 3, 4, true),
                Token::Power => (Token::Power, 7, 7, true),
                Token::Var(_) | Token::Open | Token::Function(_) => (Token::Mul, 3, 4, false),
                _ => break,
            };
            if lower < precedence {
                break;
            }
            if explicit {
                self.take();
            }
            let right = self.expression(higher, depth + 1)?;
            left = match operation {
                Token::Add => Expr::Add(vec![left, right]),
                Token::Sub => Expr::Add(vec![left, Expr::Mul(vec![num(-1), right])]),
                Token::Mul => Expr::Mul(vec![left, right]),
                Token::Div => Expr::Mul(vec![left, Expr::Pow(Box::new(right), -1)]),
                Token::Power => {
                    if right.variables() != 0 {
                        return Err(MathError::Unsupported);
                    }
                    guards(&right, false)?;
                    let right = right.normalize()?;
                    let value = right
                        .fraction()
                        .filter(|item| item.is_integer())
                        .ok_or(MathError::Unsupported)?;
                    let exponent = value
                        .to_integer()
                        .to_i16()
                        .filter(|degree| degree.unsigned_abs() <= 32)
                        .ok_or(MathError::Limit)?;
                    Expr::Pow(Box::new(left), exponent)
                }
                _ => unreachable!(),
            };
        }
        Ok(left)
    }
}

pub(super) fn parse(text: &str) -> Checked<Expr> {
    let mut parser = Parser::scan(text)?;
    let expression = parser.expression(0, 0)?;
    if !matches!(parser.peek().0, Token::End) {
        return Err(MathError::InvalidInput);
    }
    expression.bounded()
}
