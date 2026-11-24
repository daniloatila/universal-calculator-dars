# DARS 0.2.0 · Objetivo 02 · Inteligência operacional

## 1. Identificação

- **Estado** `READY_FOR_REVIEW`
- **Versão** 0.2.0 de desenvolvimento
- **Branch de entrega** `main`
- **Código verificado** [`a90b650`](https://github.com/daniloatila/universal-calculator-dars/commit/a90b6502fa4c723512844e5035e67459268e9e83)
- **Base aprovada** 0.1.1, com nota de 95/100 na auditoria independente informada pelo proprietário. [Registro de aprovação](../objective-01/approval.json)

## 2. Resumo

A Standard ganhou ciclo de vida gerenciado, perfis adaptativos com efeitos medidos, central de privacidade e diagnóstico local. O desktop suspende o módulo ao minimizar, encerra seu worker e restaura a sessão matemática ao voltar. O navegador oferece uma política explícita para usar somente os recursos já em cache. [Documentação em português](../../docs/pt-BR/operations.md) · [Documentation in English](../../docs/en/operations.md)

## 3. Implementação

- Um único módulo matemático de produção é ativado sob demanda. O gerenciador possui sete estados explícitos, cancela trabalho em mudanças de geração e pode recuperar uma falha de ativação.
- Perfis automático e manual aplicam limites de fila, prazo de worker ocioso, cache de apresentação, complexidade visual e orçamentos de trabalho secundário e desenho. Decisões automáticas usam prazos e histerese. A precisão permanece na mesma implementação Rust.
- As operações de privacidade informam o escopo dos dados e permitem limpar a sessão e redefinir as preferências. O provedor nativo do Gerenciador de Credenciais do Windows está separado da WebView. A aplicação atual usa zero credenciais.
- O diagnóstico lê capacidades e sinais locais quando disponíveis. A memória linear WASM é a capacidade do buffer reportada pelo worker. Os modos de tema, o padrão azul-marinho e os sete idiomas continuam disponíveis.
- A expressão pode mostrar o valor associado a uma referência de sessão. A matemática continua recebendo o racional ou intervalo certificado. [Alterações](changes.md) · [Captura Windows](windows-operations.png)

## 4. Aceitação

Os 16 critérios da matriz registram o resultado, a evidência e os limites aplicáveis. Os módulos sintéticos validam trocas, recursos gráficos, tarefas secundárias e isolamento. Eles ficam no conjunto de testes. [Matriz de aceitação](acceptance.json) · [Provas de recursos](browser-resource-proofs.json)

## 5. Testes

Foram aprovadas **576 verificações**, incluindo todos os **540 checks equivalentes ao Objetivo 01**. A cobertura de linhas do núcleo Rust foi de **98,87%**. Os oráculos independentes verificaram 157 casos na CLI e 291 casos de valores estruturados em WASM. Houve 20 verificações de paridade. Os testes em Chrome e WebView2 incluíram histórico, memória, precisão, falhas, offline, acessibilidade automatizada, idiomas e suspensão. [Suites, comandos e hashes](tests.json)

## 6. Desempenho

Foram quatro ciclos alternados no mesmo processo, com **597 cálculos confirmados**. Cada ciclo mediu atividade, repouso visível, minimização real e recuperação. A última fase de encerramento deixou zero descendentes.

| Ciclo | Perfil | Privada residente em repouso (MiB) | Privada comprometida em repouso (MiB) | Privada residente na recuperação (MiB) | Privada comprometida na recuperação (MiB) | CPU ociosa de um núcleo (%) | Workers no fim do repouso |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Ultraleve | 139,83 | 275,60 | 137,09 | 323,93 | 0,433 | 0 |
| 2 | Máximo | 149,12 | 278,73 | 149,69 | 304,48 | 0,087 | 1 |
| 3 | Máximo | 151,04 | 280,68 | 146,76 | 269,39 | 0,000 | 1 |
| 4 | Ultraleve | 147,90 | 284,38 | 144,07 | 329,32 | 0,173 | 0 |

Com Ultraleve, o worker encerrou depois de **980 / 981 ms** nos dois ciclos. Máximo manteve um worker em seus dois períodos de repouso. Todos os ciclos mediram **1.179.648 bytes** de memória linear WASM após a carga.

O Ultraleve deixou de ter uma instância WASM ativa em repouso. O Máximo conservou a instância. Os quatro ciclos suspenderam a Standard com zero workers quando a janela minimizou e recuperaram o valor salvo ao restaurar. A operação de recuperação demorou **82 / 80 / 46 / 53 ms**.

As medianas de latência de ponta a ponta da carga ficaram entre 48,77 e 49,03 ms. A memória privada comprometida na recuperação variou entre 269,39 e 329,32 MiB, sem trajetória monotônica nos quatro ciclos.

Nos dois ensaios Ultraleve, a mediana privada residente em repouso foi de 139,83 e 147,90 MiB. Nos dois ensaios Máximo, foi de 149,12 e 151,04 MiB. O histórico e o estado salvo foram retidos propositalmente. O benchmark observa a pressão do processo e os recursos gerenciados. A atribuição de páginas retidas a caches do WebView2 ou ao alocador exigiria instrumentação específica do runtime.

A versão 0.1.1 registrou 95,97 MiB privados residentes e 185,83 MiB de compromisso privado em 65 s de repouso estabilizado. No ensaio 0.2.0, os tempos até o primeiro resultado foram **512 / 503 / 489 ms** com perfis novos e **405 / 392 ms** com perfis reutilizados. A mediana de perfis novos foi 503 ms, ante 536 ms no baseline. As janelas e a carga são distintas. O comparativo de perfis usa o mesmo binário 0.2.0 e a mesma sessão.

Uma repetição do **mesmo protocolo de repouso da versão 0.1.1** mediu 65,02 s e 18 amostras válidas na versão 0.2.0. A mediana privada residente foi **94,26 MiB** (0.1.1: 95,97 MiB). A memória privada comprometida foi **179,69 MiB** (0.1.1: 185,83 MiB). A CPU da árvore foi 0,745% de um processador lógico. O ambiente e o estado do runtime podem explicar variação entre as coletas. [Comparação de mesmo protocolo](benchmarks.json)

Na fase comparável de minimização, o commit privado variou de 207,38 MiB no 0.1.1 para 239,47 MiB no 0.2.0. No 0.2.0, a recuperação reduziu a memória privada residente de 146,51 para 138,39 MiB entre sua primeira e última amostra. A variação do commit e a residência privada são leituras distintas. [Fases comparáveis](benchmarks.json)

No teste comparável de carga, a latência mediana da automação de ponta a ponta subiu de **31,88 para 48,87 ms**. A carga validou 527 cálculos, ante 569 no baseline. Essa leitura inclui preenchimento, cliques, agendamento do navegador e atualização do resultado. A causa da diferença permanece sem isolamento.

Um ensaio adicional mediu apenas do acionamento dentro da WebView até a atualização do resultado. A mediana foi 0,70 ms no 0.2.0 e 0,90 ms no build de desenvolvimento 0.1.1 anterior ao tema azul-marinho. Esses binários e essa fronteira de tempo são distintos da comparação principal. O ensaio ajuda a separar a resposta dentro da página da automação, sem identificar a causa da diferença de ponta a ponta. [Ensaio complementar](benchmarks.json)

No ensaio WASM em Node com 2.400 avaliações, a mediana foi 0,0047 ms e o p95 foi 0,0811 ms. O executável Windows mediu 8,15 MiB. Os tamanhos e o histórico completos constam na evidência. [Métricas e comparativo](benchmarks.json)

A meta de menos de 100 MB incrementais continua como meta de engenharia. As diferenças da máquina inteira incluem atividade de outros processos. O teste finito identifica a trajetória observada e os limites de atribuição, com verificações de longo prazo necessárias para caracterizar vazamentos.

## 7. Segurança

O npm informou zero vulnerabilidades. O Cargo Audit aprovou a verificação com versões retiradas proibidas e registrou 3 avisos do RustSec. A árvore exata entregue passou pelo Gitleaks e pela inspeção de caminhos privados. O navegador de teste observou zero origens externas durante as ações da aplicação. O teste nativo verificou salvar, ler e excluir uma entrada sintética em um nome isolado do Gerenciador de Credenciais. [Segurança e escopos](security.md) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45505762567)

## 8. Compatibilidade

O executável foi aberto e testado em Windows x64 com WebView2. Chrome local e Chromium de CI executaram o bundle web. Os jobs compilaram CLI e WASM nas plataformas declaradas e compilaram os alvos desktop de Windows e macOS. A execução interativa do desktop macOS ficou fora deste marco. [Matriz de compatibilidade](compatibility.md) · [Jobs verificados](ci.json)

## 9. Problemas encontrados

O WebView2 manteve o documento visível ao minimizar a janela real. O host agora comunica o estado nativo. O ensaio verificou suspensão e retorno do estado por Win32 e pela interface. O cache do navegador também precisou tratar o cabeçalho `Vary: Origin` dos arquivos estáticos para que o reload em modo offline permanecesse funcional. [Provas reproduzíveis](browser-resource-proofs.json) · [Segurança](security.md)

## 10. Decisões arquiteturais

O projeto conserva React, Tauri, WebAssembly e o núcleo Rust. O gerenciador controla a vida do cálculo e dos recursos; módulos opcionais podem reaproveitar os mesmos agendadores. A adaptação usa regras locais e mantém as fronteiras de privacidade. O armazenamento de credenciais Windows usa uma interface nativa reservada a futuros consumidores autorizados. [Contrato operacional](../../docs/en/operations.md)

## 11. Regressões

A sequência com `sqrt(2)%` em memória continua exibindo `100.014142135623730950488`, e `200+10%` retorna `220`. A suíte preserva frações exatas, cancelamento, concorrência, recuperação do worker, temas, uso offline e localização. A recuperação da janela preservou o valor armazenado nos quatro ciclos nativos. [Regressão completa](tests.json) · [Ciclos](benchmarks.json)

## 12. Evidências

O relatório, as matrizes, o hash do executável verificado, a imagem de execução e os resultados dos ciclos compõem a entrega auditada. O histórico 0.1.1 e sua aprovação permanecem disponíveis. [Testes](tests.json) · [Benchmark](benchmarks.json) · [Captura](windows-operations.png) · [Evidências 0.1.1](../objective-01/revision-01/REPORT.md)

## 13. Reprodução

Os comandos cobrem builds, oráculos, navegador, provas offline, execução Windows e o protocolo de benchmark. O teste de credenciais é opt-in e usa uma entrada sintética. [Reproduzir a entrega](reproduction.md)

## 14. Autoavaliação

Os dados distinguem recursos gerenciados, capacidade linear WASM, heap do renderizador, memória privada e variação da máquina. A meta futura de memória incremental continua aberta. As medições de duração finita registram a retenção observada e os limites de atribuição a caches, alocadores e processos auxiliares. Leituras de sistema que o runtime não fornece seguem indisponíveis. [Limites e comparativo](benchmarks.json)

## 15. Estado final

O Objetivo 01 está `APPROVED`. O Objetivo 02 aguarda auditoria e aprovação explícita em `READY_FOR_REVIEW`. O Objetivo 03 segue `NOT_STARTED`. A publicação é de desenvolvimento. [Estado do projeto](../../PROJECT_STATE.md)
