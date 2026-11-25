use super::MathError;
use super::polynomial::{Coefficient, MAX_DEGREE, Poly, Rational, checked_coefficient};
use num_bigint::BigInt;
use num_traits::ToPrimitive;

const MAX_INPUT_BYTES: usize = 4096;
const MAX_TOKENS: usize = 256;
const MAX_DEPTH: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Relation {
    Equal,
    Unequal,
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
}

impl Relation {
    pub(super) fn accepts(self, order: std::cmp::Ordering) -> bool {
        use std::cmp::Ordering::{Equal, Greater, Less};
        match self {
            Self::Equal => order == Equal,
            Self::Unequal => order != Equal,
            Self::Less => order == Less,
            Self::LessEqual => order != Greater,
            Self::Greater => order == Greater,
            Self::GreaterEqual => order != Less,
        }
    }
}

#[derive(Clone, Copy, Debug)]
enum Token<'a> {
    Number(&'a str),
    Variable(usize),
    Add,
    Sub,
    Mul,
    Div,
    Power,
    Open,
    Close,
    Relation(Relation),
    End,
}

pub(super) fn variable(character: char) -> Option<usize> {
    match character.to_ascii_lowercase() {
        'x' => Some(0),
        'y' => Some(1),
        'z' => Some(2),
        _ => None,
    }
}

fn digits_end(input: &[u8], mut end: usize) -> usize {
    while input.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    end
}

fn number_end(input: &[u8], start: usize) -> usize {
    let mut end = digits_end(input, start);
    if input.get(end) == Some(&b'.') {
        end = digits_end(input, end + 1);
    }
    if matches!(input.get(end), Some(b'e' | b'E')) {
        let mut exponent = end + 1;
        if matches!(input.get(exponent), Some(b'+' | b'-')) {
            exponent += 1;
        }
        let after = digits_end(input, exponent);
        if after != exponent {
            return after;
        }
    }
    end
}

fn number(text: &str) -> Result<Coefficient, MathError> {
    let (base, exponent) = match text.split_once(['e', 'E']) {
        Some((value, exponent)) => (
            value,
            exponent.parse::<i32>().map_err(|_| MathError::Limit)?,
        ),
        None => (text, 0),
    };
    let (whole, fraction) = base.split_once('.').unwrap_or((base, ""));
    if whole.is_empty() && fraction.is_empty() {
        return Err(MathError::InvalidInput);
    }
    if whole.len() + fraction.len() > 128 || exponent.unsigned_abs() > 256 {
        return Err(MathError::Limit);
    }
    let digits = format!("{whole}{fraction}");
    let numerator = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(MathError::InvalidInput)?;
    let scale = exponent - fraction.len() as i32;
    let factor = BigInt::from(10u8).pow(scale.unsigned_abs());
    checked_coefficient(if scale >= 0 {
        Coefficient::from_integer(numerator * factor)
    } else {
        Coefficient::new(numerator, factor)
    })
}

fn scan(input: &str) -> Result<Vec<Token<'_>>, MathError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(MathError::Limit);
    }
    let mut result = Vec::new();
    let mut offset = 0;
    while let Some(next) = input[offset..].chars().next() {
        let start = offset;
        offset += next.len_utf8();
        if next.is_whitespace() {
            continue;
        }
        if result.len() == MAX_TOKENS {
            return Err(MathError::Limit);
        }
        let token = match next {
            '.' | '0'..='9' => {
                offset = number_end(input.as_bytes(), start);
                Token::Number(&input[start..offset])
            }
            '+' => Token::Add,
            '-' | '−' => Token::Sub,
            '*' | '×' | '·' => Token::Mul,
            '/' | '÷' => Token::Div,
            '^' => Token::Power,
            '(' => Token::Open,
            ')' => Token::Close,
            '<' | '>' | '!' => {
                let equal = input.as_bytes().get(offset) == Some(&b'=');
                if equal {
                    offset += 1;
                }
                Token::Relation(match (next, equal) {
                    ('<', false) => Relation::Less,
                    ('<', true) => Relation::LessEqual,
                    ('>', false) => Relation::Greater,
                    ('>', true) => Relation::GreaterEqual,
                    ('!', true) => Relation::Unequal,
                    _ => return Err(MathError::InvalidInput),
                })
            }
            '≤' => Token::Relation(Relation::LessEqual),
            '≥' => Token::Relation(Relation::GreaterEqual),
            '≠' => Token::Relation(Relation::Unequal),
            '=' => Token::Relation(Relation::Equal),
            character => {
                if let Some(index) = variable(character) {
                    Token::Variable(index)
                } else if character.is_alphabetic() || character == '√' {
                    return Err(MathError::Unsupported);
                } else {
                    return Err(MathError::InvalidInput);
                }
            }
        };
        result.push(token);
    }
    result.push(Token::End);
    Ok(result)
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    offset: usize,
}

impl<'a> Parser<'a> {
    fn new(text: &'a str) -> Result<Self, MathError> {
        Ok(Self {
            tokens: scan(text)?,
            offset: 0,
        })
    }

    fn peek(&self) -> Token<'a> {
        self.tokens.get(self.offset).copied().unwrap_or(Token::End)
    }

    fn pop(&mut self) -> Token<'a> {
        let next = self.peek();
        self.offset += 1;
        next
    }

    fn expression(&mut self, precedence: u8, depth: usize) -> Result<Rational, MathError> {
        if depth > MAX_DEPTH {
            return Err(MathError::Limit);
        }
        let mut left = match self.pop() {
            Token::Number(value) => Rational::value(number(value)?),
            Token::Variable(index) => Rational::polynomial(Poly::variable(index)),
            Token::Sub => self.expression(5, depth + 1)?.neg(),
            Token::Add => self.expression(5, depth + 1)?,
            Token::Open => {
                let value = self.expression(0, depth + 1)?;
                if !matches!(self.pop(), Token::Close) {
                    return Err(MathError::InvalidInput);
                }
                value
            }
            _ => return Err(MathError::InvalidInput),
        };
        loop {
            let (operator, lower, upper, consume) = match self.peek() {
                Token::Add => (Token::Add, 1, 2, true),
                Token::Sub => (Token::Sub, 1, 2, true),
                Token::Mul => (Token::Mul, 3, 4, true),
                Token::Div => (Token::Div, 3, 4, true),
                Token::Power => (Token::Power, 7, 7, true),
                Token::Variable(_) | Token::Open => (Token::Mul, 3, 4, false),
                _ => break,
            };
            if lower < precedence {
                break;
            }
            if consume {
                self.pop();
            }
            let right = self.expression(upper, depth + 1)?;
            left = match operator {
                Token::Add => left.sum(right, false)?,
                Token::Sub => left.sum(right, true)?,
                Token::Mul => left.mul(right)?,
                Token::Div => left.div(right)?,
                Token::Power => {
                    let exponent = right
                        .constant()
                        .filter(Coefficient::is_integer)
                        .ok_or(MathError::Unsupported)?
                        .to_integer()
                        .to_i8()
                        .filter(|value| value.unsigned_abs() <= MAX_DEGREE)
                        .ok_or(MathError::Limit)?;
                    left.pow(right, exponent)?
                }
                _ => unreachable!("checked binary token"),
            };
        }
        Ok(left)
    }

    fn finish(&mut self) -> Result<(), MathError> {
        if matches!(self.pop(), Token::End) {
            Ok(())
        } else {
            Err(MathError::InvalidInput)
        }
    }
}

pub(super) fn expression(input: &str) -> Result<Rational, MathError> {
    let mut parser = Parser::new(input)?;
    let value = parser.expression(0, 0)?;
    parser.finish()?;
    Ok(value)
}

pub(super) fn relation(input: &str) -> Result<(Rational, Relation, Rational), MathError> {
    let mut parser = Parser::new(input)?;
    let lhs = parser.expression(0, 0)?;
    let Token::Relation(relation) = parser.pop() else {
        return Err(MathError::InvalidInput);
    };
    let rhs = parser.expression(0, 0)?;
    parser.finish()?;
    Ok((lhs, relation, rhs))
}

pub(super) fn assignment(input: &str) -> Result<(usize, Coefficient), MathError> {
    let (name, value) = input.split_once('=').ok_or(MathError::InvalidInput)?;
    let mut chars = name.trim().chars();
    let id = chars
        .next()
        .and_then(variable)
        .ok_or(MathError::InvalidInput)?;
    if chars.next().is_some() {
        return Err(MathError::InvalidInput);
    }
    let value = expression(value)?;
    if value.used != 0 {
        return Err(MathError::Unsupported);
    }
    Ok((id, value.constant().ok_or(MathError::InvalidInput)?))
}
