# Segurança e escopo dos dados

[English](security.md)

O Worker financeiro local recebe duas receitas delimitadas e devolve a Calculation Proof derivada pelo Rust. Campos desconhecidos e comparações aninhadas são rejeitados. A importação reexecuta as receitas no motor antes de mostrar resultados. Os arquivos de cenários e de provas são exportados por ação explícita do usuário.

Os testes usam dados sintéticos. A origem local do aplicativo e os limites de arquivo foram preservados. A revisão manteve as permissões de execução e o armazenamento temporário dos cálculos.

O Windows registrou o evento 3077 de integridade de código sob a política `VerifiedAndReputableDesktop` e impediu a execução de um binário local instrumentado com o erro 4551. O CLI de produção e o WASM rodaram localmente. A medição instrumentada foi encaminhada ao fluxo Linux hospedado. As proteções do Windows permaneceram em vigor. [Documentação do evento](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/operations/event-id-explanations)

A consulta somente leitura `Get-MpComputerStatus` confirmou o serviço e o antivírus Microsoft Defender, a proteção em tempo real, o monitoramento de comportamento e a proteção contra adulteração ativos. O log de integridade de código confirmou a aplicação da política do Smart App Control nos dois bloqueios observados.

O job de segurança do commit auditado passou. O npm audit registrou zero vulnerabilidades. O Cargo Audit registrou três avisos permitidos em dependências já presentes no lockfile, `chrono`, `proc-macro-error` e `glib`. A revisão atualizou somente as versões dos pacotes do DARS no lockfile Rust. [Aviso do Chrono](https://rustsec.org/advisories/RUSTSEC-2026-0543) · [Aviso do proc-macro-error](https://rustsec.org/advisories/RUSTSEC-2024-0370) · [Aviso do GLib](https://rustsec.org/advisories/RUSTSEC-2024-0429)
