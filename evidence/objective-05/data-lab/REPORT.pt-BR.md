# Laboratório de dados

[English](REPORT.md)

Na interface Windows ou web, um worker dedicado recebe o arquivo local escolhido pelo usuário. O Rust lê as linhas, executa as etapas declaradas e gera o perfil e a prova do cálculo. A linha de comando usa o mesmo leitor com `dars dataset SETTINGS_JSON` e os bytes na entrada padrão. Python é usado apenas nos testes independentes.

## Formatos e tipos

CSV e TSV aceitam campos entre aspas, delimitadores embutidos, CRLF, UTF-8 com BOM opcional, Latin-1 e UTF-16 com ordem explícita. JSON aceita uma lista de objetos planos e preserva a grafia original dos números. O primeiro objeto define as colunas em ordem alfabética. Chaves ausentes em linhas seguintes são marcadas como ausentes. Chaves duplicadas, colunas novas ou valores aninhados geram erro. A detecção de cabeçalhos exige nomes distintos começando por letra. É possível escolher o modo explicitamente.

As colunas começam como texto. Os tipos e o separador decimal são escolhas independentes do idioma da interface. Inteiros e decimais compartilham o leitor racional limitado do Conversor. São aceitos até 128 dígitos e expoente com magnitude até 256. Frações calculadas continuam exatas. A grafia dos dados originais é preservada, inclusive zeros à esquerda. Vazio, ausente, nulo, inválido e zero possuem representações distintas. Datas e horários usam tipos civis ISO explícitos. Ao converter uma coluna para número, o texto NaN fica marcado como inválido.

Em XLSX o leitor resolve a planilha selecionada, as cadeias compartilhadas e os estilos. Ele preserva a grafia numérica, a posição das células esparsas e a época 1900 ou 1904 de números seriais com formato de data reconhecido. O serial original permanece disponível, inclusive o valor 60. Fórmula, cache salvo e erro de célula são identificados individualmente. Uma fórmula sem cache tem resultado desconhecido. O suporte se limita aos dados tabulares e não inclui recálculo de fórmulas nem reprodução de todos os estilos do Excel. [Modelo SpreadsheetML da Microsoft](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas)

## Transformações e análise

O pipeline JSON versionado permite filtrar, ordenar, selecionar, renomear, converter tipos, remover ou preencher ausentes, descartar duplicatas literais, agrupar, calcular colunas, transformar texto e juntar tabelas. Uma coluna calculada contém dois operandos explícitos e um de quatro operadores aritméticos. A junção por tabela de consulta usa chaves únicas, modo esquerdo ou interno e uma coluna de saída. Os grupos oferecem contagem válida, soma, média, mínimo e máximo. As chaves de agrupamento e deduplicação consideram texto original e origem da célula. A ordenação numérica usa valores exatos. Cada etapa registra as contagens de entrada e saída. Em agrupamentos, a diferença inclui linhas consolidadas.

O editor do navegador aceita todo o conjunto declarativo de operações, inclusive ao carregar um arquivo de pipeline salvo. O formulário de etapas oferece atalhos para filtrar por igualdade, ordenar, remover duplicatas, descartar linhas com dados ausentes, aparar texto e multiplicar uma coluna por dois.

O perfil apresenta contagens por origem e medidas exatas. A análise opcional usa quartis tipo 7, limites de Tukey de 1,5 intervalo interquartil e oito classes de mesma largura. O máximo cai na última classe, exceto em amostras constantes, que ocupam a primeira. Para duas colunas numéricas, os pares completos determinam a correlação de Pearson como raiz com sinal do r² exato. Com variância nula ou menos de dois pares, o coeficiente fica indefinido. A correlação isolada não estabelece causalidade.

## Limites e reprodução

Os limites são 16 MiB de entrada, 200 mil linhas, 64 colunas, 1,2 milhão de células e 4 KiB por campo. A abertura do conjunto aceita até 16 KiB de JSON de configuração. Para gerar uma prova portátil, o descritor com a configuração e o hash de origem deve caber em 4 KiB. Até 32 etapas compartilham o orçamento de 12 milhões de células contadas na entrada de cada etapa. A prévia mostra 25 linhas por página. O worker comunica as fases de inicialização, leitura, importação e geração da saída. Cancelar encerra o worker. Paginar e exportar recriam a tabela a partir da referência temporária ao arquivo. Sair do módulo libera o arquivo e a prévia.

O manifesto registra SHA-256, esquema, tipos, dimensões, configuração, etapas e resultados. Para conferir um manifesto é necessário selecionar os mesmos bytes e reproduzir a configuração. O usuário pode exportar só o pipeline e reaplicá-lo em outra tabela compatível. O CSV literal exporta o texto de cada célula da tabela transformada, incluindo o valor armazenado de uma fórmula quando disponível. O CSV protegido acrescenta um prefixo a textos que planilhas podem interpretar como fórmulas. A prévia identifica separadamente as fórmulas de origem e o estado do cache.

Execute os grupos Rust com `cargo test --locked -p dars-universal --no-default-features --features data-lab data_lab::`. Depois de compilar a CLI e os módulos WASM, rode `node tests/check-data-targets.mjs target/release/dars` para as 20 comparações de provas completas. Elas incluem duas planilhas e decimais além do limite de inteiros do binary64. Os testes de volume usam `node benchmarks/science-data.mjs`. [Comparações independentes](../../../tests/check-data-targets.mjs) · [Medições](benchmarks.json)

A captura usa a demonstração sintética do aplicativo, com identificadores A e B e valores 1,25 e 2,50. [Captura do navegador](web.png)
