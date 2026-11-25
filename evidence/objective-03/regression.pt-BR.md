# Objetivo 03 · Regressão sobre a versão 0.2.2 aprovada

[English](regression.md) · [Relatório integrado](REPORT.pt-BR.md) · [Registro de testes](tests.json) · [Reprodução](reproduction.pt-BR.md)

O proprietário aprovou a versão 0.2.2 com nota 95/100. O código testado estava no commit `d3c5a95d9c059fceb19e6f4f50e7c4dd38be2fad`. O registro contou 594 verificações já rastreadas e oito novas, chegando a **602 verificações distintas**. O mapa preserva essas asserções por suíte ou por equivalente explicitamente rastreado. Testes de ferramentas avançadas, repetições com executáveis instrumentados e execuções duplicadas no CI têm contagens próprias. [Aprovação do proprietário](../objective-02/approval.json) · [Registro de 0.2.2](../objective-02/revision-02/tests.json)

| ID da suíte de base | Verificações mapeadas | Caminho no Objetivo 03 |
| --- | ---: | --- |
| `rust_core` | 16 | Testes do núcleo matemático Standard com dependências fixadas. [Suíte do núcleo](../../crates/dars-core/src/lib.rs) |
| `cli_independent_oracle` | 157 | Referências Python existentes para racionais e decimais na CLI otimizada. [Oráculo](../../tests/oracle.py) |
| `wasm_structured_independent_oracle` | 291 | Oráculo Python independente existente para valores estruturados no WASM Standard gerado. [Oráculo](../../crates/dars-core/tests/structured-oracle.py) |
| `cli_wasm_parity` | 20 | Pares existentes de paridade do Standard na CLI e no WASM. [Executor de paridade](../../tests/check-targets.mjs) |
| `typescript_node` | 57 | Pontos de entrada dos testes existentes de estado Standard, worker, módulos, Adaptive e agendador no Node. As adições de registro de cálculo entram apenas na contagem da execução atual. [Comando de teste Node](../../apps/web/package.json) |
| `physical_windows_chrome` | 27 | Fluxos existentes no Chrome Windows para interação Standard, porcentagens, memória, continuação, operações, recursos com fixtures, Adaptive e recuperação de worker no shell real. [Suítes no navegador](../../apps/web/tests) |
| `browser_explicit_offline` | 10 | Asserções avulsas existentes de funcionamento web offline e idiomas sob demanda. [Executor offline](../../tests/verify-web-offline.mjs) |
| `native_windows_webview2_ui` | 17 | Verificações existentes de Standard e Operações na interface Windows passaram no executável integrado, no modo `--objective-03` do mesmo executor. [Executor desktop](../../scripts/verify-desktop.mjs) · [Resultados na interface nativa](windows-ui.json) |
| `native_windows_provider_credentials` | 2 | Validação existente de identificador e tamanho e ciclo de armazenamento e exclusão de uma credencial sintética no Gerenciador de Credenciais do Windows. A verificação de identificador e tamanho é contada uma vez. [Testes de credenciais](../../apps/desktop/src/credentials.rs) |
| `native_windows_sensor_rust` | 5 | Asserções unitárias existentes sobre dados e sensores do Windows. A execução real de capacidades confirma o comportamento nativo separadamente. [Fonte dos sensores](../../apps/desktop/src/capabilities.rs) · [Executor nativo](../../scripts/verify-native-capabilities.mjs) |
| **Total** | **602** | **As 602 verificações de base passaram no candidato integrado.** [Registro de testes](tests.json) |

## Recuperação e garantias do Standard

A falha antiga do agendador permitia que um callback travado ocupasse a vaga ativa mesmo após o prazo e o cancelamento. Os testes de 0.2.2 exigiam um sucessor válido nos cinco perfis. A fixture de navegador e os testes Node correspondentes continuam nas suítes atuais e cobrem expiração, cancelamento, conclusão tardia, troca de módulos e descarte. No supervisor do Standard de produção, um worker travado, com resposta inválida ou falha de inicialização deve ceder a vaga a um novo worker dentro da política limitada. [Reprodução histórica e evidência](../objective-02/revision-02/recovery.md) · [Suíte do agendador](../../apps/web/tests/module-work.test.mts) · [Suíte no shell de navegador real](../../apps/web/tests/module-shell.spec.ts) · [Testes do supervisor Standard](../../apps/web/tests/worker.test.mts)

O Standard conserva os tipos de racionais e intervalos certificados, a semântica relativa e absoluta de porcentagens, as operações de memória, o armazenamento de valores e a continuação. As respostas de base da CLI e do WASM conservam seu contrato estruturado. A geração do registro de cálculo é explícita e seus testes são contados à parte das 602 verificações. [Regressões do Standard no navegador](../../apps/web/tests/standard-revision.spec.ts) · [Contrato do registro de cálculo](calculation-proof/contract.pt-BR.md)

## Módulos avançados e repetições

As suítes matemáticas independentes cobrem cada novo módulo. A paridade entre CLI e WASM confere contratos de resultados e erros nos dois alvos e em módulos isolados. A cobertura de linhas agrega testes Rust e referências instrumentadas. O relatório integrado aponta os resultados por módulo, os critérios de exatidão e tolerância, as medições isoladas e os recortes bruto e de execução para o Conversor. [Evidências dos módulos](REPORT.pt-BR.md#validação-dos-módulos) · [Registro de testes](tests.json)
