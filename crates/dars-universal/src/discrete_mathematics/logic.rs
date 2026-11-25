use super::integer::Checked;
use crate::MathError;
use std::collections::{BTreeMap, BTreeSet};

const MAX_VARIABLES: usize = 8;
const MAX_TOKENS: usize = 256;
const MAX_DEPTH: usize = 32;

#[derive(Clone, Copy)]
enum Operator {
    And,
    Xor,
    Or,
    Implies,
    Iff,
}

impl Operator {
    fn precedence(self) -> (u8, u8) {
        match self {
            Self::And => (10, 11),
            Self::Xor => (8, 9),
            Self::Or => (6, 7),
            Self::Implies => (4, 4),
            Self::Iff => (2, 3),
        }
    }

    fn apply(self, a: bool, b: bool) -> bool {
        match self {
            Self::And => a && b,
            Self::Xor => a ^ b,
            Self::Or => a || b,
            Self::Implies => !a || b,
            Self::Iff => a == b,
        }
    }
}

#[derive(Clone, Copy)]
enum Token<'a> {
    Literal(bool),
    Variable(&'a str),
    Not,
    Binary(Operator),
    Open,
    Close,
    End,
}

enum Expression<'a> {
    Literal(bool),
    Variable(&'a str),
    Not(Box<Self>),
    Binary(Operator, Box<Self>, Box<Self>),
}

impl Expression<'_> {
    fn evaluate(&self, values: &BTreeMap<&str, bool>) -> bool {
        match self {
            Self::Literal(value) => *value,
            Self::Variable(name) => values[name],
            Self::Not(argument) => !argument.evaluate(values),
            Self::Binary(operator, a, b) => operator.apply(a.evaluate(values), b.evaluate(values)),
        }
    }
}

fn boolean(word: &str) -> Option<bool> {
    if word.eq_ignore_ascii_case("true") || word == "1" {
        Some(true)
    } else if word.eq_ignore_ascii_case("false") || word == "0" {
        Some(false)
    } else {
        None
    }
}

fn identifier(input: &str) -> Checked<Token<'_>> {
    use Operator::{And, Iff, Implies, Or, Xor};
    if matches!(input, "constructor" | "prototype") {
        return Err(MathError::InvalidInput);
    }
    let token = match input.to_ascii_lowercase().as_str() {
        "not" => Token::Not,
        "and" => Token::Binary(And),
        "xor" => Token::Binary(Xor),
        "or" => Token::Binary(Or),
        "implies" => Token::Binary(Implies),
        "iff" => Token::Binary(Iff),
        "true" => Token::Literal(true),
        "false" => Token::Literal(false),
        _ if input.len() > 16 => return Err(MathError::Limit),
        _ => Token::Variable(input),
    };
    Ok(token)
}

fn scan(input: &str) -> Checked<Vec<Token<'_>>> {
    use Operator::{And, Iff, Implies, Or, Xor};
    let mut index = 0;
    let mut tokens = Vec::new();
    while let Some(character) = input[index..].chars().next() {
        let start = index;
        index += character.len_utf8();
        if character.is_whitespace() {
            continue;
        }
        if tokens.len() == MAX_TOKENS {
            return Err(MathError::Limit);
        }
        let full = &input[start..];
        let token = match character {
            '(' => Token::Open,
            ')' => Token::Close,
            '!' | '¬' => Token::Not,
            '0' | '1' => Token::Literal(character == '1'),
            '^' | '⊕' => Token::Binary(Xor),
            '∧' => Token::Binary(And),
            '∨' => Token::Binary(Or),
            '→' | '⇒' => Token::Binary(Implies),
            '↔' | '⇔' => Token::Binary(Iff),
            '<' if full.starts_with("<->") => {
                index += 2;
                Token::Binary(Iff)
            }
            '-' if full.starts_with("->") => {
                index += 1;
                Token::Binary(Implies)
            }
            '&' if full.starts_with("&&") => {
                index += 1;
                Token::Binary(And)
            }
            '|' if full.starts_with("||") => {
                index += 1;
                Token::Binary(Or)
            }
            c if c.is_ascii_alphabetic() => {
                while input
                    .as_bytes()
                    .get(index)
                    .is_some_and(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
                {
                    index += 1;
                }
                identifier(&input[start..index])?
            }
            _ => return Err(MathError::InvalidInput),
        };
        tokens.push(token);
    }
    Ok(tokens)
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    variables: BTreeSet<&'a str>,
    index: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Token<'a> {
        self.tokens.get(self.index).copied().unwrap_or(Token::End)
    }

    fn take(&mut self) -> Token<'a> {
        let token = self.peek();
        self.index += 1;
        token
    }

    fn parse_expression(&mut self, minimum: u8, depth: usize) -> Checked<Expression<'a>> {
        if depth > MAX_DEPTH {
            return Err(MathError::Limit);
        }
        let mut left = match self.take() {
            Token::Literal(value) => Expression::Literal(value),
            Token::Variable(name) => {
                self.variables.insert(name);
                if self.variables.len() > MAX_VARIABLES {
                    return Err(MathError::Limit);
                }
                Expression::Variable(name)
            }
            Token::Not => Expression::Not(Box::new(self.parse_expression(11, depth + 1)?)),
            Token::Open => {
                let expression = self.parse_expression(0, depth + 1)?;
                if !matches!(self.take(), Token::Close) {
                    return Err(MathError::InvalidInput);
                }
                expression
            }
            _ => return Err(MathError::InvalidInput),
        };
        while let Token::Binary(operator) = self.peek() {
            let (lower, upper) = operator.precedence();
            if lower < minimum {
                break;
            }
            self.take();
            let right = self.parse_expression(upper, depth + 1)?;
            left = Expression::Binary(operator, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
}

fn parse(input: &str) -> Checked<(Expression<'_>, BTreeSet<&str>)> {
    let mut parser = Parser {
        tokens: scan(input)?,
        variables: BTreeSet::new(),
        index: 0,
    };
    let expression = parser.parse_expression(0, 0)?;
    if !matches!(parser.peek(), Token::End) {
        return Err(MathError::InvalidInput);
    }
    Ok((expression, parser.variables))
}

fn split_assignment(input: &str) -> Checked<(&str, Option<&str>)> {
    let bytes = input.as_bytes();
    let mut split = input
        .match_indices('|')
        .map(|(index, _)| index)
        .filter(|&index| {
            (index == 0 || bytes[index - 1] != b'|') && bytes.get(index + 1) != Some(&b'|')
        });
    let first = split.next();
    if split.next().is_some() {
        return Err(MathError::InvalidInput);
    }
    Ok(first.map_or((input, None), |index| {
        (&input[..index], Some(&input[index + 1..]))
    }))
}

pub(super) struct LogicAnswer {
    pub(super) result: String,
    pub(super) variables: BTreeMap<String, String>,
}

pub(super) fn evaluate(input: &str) -> Checked<LogicAnswer> {
    let (expression, assignment) = split_assignment(input)?;
    let (expression, variables) = parse(expression)?;
    let mut environment = BTreeMap::new();
    if let Some(assignment) = assignment {
        if assignment.trim().is_empty() {
            return Err(MathError::InvalidInput);
        }
        for item in assignment.split_whitespace() {
            let (name, value) = item.split_once('=').ok_or(MathError::InvalidInput)?;
            let value = boolean(value).ok_or(MathError::InvalidInput)?;
            if !variables.contains(name) || environment.insert(name, value).is_some() {
                return Err(MathError::InvalidInput);
            }
        }
    }
    if environment.len() != variables.len() {
        return Err(MathError::InvalidInput);
    }
    let result = expression.evaluate(&environment).to_string();
    let variables = environment
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value.to_string()))
        .collect();
    Ok(LogicAnswer { result, variables })
}

pub(super) fn truth_table(input: &str) -> Checked<LogicAnswer> {
    let (expression, variables) = parse(input)?;
    let names: Vec<_> = variables.into_iter().collect();
    let width = names.len();
    let mut rows = Vec::with_capacity(1 << width);
    for bits in 0..1usize << width {
        let row: Vec<_> = (0..width)
            .map(|index| (bits >> (width - index - 1)) & 1 != 0)
            .collect();
        let environment = names.iter().copied().zip(row.iter().copied()).collect();
        let mut output: Vec<_> = row.into_iter().map(u8::from).collect();
        output.push(u8::from(expression.evaluate(&environment)));
        rows.push(output);
    }
    let result = format!(
        r#"{{"variables":{},"rows":{}}}"#,
        serde_json::to_string(&names).map_err(|_| MathError::NoConvergence)?,
        serde_json::to_string(&rows).map_err(|_| MathError::NoConvergence)?,
    );
    let variables = names
        .into_iter()
        .map(|name| (name.to_owned(), "boolean variable".to_owned()))
        .collect();
    Ok(LogicAnswer { result, variables })
}
