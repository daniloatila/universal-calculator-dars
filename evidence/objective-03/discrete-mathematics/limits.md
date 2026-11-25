# Discrete Mathematics methods and bounds

[Português brasileiro](limits.pt-BR.md)

The module accepts signed decimal integers over the existing Rust arbitrary-precision representation. Combinatorics and sequence indices use nonnegative integers. Set names and propositional variables use their separate finite grammars. Results preserve integer values exactly, including values beyond machine precision. The proof retains the submitted mathematical representation for replay. [Integer parser and arithmetic](../../../crates/dars-universal/src/discrete_mathematics/integer.rs) · [Operation and proof contract](../../../crates/dars-universal/src/discrete_mathematics.rs)

| Operation | Input and result |
| --- | --- |
| Permutations | `n` returns `n!`. With `repetition=true`, enter the multiplicities of a multiset, as in `2 2 1`. The result counts distinct orderings. |
| Arrangements | `n k` counts ordered selections without repetition by default. With `repetition=true`, each of the `k` positions can select any of the `n` elements. |
| Combinations | `n k` counts unordered selections. With `repetition=true`, it counts multisets of size `k` over `n` types. Without repetition, a selection larger than the population gives zero. An empty selection gives one for both counting operations. |
| Finite sets | Union, intersection, directional difference, symmetric difference and inclusive subset. Separate two whitespace-delimited sets with one vertical bar. Empty sides represent empty sets. |
| Logic and truth tables | Evaluate a Boolean expression with complete bindings, or build its complete truth table. Each row of the table contains the input bits followed by the output bit. |
| Prime | A signed integer. Returns `not_prime` below 2, an exact `prime` or `composite` within the unsigned 64-bit range, or a bounded fixed-base test result for larger positive integers. |
| Factor | A nonzero signed integer of magnitude up to `2^64-1`. Returns an ordered list of prime factors with multiplicity, with initial `-1` for negative input. The empty product represents 1. |
| GCD and LCM | Between 2 and 32 signed integers. Results are nonnegative. The GCD of all zeros is zero. Any zero operand makes the LCM zero. |
| Modular arithmetic | `mode` accepts `remainder` by default, `add`, `mul`, `pow` or `inverse`. Remainder and inverse take `a m`. The other modes take `a b m`, with `b` interpreted as the exponent for `pow`. Results are least nonnegative residues. |
| Sequences | `mode` accepts `fibonacci` by default, `lucas`, `arithmetic` or `geometric`. Fibonacci and Lucas take `n`. Arithmetic and geometric sequences take first term, difference or ratio, and index. Indices start at zero. |

## Sets and propositional grammar

Each set atom is a signed integer or a case-sensitive name matching `[A-Za-z][A-Za-z0-9_-]{0,31}`. Duplicates collapse by value, so `01` and `+1` are a single integer. Result arrays list integers in numerical order, then names in ASCII order. For example, `3 1 a | 2 a` under union gives `[1,2,3,"a"]`. [Finite sets](../../../crates/dars-universal/src/discrete_mathematics/sets.rs)

Propositional variables match `[A-Za-z][A-Za-z0-9_]{0,15}) and are case-sensitive. The exact lowercase names `constructor` and `prototype` are reserved by proof validation and return `invalid_input`. Literals are `true`, `false`, `1` and `0`. Textual Boolean operator names and constants are case-insensitive. Parentheses override the following precedence, from strongest to weakest.

1. Negation `!`, `¬` or `NOT`.
2. Conjunction `&&`, `∧` or `AND`.
3. Exclusive disjunction `^`, `⊕` or `XOR`.
4. Inclusive disjunction `||`, `∨` or `OR`.
5. Implication `->`, `→`, `⇒` or `IMPLIES`, which associates to the right.
6. Equivalence `<->`, `↔`, `⇔` or `IFF`.

A logic request with variables has one binding per name, as in `A && !B | A=1 B=0`. Unused, repeated or missing bindings are invalid. Constant expressions can omit bindings. Truth tables take the expression alone, sort columns by variable name and enumerate rows with false before true. A constant has one row and no input columns. The parser builds a typed Boolean expression tree with a fixed set of operators. [Typed parser and evaluator](../../../crates/dars-universal/src/discrete_mathematics/logic.rs) · [Truth tables](https://openstax.org/books/contemporary-mathematics/pages/2-3-constructing-truth-tables) · [Implication and equivalence](https://openstax.org/books/contemporary-mathematics/pages/2-4-truth-tables-for-the-conditional-and-biconditional)

## Primality, factorization and arithmetic

Primality uses trial checks for small primes followed by the strong Miller–Rabin test with the first 12 prime bases, 2 through 37. Sorenson and Webster determined the first common strong pseudoprime for those bases, which is above `2^64-1`. DARS uses the deterministic classification for values within that unsigned range. For larger positive inputs up to 1,024 bits, passing all 12 checks returns `probable_prime` with approximate classification. A divisor or failed strong test still proves compositeness and is recorded in the proof. The fixed bases supply no random-base probability estimate. Numerical precision, tolerance and error-bound fields remain empty. [Sorenson and Webster](https://arxiv.org/abs/1509.00864) · [Primality implementation](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

After removing small prime factors, factorization uses a bounded Pollard rho search with Brent batching and a fixed restart schedule. It splits composite residuals, checks remaining factors with the deterministic primality procedure and recomposes the input magnitude before returning the sorted list. The limits are 600,000 total polynomial steps, 120,000 per attempt, 12 candidate restart constants and 64 steps per batched GCD. Search exhaustion returns `no_convergence`. The output is a complete verified factorization when successful. [Brent's factorization paper](https://maths-people.anu.edu.au/~brent/pub/pub051.html) · [Bounded factorization](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

GCD uses Euclidean reduction. LCM divides by the GCD before multiplying. Modular inverse uses the extended Euclidean algorithm and requires modulus greater than one and coprimality. All modular operations require a positive modulus. A negative modular exponent first applies the inverse with these same conditions. The exponent zero uses the multiplicative identity reduced modulo `m`. [Euclidean algorithm](https://math.dartmouth.edu/~trs/PreTeXtProjects/pretext-devel/sample-book/html-orig/section-division-algorithm.html) · [Modular implementation](../../../crates/dars-universal/src/discrete_mathematics/number_theory.rs)

Counting uses products and the exact binomial recurrence. Multiset permutations multiply successive binomial counts. Fibonacci uses fast doubling, and Lucas terms follow `L(n) = 2*F(n+1) - F(n)`. Arithmetic and geometric sequences use exact formulas with bounded intermediate values. The term at geometric index zero is its first term even when the ratio is zero. [Binomial coefficients](https://dlmf.nist.gov/26.3) · [Multiset permutations](https://dlmf.nist.gov/26.16) · [Fibonacci and Lucas](https://dlmf.nist.gov/24.15) · [Exact algorithms](../../../crates/dars-universal/src/discrete_mathematics/integer.rs)

## Resources and validation

- The request allows at most 4,096 UTF-8 bytes. Integer literals allow up to 1,234 decimal digits and 4,096 magnitude bits. Bounded integer results are at most 65,536 bits, with the shared result text limited to 32,768 bytes.
- Counting supports `0 ≤ n, k ≤ 4096` and at most 64 multiset groups with a total of at most 4,096 items. Sets accept at most 128 tokens each before deduplication.
- Propositions accept at most eight variables, 256 tokens and 32 nested parse levels. Truth tables contain at most 256 rows. The sequence index cap is 32,768. Modular power limits the exponent magnitude to 1,024 bits and the modulus to 2,048 bits.
- The browser runs the same Rust algorithms in its dedicated worker. The module runs bounded requests and uses the shared task cancellation and recovery path in the web app. The CLI and browser both return structured errors for invalid syntax, domain violations, resource limits and unsuccessful bounded searches. [Browser worker](../../../apps/web/src/tool-discrete-worker.ts) · [Shared result bounds](../../../crates/dars-universal/src/lib.rs)

The module uses the locked Num integer crates. A full trial-division proof over the entire 64-bit factorization range would require many more divisions in difficult cases. Bounded Brent search reaches large composite cases while retaining deterministic verification of its outputs. The independent fixtures compare exact values against Python and SymPy, exhaust Boolean valuations, reconstruct prime factors and distinguish large probable results from proven classifications. [Feature manifest](../../../crates/dars-universal/Cargo.toml) · [Independent oracle](../../../tests/verify-discrete-mathematics.py)
