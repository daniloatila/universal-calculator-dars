# DARS 0.1.1 · Auditoria do Objetivo 01

- **Estado da revisão** `READY_FOR_REVIEW`
- **Decisão do proprietário** Pendente
- **Objetivo 02** `NOT_STARTED`
- **Código final auditado** [`460c2f0`](https://github.com/daniloatila/universal-calculator-dars/commit/460c2f05049acaa75da0035444150f5f4eaed801)

[Aceitação da revisão](acceptance.json) · [Aceitação original atualizada](../acceptance.json) · [Achados](findings.json) · [Estado do projeto](../../../PROJECT_STATE.md) · [Linha de base 0.1.0](../REPORT.md)

## Memória matemática e porcentagens

A auditoria confirmou dois efeitos na versão 0.1.0 em Chrome 158, com os hashes do bundle original verificados. Depois de **MS 100**, `sqrt(2)%`, **M+** e **MR**, a interface montava `sqrt(2)%((100)+(sqrt(2)%))` e devolvia um erro. Se o campo fosse limpo antes de **MR**, a expressão recuperada produzia `101.414213562373095048802`. O valor armazenado ainda era texto, e o parser reaplicava a porcentagem em relação a 100. [Execução anterior](baseline-memory.json) · [Como reproduzir](reproduction.md)

Na versão 0.1.1, a sequência inteira produz **`100.014142135623730950488`**, a aproximação exibida para `100 + sqrt(2)/100`. A correção foi verificada em Chrome e no aplicativo Windows com WebView2. O controle `200+10%` continua retornando `220`. [Execuções corrigidas](tests.json) · [Regressões](regression.md)

O núcleo Rust combina diretamente frações reduzidas ou extremos racionais de intervalos certificados. A interface usa referências de sessão para recuperar operandos irracionais ou exatos grandes. Quando a entrada é reaproveitada, o parser recebe um valor, e a aproximação exibida continua sendo arredondada separadamente. A mesma representação sustenta memória, histórico e encadeamento. Referências deixam de ser retidas depois que o resultado, histórico e versões editáveis já não as alcançam. [Arquitetura](../../../docs/en/architecture.md) · [Arquitetura em português](../../../docs/pt-BR/architecture.md)

## Tema padrão

A calculadora abre em **Dark com tons de azul-marinho** em perfis novos, independentemente do esquema do sistema. O Chrome confirmou a primeira renderização com JavaScript desabilitado e a persistência de escolhas explícitas. A captura nativa mostra o tema e o valor de memória na WebView2. [Captura no Windows](windows-memory.png) · [Matriz de aparência](themes-and-locales.json)

## Cancelamento e recuperação

Interceptar uma resposta após a inicialização no build antigo deixou o cálculo ocupado. A inspeção confirmou que só a inicialização tinha prazo. O worker revisado limita cada tarefa ativa a cinco segundos e a fila a oito operações, contando a ativa. O teste em Chrome observou o encerramento do worker travado e uma nova operação correta sem recarregar. A interface invalida respostas de edições, cancelamentos e operações de memória descartadas. Limpar o histórico impede que um trabalho anterior o repovoe. [Achados e limites](findings.json) · [Testes controlados](regression.md)

## Verificação integral

| Verificação | Resultado |
| --- | --- |
| Rust, formatação e Clippy | 16 testes aprovados. Cobertura instrumentada do núcleo de 98,87% das linhas e 95,69% das regiões. |
| Oráculos independentes e paridade | 157 comparações via CLI, 291 comparações combinatórias por meio do WASM e 20 comparações de contrato CLI/WASM aprovadas. |
| Unidade web e navegador | 17 testes de unidade e 16 testes Playwright aprovados. Incluem concorrência, falhas do worker, histórico, teclado, idioma, viewport e acessibilidade automatizada. |
| Idiomas, temas e uso offline | Sete idiomas, quatro temas e movimento reduzido verificados em Chrome. Dez verificações do fluxo web offline aprovadas. |
| Windows 11 x64 real | Três aberturas em perfis isolados do WebView2 e treze verificações aprovadas, incluindo tema inicial, logotipo embutido, correção de memória e aritmética com o contexto offline. |
| GitHub Actions | Quatro jobs aprovados. Ubuntu x64 executou o navegador e as verificações offline. Windows e macOS também compilaram o alvo desktop. O macOS desktop ficou no escopo de compilação em CI. |
| Segurança | Gitleaks sem achados no export da árvore auditada. npm sem vulnerabilidades reportadas. RustSec com três avisos já presentes no 0.1.0. |

[Resultados e hashes](tests.json) · [GitHub Actions](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45499090489) · [Idiomas e temas](themes-and-locales.json) · [Segurança](security.md) · [Reprodução](reproduction.md)

## Desempenho no Windows

A medição usou o mesmo executável Windows x64 da validação do tema, com o WebView2 real. A verificação independente conferiu as 103 amostras do ensaio. A árvore em repouso incluiu o processo principal e os auxiliares identificados pela árvore de processos.

| Fase | Duração (s) | WS somado (MiB) | WS privado (MiB) | Commit privado (MiB) | WS compartilhado somado (MiB) | CPU de um núcleo lógico (%) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Visível em repouso | 65,02 | 380,63 | 95,97 | 185,83 | 282,73 | 0,985 |
| Minimizado | 60,02 | 385,57 | 94,98 | 207,38 | 290,91 | 0,547 |
| Cálculos repetidos | 100,02 | 439,48 | 134,41 | 266,53 | 304,31 | 25,246 |
| Recuperação | 65,02 | 441,87 | 137,72 | 229,42 | 304,14 | 0,745 |

Em repouso, os auxiliares mediram **91,95 MiB de residência privada** e **180,28 MiB de commit privado**. A mediana do sistema, em relação ao período sem o aplicativo, variou em -106,65 MiB de memória física em uso e -66,86 MiB de commit. São medidas da máquina inteira durante a observação.

A carga verificou **569 cálculos** com latência mediana de **31,88 ms** pela interface. Durante a recuperação, o commit privado foi de 274,34 a 229,89 MiB. A mediana permaneceu 43,59 MiB acima da referência da própria sessão. O intervalo observado documenta retenção e queda após a carga. A caracterização de vazamentos exige sessões mais longas e repetidas.

Os tempos até o primeiro resultado exato foram **534 / 549 / 536 ms** com perfis novos e **487 / 442 ms** com perfis reutilizados. As duas séries usam o mesmo boot do Windows. Após o encerramento e o período de observação, a árvore residual tinha zero processos.

Em Node, 2.400 avaliações WASM apresentaram 0,0044 ms de mediana, 0,0726 ms de p95 e 0,0996 ms de p99. Os tempos desse microbenchmark cobrem o cálculo e a serialização JSON.

O novo protocolo mede a árvore inteira, separa residência privada, commit privado e compartilhamento, e compara as medições agregadas da máquina com períodos em que o DARS estava fechado. Os deltas da máquina incluem a atividade de outros programas. A soma de working sets pode contar páginas compartilhadas mais de uma vez. As medições 0.1.0 de cerca de 25,4 MiB no processo principal, 400,5 MiB de working sets somados e 5,51% de um processador lógico por aproximadamente três segundos são referências históricas. A janela e as métricas mudaram entre as duas versões. Reinicializações do host interromperam coletas preliminares. Os resultados qualificadores foram repetidos com o executável final e verificados por hash.

Na interface, uma sessão sem valores retidos dispensa a busca por referências. A meta futura de menos de **100 MB de memória incremental** continua registrada para o Objetivo 02. [Métricas, ressalvas e limites](benchmarks.json) · [Protocolo em português](../../../benchmarks/windows-desktop.pt-BR.md) · [Protocolo em inglês](../../../benchmarks/windows-desktop.md)

## Entrega e próxima decisão

A árvore pública contém a correção de desenvolvimento, os instrumentos de benchmark e as evidências revisadas. O histórico 0.1.0 permanece disponível no commit de entrega original. A matriz principal recebeu as referências atuais. Nenhuma release estável foi publicada. O Objetivo 01 aguarda auditoria independente e aprovação explícita. [Entrega histórica](https://github.com/daniloatila/universal-calculator-dars/tree/ea26c7f9d4d870d1ee06a8b95f60854d0da059d3/evidence/objective-01) · [Estado do projeto](../../../PROJECT_STATE.md)

## English summary

Revision 01 reproduced and fixed an incorrect relative-percent interpretation when reusing irrational memory. DARS now stores evaluated Rust values and cancels obsolete results. Production Chrome and native Windows WebView2 verified the reported sequence, conventional percent behavior and the navy Dark default. Independent CLI and WASM oracles, worker recovery and all four CI jobs passed. The Windows resource profile reports private, shared and system-level readings under stated conditions. The objective awaits independent review and explicit approval. Objective 02 remains unstarted. [Evidence and reproduction](regression.md)
