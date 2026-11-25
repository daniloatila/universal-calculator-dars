# Objetivo 02 · Revisão 02 · DARS 0.2.2

[English](REPORT.md) · [Entrega anterior](../revision-01/REPORT.pt-BR.md)

**Estado** `READY_FOR_REVIEW`

O proprietário informou a avaliação independente de 93/100 para o 0.2.1 e autorizou a correção do agendador para o 0.2.2. As evidências anteriores e os estados de aprovação continuam como referência. [Reprodução do defeito](reproduction.md) · [Dívida de memória](memory-debt.pt-BR.md)

## Defeito e recuperação

A reprodução no 0.2.1 confirmou que a primeira tarefa essencial expirou e recebeu o pedido de cancelamento. Sua Promise continuou pendente e reteve a vaga. A segunda tarefa essencial também expirou, com zero tentativas de execução. [Resultado observado](tests.json) · [Reprodução](reproduction.md)

O agendador agora admite uma tarefa por worker dedicado do pacote. Ao concluir, falhar, expirar, receber cancelamento ou sair do escopo do módulo, invalida os callbacks e encerra o worker antes de liberar a vaga. A próxima tarefa admitida recebe seu próprio worker. Respostas atrasadas são descartadas e tarefas expiradas não voltam a ser executadas automaticamente. Se o encerramento falhar, o agendador fecha as admissões e continua contabilizando a vaga ocupada. [Implementação](../../../apps/web/src/module-work.ts) · [Especificação do encerramento](https://html.spec.whatwg.org/multipage/workers.html#dom-worker-terminate-dev)

## Verificações

- No Chrome, uma tarefa sem resposta foi encerrada em cada um dos cinco perfis. Todas as sucessoras essenciais retornaram valores de 42 a 46 na mesma instância do aplicativo. O teste também verificou recuperação de tarefas secundárias, cancelamento, suspensão e troca de módulo. Os 19 workers criados pelo agendador nesses cenários foram encerrados. [Resultados do navegador](scheduler-outcomes.json)
- Os testes Node verificaram filas cheias, limites separados de concorrência, callbacks obsoletos, cancelamento durante a criação do worker e falhas repetidas. A matriz identifica os 14 casos solicitados e seus testes. O Standard mantém seu supervisor do worker Rust/WASM. [Matriz de recuperação](recovery.md)
- A regressão passou **602 verificações**, com 594 equivalentes rastreados e oito adições. O núcleo matemático ficou com 98,87% de cobertura de linhas e 95,69% de regiões. O executável Windows 0.2.2 passou 17 verificações de interface e um ensaio separado de capacidades do WebView2. Os testes de produção cobrem cache offline, sete idiomas, tema escuro azul-marinho padrão e cálculos exatos. [Regressão](tests.json) · [Evidências Windows](windows.json) · [GitHub Actions](ci.json)

## Dívida de memória monitorada

No 0.2.1, o commit privado da árvore de processos nas quatro minimizações registrou medianas de 252,42, 307,36, 308,43 e 376,20 MiB. Os auxiliares do WebView2 concentraram o aumento. A causa das alocações continua indeterminada, e a meta de menos de 100 MB incrementais no modo básico permanece aberta. O roteiro exige acompanhamento nos Objetivos 03–08. O plano anterior à versão 1.0.0 estabelece critérios para medir estabilização, retenção, crescimento sustentado e vazamentos. [Registro e protocolo](memory-debt.pt-BR.md)

## Estado de revisão

O Objetivo 01 permanece `APPROVED`. O Objetivo 02 aguarda a decisão do proprietário e o Objetivo 03 permanece `NOT_STARTED`. Esta é uma versão de desenvolvimento. [Aceitação](acceptance.json) · [Estado do projeto](../../../docs/pt-BR/project-state.md)
