# Modelo de palavra e limites do Programador

[English](limits.md)

O Programador usa uma palavra de exatamente `w` bits. As opções são `base` numérica em 2, 8, 10 ou 16, `width` numérica de 1 a 1.024 e `signed` booleana. Os padrões são base 10, largura 32 e exibição decimal sem sinal. As configurações de 8, 16, 32, 64 e 128 bits usam as mesmas regras das demais larguras aceitas. [Modelo de palavra e opções](../../../crates/dars-universal/src/programmer.rs)

## Entrada e interpretação de sinal

Separe os operandos por espaços. Conversão, NOT e complemento de dois recebem uma palavra. AND, OR e XOR recebem duas palavras na mesma base de origem. Deslocamentos e rotações recebem uma palavra seguida de uma contagem decimal. O analisador aceita algarismos ASCII da base, letras hexadecimais em maiúsculas ou minúsculas e sinais opcionais antes de uma palavra. Binário, octal e hexadecimal aceitam o prefixo opcional da base selecionada, `0b`, `0o` ou `0x`, sem distinção de maiúsculas. Texto fora da gramática do prefixo e dos dígitos da base é inválido. Em hexadecimal, `0B` é uma palavra válida para onze e também pode ser escrita como `0x0B`. [Analisador de literais e contagens](../../../crates/dars-universal/src/programmer.rs)

| Forma de entrada | Interpretação aceita |
| --- | --- |
| Decimal ou sinal explícito em qualquer base | Valor numérico. Com sinal, a faixa vai de `-2^(w-1)` a `2^(w-1)-1`. Sem sinal, vai de `0` a `2^w-1`. Zero negativo equivale a zero. |
| Binário, octal ou hexadecimal sem sinal explícito | Padrão de bits com magnitude sem sinal de até `2^w-1`. O modo com sinal lê um padrão com bit mais significativo igual a um como valor decimal negativo. |
| Contagem de deslocamento ou rotação | Inteiro decimal não negativo, independentemente da base da palavra. Zeros à esquerda e sinal positivo inicial são aceitos. Zero com sinal equivale a zero. |

Entradas numéricas fora da faixa selecionada e padrões mais largos que a palavra retornam `domain`. Isso rejeita overflow e underflow durante a leitura. Um número negativo admitido é codificado pelo seu resíduo módulo `2^w`. A exibição com sinal usa o próprio resíduo quando o bit mais significativo é zero ou subtrai `2^w` quando ele é um. Por exemplo, `FF` em base 16 e largura 8 aparece como `-1` com sinal e `255` sem sinal. [Vetores de bits com e sem sinal](https://smt-lib.org/theories-FixedSizeBitVectors.shtml)

## Operações e comportamento nos limites

| Operação | Regra da palavra de largura fixa |
| --- | --- |
| Conversão | Preserva a palavra admitida e a exibe nas quatro bases. |
| AND, OR e XOR | Combinam os bits correspondentes de duas palavras. |
| NOT | Inverte todos os `w` bits. |
| Deslocamento à esquerda | Multiplica pela potência de dois do deslocamento e retém os `w` bits menos significativos. Contagens a partir de `w` produzem zero. |
| Deslocamento lógico à direita | Descarta bits menos significativos e insere zeros à esquerda. Contagens a partir de `w` produzem zero. |
| Deslocamento aritmético à direita | Descarta bits menos significativos e estende o bit original mais significativo, independentemente da configuração decimal. Contagens a partir de `w` preenchem a palavra inteira com esse bit. |
| Rotações à esquerda e à direita | Movem os bits de forma cíclica pela contagem módulo `w`. Contagem efetiva zero preserva a palavra. |
| Complemento de dois | Nega módulo `2^w`. Zero permanece zero. O menor valor com sinal preserva o padrão de bits porque seu oposto positivo está fora da faixa com sinal dessa largura. |

O deslocamento à esquerda e o complemento de dois reduzem o resultado à largura fixa. O deslocamento aritmético à direita corresponde a arredondar o quociente com sinal para baixo até um inteiro e então codificar o resultado. Para `A5` em largura 8 deslocado um bit à direita, o resultado lógico é `52` em hexadecimal e o aritmético é `D2`. [Deslocamentos e negação em vetores de bits](https://smt-lib.org/theories-FixedSizeBitVectors.shtml) · [Deslocamento aritmético](https://smt-lib.org/logics-all.shtml) · [Implementação das operações](../../../crates/dars-universal/src/programmer.rs)

## Saída, recursos e validação

A ordem canônica dos campos é `binary=...; octal=...; decimal=...; hexadecimal=...`. O campo binário tem exatamente `w` dígitos. O octal tem `ceil(w/3)` e o hexadecimal tem `ceil(w/4)`, ambos preenchidos com zeros à esquerda. As letras hexadecimais são maiúsculas. O decimal mostra a interpretação selecionada, com ou sem sinal, sem preenchimento. Todos os resultados são exatos. A prova registra largura efetiva, base de entrada, interpretação decimal e as regras de contagem ou retorno modular aplicáveis. [Renderização e prova](../../../crates/dars-universal/src/programmer.rs)

Uma requisição está limitada a 4.096 bytes UTF-8 e uma palavra ou contagem a 1.024 dígitos. Durante a leitura, a contagem de deslocamento é limitada à largura selecionada e a de rotação é reduzida dígito a dígito módulo essa largura. Isso limita os deslocamentos efetivos mesmo com contagens maiores que inteiros de máquina. Sintaxe inválida retorna `invalid_input`. Violações de domínio retornam `domain`, incluindo largura zero e contagem negativa. Larguras acima de 1.024 e excesso de tamanho retornam `limit`. [Limites de recursos](../../../crates/dars-universal/src/programmer.rs)

A representação `BigUint` existente oferece operações de bits e conversão de base para todas as larguras suportadas. Os inteiros primitivos de Rust oferecem largura fixa até 128 bits. Uma biblioteca de fatias de bits como `bitvec` oferece indexação arbitrária e controle de layout. A representação inteira atende diretamente à conversão de bases e à aritmética modular do módulo, com largura aplicada explicitamente a cada palavra. A execução nativa e o navegador compartilham o avaliador Rust. O oráculo independente em Python verifica os campos exatos, reprodução entre bases, palavras de 1 a 1.024 bits, limites com sinal, deslocamentos e contagens além da faixa de máquina. [Referência de inteiros Rust](https://doc.rust-lang.org/std/primitive.u128.html) · [Documentação do bitvec](https://docs.rs/bitvec/latest/bitvec/) · [Manifesto de features](../../../crates/dars-universal/Cargo.toml) · [Referência independente](../../../tests/verify-programmer.py)
