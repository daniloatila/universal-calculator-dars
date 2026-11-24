# Ciclos adaptativos no Windows

[English](windows-adaptive-cycles.md)

Este protocolo exercita o executável Windows em modo release com WebView2 real e a interface Standard. Ele reutiliza o amostrador de processos do [protocolo 0.1.1](windows-desktop.pt-BR.md). A calculadora tem um módulo em produção. Os [testes do ciclo de vida](../apps/web/tests/module-manager.test.mts) verificam separadamente as trocas repetidas entre módulos de teste.

## Executar a observação

Compile o executável release e instale as dependências de teste web a partir do lockfile. O ensaio requer uma sessão interativa no Windows, Node.js, PowerShell 7 e o WebView2 Runtime. Mantenha a sessão aberta e evite interagir com a janela do aplicativo. [Instruções de compilação](../docs/pt-BR/build.md)

```powershell
npm ci --prefix apps/web --ignore-scripts
node benchmarks/windows-adaptive-cycles.mjs
```

O primeiro argumento opcional seleciona outro executável 0.2.0. Use `--quick` para conferir o funcionamento do ensaio com fases abreviadas. A execução abreviada tem escopo de verificação do protocolo.

A observação completa leva aproximadamente seis minutos e meio. Ela começa com 25 segundos de amostragem do ambiente, inicia um perfil novo do WebView2 e confere o valor exato de `0.1+0.2`. Em seguida, guarda `100` na memória da calculadora e observa 20 segundos de estabilização. O mesmo processo passa por quatro ciclos, na ordem Ultraleve, Máximo, Máximo e Ultraleve. Começar e terminar em Ultraleve ajuda a equilibrar efeitos de aquecimento do navegador e da idade do processo.

| Fase | Mínimo por ciclo | Observação |
| --- | ---: | --- |
| Cálculo ativo | 28 s | Aritmética sintética exata e representação decimal esperada de `sqrt(2)%`. |
| Repouso visível | 18 s | Memória nativa e retenção do worker matemático durante a ausência de novos cálculos. |
| Minimização nativa | 15 s | Estado Win32 da janela, encerramento do worker matemático e suspensão do módulo. |
| Recuperação | 14 s | Após restaurar, a calculadora recupera e avalia o valor `100` da memória. A amostragem continua para acompanhar a retenção de memória. |

O aplicativo fecha e o ensaio observa a máquina e os processos descendentes por 20 segundos. Mais dois lançamentos com perfis novos e dois com perfil reutilizado medem o tempo até o primeiro resultado exato. Os perfis usam o mesmo boot e podem compartilhar caches de arquivos do Windows.

## Escopo das evidências

- O resumo mede a árvore de processos do Windows e separa o processo principal, os descendentes e os totais de working set, memória privada residente, commit privado e compartilhamento. As diferenças de memória física e commit do sistema incluem outras atividades. Páginas compartilhadas podem aparecer em vários processos. [Amostragem e definições do Windows](windows-desktop.pt-BR.md)
- A CPU por processo usa as mesmas identidades em amostras adjacentes. Processos que nascem ou saem entre amostras entram somente nos trechos observados. A contagem usa os workers dedicados detectados pelo Playwright e é comparada ao diagnóstico do aplicativo em pontos de observação visíveis. [Workers no Playwright](https://playwright.dev/docs/api/class-page#page-workers)
- Pontos visíveis podem medir o heap do isolamento do renderizador via CDP e, em seguida, a capacidade exata da memória linear WASM informada pelo aplicativo. Os dois valores medem escopos diferentes e podem se sobrepor aos contadores da árvore de processos. A capacidade linear corresponde ao tamanho do buffer. Leituras indisponíveis ficam ausentes. As fases cronometradas ocorrem com o diagnóstico fechado. [Heap do Runtime no CDP](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-getHeapUsage)
- As comparações usam amostras repetidas de repouso e recuperação no mesmo perfil e os perfis pareados da execução. A retenção após a carga pode incluir caches do WebView2, comportamento do alocador, estado mantido pela interface ou workers ainda ativos. A duração do ensaio limita conclusões sobre categorias específicas do alocador e possíveis vazamentos. O ensaio histórico 0.1.1 usou fases e uma combinação de cálculos diferentes. [Evidência comparativa 0.1.1](../evidence/objective-01/revision-01/benchmarks.json)

O ensaio escreve resumos incrementais e amostras brutas na pasta ignorada `artifacts/objective-02/windows-adaptive-cycles-*`. As amostras brutas incluem identificadores de processo e permanecem locais. A entrega registra o hash do executável, o resumo das observações e os limites de cada fase ou medição.
