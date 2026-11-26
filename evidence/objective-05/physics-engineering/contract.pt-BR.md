# Física e Engenharia

[English](contract.md)

`physics-engineering/1` reúne modelos elementares de mecânica, eletricidade, termodinâmica, fluidos e engenharia. A requisição usa grandezas nomeadas como textos decimais ou racionais canônicos e um objeto opcional `units` com os códigos de unidade de cada campo. O resultado tem a forma `{ "values": { "grandeza": { "value": "racional ou decimal", "unit": "código SI" } } }`. O Calculation Proof preserva a entrada com suas unidades e registra as grandezas escalares normalizadas em unidades do SI. O motor rejeita chaves repetidas, campos desconhecidos, dimensões incompatíveis, valores fora do domínio do modelo e listas de mais de 32 resistores.

| Área | Identificadores dos modelos |
| --- | --- |
| Mecânica | `uniform_motion`, `accelerated_motion`, `force`, `work`, `energy`, `power`, `momentum`, `impulse`, `circular_motion`, `gravitation` |
| Eletricidade | `ohm`, `electrical_power`, `electrical_energy`, `resistors_series`, `resistors_parallel`, `capacitance`, `inductance`, `rlc_series` |
| Termodinâmica | `temperature`, `heat`, `heat_conduction`, `ideal_gas`, `pressure`, `thermodynamic_work`, `efficiency` |
| Fluidos | `density`, `hydrostatic_pressure`, `buoyancy`, `flow_rate`, `continuity`, `bernoulli` |
| Engenharia | `stress_strain`, `elasticity`, `torque`, `wave` |

O Converter existente fornece as famílias dimensionais e a conversão afim exata de temperatura. Diferenças de temperatura usam `delta_K`, `delta_degC`, `delta_degF` ou `delta_degR`. Códigos elétricos, de frequência e de outras unidades compostas são restritos à dimensão da grandeza e aos aliases aceitos. Fatores aproximados do Converter, como `mmHg`, ficam fora dos modelos físicos exatos. A maioria das operações retorna racionais exatos dentro das hipóteses matemáticas declaradas. A incerteza das medições e dos modelos simplificados continua sendo uma questão física separada.

A gravidade padrão `g0 = 9,80665 m/s^2` é exata por convenção. O gás ideal usa `R = 8,31446261815324 J/(mol*K)`, produto exato das constantes definidoras `N_A` e `k` do SI. A gravitação entre massas pontuais usa `G = 6,67430e-11 m^3/(kg*s^2)` do CODATA 2022 e apresenta separadamente a contribuição propagada da incerteza padrão de `G`, de `1,5e-15 m^3/(kg*s^2)`. O circuito RLC em série usa binary64 e registra o condicionamento próximo da ressonância. Os dois resultados aproximados mantêm o limite de erro absoluto vazio. A validação estrutural e de sistemas críticos excede o escopo desses modelos didáticos. [Brochura do SI do BIPM, nona edição](https://www.bipm.org/en/si-brochure-9) · [Gravidade padrão no NIST](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) · [CODATA 2022](https://physics.nist.gov/cuu/pdf/JPCRD2022CODATA.pdf)

Execute `python -B tests/verify-physics-engineering.py target/release/dars.exe` na raiz. O oráculo independente cobre todos os modelos com cálculos analíticos ou `Fraction` do Python, incluindo 12 V com 6 Ω resultando em 2 A e 24 W, unidades equivalentes, propagação da incerteza de constante experimental e rejeição de dimensões e temperaturas absolutas inválidas.
