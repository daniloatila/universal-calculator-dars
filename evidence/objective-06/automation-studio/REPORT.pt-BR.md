# Automation Studio

Escolha um exemplo, confira as entradas e edite a definição antes de selecionar **Executar**. Há um controle próprio para selecionar um CSV, TSV, JSON ou XLSX local. Abrir um .darsflow ou uma prova exportada permite revisar seu conteúdo. Para reproduzir uma prova, selecione o arquivo de dados original. O fluxo confere as etapas, os hashes e os resultados recém-calculados. Salvar exige um clique. A instrução de exportação dentro do fluxo seleciona valores para a saída.

| Exemplo | Operações conectadas | Resultado observado |
| --- | --- | --- |
| Financeiro | Dois cenários de juros compostos, comparação semântica Rust, diferença exata e condição | R$ 11.268,25 e R$ 11.956,18 em 12 períodos iguais. O comparador classificou os montantes como diretamente comparáveis. |
| Empresarial | Tabela local tipada, iteração por linha, margem, markup e consolidação | Ganho de 70 e margem ponderada de 14/45. |
| Estatístico | Data Lab v2, preenchimento explícito dos ausentes, estatística e histograma | Quatro observações de origem, soma 12 e hash do arquivo preservado. |
| Científico | 512 amostras da distribuição normal, semente 42, três quantis e análise estatística | A repetição reproduziu as provas e os resultados. Os registros conservam a indicação de aproximação. |

[Recibos e tempos](execution.json) · [Quatro definições portáveis](../../../apps/web/src/automation-examples) · [Esquema JSON](../../../schemas/automation-flow-v1.schema.json)

O leitor v1 aceita 128 KiB por fluxo, 32 entradas, 16 saídas, 96 etapas estáticas e quatro níveis de aninhamento. Verifica referências anteriores, recusa chaves duplicadas e conserva decimais e frações exatas como texto. Entradas localizadas conservam a notação de origem. A aritmética com unidade verifica dimensões. A chamada de fórmula fixa identificador e versão. A declaração de juros simples 1.0.0 produziu R$ 1.200 e registrou seus três testes.

Um fluxo pode usar até 240 operações, 64 iterações por laço, 200 mil linhas de origem acumuladas e 60 segundos. O Data Lab recebe o saldo do orçamento do perfil ativo. Entram na conta os resultados intermediários, as provas e o pico estimado de cada importação. As agregações abrangem a tabela inteira. A iteração por linha exige a página completa e acusa erro quando essa condição falha. Repetir a importação consome novamente a margem disponível. Cancelamento, referência inválida ou orçamento esgotado deixam um recibo e limpam os valores de saída.

A mensagem de conclusão se refere ao fluxo. Cada cálculo efetivo no Rust mostra sua prova e sua exatidão. Um aviso aparece quando o fluxo usa entrada ou resultado aproximado, inclusive nas análises de quantis simulados. Um fluxo que somente seleciona valores mostra a conclusão das etapas.
