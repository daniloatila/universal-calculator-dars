# Contrato de tipos do Data Lab

[English](data-type-contract.md)

## Valores de origem e conversões explícitas

A prévia mantém `value`, o conteúdo original da célula ou o literal de uma célula derivada. Ela apresenta separadamente `source_type`, `source_origin`, `requested_type`, `notation`, `validity` e `canonical`. O conteúdo decodificado de uma string JSON é preservado. O token numérico JSON é mantido com seu expoente. A célula de planilha também registra o tipo de armazenamento e o valor bruto de `<v>` quando presente. `canonical` é `null` para um valor indisponível ou inválido e uma string para um valor válido. A string numérica representa uma fração reduzida exata ou um inteiro. `origin` é a classificação de compatibilidade da interpretação atual. `source_origin` é preservado em conversões sucessivas.

| Entrada | Interpretação numérica após conversão explícita |
| --- | --- |
| Número nativo JSON `1.25` | Gramática de origem com ponto. O valor exato é `5/4` nas duas opções de separador decimal. |
| Célula numérica nativa XLSX ou cache numérico de fórmula `1.25` | Gramática de origem com ponto, exceto quando a célula representa data ou hora. O número bruto é preservado. |
| CSV, TSV, string JSON, texto XLSX ou texto digitado em uma transformação | Segue a notação selecionada para texto. Com vírgula, `2,50` é `5/2` e `2.50` fica inválido. |
| Saída numérica exata de um cálculo ou agrupamento | Inteiro ou racional canônico produzido em Rust. Uma conversão posterior usa esse valor independentemente da notação de texto. |

As colunas podem permanecer em Texto. Nesse tipo, `00017` permanece `00017`, e os decimais aparecem como fornecidos. A conversão para Inteiro exige um valor inteiro. Datas, booleanos nativos e erros de planilha são excluídos dos agregados numéricos. Texto vazio, JSON `null`, célula ausente, conversão inválida, fórmula sem valor utilizável em cache e erro mantêm estados distintos. Zero numérico é válido. A troca do idioma da interface preserva a gramática de origem e os valores canônicos. O separador decimal é uma opção de importação para interpretar texto e fica registrado na receita.

## Datas e caches de planilhas

A prévia registra `workbook.cell_type`, `style_index`, `number_format_id` e `number_format_code` quando existe um formato personalizado. `formula` guarda a expressão fornecida no arquivo. `workbook.cache.status` distingue `stored`, `empty`, `missing` e `error`. O cache explicitamente vazio guarda um valor bruto vazio. Quando o cache está ausente, o campo de valor fica omitido. O cache textual segue a notação de texto e o cache numérico segue a gramática XLSX. A leitura usa os valores armazenados, que podem estar desatualizados. A avaliação das fórmulas do Excel fica fora do contrato.

Os metadados de data independem da presença de fórmula. Um serial formatado como data e um serial em cache com o mesmo valor e a mesma época produzem a mesma data canônica. A prévia e a prova registram a época da planilha. A célula registra `serial` ou `iso`, o estado da conversão e o valor ISO canônico quando disponível. O sistema 1900 usa `1899-12-31` como serial zero e pula o dia fictício do serial `60`. Seu valor bruto continua visível com estado `fictitious_1900_leap_day` e sem valor gregoriano. O sistema 1904 começa em `1904-01-01` e aceita o serial `60` como dia normal. [Sistemas de datas do Excel](https://support.microsoft.com/en-us/excel/date-systems-in-excel) · [Nota da Microsoft sobre o ano 1900](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year)

A parte fracionária de um serial não negativo é uma fração exata de um dia de 24 horas. Valores entre nanossegundos são apresentados no nanossegundo anterior com `discarded_subnanosecond_precision: true`. O decimal completo permanece na origem. Datas ISO sem deslocamento mantêm a data e o horário civis. Datas ISO com deslocamento são normalizadas para UTC. Horários ISO com mais de nove dígitos fracionários ficam inválidos na conversão para Data. A conversão para Hora apresenta o horário do dia quando disponível. Uma data sem componente de horário permanece uma data. A conversão para Texto mantém o serial bruto e o tipo de origem Data, que continua excluído em uma conversão posterior para Decimal.

## Operações do pipeline

| Operação | Regra aplicada |
| --- | --- |
| Filtrar e ordenar | Comparam valores canônicos no tipo escolhido para a coluna. O filtro ignora células indisponíveis. A ordenação classifica as indisponíveis por origem e literal e mantém a sequência de entrada para chaves iguais. A ordem numérica usa racionais exatos. Datas são ordenadas pelo valor civil, em UTC quando há deslocamento informado. Data, data e horário civis e data e horário em UTC são chaves distintas. |
| Deduplicar e agrupar | Usam a chave tipada. `1.25` e `1,250` são iguais em uma coluna Decimal quando interpretados pela notação de cada origem. O primeiro literal correspondente representa o grupo. As origens de ausência ficam distintas. A contagem do grupo inclui células utilizáveis, e os agregados numéricos exigem coluna numérica. |
| Juntar | Converte as chaves de pesquisa para o tipo da coluna usando a notação de texto selecionada. Chaves duplicadas equivalentes são rejeitadas. Células ausentes ou inválidas ficam sem correspondência. A junção à esquerda produz uma célula ausente para a linha sem correspondência. O texto associado preserva zeros à esquerda. |
| Preencher ausentes | Substitui células ausentes, nulas e vazias. Interpreta o preenchimento pela notação de texto e registra `derivation.from_missing`. Células inválidas, com erro ou sem cache utilizável mantêm seus estados. |
| Calcular, estatísticas e análise | Leem valores numéricos utilizáveis pela gramática de origem e calculam frações exatas dentro dos limites numéricos. Colunas Texto, Data e Hora exigem conversão numérica apropriada para uso como entrada numérica. A conversão intermediária para Texto preserva a exclusão de datas das quantidades. |
| Transformar texto | Aplica uma operação explícita de texto e registra a derivação. Quando existe uma interpretação ISO válida para a data de origem, a transformação usa esse ISO e mantém o tipo de origem Data. |
| Exportar CSV | Escreve o conteúdo de `value`, preservando literais comuns e zeros à esquerda. A exportação protegida aplica escape e prefixos para textos que podem ser interpretados como fórmulas. O formato CSV não carrega estilos e metadados tipados de planilha. |

## Prova e compatibilidade

Novas importações geram `data-lab/2`. O objeto codificado em `normalized` na prova contém o SHA-256 dos bytes originais, `semantics_version: 2`, a `configuration` canônica com opções de importação, notação de texto, tipos de destino, etapas, análise e a `resource_policy` com modelo e limite efetivo em bytes. A prova registra contagens de tipos de origem, notações e estados de cache antes das transformações, além dos perfis das colunas resultantes, estados das conversões e etapas aplicadas. A prova contém evidências agregadas e configurações da receita. Os bytes originais ficam com o usuário.

A reprodução de uma receita v2 exige os mesmos bytes de origem e versões compatíveis de semântica e de política de recursos. O descritor tem limite de 4.096 bytes UTF-8. Um hash divergente retorna `invalid_input`. Uma versão histórica ou desconhecida retorna `unsupported`. Provas v1 continuam legíveis na interface. Na migração explícita, a pessoa seleciona os bytes originais, o aplicativo confere o hash e executa a configuração registrada pela semântica v2 para gerar um novo resultado. A prova histórica permanece intacta. Estatísticas, validade de datas e chaves tipadas do pipeline podem mudar no novo resultado. [Verificações de compatibilidade](compatibility.pt-BR.md)

O comando `cargo test --locked -p dars-universal --no-default-features --features data-lab` verifica o contrato em Rust. As evidências da revisão apontam para os arquivos de teste independentes e as comparações entre ambientes de execução.
