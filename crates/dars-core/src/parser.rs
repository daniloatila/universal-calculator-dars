use num_bigint::BigInt;
use num_traits::Zero;

use crate::{
    Error,
    arithmetic::{Operator, Rational, Value, power_of_ten},
};

const MAX_BYTES: usize = 4096;
const MAX_LITERAL_DIGITS: usize = 256;
const MAX_NODES: usize = 256;
const MAX_NESTING: usize = 48;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token<'a> {
    Number(&'a str),
    Add,
    Subtract,
    Multiply,
    Divide,
    Power,
    Percent,
    Open,
    Close,
    Comma,
    SquareRoot,
    CubeRoot,
    Root,
    Radical,
    End,
}

struct Lexer<'a> {
    remaining: &'a str,
}

impl<'a> Lexer<'a> {
    fn next(&mut self) -> Result<Token<'a>, Error> {
        self.remaining = self.remaining.trim_start();
        let Some(first) = self.remaining.chars().next() else {
            return Ok(Token::End);
        };

        if first.is_ascii_digit() || first == '.' {
            return self.number();
        }
        if first.is_ascii_alphabetic() {
            let length = self
                .remaining
                .bytes()
                .take_while(u8::is_ascii_alphabetic)
                .count();
            let (name, rest) = self.remaining.split_at(length);
            self.remaining = rest;
            return match name {
                "sqrt" => Ok(Token::SquareRoot),
                "cbrt" => Ok(Token::CubeRoot),
                "root" => Ok(Token::Root),
                _ => Err(Error::InvalidCharacter),
            };
        }

        self.remaining = &self.remaining[first.len_utf8()..];
        match first {
            '+' => Ok(Token::Add),
            '-' | '−' => Ok(Token::Subtract),
            '*' | '×' => Ok(Token::Multiply),
            '/' | '÷' => Ok(Token::Divide),
            '^' => Ok(Token::Power),
            '%' => Ok(Token::Percent),
            '(' => Ok(Token::Open),
            ')' => Ok(Token::Close),
            ',' => Ok(Token::Comma),
            '√' => Ok(Token::Radical),
            _ => Err(Error::InvalidCharacter),
        }
    }

    fn number(&mut self) -> Result<Token<'a>, Error> {
        let length = self
            .remaining
            .bytes()
            .take_while(|byte| byte.is_ascii_digit() || *byte == b'.')
            .count();
        let (literal, rest) = self.remaining.split_at(length);
        self.remaining = rest;
        let separator_count = literal.bytes().filter(|&byte| byte == b'.').count();
        let digits = length - separator_count;
        if separator_count > 1 || digits == 0 {
            return Err(Error::InvalidNumber);
        }
        if digits > MAX_LITERAL_DIGITS {
            return Err(Error::InputLimit);
        }
        Ok(Token::Number(literal))
    }
}

#[derive(PartialEq, Eq)]
pub(crate) enum Expression<'a> {
    Number(&'a str),
    Signed {
        negative: bool,
        inner: Box<Self>,
    },
    Percent(Box<Self>),
    Root {
        radicand: Box<Self>,
        degree: Degree<'a>,
    },
    Binary {
        operator: Operator,
        left: Box<Self>,
        right: Box<Self>,
    },
}

#[derive(PartialEq, Eq)]
pub(crate) enum Degree<'a> {
    Fixed(u32),
    Expression(Box<Expression<'a>>),
}

impl Expression<'_> {
    fn is_relative_percent(&self) -> bool {
        match self {
            Self::Percent(_) => true,
            Self::Signed { inner, .. } => inner.is_relative_percent(),
            _ => false,
        }
    }

    pub(crate) fn evaluate(&self) -> Result<Value, Error> {
        match self {
            Self::Number(literal) => decimal_literal(literal).map(Value::Exact),
            Self::Signed { negative, inner } => {
                let value = inner.evaluate()?;
                Ok(if *negative { value.negate() } else { value })
            }
            Self::Percent(inner) => inner.evaluate()?.percent(),
            Self::Root { radicand, degree } => {
                let value = radicand.evaluate()?;
                let degree = match degree {
                    Degree::Fixed(n) => *n,
                    Degree::Expression(expression) => expression.evaluate()?.root_degree()?,
                };
                value.root(degree)
            }
            Self::Binary {
                operator,
                left,
                right,
            } => {
                let lhs = left.evaluate()?;
                // Equal, valid subexpressions cancel exactly. The relative
                // percentage rule can make the operands numerically unequal.
                if matches!(operator, Operator::Subtract)
                    && left == right
                    && !right.is_relative_percent()
                {
                    return Ok(Value::Exact(Rational::zero()));
                }
                let mut rhs = right.evaluate()?;
                if matches!(operator, Operator::Add | Operator::Subtract)
                    && right.is_relative_percent()
                {
                    rhs = lhs.apply(Operator::Multiply, &rhs)?;
                }
                lhs.apply(*operator, &rhs)
            }
        }
    }
}

fn decimal_literal(literal: &str) -> Result<Rational, Error> {
    let Some((whole, fraction)) = literal.split_once('.') else {
        return BigInt::parse_bytes(literal.as_bytes(), 10)
            .map(Rational::from_integer)
            .ok_or(Error::InvalidNumber);
    };
    let digits = format!("{whole}{fraction}");
    let numerator = BigInt::parse_bytes(digits.as_bytes(), 10).ok_or(Error::InvalidNumber)?;
    Ok(Rational::new(
        numerator,
        power_of_ten(fraction.len() as u32),
    ))
}

struct Parser<'a> {
    lexer: Lexer<'a>,
    current: Token<'a>,
    nodes: usize,
}

impl<'a> Parser<'a> {
    fn advance(&mut self) -> Result<Token<'a>, Error> {
        let previous = self.current;
        self.current = self.lexer.next()?;
        Ok(previous)
    }

    fn node(&mut self, expression: Expression<'a>) -> Result<Expression<'a>, Error> {
        self.nodes += 1;
        if self.nodes > MAX_NODES {
            return Err(Error::ComplexityLimit);
        }
        Ok(expression)
    }

    fn close(&mut self) -> Result<(), Error> {
        if self.current != Token::Close {
            return Err(Error::MissingParenthesis);
        }
        self.advance()?;
        Ok(())
    }

    fn function(&mut self, name: Token<'a>, depth: usize) -> Result<Expression<'a>, Error> {
        if self.current != Token::Open {
            return Err(Error::MissingParenthesis);
        }
        self.advance()?;
        let radicand = Box::new(self.expression(0, depth)?);
        let degree = match name {
            Token::SquareRoot => Degree::Fixed(2),
            Token::CubeRoot => Degree::Fixed(3),
            _ => {
                if self.current != Token::Comma {
                    return Err(Error::UnexpectedToken);
                }
                self.advance()?;
                Degree::Expression(Box::new(self.expression(0, depth)?))
            }
        };
        self.close()?;
        self.node(Expression::Root { radicand, degree })
    }

    fn expression(&mut self, minimum_binding: u8, depth: usize) -> Result<Expression<'a>, Error> {
        if depth >= MAX_NESTING {
            return Err(Error::ComplexityLimit);
        }
        let first = self.advance()?;
        let mut lhs = match first {
            Token::Number(number) => self.node(Expression::Number(number))?,
            Token::Add | Token::Subtract => {
                let inner = Box::new(self.expression(5, depth + 1)?);
                self.node(Expression::Signed {
                    negative: first == Token::Subtract,
                    inner,
                })?
            }
            Token::Open => {
                let grouped = self.expression(0, depth + 1)?;
                self.close()?;
                grouped
            }
            Token::SquareRoot | Token::CubeRoot | Token::Root => self.function(first, depth + 1)?,
            Token::Radical => {
                let radicand = Box::new(self.expression(8, depth + 1)?);
                self.node(Expression::Root {
                    radicand,
                    degree: Degree::Fixed(2),
                })?
            }
            _ => return Err(Error::UnexpectedToken),
        };

        loop {
            if self.current == Token::Percent && minimum_binding <= 7 {
                self.advance()?;
                lhs = self.node(Expression::Percent(Box::new(lhs)))?;
                continue;
            }
            let (operator, left, right) = match self.current {
                Token::Add => (Operator::Add, 1, 2),
                Token::Subtract => (Operator::Subtract, 1, 2),
                Token::Multiply => (Operator::Multiply, 3, 4),
                Token::Divide => (Operator::Divide, 3, 4),
                Token::Power => (Operator::Power, 6, 6),
                _ => break,
            };
            if left < minimum_binding {
                break;
            }
            self.advance()?;
            let rhs = self.expression(right, depth + 1)?;
            lhs = self.node(Expression::Binary {
                operator,
                left: Box::new(lhs),
                right: Box::new(rhs),
            })?;
        }
        Ok(lhs)
    }
}

pub(crate) fn parse(input: &str) -> Result<Expression<'_>, Error> {
    if input.len() > MAX_BYTES {
        return Err(Error::InputLimit);
    }
    let mut lexer = Lexer { remaining: input };
    let first = lexer.next()?;
    if first == Token::End {
        return Err(Error::EmptyExpression);
    }
    let mut parser = Parser {
        lexer,
        current: first,
        nodes: 0,
    };
    let expression = parser.expression(0, 0)?;
    if parser.current != Token::End {
        return Err(Error::UnexpectedToken);
    }
    Ok(expression)
}
