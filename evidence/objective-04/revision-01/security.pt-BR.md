# Segurança e escopo dos dados

[English](security.md)

O Worker financeiro local recebe duas receitas delimitadas e devolve a Calculation Proof derivada pelo Rust. Campos desconhecidos e comparações aninhadas são rejeitados. A importação reexecuta as receitas no motor antes de mostrar resultados. Os arquivos de cenários e de provas são exportados por ação explícita do usuário.

Os testes usam dados sintéticos. A origem local do aplicativo e os limites de arquivo foram preservados. A revisão manteve as permissões de execução e o armazenamento temporário dos cálculos.

O Windows registrou o evento 3077 de integridade de código sob a política `VerifiedAndReputableDesktop` e impediu a execução de um binário local instrumentado com o erro 4551. O CLI de produção e o WASM rodaram localmente. A medição instrumentada foi encaminhada ao fluxo Linux hospedado. As proteções do Windows permaneceram em vigor. [Documentação do evento](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/event-id-explanations)
