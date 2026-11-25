# Unidades, métodos e limites do Conversor

[English](limits.md)

`convert` recebe um valor racional com sinal e as opções `from` e `to`. Informe um inteiro, decimal, literal científico ou fração, como `2`, `-1.25e-2` ou `3/7`. O motor consulta as duas unidades em um catálogo tipado e retorna um valor escalar com os códigos canônicos em `proof.units`. As unidades distinguem maiúsculas e minúsculas, como `bit` e `B`. O catálogo também aceita formas explícitas como `μm`, `m²`, `°C`, `Δ°F`, `Mbps` e `L/100 km`. [Catálogo e variantes](../../../crates/dars-universal/src/converter/units.rs) · [Gramática de entrada](../../../crates/dars-universal/src/converter/scalar.rs)

| Família | Códigos canônicos |
| --- | --- |
| Comprimento | `nm` `um` `mm` `cm` `m` `km` `in` `ft` `yd` `mi` `nmi` |
| Área | `mm^2` `cm^2` `m^2` `km^2` `in^2` `ft^2` `yd^2` `mi^2` `ha` `acre` |
| Volume | `mL` `cL` `dL` `L` `cm^3` `m^3` `in^3` `ft^3` `gal_us` `gal_imp` `qt_us` `pt_us` `fl_oz_us` |
| Massa | `mg` `g` `kg` `t` `oz` `lb` `st` |
| Tempo | `ns` `us` `ms` `s` `min` `h` `d` `wk` |
| Temperatura | Absoluta `K` `degC` `degF` `degR`. Diferenças `delta_K` `delta_degC` `delta_degF` `delta_degR`. |
| Velocidade | `m/s` `km/h` `cm/s` `ft/s` `mph` `kn` |
| Aceleração | `m/s^2` `cm/s^2` `ft/s^2` `g0` |
| Pressão | `Pa` `kPa` `MPa` `bar` `mbar` `atm` `psi` `Torr` `mmHg` |
| Energia | `J` `kJ` `MJ` `Wh` `kWh` `cal_th` `kcal_th` `eV` `BTU_IT` |
| Potência | `W` `kW` `MW` `hp_mech` `hp_metric` |
| Força | `N` `kN` `MN` `dyn` `kgf` `lbf` |
| Ângulo | `rad` `deg` `grad` `turn` `arcmin` `arcsec` |
| Armazenamento digital | `bit` `B` `kbit` `Mbit` `Gbit` `Tbit` `kB` `MB` `GB` `TB` `Kibit` `Mibit` `Gibit` `Tibit` `KiB` `MiB` `GiB` `TiB` |
| Taxa de transferência | Os mesmos códigos de armazenamento com sufixo `/s`. |
| Economia e consumo de combustível | Economia `km/L` `mpg_us` `mpg_imp`. Consumo `L/km` `L/100km`. |

## Compatibilidade e exatidão

- Grandezas lineares usam uma razão exata de fatores com unidade de referência comum. A polegada internacional vale exatamente `0.0254 m`, e áreas e volumes usam potências do comprimento correspondente. O galão líquido dos EUA usa `231 in^3` e o galão imperial usa `4.54609 L`. A libra-força usa a libra internacional vezes a gravidade padrão. Esses fatores e o BTU da Tabela Internacional são representados como racionais. [Brochura do SI](https://www.bipm.org/en/publications/si-brochure) · [Fatores NIST](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [Capacidade imperial](https://www.legislation.gov.uk/ukpga/1985/72/schedule/1/part/IV/enacted) · [BTU da Tabela Internacional](https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nbsir82-2401.pdf)
- Temperaturas absolutas passam por kelvin com escala e deslocamento exatos. Entradas abaixo do zero absoluto são rejeitadas, inclusive na mesma unidade. Diferenças de temperatura formam outra família, usam somente escala e aceitam diferenças negativas. Por exemplo, `0 degC` converte para `32 degF`, enquanto `0 delta_degC` converte para `0 delta_degF`. [Definições de temperatura](https://www.bipm.org/en/publications/si-brochure) · [Implementação afim](../../../crates/dars-universal/src/converter.rs)
- Ângulos usam coeficiente racional exato e potência inteira de π. Por exemplo, `90 deg` produz `pi/2` radianos, `1 rad` produz `180/pi` graus e `200 grad` produz `180` graus após cancelar π. Conversões envolvendo radianos cujo resultado conserva π são simbólicas. [Unidades fora do SI e ângulos](https://www.bipm.org/en/publications/si-brochure)
- Prefixos decimais de dados usam potências de 1.000 e os binários usam potências de 1.024. Um byte tem oito bits. Armazenamento e taxa de transferência são famílias distintas. A variante `KB` resolve para `kB` decimal. [Notação de unidades da IEC](https://styleguide.iec.ch/?docs=iec%2Ftypographic%2Funits-and-symbols)
- Dentro de economia ou de consumo de combustível, a escala é linear e admite zero. Entre as duas formas o cálculo toma o recíproco e exige valor positivo. Por exemplo, `8 L/100km` passa a `25/2 km/L`. As duas unidades MPG usam definições distintas de galão e fatores exatos. [Conversão de combustível](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors) · [Implementação de consumo](../../../crates/dars-universal/src/converter.rs)
- `mmHg` usa o coeficiente nominal arredondado de `133.3224 Pa` publicado pelo NIST. Conversões com valor diferente de zero para outra unidade de pressão ou a partir dela usam esse fator e recebem classificação `approximate`. A saída arredonda para sete algarismos significativos, com empate para par, usando aritmética inteira. A precisão registrada descreve a meta de arredondamento e o limite certificado de erro fica vazio. `Torr` usa `101325/760 Pa` exatos. Conversões nulas e na mesma unidade permanecem exatas. [Fatores de pressão NIST](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8) · [Implementação do arredondamento](../../../crates/dars-universal/src/converter/scalar.rs)

## Cotações manuais de moedas

`currency` aceita um valor com sinal e os campos manuais `from`, `to`, `rate`, `source`, `as_of` e `reference_date`, com `valid_until` opcional. As moedas disponíveis são `USD`, `EUR`, `BRL`, `GBP`, `JPY`, `CHF`, `CAD`, `AUD`, `CNY`, `ARS`, `MXN`, `INR`, `KRW`, `NZD`, `ZAR` e `PLN`. A taxa é o número racional positivo de unidades da moeda de destino por uma unidade da moeda de origem. A mesma moeda exige taxa um. O valor retornado é o produto exato em relação à taxa informada e pode manter uma fração. Valores com sinal permitem estornos. [Autoridade de códigos ISO](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html) · [Implementação da cotação manual](../../../crates/dars-universal/src/converter/currency.rs)

As datas usam o calendário gregoriano em `YYYY-MM-DD` entre os anos 0001 e 9999. O motor valida a duração dos meses e as regras de ano bissexto em séculos. A data inicial e a data final, quando informada, são inclusivas. A fonte é texto simples não vazio com até 80 bytes UTF-8. O registro mantém valor, taxa, fonte informada e datas fornecidas. A saída usa `amount=...; status=...`. A situação é calculada em relação à data de referência selecionada explicitamente. [Formato de data](https://www.w3.org/TR/NOTE-datetime)

| Situação | Datas informadas |
| --- | --- |
| `within_validity` | A data de referência está dentro do período inclusive informado. |
| `expired` | A data de referência é posterior ao fim informado. |
| `not_yet_valid` | A data de referência antecede o início da cotação. |
| `unverified_validity` | A data de referência está no início ou depois dele, e a data final está ausente. |

O motor calcula offline com a cotação informada. A data selecionada determina a situação na reprodução, inclusive para cotações históricas, vencidas ou com vigência futura. Taxas são inseridas pelo usuário.

## Limites e escolha de dependências

Famílias incompatíveis, taxa não positiva, fim anterior ao início, denominador nulo ou domínio matemático não admitido retornam `domain`. Identificadores desconhecidos, datas inválidas e expressões malformadas retornam `invalid_input`. Literais escalares têm até 256 bytes UTF-8, até 128 algarismos na mantissa de cada componente decimal e expoente de magnitude até 256. Numerador e denominador racional reduzidos estão limitados a 4.096 bits. [Limites do analisador](../../../crates/dars-universal/src/converter/scalar.rs) · [Compatibilidade](../../../crates/dars-universal/src/converter.rs)

O `uom` 0.38 oferece análise dimensional em tempo de compilação, armazenamento `bigrational` e tipos para temperatura absoluta e diferenças de temperatura. O módulo usa um catálogo de execução limitado com racionais Num exatos e modelos explícitos de deslocamento, fatores π, recíprocos e precisão nominal. Assim os códigos de entrada e os metadados da prova usam a mesma tabela revisada. O oráculo independente usa frações do Python e cálculos simbólicos nas conversões, além de referências de calendário na validade das cotações. [API e tipos do uom](https://docs.rs/uom/latest/uom/) · [Modelo de temperatura no uom](https://docs.rs/uom/latest/src/uom/si/thermodynamic_temperature.rs.html) · [Oráculo independente](../../../tests/verify-converter.py)
