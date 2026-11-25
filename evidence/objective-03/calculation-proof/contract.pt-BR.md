# DARS Calculation Proof · Contrato do registro

[English](contract.md) · [Esquema estrutural](schema.v1.json)

O esquema 1 preserva o contexto de execução de um cálculo concluído. O registro reúne a operação solicitada, a expressão de entrada, a representação matemática, as configurações, o domínio, o método, o resultado e sua classificação de exatidão. Os módulos avançados já implementados geram registros pelo mesmo contrato Rust. O esquema também reconhece os identificadores reservados para módulos planejados. [Contrato do motor](../../../crates/dars-universal/src/lib.rs)

O **registro de execução** descreve o cálculo realizado. Uma **explicação** esclarece o método matemático. A **verificação de solução** aplica critérios independentes ao resultado. Uma **demonstração formal** exige premissas e deduções justificadas. O registro fornece a origem da execução e elementos para reproduzi-la. O campo de precisão registra a precisão numérica utilizada. O limite de erro tem campo próprio e depende do valor fornecido pelo motor.

## Ler e reproduzir um registro

| Campos | Significado |
| --- | --- |
| `schema`, `module`, `operation` | Versão do formato e identidade da operação. |
| `expression`, `normalized` | Entrada original e representação matemática do motor. |
| `variables`, `units`, `options` | Variáveis nomeadas, unidades e configurações escalares. Objetos vazios representam grupos vazios. |
| `domain`, `method`, `formula` | Domínio, método registrado e fórmula quando disponível. |
| `result`, `exactness`, `precision` | Resultado em texto, classificação exata, simbólica ou aproximada e precisão registrada quando aplicável. |
| `tolerance`, `rounding`, `error_bound` | Configurações numéricas e limite declarados. O valor `null` indica que o motor não forneceu aquele valor. |
| `assumptions`, `constraints`, `references` | Premissas, restrições e identificadores de referências. |
| `engine_version`, `algorithm_version` | Versões do motor e da implementação da operação. |

No exemplo do Científico, calcule `sin(90°)`. Abra **Registro de cálculo**, selecione **Baixar JSON** e use **Abrir JSON local** para inspecionar esse arquivo. O resultado é `1`, classificado como exato. Para conferir o cálculo, use a mesma entrada matemática, o módulo e as configurações registradas na CLI compilada com o lockfile.

```powershell
$request = '{"schema":1,"module":"scientific","operation":"evaluate","input":"sin(90°)","options":{"angle":"rad","notation":"auto","precision":32,"complex":false}}'
cargo run --locked -q -p dars-cli -- tool $request
```

Para entradas localizadas, consulte a expressão original e as configurações para identificar a notação usada. A representação normalizada registra a expressão matemática e pode conter formatação específica do motor. Compare o resultado matemático e sua exatidão na versão do motor registrada. [Entrada pelo navegador](../../../apps/web/src/tool-scientific-runtime.tsx) · [Entrada pela CLI](../../../crates/dars-cli/src/main.rs)

Expressões canônicas do Científico também permitem comparação explícita. O procedimento reproduziu o resultado e a exatidão de seno e cosseno em ângulos notáveis, `ln(1)`, `log2(1024)`, `20!` e `sqrt(-1)` no modo complexo com a versão WASM do Científico. Use-o quando o parser do Científico aceitar a expressão normalizada e a versão do motor corresponder à versão em teste. Abrir manualmente um arquivo continua exibindo os dados para inspeção.

```powershell
$record = Get-Content -Raw -Encoding utf8 -LiteralPath dars-calculation-record.json | ConvertFrom-Json
$request = [ordered]@{
    schema = $record.schema
    module = $record.module
    operation = $record.operation
    input = $record.normalized
    options = $record.options
} | ConvertTo-Json -Depth 5 -Compress
cargo run --locked -q -p dars-cli -- tool $request
```

Em Álgebra, resolva `x/x=1` no domínio real. O registro identifica `x` como variável real, conserva `x != 0` e mantém a estrutura da expressão na entrada normalizada. Simplificar antes de registrar essa entrada faria a exclusão desaparecer na reprodução. A suíte da CLI verificou registros idênticos ao reproduzir sete casos de Álgebra, incluindo restrições ativas e valores atribuídos a variáveis. [Oráculo de Álgebra](../../../tests/verify-algebra.py)

Em Cálculo, integre `exp(-x^2)` numericamente entre `0` e `1`, com tolerância absoluta `1e-10`. O registro identifica a quadratura adaptativa de Simpson, informa a tolerância solicitada e apresenta nas restrições a estimativa de erro absoluto. O campo do limite de erro certificado fica `null`. A suíte verifica a precisão numérica de forma independente e compara os registros completos na reprodução. [Oráculo de Cálculo](../../../tests/verify-calculus.py)

Em Álgebra Linear, calcule a decomposição QR de uma matriz de três linhas e duas colunas com linhas `1 0`, `1 1` e `1 2`. O registro identifica o método de Householder, informa a tolerância aplicada e apresenta o resíduo observado de reconstrução e o erro de ortogonalidade pela norma de Frobenius. As medidas descrevem os fatores retornados. A suíte confere a reconstrução e o subespaço de forma independente com NumPy e SciPy. [Oráculo de Álgebra Linear](../../../tests/verify-linear-algebra.py)

Em Geometria, use um círculo de raio `2` em metros. O registro mantém a área simbólica exata `4*pi` com unidade `m^2` e o diâmetro `4` com unidade `m`. O mapa de unidades registra a dimensão de cada grandeza a partir da escala comum das entradas. [Oráculo de Geometria](../../../tests/verify-geometry.py)

Em Matemática Discreta, `97` produz um resultado determinístico de primalidade. A aprovação nos testes fixos fora do domínio certificado produz `probable_prime`, com as bases testadas no registro e sem um limite de erro certificado. A suíte independente confere a classificação e as bases que demonstram que um número é composto. [Oráculo de Matemática Discreta](../../../tests/verify-discrete-mathematics.py)

## Formato e validação local

O arquivo é um objeto JSON independente em UTF-8. O navegador lê até 128 KiB, exige UTF-8 válido, rejeita nomes repetidos mesmo quando escritos com escapes e aceita apenas os campos próprios esperados. Os limites de comprimento do JSON Schema contam caracteres. O aplicativo também aplica limites em bytes UTF-8 por campo, rejeita sequências Unicode malformadas e limita a profundidade de estruturas a dois níveis. A expressão tem limite de 4.096 bytes. A expressão normalizada tem limite de 8.192 bytes e o resultado, de 32.768 bytes. Os mapas têm até 16 entradas e as listas têm até 32 itens. [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation) · [Validador do aplicativo](../../../apps/web/src/calculation-proof.ts)

Um arquivo aberto aparece como **Registro importado**, com os valores identificados como não verificados. Expressões e referências são exibidas como texto literal, inclusive se parecerem marcação ou links. Abrir o arquivo exibe o registro sem executar o cálculo, gravar preferências ou consultar servidores. O download cria um arquivo JSON local. O registro importado fica no componente da área de trabalho. Ao fechá-lo, o registro do cálculo atual volta a ser exibido. [Visualizador local](../../../apps/web/src/calculation-proof-panel.tsx)

## Comandos de verificação

```powershell
node --experimental-strip-types --test apps/web/tests/calculation-proof.test.mts
npm run build --prefix apps/web
npm run test:e2e --prefix apps/web -- calculation-proof.spec.ts
```

Gere antes os arquivos WASM do Científico. A suíte Node confere o formato, a ida e volta do registro, nomes repetidos, limites, texto Unicode e a cobertura das etiquetas nos sete idiomas. A suíte de navegador confere a exportação do Científico, a reabertura do arquivo, arquivos grandes e UTF-8 inválido, a exibição literal e o tratamento local. [Suíte Node](../../../apps/web/tests/calculation-proof.test.mts) · [Suíte de navegador](../../../apps/web/tests/calculation-proof.spec.ts)

As verificações focadas passaram no Node (8 testes) e no Chrome instalado (2 testes na rota de produção do Científico). O pacote Python `jsonschema` 4.25.1 validou o metaesquema Draft 2020-12 e concordou com o validador do aplicativo em 10 casos estruturais representativos. Os testes do aplicativo cobrem limites UTF-8, rejeição de nomes repetidos e exibição literal no navegador. [Validador independente](https://pypi.org/project/jsonschema/4.25.1/)
