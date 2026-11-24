# Perfil de recursos do aplicativo Windows

[English](windows-desktop.md)

A revisão 01 observa uma compilação de release do DARS numa sessão interativa do Windows. O ensaio mede o processo nativo e seus descendentes do WebView2, confirma um resultado exato a cada inicialização e utiliza a interface real do aplicativo para a carga de cálculos. O relatório da revisão contém o ambiente medido, o hash do executável e os resultados. [Relatório da revisão](../evidence/objective-01/revision-01/REPORT.md)

## Reprodução

Compile primeiro o executável de release. Execute a partir da raiz do repositório num Windows com o WebView2 Runtime, PowerShell 7, Node.js 22.12 ou mais recente e as dependências do lockfile da aplicação web. [Instruções de compilação](../docs/pt-BR/build.md)

```powershell
npm ci --prefix apps/web --ignore-scripts
node benchmarks/windows-desktop-profile.mjs
```

O primeiro argumento posicional pode indicar outro executável de release. A opção `--quick` executa uma verificação curta do roteiro. Essa opção gera resultados de diagnóstico. O ensaio completo leva cerca de seis minutos. Deixe a sessão do Windows aberta e evite interagir com a janela do DARS durante a coleta. Registre atividades relevantes do sistema para interpretar os valores globais.

Se a janela mudar inesperadamente durante a carga ou a recuperação, preserve a coleta original e repita a observação de uso visível com `node benchmarks/windows-desktop-profile.mjs --visible-tail`. O roteiro inicia outro processo com perfil novo do WebView2 e executa 25 segundos de estabilização, 100 segundos de carga e 65 segundos de recuperação. Registre a repetição como uma sessão separada do aplicativo. Use a coleta original para as demais fases que passaram nas verificações da janela.

O roteiro usa um perfil temporário do WebView2 na pasta do ensaio e conecta o Playwright a uma porta de teste efêmera no endereço de loopback. Confirma `0.1+0.2` → `0.3` pelos controles normais da calculadora. O tempo inclui criação do processo, inicialização do WebView2 e CDP, interação automatizada com a interface e leitura do resultado exato. Três inicializações usam perfis recém-criados e duas reutilizam o perfil principal. Os caches do Windows e do WebView podem continuar aquecidos nos dois grupos. Os tempos medem o efeito do estado do perfil na sessão atual do Windows.

## Fases de observação

| Fase | Mínimo | Estado do aplicativo |
| --- | ---: | --- |
| Ambiente | 30 s | O DARS do ensaio ainda está fechado |
| Estabilização | 25 s | Visível após o primeiro cálculo exato |
| Repouso | 65 s | Visível sem novos cálculos |
| Minimizado | 60 s | Janela principal minimizada pelo PID do processo |
| Carga | 100 s | Restaurado e calculando aritmética exata e expressões compostas com porcentagens relativas irracionais |
| Recuperação | 65 s | Visível sem novos cálculos após a carga |
| Fechado | 25 s | Processo principal fechado, com verificação dos descendentes no início e no fim da fase |

O intervalo-alvo é de quatro segundos. O coletor verifica a janela e se ela está em primeiro plano em cada amostra. A carga registra o número de cálculos concluídos e a latência ponta a ponta da interface. As expressões inteiras usam uma expectativa exata calculada de forma independente. As porcentagens irracionais verificam a parte inteira esperada e a presença da parte decimal. A suíte de regressão matemática avalia a precisão irracional.

## Interpretação

- `workingSetBytes` conta os mapeamentos residentes. `privateWorkingSetBytes` mede os mapeamentos residentes privados. `privateBytes` mede a memória privada comprometida. `sharedWorkingSetBytes` é a diferença entre o working set e a parte residente privada para cada processo. `sharedCommitBytes` é o contador de memória compartilhada comprometida do Windows. Com um número par de amostras, a mediana informada é a maior das duas observações centrais. Cada fase separa o processo principal, os descendentes e a árvore completa. Páginas compartilhadas podem aparecer nos contadores de vários processos. [Contadores de memória de processo da Microsoft](https://learn.microsoft.com/pt-br/windows/win32/api/psapi/ns-psapi-process_memory_counters_ex2)
- `systemCommitDeltaVsUnlaunchedBytes` e `systemPhysicalDeltaVsUnlaunchedBytes` comparam as medianas da fase com a mediana ambiente. Incluem a atividade simultânea do Windows e podem ser negativos. Os contadores privados da árvore atribuem memória residente e comprometida aos processos. O consumo incremental do sistema inclui efeitos externos a esses contadores. [Contadores de desempenho do sistema da Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getperformanceinfo)
- A CPU da árvore integra o tempo de kernel e de usuário entre amostras adjacentes para a mesma instância do processo. Pode omitir processos breves ou tempo anterior à primeira e posterior à última amostra de um processo. O resumo contém o número de processos e os nascimentos e encerramentos detectados. `processOneLogicalCpuPercent` usa uma CPU lógica como denominador. `processTotalMachinePercent` divide esse resultado pelo total de CPUs lógicas. O cálculo da CPU do sistema usa `GetSystemTimes` e desconta o tempo ocioso. [Tempos do sistema da Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getsystemtimes)
- Compare primeiro valor, último valor, mediana e máximo da memória privada residente e comprometida entre repouso, carga e recuperação. Variações podem refletir alocação, cache, liberação de páginas ou comportamento do runtime nesta sessão. Um ensaio com essa duração ajuda a identificar crescimento para investigar. Uma conclusão sobre vazamento exige coletas mais longas e repetidas.

Eventos de amostra e resumos ficam em `artifacts/objective-01/revision-01/desktop-profile-*`. A repetição de uso visível usa `desktop-visible-tail-*` na mesma pasta pai. Pontos de controle de fases e inicializações são gravados durante o ensaio. Um ensaio interrompido pode preservar as observações anteriores. Mantenha arquivos locais específicos do usuário e perfis do WebView2 na pasta ignorada de artefatos. Publique somente evidência sanitizada selecionada para o objetivo.

A versão 0.1.0 usou outra janela de observação e outro método de working set. Ao consultar o histórico, considere essas diferenças de protocolo. A meta futura permanece abaixo de 100 MB incrementais. O Objetivo 02 contempla a otimização arquitetural aprofundada.
