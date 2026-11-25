# Etapas internas do Objetivo 03

[English](PLAN.md) · [Autorização do proprietário](../objective-02/approval.json) · [Missão](../../PROJECT_SPEC.md)

A entrega 0.2.2 é a base aprovada. Registre em cada etapa a especificação matemática, a investigação de dependências, os domínios e limites, o motor e a interface, a integração com o gerenciador e o Adaptive, a localização, a validação matemática independente, a segurança, o desempenho, a documentação e a regressão. Registre a aceitação interna antes de iniciar o módulo seguinte. O Calculation Proof começa na primeira etapa. O Objetivo 03 permanece em andamento até a auditoria global.

| Etapa | Módulo | Estado |
| --- | --- | --- |
| 1 | Scientific | INTERNALLY_ACCEPTED · [Verificação](scientific/verification.pt-BR.md) · [CI](scientific/ci.json) |
| 2 | Álgebra | INTERNALLY_ACCEPTED · [Verificação](algebra/verification.pt-BR.md) · [CI](algebra/ci.json) |
| 3 | Cálculo | INTERNALLY_ACCEPTED · [Verificação](calculus/verification.pt-BR.md) · [CI](calculus/ci.json) |
| 4 | Álgebra Linear | INTERNALLY_ACCEPTED · [Verificação](linear-algebra/verification.pt-BR.md) |
| 5 | Geometria | NOT_STARTED |
| 6 | Matemática Discreta | NOT_STARTED |
| 7 | Programador | NOT_STARTED |
| 8 | Conversor | NOT_STARTED |
| 9 | Data e Hora | NOT_STARTED |
| Auditoria | Objetivo 03 integrado | NOT_STARTED |

A auditoria global repete as 602 verificações rastreadas, exercita os dez módulos e sete idiomas e valida Windows, navegador, CLI/WASM, CI, segurança, modo offline, desempenho, memória e publicação. [Regressão de referência](../objective-02/revision-02/tests.json) · [Dívida e protocolo de memória no Windows](../objective-02/revision-02/memory-debt.pt-BR.md)
