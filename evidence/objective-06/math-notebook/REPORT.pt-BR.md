# Caderno Matemático

[English](REPORT.md) · [Esquema JSON portável](notebook-v1.schema.json) · [Exemplo financeiro](financial-plan.darsnb)

Abra o Caderno Matemático na categoria de produtividade. O exemplo financeiro começa com três variáveis editáveis, capital de R$ 10.000, taxa mensal efetiva de 0,01 e prazo de 12 meses. Ao selecionar **Recalcular**, o caderno apresenta o capital futuro, o ganho, o gráfico e a prova. Selecione a taxa no índice, escolha **Editar**, informe 0,02 na notação brasileira e aplique. São atualizados a taxa, a projeção, o ganho, o gráfico e a prova. Capital inicial e prazo conservam seus registros anteriores.

O exemplo inicial produz **R$ 11.268,25** de capital futuro e **R$ 1.268,25** de ganho, com arredondamento monetário para o par. O capital exato é `1126825030131969720661201/100000000000000000000`. Os 13 pontos do gráfico abrangem o mês zero e os 12 meses da aplicação. O motor financeiro Rust calcula cada ponto. A tabela e a exportação mantêm os racionais exatos. A projeção das coordenadas do gráfico usa ponto flutuante para desenhar a curva.

### Edição e cálculo

O identificador de cada célula permanece estável quando sua posição muda. O índice, o editor e o documento permitem adicionar, duplicar, excluir e reordenar células. Use as setas, Home ou End para navegar no índice e Alt com uma seta para mover a célula selecionada. Ctrl/Cmd+Enter aplica a edição ou recalcula o caderno. Ctrl/Cmd+Z e Ctrl/Cmd+Shift+Z desfazem e refazem edições confirmadas fora dos campos de texto. Cada histórico comporta até 24 versões do documento em até um MiB.

Células de título e texto apresentam explicações, parágrafos, negrito, ênfase e código em linha. O renderizador exibe HTML como texto. Variáveis, expressões e cálculos científicos e financeiros usam o catálogo para chamar os motores Rust. Fórmulas personalizadas identificam a definição declarativa e sua versão exata. Uma tabela recebe uma matriz JSON retangular de textos. Células de gráfico, resultado e prova referem-se a outra célula por `@id`. Nas projeções financeiras, `amount_exact` e `interest_exact` identificam os campos matemáticos. Por exemplo, `@growth.interest_exact` seleciona o ganho exato. Os campos de apresentação monetária têm sua própria regra de arredondamento.

As expressões aceitam referências a valores numéricos exatos adimensionais. O cálculo financeiro exige que as unidades das entradas sejam compatíveis com a moeda solicitada, `rate/month` e `month`. A biblioteca de fórmulas verifica dimensões em fórmulas personalizadas. O motor financeiro recebe frações decimais finitas quando cabem na precisão aceita. Dimensões incompatíveis, resultados indisponíveis e dependências numéricas aproximadas geram erros explícitos. Resultados científicos aproximados continuam disponíveis para inspeção com a incerteza registrada na prova. A notação de entrada acompanha a célula quando o idioma muda.

### Formato, autorização e limites

Um arquivo `.darsnb` contém JSON UTF-8, com formato `dars-notebook`, versão 1, título e células ordenadas. A abertura verifica nomes de campos, tipos, identificadores, profundidade, duplicação de chaves, registros históricos e definições de fórmulas incorporadas. Os resultados importados aparecem como armazenados. É preciso autorizar o recálculo para executar operações. A variante preliminar versão 0 com `notation: "ascii-point"` migra para versão 1 com notação inglesa. Outras versões são recusadas.

O registro de cada célula calculada contém dependências diretas, alterações que motivaram o recálculo, entradas com unidades, fonte, notação, resultado e provas dos motores. O recibo da fórmula inclui definição e versão. A exportação explícita incorpora as definições dos cálculos locais verificados, em ordem de dependência. A abertura preserva a biblioteca global do aplicativo. Ao autorizar uma execução com fórmulas anexadas, o caderno verifica os respectivos testes em uma biblioteca isolada. O estado permanece temporário e o salvamento em arquivo é explícito.

Os metadados opcionais do documento admitem uma descrição de até 1.024 caracteres e até 16 etiquetas de 40 caracteres cada. A célula de resultado conserva a prova de sua origem, permitindo consultá-la em outra célula.

Há limites de 128 células, 512 referências diretas, 32 níveis de dependência e 4.096 caracteres de fonte por célula. Cada tabela admite até 128 linhas e 12 colunas. Um recálculo dispõe de 256 chamadas aos motores, com execução sequencial, orçamento adaptativo, prazo de 45 segundos e cancelamento. O arquivo comporta até dois MiB. Durante o cálculo, o caderno estima os bytes do documento e dos resultados retidos, controla as provas provisórias e aplica o menor limite entre dois MiB e um oitavo da margem de dados do perfil ativo. Uma recusa preserva as células independentes confirmadas. Erros e ciclos impedem que uma célula forneça valor aos seus descendentes. Registros históricos e resultados desatualizados ficam fora do mapa de dependências válidas.

A suíte `node --experimental-strip-types --test apps/web/tests/notebook.test.mts` verifica estrutura e limites. Na distribuição web, `npx playwright test math-notebook.spec.ts` cobre o planejamento financeiro, a edição, o cancelamento, as fórmulas, o consentimento após importação e os 42 pares direcionais de idiomas. [Recibos de testes](tests.json)

As referências usam o identificador estável da célula, por exemplo @capital. O símbolo da variável é um rótulo distinto que deve ser único no documento.

O exemplo financeiro contém sete registros históricos de células e treze provas financeiras. O Chrome instalado reabriu o documento e reproduziu as sete saídas após o recálculo autorizado. O PowerShell validou o arquivo exportado com o esquema publicado e sua referência local ao esquema de fórmulas. [Exemplo portável e hashes](tests.json)
