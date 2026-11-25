# Programmer word model and bounds

[Português brasileiro](limits.pt-BR.md)

Programmer uses a word of exactly `w` bits. Its options are numeric `base` in 2, 8, 10 or 16, numeric `width` from 1 through 1,024, and Boolean `signed`. Defaults are base 10, width 32 and unsigned decimal display. The 8, 16, 32, 64 and 128-bit presets use the same rules as every other supported width. [Word model and options](../../../crates/dars-universal/src/programmer.rs)

## Input and signed interpretation

Enter operands separated by whitespace. Convert, NOT and two's complement take one word. AND, OR and XOR take two words in the same source base. Shifts and rotations take one word followed by a decimal count. The parser accepts ASCII digits for the base, hexadecimal letters in either case, and optional signs before a word. Binary, octal and hexadecimal accept the selected base's optional case-insensitive `0b`, `0o` or `0x` prefix. Text outside that base's selected prefix and digit grammar is invalid. A hexadecimal word such as `0B` is valid digit text for eleven and can also be entered as `0x0B`. [Literal and count parser](../../../crates/dars-universal/src/programmer.rs)

| Source form | Accepted interpretation |
| --- | --- |
| Decimal or explicit sign in any source base | A numeric value. With signed mode, the range is `-2^(w-1)` through `2^(w-1)-1`. Otherwise the range is `0` through `2^w-1`. Negative zero equals zero. |
| Signless binary, octal or hexadecimal | A bit pattern with unsigned magnitude at most `2^w-1`. Signed mode reads a high-bit pattern as a negative decimal value. |
| Shift or rotation count | A nonnegative decimal integer regardless of the word's base. Leading zeros and a leading plus sign are allowed. Signed zero is treated as zero. |

Numeric sources outside the selected interval and patterns wider than the selected word return `domain`. This rejects overflow and underflow during literal entry. For an admitted negative number, the encoded word is its residue modulo `2^w`. Signed display reads that residue as itself if the high bit is zero, or subtracts `2^w` if the high bit is one. For example, `FF` in base 16 at width 8 is displayed as `-1` in signed mode and `255` in unsigned mode. [Signed and unsigned bit vectors](https://smt-lib.org/theories-FixedSizeBitVectors.shtml)

## Operations and boundary behavior

| Operation | Fixed-width rule |
| --- | --- |
| Convert | Preserve the admitted word and display it in all four bases. |
| AND, OR, XOR | Combine the corresponding bits of two words. |
| NOT | Flip all `w` bits. |
| Left shift | Multiply by the shift power of two and retain the low `w` bits. Counts at least `w` produce zero. |
| Logical right shift | Discard low bits and insert zeros from the left. Counts at least `w` produce zero. |
| Arithmetic right shift | Discard low bits and extend the original high bit, independently of the decimal display setting. Counts at least `w` fill the complete word with that bit. |
| Rotate left and right | Move bits cyclically by the count modulo `w`. When the effective count is zero the word is unchanged. |
| Two's complement | Negate modulo `2^w`. Zero remains zero. The minimum signed value retains the same pattern because its positive counterpart is outside the signed interval at this width. |

Left shift and two's complement reduce their result to the fixed width. The arithmetic right-shift rule corresponds to rounding the signed quotient down to an integer and then encoding the result. For `A5` at width 8 shifted right by one, the logical result is `52` in hexadecimal and the arithmetic result is `D2`. [Bit-vector shifts and negation](https://smt-lib.org/theories-FixedSizeBitVectors.shtml) · [Arithmetic bit-vector shift](https://smt-lib.org/logics-all.shtml) · [Operation implementation](../../../crates/dars-universal/src/programmer.rs)

## Output, resources and validation

The canonical field order is `binary=...; octal=...; decimal=...; hexadecimal=...`. The binary field has exactly `w` digits. Octal has `ceil(w/3)` and hexadecimal has `ceil(w/4)`, both padded with leading zeros. Hexadecimal letters are uppercase. Decimal shows the selected signed or unsigned interpretation without padding. Every result is exact. The proof records the effective width, input base, decimal interpretation and any relevant count or wrap rule. [Rendering and proof](../../../crates/dars-universal/src/programmer.rs)

A request is limited to 4,096 UTF-8 bytes and a word or count to 1,024 digits. Shift counts are capped at the selected width during parsing, while rotation counts are reduced digit by digit modulo that width. This bounds the actual shifts even for counts larger than machine integers. Invalid syntax reports `invalid_input`. Domain violations use `domain`, including width zero and negative counts. Widths above 1,024 and excess request size report `limit`. [Resource guards](../../../crates/dars-universal/src/programmer.rs)

The existing `BigUint` representation provides bitwise operators and base conversion for every supported width. Primitive Rust integers provide fixed-size behavior through 128 bits. A bit-slice package such as `bitvec` offers arbitrary indexing and control of bit layout. The integer representation fits this module's base conversion and modular arithmetic directly, with the width imposed explicitly on every word. Native and browser executions share the Rust evaluator. The independent Python oracle checks exact field content, cross-base replay, 1-bit through 1,024-bit words, signed boundary cases, independent shifts, and counts beyond machine range. [Rust integer reference](https://doc.rust-lang.org/std/primitive.u128.html) · [Bitvec documentation](https://docs.rs/bitvec/latest/bitvec/) · [Feature manifest](../../../crates/dars-universal/Cargo.toml) · [Independent oracle](../../../tests/verify-programmer.py)
