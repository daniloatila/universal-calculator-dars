# Revisão de segurança do DARS 0.1.1

[Relatório de revisão](REPORT.md) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45499090489) · [Linha de base de segurança](../security.md)

## Limites de entrada e execução

O núcleo interpreta a expressão com seu próprio parser Rust. Os limites existentes de 4.096 bytes por expressão, 256 dígitos por literal, 256 nós e 48 níveis de aninhamento continuam válidos. O novo transporte admite até 256 valores por requisição, com até 10.000 bytes por valor, 2.565.122 bytes por mapa e 8.192 bits por inteiro. O núcleo valida a sintaxe canônica, as frações reduzidas e a ordem dos extremos dos intervalos. IDs desconhecidos, mapas inválidos e estouros retornam erros estruturados. Nenhuma expressão é executada como código do ambiente. [Parser](../../../crates/dars-core/src/parser.rs) · [Valores matemáticos](../../../crates/dars-core/src/stored_value.rs) · [Testes](tests.json)

O worker tem limite de 15 segundos para iniciar, cinco segundos para uma tarefa ativa, até oito operações pendentes contando a ativa e até duas tentativas automáticas consecutivas de recuperação. Cancelamento, falhas de transporte e timeout fecham o worker afetado quando necessário. A geração anterior deixa de aceitar resultados. O cálculo e a precisão continuam sob responsabilidade de Rust. [Adaptador](../../../apps/web/src/engine.ts) · [Regressão](regression.md)

## Dados e publicação

A memória, os valores reutilizáveis e o histórico permanecem na sessão. O cache offline contém recursos estáticos da aplicação. Idioma e tema continuam sendo preferências persistidas. Os testes offline de Chrome e WebView2 não observaram chamadas externas da página no intervalo monitorado. O executável usa recursos locais com CSP e sem capacidades Tauri concedidas. A porta de depuração em loopback foi habilitada pelos ensaios em perfis isolados. [Verificações](tests.json) · [Configuração desktop](../../../apps/desktop/tauri.conf.json)

O Gitleaks 8.30.1 e a inspeção dos arquivos alterados foram aplicados à árvore revisada antes da publicação. A publicação inclui código, documentação, instrumentos de medição e evidências sanitizadas. Perfis, saídas brutas de sistema, estado local, credenciais e o executável ficaram fora da árvore publicada. O repositório permanecia público, com zero tags e zero releases no momento da verificação da entrega.

## Auditoria dos lockfiles

O job de segurança em Ubuntu retornou zero vulnerabilidades no npm e aprovou `cargo audit --deny yanked` sobre 425 dependências do Cargo, sem vulnerabilidades classificadas como erro ou versões retiradas. O Cargo registrou três avisos já presentes no 0.1.0.

| Dependência | Categoria | Advisory |
| --- | --- | --- |
| chrono 0.4.45 | Sem manutenção | [RUSTSEC-2026-0543](https://rustsec.org/advisories/RUSTSEC-2026-0543) |
| proc-macro-error 1.0.4 | Sem manutenção | [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370) |
| glib 0.18.5 | Invariante de segurança em iteradores | [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429) |

As verificações de dependências valem para o lockfile e as bases consultadas na execução registrada. O resultado de zero vulnerabilidades reportadas e os três avisos devem ser lidos juntos. [Execução de segurança](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45499090489/job/138817259704)
