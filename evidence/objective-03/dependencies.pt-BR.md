# Objetivo 03 · Inventário de dependências e referências

[English](dependencies.md) · [Relatório integrado](REPORT.pt-BR.md) · [Segurança](security.pt-BR.md)

## Mudanças nos lockfiles de execução e build

A base é o código auditado de 0.2.2 no commit `d3c5a95d9c059fceb19e6f4f50e7c4dd38be2fad`. O Objetivo 03 adiciona 16 entradas de pacote e versão do registro ao lockfile Rust e remove zero. As dependências declaradas na web seguem as mesmas. A versão raiz do pacote e do lockfile web passa para `0.3.0`. Entradas do registro podem corresponder a pacotes opcionais ou específicos de uma plataforma. Consulte `cargo tree --locked` com a plataforma e as funcionalidades selecionadas para inspecionar um artefato. [Lockfile do workspace](../../Cargo.lock) · [Funcionalidades do motor](../../crates/dars-universal/Cargo.toml) · [Lockfile web](../../apps/web/package-lock.json)

| Escopo | Novas entradas do registro Rust |
| --- | --- |
| Científico | `astro-float-num` 0.3.6, `either` 1.19.0, `itertools` 0.10.5 e `lazy_static` 1.5.1. O motor usa `astro-float-num` para aproximações de precisão arbitrária dentro de limites e os tipos Num existentes para aritmética exata. [Seleção e referências primárias](scientific/limits.pt-BR.md) · [Consultas ao registro](scientific/verification.pt-BR.md) |
| Álgebra Linear | `nalgebra` 0.35.0, `approx` 0.5.1, `glam` 0.30.10/0.31.1/0.32.1/0.33.12, `matrixmultiply` 0.3.11, `num-complex` 0.4.6, `rawpointer` 0.2.1, `safe_arch` 1.2.0, `simba` 0.10.2 e `wide` 1.7.1. `nalgebra` dá suporte aos métodos numéricos selecionados. A etapa registra o impacto das funcionalidades opcionais e do artefato. [Seleção e referências primárias](linear-algebra/limits.pt-BR.md) · [Consultas ao registro](linear-algebra/dependency-check.json) |
| Datas e Horários | O avaliador seleciona os pacotes Jiff 1.0.3, Jiff Core 1.0.2 e `jiff-tzdb` 1.0.0, já presentes no lockfile. Os fusos usam dados IANA 2026f no formato `rearguard` embarcados. [Justificativa da dependência](date-time/limits.pt-BR.md) · [Versão da IANA](https://www.iana.org/time-zones/releases/2026f) |
| Outros módulos avançados | Usam Num, Serde e os pacotes existentes do workspace. Álgebra usa parser e regras simbólicas delimitados em Rust. O Conversor usa o registro de unidades revisado e taxas manuais. [Alternativas de Álgebra](algebra/limits.pt-BR.md) · [Alternativas do Conversor](converter/limits.pt-BR.md) |

As ferramentas fixadas são Rust `1.100.0` e `wasm-bindgen-cli` `0.2.130`. Os valores SHA-256 de `Cargo.lock` e `apps/web/package-lock.json` são `53a7043de7be6bf0ebc51d53e65249587315d95b438b35b24efca99eb84c9820` e `32c531c5efcbb8469b12e2edbf218991245236d96e3aab4c21db633e7923ac80`. Os pacotes usados na execução ficam separados das referências independentes abaixo. [Ferramentas Rust](../../rust-toolchain.toml) · [Script de build WASM](../../scripts/build-wasm.mjs) · [Registro integrado de testes](tests.json)

## Referências exclusivas de teste

| Referência | Uso |
| --- | --- |
| `Fraction`, `Decimal`, inteiros exatos e conjuntos finitos do Python | Comparações de racionais e intervalos no Standard, palavras de largura fixa, razões independentes entre unidades e operações discretas. [Oráculo Standard](../../tests/oracle.py) · [Oráculo do Programador](../../tests/verify-programmer.py) · [Oráculo de Matemática Discreta](../../tests/verify-discrete-mathematics.py) |
| SymPy `1.14.0` e mpmath `1.3.0` | Precisão real e complexa do Científico, álgebra simbólica, referências de Cálculo, matrizes exatas e geometria. Os pacotes Python estão fixados por hash. [Referências fixadas](../../tests/math-oracle-requirements.txt) |
| NumPy `2.5.1` e SciPy `1.18.1` | Autoespaços numéricos, diagnósticos de QR e resíduos correspondentes. Os pacotes binários de teste têm hashes SHA-256 por plataforma. [Pacotes fixados](../../tests/linear-algebra-oracle-requirements.txt) · [Oráculo de Álgebra Linear](../../tests/verify-linear-algebra.py) |
| `datetime`, `calendar`, `zoneinfo` do Python e `tzdata` `2026.6` | Datas gregorianas, anos semanais ISO, calendário independente de dias úteis, aritmética de nanossegundos e dados TZif carregados diretamente do pacote fixado. As regras `rearguard` publicadas pela IANA definem os indicadores de horário de verão testados para Dublin. [Oráculo de Datas e Horários](../../tests/verify-date-time.py) · [Fonte da IANA](https://data.iana.org/time-zones/tzdb-2026f/europe) |
| SI do BIPM e fatores de conversão do NIST | Grandezas dimensionais, fatores exatos e nominais de unidade e prefixos de informação decimais e binários. O Conversor usa verificações racionais, decimais e simbólicas independentes para o catálogo delimitado. [Referências do Conversor](converter/limits.pt-BR.md) · [Oráculo do Conversor](../../tests/verify-converter.py) |

Os limites das etapas registram as referências matemáticas de cada operação e quais resultados são exatos, simbólicos ou aproximados. [Referências de todos os módulos](REPORT.pt-BR.md#validação-dos-módulos) · [Contrato do registro de cálculo](calculation-proof/contract.pt-BR.md)
