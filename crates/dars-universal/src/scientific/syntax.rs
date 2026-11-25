use super::MathError;

const MAX_INPUT_BYTES: usize = 4096;
const MAX_TOKENS: usize = 256;
const MAX_PARSE_DEPTH: usize = 40;

#[derive(Clone, Copy, PartialEq)]
enum Token<'a> {
    Number(&'a str),
    Name(&'a str),
    Add,
    Sub,
    Mul,
    Div,
    Power,
    Factorial,
    Degrees,
    Radical,
    Open,
    Close,
    Comma,
    End,
}

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Binary {
    Add,
    Sub,
    Mul,
    Div,
    Power,
}

#[derive(PartialEq)]
pub(super) enum Expr<'a> {
    Number(&'a str),
    Name(&'a str),
    Neg(Box<Self>),
    Binary(Binary, Box<Self>, Box<Self>),
    Factorial(Box<Self>),
    Degrees(Box<Self>),
    Call(&'a str, Box<Self>, Option<Box<Self>>),
}

impl Expr<'_> {
    pub(super) fn normalized(&self) -> String {
        match self {
            Self::Number(s) => s.to_ascii_lowercase(),
            Self::Name(s) => s.to_ascii_lowercase(),
            Self::Neg(value) => format!("(-{})", value.normalized()),
            Self::Binary(op, left, right) => {
                let symbol = match op {
                    Binary::Add => '+',
                    Binary::Sub => '-',
                    Binary::Mul => '*',
                    Binary::Div => '/',
                    Binary::Power => '^',
                };
                format!("({}{symbol}{})", left.normalized(), right.normalized())
            }
            Self::Factorial(value) => format!("{}!", value.normalized()),
            Self::Degrees(value) => format!("{}°", value.normalized()),
            Self::Call(name, left, right) => match right {
                Some(right) => format!(
                    "{}({},{})",
                    name.to_ascii_lowercase(),
                    left.normalized(),
                    right.normalized()
                ),
                None => format!("{}({})", name.to_ascii_lowercase(), left.normalized()),
            },
        }
    }

    pub(super) fn formula(&self) -> Option<&'static str> {
        let Self::Call(name, _, _) = self else {
            return None;
        };
        match name.to_ascii_lowercase().as_str() {
            "log" | "log2" | "log10" => Some("log_b(x)=ln(x)/ln(b)"),
            "root" => Some("root(x,n)=x^(1/n), with the selected domain"),
            "abs" => Some("|a+bi|=sqrt(a^2+b^2)"),
            _ => None,
        }
    }
}

fn number_end(input: &[u8], mut end: usize) -> usize {
    while input.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    if input.get(end) == Some(&b'.') {
        end += 1;
        while input.get(end).is_some_and(u8::is_ascii_digit) {
            end += 1;
        }
    }
    if matches!(input.get(end), Some(b'e' | b'E')) {
        let mut cursor = end + 1;
        if matches!(input.get(cursor), Some(b'+' | b'-')) {
            cursor += 1;
        }
        if input.get(cursor).is_some_and(u8::is_ascii_digit) {
            end = cursor + 1;
            while input.get(end).is_some_and(u8::is_ascii_digit) {
                end += 1;
            }
        }
    }
    end
}

fn tokenize(input: &str) -> Result<Vec<Token<'_>>, MathError> {
    if input.len() > MAX_INPUT_BYTES {
        return Err(MathError::Limit);
    }
    let mut tokens = Vec::new();
    let mut start = 0;
    while let Some(character) = input[start..].chars().next() {
        let mut end = start + character.len_utf8();
        if character.is_whitespace() {
            start = end;
            continue;
        }
        if tokens.len() == MAX_TOKENS {
            return Err(MathError::Limit);
        }
        let token = match character {
            '0'..='9' | '.' => {
                end = number_end(input.as_bytes(), start);
                Token::Number(&input[start..end])
            }
            'a'..='z' | 'A'..='Z' => {
                while input
                    .as_bytes()
                    .get(end)
                    .is_some_and(u8::is_ascii_alphanumeric)
                {
                    end += 1;
                }
                let name = &input[start..end];
                if name.eq_ignore_ascii_case("log") && input[end..].starts_with('₂') {
                    end += '₂'.len_utf8();
                    Token::Name("log2")
                } else if name.eq_ignore_ascii_case("log") && input[end..].starts_with("₁₀") {
                    end += "₁₀".len();
                    Token::Name("log10")
                } else {
                    Token::Name(name)
                }
            }
            'π' | 'Π' => Token::Name("pi"),
            'τ' | 'Τ' => Token::Name("tau"),
            '+' => Token::Add,
            '-' | '−' => Token::Sub,
            '*' | '×' | '·' => Token::Mul,
            '/' | '÷' => Token::Div,
            '^' => Token::Power,
            '!' => Token::Factorial,
            '°' => Token::Degrees,
            '√' => Token::Radical,
            '(' => Token::Open,
            ')' => Token::Close,
            ',' => Token::Comma,
            _ => return Err(MathError::InvalidInput),
        };
        tokens.push(token);
        start = end;
    }
    tokens.push(Token::End);
    Ok(tokens)
}

struct Parser<'a> {
    tokens: Vec<Token<'a>>,
    cursor: usize,
}

impl<'a> Parser<'a> {
    fn peek(&self) -> Token<'a> {
        self.tokens.get(self.cursor).copied().unwrap_or(Token::End)
    }

    fn take(&mut self) -> Token<'a> {
        let token = self.peek();
        self.cursor += 1;
        token
    }

    fn expect(&mut self, token: Token<'a>) -> Result<(), MathError> {
        if self.take() == token {
            Ok(())
        } else {
            Err(MathError::InvalidInput)
        }
    }

    fn primary(&mut self, depth: usize) -> Result<Expr<'a>, MathError> {
        Ok(match self.take() {
            Token::Number(s) => Expr::Number(s),
            Token::Name(name) if self.peek() == Token::Open => {
                self.take();
                let first = Box::new(self.expression(0, depth + 1)?);
                let second = if self.peek() == Token::Comma {
                    self.take();
                    Some(Box::new(self.expression(0, depth + 1)?))
                } else {
                    None
                };
                self.expect(Token::Close)?;
                Expr::Call(name, first, second)
            }
            Token::Name(name) => Expr::Name(name),
            Token::Sub => Expr::Neg(Box::new(self.expression(5, depth + 1)?)),
            Token::Add => self.expression(5, depth + 1)?,
            Token::Radical => Expr::Call("sqrt", Box::new(self.expression(8, depth + 1)?), None),
            Token::Open => {
                let value = self.expression(0, depth + 1)?;
                self.expect(Token::Close)?;
                value
            }
            _ => return Err(MathError::InvalidInput),
        })
    }

    fn expression(&mut self, precedence: u8, depth: usize) -> Result<Expr<'a>, MathError> {
        if depth > MAX_PARSE_DEPTH {
            return Err(MathError::Limit);
        }
        let mut left = self.primary(depth)?;
        loop {
            let next = self.peek();
            if precedence <= 9 && matches!(next, Token::Factorial | Token::Degrees) {
                self.take();
                left = if next == Token::Factorial {
                    if matches!(left, Expr::Factorial(_)) {
                        return Err(MathError::InvalidInput);
                    }
                    Expr::Factorial(Box::new(left))
                } else {
                    Expr::Degrees(Box::new(left))
                };
                continue;
            }
            let (op, lb, rb, consume) = match next {
                Token::Add => (Binary::Add, 1, 2, true),
                Token::Sub => (Binary::Sub, 1, 2, true),
                Token::Mul => (Binary::Mul, 3, 4, true),
                Token::Div => (Binary::Div, 3, 4, true),
                Token::Power => (Binary::Power, 7, 7, true),
                Token::Name(_) | Token::Open | Token::Radical => (Binary::Mul, 3, 4, false),
                _ => break,
            };
            if lb < precedence {
                break;
            }
            if consume {
                self.take();
            }
            let right = self.expression(rb, depth + 1)?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
        Ok(left)
    }
}

pub(super) fn parse(input: &str) -> Result<Expr<'_>, MathError> {
    let mut parser = Parser {
        tokens: tokenize(input)?,
        cursor: 0,
    };
    let expression = parser.expression(0, 0)?;
    parser.expect(Token::End)?;
    Ok(expression)
}
