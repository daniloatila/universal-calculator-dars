# Estado do projeto

[English](../../PROJECT_STATE.md) · [Roteiro](roadmap.md) · [Missão original](../../PROJECT_SPEC.md)

## Objetivo atual

**Objetivo 05 · Ciência, engenharia e dados · 0.5.1 · APPROVED**

Em 24/11/2026, o proprietário aprovou o Objetivo 01 após a avaliação independente de 95/100 e autorizou o Objetivo 02. A entrega 0.1.1 revisada é a referência comparativa. [Aprovação](../../evidence/objective-01/approval.json) · [Revisão 01](../../evidence/objective-01/revision-01/REPORT.md) · [Relatório do Objetivo 02](../../evidence/objective-02/REPORT.md)

Em 25/11/2026, o proprietário aprovou o Objetivo 02 na versão 0.2.2 após a avaliação independente final de 95/100 e autorizou o Objetivo 03. O commit aprovado da 0.2.2 é a referência de regressão e de recursos. [Aprovação](../../evidence/objective-02/approval.json) · [Evidências da entrega aprovada](../../evidence/objective-02/revision-02/REPORT.pt-BR.md)

As nove etapas internas de matemática e a auditoria integrada foram concluídas. A versão 0.3.0 passou na regressão mapeada, nos testes locais de Windows e Chrome e nos quatro jobs do commit auditado. O próximo objetivo exige decisão explícita do proprietário. [Relatório integrado](../../evidence/objective-03/REPORT.pt-BR.md) · [Registro de aceitação](../../evidence/objective-03/acceptance.json)

A avaliação independente atribuiu 90/100 à versão 0.3.0 e manteve a aprovação pendente até a correção das entradas editáveis durante mudanças de idioma. A revisão 01 corrige a falha e passou nas 42 transições direcionais em dez ferramentas, nas 602 verificações mapeadas e nos quatro jobs de CI. Em 25/11/2026, o proprietário aprovou a revisão 0.3.1 após a avaliação independente final de 95/100 e autorizou o Objetivo 04. [Aprovação](../../evidence/objective-03/approval.json) · [Relatório da revisão](../../evidence/objective-03/revision-01/REPORT.pt-BR.md) · [Aceitação](../../evidence/objective-03/revision-01/acceptance.json)

A avaliação independente atribuiu 91/100 ao Objetivo 04 e manteve a aprovação pendente até a correção semântica do Comparador de Cenários. A entrega e as verificações da 0.4.0 formam a referência histórica. [Achados da revisão](../../evidence/objective-04/revision-01/findings.json)

A revisão 0.4.1 passou na regressão mapeada, nos testes físicos em Windows e nos quatro jobs de CI no commit de código `5329e697a105685f3206d14adac9832224bcf53e`. A cobertura das linhas financeiras instrumentadas chegou a 97,26%. O proprietário aprovou essa revisão após a nova auditoria. [Relatório da revisão](../../evidence/objective-04/revision-01/REPORT.pt-BR.md) · [Aceitação](../../evidence/objective-04/revision-01/acceptance.json)

Em 26/11/2026, o proprietário aprovou a revisão 0.4.1 com avaliação independente de 95/100 e autorizou o Objetivo 05. [0.4.1](../../evidence/objective-04/approval.json)

Os sete módulos científicos passaram pelos oráculos independentes e pelos testes integrados. O Chrome local e o Chromium no CI passaram em 224 testes cada. A matriz de 924 comparações cobre os 22 módulos. O executável Windows foi testado offline no dispositivo físico, e os quatro jobs do commit de código passaram. A 0.5.0 seguiu para auditoria independente. [Relatório](../../evidence/objective-05/REPORT.pt-BR.md) · [CI](../../evidence/objective-05/integrated-audit/ci.json)

O parecer independente da 0.5.0 atribuiu 89/100 e manteve a aprovação pendente. A revisão 0.5.1 corrigiu números nativos, datas de fórmulas e o orçamento de recursos do Laboratório de Dados. A regressão e o aplicativo Windows foram verificados. O Objetivo 05 aguarda nova auditoria independente. [Relatório da revisão](../../evidence/objective-05/revision-01/REPORT.pt-BR.md) · [CI](../../evidence/objective-05/revision-01/ci.json)

O proprietário aprovou formalmente o Objetivo 05 com 95/100 e autorizou o Objetivo 06 em 26/11/2026. [0.5.1](../../evidence/objective-05/approval.json)

| Objetivo | Versão planejada | Estado | Evidências |
| --- | --- | --- | --- |
| 01 · Fundação | 0.1.1 | APPROVED | [Aprovação](../../evidence/objective-01/approval.json) · [Revisão 01](../../evidence/objective-01/revision-01/REPORT.md) |
| 02 · Inteligência operacional | 0.2.2 | APPROVED | [Aprovação](../../evidence/objective-02/approval.json) · [Revisão 02](../../evidence/objective-02/revision-02/REPORT.pt-BR.md) |
| 03 · Matemática universal | 0.3.1 | APPROVED | [Aprovação](../../evidence/objective-03/approval.json) · [Revisão 01](../../evidence/objective-03/revision-01/REPORT.pt-BR.md) · [Auditoria histórica da 0.3.0](../../evidence/objective-03/REPORT.pt-BR.md) |
| 04 · Finanças e negócios | 0.4.1 | APPROVED | [Revisão 01](../../evidence/objective-04/revision-01/REPORT.pt-BR.md) · [Aceitação](../../evidence/objective-04/revision-01/acceptance.json) · [Relatório 0.4.0](../../evidence/objective-04/REPORT.pt-BR.md) |
| 05 · Ciência, engenharia e dados | 0.5.1 | APPROVED | [Relatório](../../evidence/objective-05/revision-01/REPORT.pt-BR.md) · [Aceitação](../../evidence/objective-05/revision-01/acceptance.json) |
| 06 · Produtividade, automação e IA | 0.6.0 | NOT_STARTED | `evidence/objective-06/` |
| 07 · Distribuição e atualizações | 0.9.0 | NOT_STARTED | `evidence/objective-07/` |
| 08 · Auditoria global e lançamento | 1.0.0 | NOT_STARTED | `evidence/objective-08/` |

## Revisão e retomada

- `NOT_STARTED` indica que o objetivo ainda não tem implementação autorizada em andamento.
- `IN_PROGRESS` indica que a implementação ou verificação está em andamento.
- `BLOCKED` identifica um resultado obrigatório que depende de um pré-requisito externo indisponível. Registre o pré-requisito e o trabalho concluído independentemente dele.
- `FAILED_VALIDATION` indica que um comportamento obrigatório falhou na verificação. Registre os testes que falharam e como reproduzi-los.
- `READY_FOR_REVIEW` indica que os critérios obrigatórios foram demonstrados e o proprietário pode revisar as evidências. Aguarde antes de iniciar o objetivo seguinte.
- `APPROVED` exige decisão explícita do proprietário. Preserve a referência à decisão no relatório do objetivo.

Para retomar o trabalho, confira o branch, a árvore de trabalho, o estado e as evidências de aceitação atuais. Preserve o diretório existente `github-portfolio/` fora do commit do DARS e use caminhos relativos em evidências públicas.
