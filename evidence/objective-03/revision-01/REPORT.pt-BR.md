# Objetivo 03 · Revisão independente e correção · DARS 0.3.1

[English](REPORT.md) · [Relatório histórico da 0.3.0](../REPORT.pt-BR.md) · [Achados](findings.json) · [Reprodução](reproduction.md)

**Estado** `READY_FOR_REVIEW` para a 0.3.1 após a matriz de navegador, as regressões, as medições nativas pareadas e o CI no commit exato. A auditoria independente avaliou a 0.3.0 em **90/100** e deixou a aprovação pendente. Os Objetivos 01 e 02 mantêm a aprovação do proprietário. O Objetivo 04 permanece `NOT_STARTED`.

## Comportamento confirmado na 0.3.0

O executável Windows arquivado, SHA-256 `8c2da09e07fa9e5a95bf3e068105b63a2e1e860582fb371dcc0bd4ace4db3d88`, foi conferido com o inventário de artefatos e executado no WebView2 `158.0.4370.33`. Cada caso fez o cálculo inicial, trocou o idioma sem editar o campo e recalculou. A fonte auditada foi `c3af4870b6fe781f1b7526995fcd3761791aeead` e o commit histórico das evidências foi `9e491d266b73e357046483aa8ff8aa45daf2103f`. [Inventário de artefatos](../assets.json) · [Observação no Windows](windows-baseline.json)

| Troca de idioma | Entrada original preservada | Entrada canônica e resultado iniciais | Reexecução na 0.3.0 |
| --- | --- | --- | --- |
| Inglês → português brasileiro | `log(8,2)` | `log(8,2)` resulta em `3` exato | `log(8.2)` resulta em `0.91381385238371668972315074469267` aproximado |
| Português brasileiro → inglês | `log(8;2)` | `log(8,2)` resulta em `3` exato | Mesma entrada canônica e mesmo resultado exato |
| Português brasileiro → inglês | `log(8,2)` | `log(8.2)` resulta em `0.91381385238371668972315074469267` aproximado | `log(8,2)` resulta em `3` exato |

O módulo Scientific guardava a expressão como texto e usava o separador decimal do idioma da interface no momento do cálculo. A troca de idioma conservava o módulo ativo. A vírgula mudava de separador de argumentos para marca decimal, ou o contrário, antes de a solicitação chegar ao Rust. O registro mostrava a alteração na expressão normalizada. [Módulo Scientific](../../../apps/web/src/tool-scientific-runtime.tsx) · [Interface](../../../apps/web/src/app.tsx) · [Funções de localização](../../../apps/web/src/locale-format.ts)

Os três casos corrigidos no Chrome preservaram a expressão canônica, o resultado, a exatidão e o registro exportado após a troca de idioma e uma nova execução do worker. `log(8,2)` digitado em inglês e `log(8;2)` digitado em português mantiveram `3` exato. `log(8,2)` digitado em português manteve a expressão unária `log(8.2)` e seu resultado aproximado. [Testes Scientific no navegador](../../../apps/web/tests/scientific.spec.ts) · [Resultados do navegador](browser.json)

## Correção nos dez módulos

Os campos editáveis sensíveis à localização guardam o texto e o idioma em que o rascunho foi escrito. O adaptador de entrada normaliza pela origem no envio. A troca de idioma atualiza a apresentação, inclusive a formatação e os rótulos dos resultados já disponíveis. O cálculo pendente conserva os dados matemáticos com os quais foi iniciado. A suspensão e a troca de módulos preservam os rascunhos. Um campo preenchido continua usando a notação da origem durante a edição e mostra essa informação quando ela difere do idioma da interface. Limpar o campo faz a entrada seguinte usar o idioma atual. Inserir um exemplo inicia um rascunho na notação do exemplo.

| Módulo | Campos e gramática examinados |
| --- | --- |
| Standard | O editor, desfazer e refazer guardam a origem. O histórico e as referências preservam o contexto original, os vínculos tipados e os valores canônicos. |
| Scientific | A expressão guarda o contexto de decimais e argumentos, inclusive no teclado da interface. Os dígitos de trabalho têm rascunho próprio e gramática inteira. Ângulo, notação e domínio real ou complexo usam IDs de opções. |
| Álgebra | Cada operação guarda sua expressão. Sistemas, substituições e verificações preservam os pontos e vírgulas entre instruções, inclusive os aliases suportados. Variáveis e domínio conservam o sentido. |
| Cálculo | Cada operação guarda a expressão e os campos independentes de limites, ponto de expansão ou aproximação e tolerância. Direção, variável, ordem e quantidade de termos usam opções fixas. O analisador de expressões aceita funções unárias. |
| Álgebra Linear | Cada célula de matriz ou vetor e a tolerância preservam notação própria. Estrutura matricial e operação têm campos separados dos valores numéricos. |
| Geometria | Dimensões e coordenadas preservam a notação. As coordenadas mantêm os separadores de linha. Unidades e operações usam IDs canônicos. |
| Matemática Discreta | Os campos inteiros e lógicos seguem sua gramática de dígitos. Delimitadores de conjunto e membros textuais conservam sua representação literal. |
| Programador | Valores e deslocamentos usam dígitos com sinal e a base selecionada. Largura, representação e operação de bits conservam seus IDs. |
| Conversor | Valor e cotação manual mantêm notações independentes. IDs de unidade e de moeda, origem textual e datas de validade conservam seus próprios campos. |
| Data e Hora | Tokens ISO e IDs de fuso seguem a própria gramática. Números com sinal de períodos e os dígitos aceitos são normalizados sem depender do separador decimal. Feriados, dias da semana e política de transição conservam o sentido. |

Quando um rascunho está incompleto ou inválido, a interface mantém o texto no contexto de origem e a gramática rejeita entradas inválidas. A matriz e as reproduções conferem o comportamento com casos identificados. Os motores matemáticos continuam responsáveis pelos valores, pela precisão e pelos diagnósticos. A apresentação traduz rótulos e explicações identificadas. O registro disponibiliza para reprodução a expressão original, a expressão normalizada, as opções e o resultado. [Contrato do registro de cálculo](../calculation-proof/contract.pt-BR.md) · [Matriz de transições](locale-transition-matrix.json)

O formato mantém o esquema 1 e aceita registros existentes. Os registros novos podem incluir `expression_locale` quando um idioma descreve a expressão original. Uma matriz formada por células digitadas em idiomas diferentes pode conservar o texto original e os campos canônicos de reprodução. A exportação continua sujeita ao limite de bytes já aprovado. A reprodução no motor usa a expressão e as opções canônicas. [Esquema da revisão](schema.v1.json) · [Esquema histórico](../calculation-proof/schema.v1.json)

## Validação e entrega

O Chrome instalado `158.0.8127.38` passou **146/146** verificações. As 42 transições direcionais cobriram os dez módulos, com **420 pares antes e depois e 840 cálculos**. A suíte compara a solicitação completa do worker sem o identificador de transporte e o registro completo do motor. Cenários separados mantêm uma solicitação real pendente durante uma troca, conferem registros exportados, preservam um rascunho suspenso com catálogos disponíveis offline, redefinem preferências e verificam uma entrada incompleta e um horário civil ambíguo. Passaram os cinco testes adicionais de ciclo de vida e as dez verificações offline independentes. A primeira execução integrada no navegador passou 144 de 146 verificações. A revisão restabeleceu os separadores aceitos pela função `root` da Standard e ajustou os testes para limpar o campo antes de digitar uma entrada em outra notação. [Resultados do navegador](browser.json) · [Matriz direcional](locale-transition-matrix.json) · [Testes de transição](../../../apps/web/tests/locale-transitions.spec.ts)

Passaram os 2.355 casos independentes avançados, 305 comparações de CLI e WASM e 37 verificações de isolamento. A Standard passou 157 casos independentes da CLI, 291 casos independentes dos valores estruturados WASM, 20 comparações de CLI e WASM e 9 comparações de registros de cálculo. O Rust passou 21 verificações da Standard e 68 do motor Universal. O Node passou 69. A cobertura de linhas LLVM chegou a 726/733 (**99,05%**) na Standard e 10.189/10.495 (**97,08%**) no motor Universal. O Clippy dos membros padrão e as auditorias dos arquivos de dependências passaram, com zero vulnerabilidades reportadas e os avisos anteriores registrados. Passaram **as 602 verificações mapeadas**, incluindo os testes portáveis e no Chrome, dois testes de credenciais e cinco de capacidades no Windows hospedado e 17 verificações de interface WebView2 no Windows local. [Mapa de regressão](regression.md) · [Registro de testes](tests.json) · [Segurança](security.pt-BR.md)

O build local em modo `release` da 0.3.1 parou quando o Windows bloqueou o auxiliar de compilação Rust `build_script_build.exe` às 14h25min17s. Os registros 3077 e 3033 do Code Integrity identificaram a política `VerifiedAndReputableDesktop`. O Cargo retornou o erro 4551 do sistema operacional. As proteções e exclusões foram preservadas. O job Windows no commit exato compilou o candidato e gerou o artefato de revisão `15048137470`. O SHA-256 do ZIP, o SHA-256 do executável e a proveniência da fonte foram conferidos antes da execução. O executável sem assinatura tem 13.646.848 bytes e SHA-256 `80ff0a020fd25a0c2ec8aebd19f84361297ea9d55cbc6f7d4b90d6f24168885a`. [Segurança](security.pt-BR.md) · [Artefato verificado](windows-artifact.json) · [Reprodução](reproduction.md)

O candidato verificado rodou no Windows 11 local com WebView2 `158.0.4370.33`. Os três casos Scientific conservaram texto original, expressão canônica, rótulo de origem, resultado e versão `0.3.1` do motor após recalcular. `log(8,2)` em inglês e `log(8;2)` em português mantiveram `3` exato. `log(8,2)` em português manteve `log(8.2)` e `0.91381385238371668972315074469267`. A interface local passou **17/17** e chegou ao primeiro resultado conferido em 568, 617 e 587 milissegundos nas três aberturas. A etapa opcional de interface no ambiente hospedado ficou sem arquivos de observação nativa. Os resultados da interface vêm da execução local do artefato hospedado verificado. [Casos Scientific no Windows](windows-candidate.json) · [Testes da interface Windows](windows-ui.json) · [Testes Rust hospedados](windows-rust.json)

O pacote desktop hospedado e o build local do Chrome têm dez módulos WASM cada, gerados a partir da fonte auditada. Os hashes dos dez arquivos diferem entre os ambientes de build. Cada execução usa a evidência de integridade de seus próprios arquivos. O executável Windows de revisão e a proveniência da fonte foram conferidos antes da abertura. [Inventários de artefatos](assets.json) · [Registro do executável Windows](windows-artifact.json)

Após os testes da aplicação e das medições, a leitura local do Windows às 14h46min40s confirmou antivírus Defender, proteção em tempo real e proteção contra adulterações ativos. No intervalo consultado a partir de 14h25min30s houve zero novos eventos 3077 relacionados e zero eventos selecionados do Defender ou ASR. Nenhum processo `dars-desktop` permaneceu aberto. [Escopo de segurança](security.pt-BR.md) · [Evidência das proteções](windows-protection.json)

O código corrigido `2a8e0f5a174afe850f245b2ae4cc8e974119bf5d` foi publicado e confirmado no branch de revisão do Objetivo 03. A execução `45665744240` terminou com sucesso em Linux, macOS e Windows e no job de segurança. O job Windows empacotou o arquivo de revisão com retenção de um dia, concluiu o Clippy de todo o workspace em `release` e executou o teste de credenciais. As evidências históricas da 0.3.0 continuam preservadas. [Código corrigido](https://github.com/daniloatila/universal-calculator-dars/commit/2a8e0f5a174afe850f245b2ae4cc8e974119bf5d) · [Recibo do CI](ci.json) · [Execução no commit exato](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45665744240) · [Aceitação](acceptance.json)

## Medições pareadas no Windows

Os dois executáveis rodaram a mesma carga Scientific no sistema local, com perfis WebView2 novos. A forma estável `log(8;2)` manteve `3` exato durante doze trocas entre inglês e português brasileiro em cada build. Cada build encerrou os 14 workers Scientific observados. O pico foi um worker e o encerramento deixou zero descendentes. Houve seis amostras por fase de recursos, em intervalos de cerca de um segundo, e uma amostra na inicialização. [Medições pareadas](benchmarks.json)

| Observação em milissegundos | 0.3.0 | 0.3.1 |
| --- | ---: | ---: |
| Inicialização a frio até resultado Standard conferido | 541,45 | 645,16 |
| Primeiro cálculo Scientific | 109,97 | 112,85 |
| Troca de idioma p50 / p95 | 8,89 / 55,43 | 9,06 / 47,72 |
| Recálculo p50 / p95 | 51,91 / 61,26 | 52,89 / 66,65 |
| Cálculo Scientific após restaurar a janela | 48,49 | 63,58 |

A mediana da memória residente privada na Standard visível passou de 103.063.552 para 104.267.776 bytes. Na Scientific ociosa, passou de 133.947.392 para 134.651.904 bytes, e o commit privado passou de 280.633.344 para 278.532.096 bytes. Na restauração da janela, o commit privado medido aumentou 61.120.512 bytes. O registro mostra separadamente os contadores da aplicação e dos auxiliares, a soma dos conjuntos de trabalho compartilhados e a memória do sistema. A inicialização a frio tem uma amostra por build. Com doze interações, p95 e p99 selecionam a maior observação. A curta janela não permite classificar uma tendência prolongada nem atribuir páginas compartilhadas. A meta de RAM incremental do desktop básico continua aberta. [Registro de medições](benchmarks.json) · [Evidência de memória da 0.3.0](../memory-debt.pt-BR.md) · [Protocolo aprovado](../../objective-02/revision-02/memory-debt.pt-BR.md)
