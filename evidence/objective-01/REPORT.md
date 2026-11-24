# Relatório do Objetivo 01 · Fundação e primeiro produto funcional

## 1. Identificação

Universal Calculator (DARS), versão 0.1.0, branch `main`. A implementação auditada é o commit `164af9e4fb1719834cbf7858d1dc7781ac9bfacf`. Estado **READY_FOR_REVIEW** após a validação local e remota. [Commit auditado](https://github.com/daniloatila/universal-calculator-dars/commit/164af9e4fb1719834cbf7858d1dc7781ac9bfacf) · [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034)

## 2. Resumo executivo

O módulo Standard funciona no executável Windows x64 e no navegador. A CLI nativa, o desktop e a web usam o mesmo avaliador Rust. Foram verificados decimais e frações exatos, tratamento de erros e cálculos offline. O repositório público contém o código-fonte e os procedimentos de compilação. O executável e o build web são artefatos locais de validação. A versão de desenvolvimento ainda não foi distribuída como release estável. [Repositório público](https://github.com/daniloatila/universal-calculator-dars) · [Artefatos locais e hashes](artifacts.json)

## 3. Implementação

O núcleo executa aritmética racional, raízes e potências reais dentro de limites explícitos. A interface React oferece expressões editáveis, atalhos, memória, histórico temporário, desfazer, refazer, cópia, resultado exato e decimal e temas claro, escuro e OLED. O gerenciador inicial registra o Standard como módulo carregado sob demanda. A fundação de localização inclui sete catálogos, preferência explícita persistente, formatos numéricos e interface RTL em árabe. [Arquitetura](../../docs/pt-BR/architecture.md) · [Semântica e uso](../../docs/pt-BR/standard.md) · [Alterações](changes.md)

## 4. Critérios de aceitação

A matriz identifica 55 critérios e centraliza seu estado, justificativa e referência de evidência. A verificação local concluiu os testes do Standard, os fluxos offline em Windows e Chrome e os benchmarks. Os quatro jobs da execução em clone limpo passaram com compilação e testes para os alvos descritos na matriz. [Matriz de critérios](acceptance.json) · [Execução do CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034)

## 5. Testes

Foram executadas **219 verificações locais**, todas aprovadas, com 0 falhas e 0 ignoradas. O total soma 10 testes Rust, 157 comparações com o oráculo Python independente, 20 comparações CLI e WASM, 9 testes unitários web, 8 cenários Playwright com axe, 10 verificações offline e de carregamento de idioma e 5 verificações no executável Windows. Os testes Rust incluem 297 casos matemáticos gerados e 2.500 mutações de entrada como casos internos, contabilizados nas suas suítes. A cobertura medida do núcleo em debug foi de **458/464 linhas (98,71%)**, 36/36 funções e 550/575 regiões. O relatório de instrumentação não registrou ramos. [Suítes e comandos](tests.json) · [Cobertura](coverage.json)

Verificações suplementares confirmaram `1/3` no modo exato da WebView2 158.0.4370.33, 65 mensagens por catálogo nos sete idiomas, RTL em árabe, persistência do tema OLED e respeito à preferência de movimento reduzido. [Fração exata no Windows](windows-exact.json) · [Temas e idiomas](themes-and-locales.json)

## 6. Desempenho

As medições foram feitas no Windows 11 x64 build 26200, Intel Core Ultra 7 255HX de 20 processadores lógicos e Node 24.19.0. Esta é a linha de base usada para comparações futuras.

| Medição | Resultado observado |
| --- | --- |
| Windows desktop, lançamento até o primeiro resultado | 787, 691 e 659 ms em três perfis isolados de WebView2, mediana de 691 ms |
| CPU da árvore desktop, amostra depois do teste | 5,51% de um núcleo em 3.119 ms |
| Memória Windows desktop | 26.628.096 bytes no processo DARS e 419.979.264 bytes na soma dos *working sets* de sete processos, incluindo a WebView2 e possíveis páginas compartilhadas |
| Inicialização WASM no processo Node | 23,333 ms |
| Latência WASM, 2.400 operações com serialização JSON | Mediana de 0,0044 ms, p95 de 0,292 ms e p99 de 0,3122 ms |
| CPU e memória no benchmark WASM | 47 ms de CPU de usuário e 0 ms de CPU de sistema durante 100,046 ms decorridos. RSS de 53.604.352 bytes com Node e aumento observado de 14.319.616 bytes. |
| Artefatos | Desktop 8.387.072 bytes, CLI 464.896 bytes, WASM 210.926 bytes, build web íntegro 488.948 bytes e 162.147 bytes na soma do gzip por arquivo |

As amostras desktop incluem a instrumentação e o primeiro cálculo. A CPU ociosa tem apenas uma amostra curta. A soma dos *working sets* não mede memória privada incremental. Os tempos WASM são do motor em Node e não medem a latência da interação no navegador. [Benchmark do motor e tamanhos](benchmarks.json) · [Medições desktop](windows-x64.json) · [Ambiente](environment.json)

## 7. Segurança

O Gitleaks examinou os 106 arquivos preparados no índice antes da primeira publicação. A verificação de padrões privados complementou a varredura, sem ocorrências reconhecidas. Cargo-audit e npm audit registraram zero vulnerabilidades conhecidas nas fontes consultadas, com três avisos RustSec documentados. Web e Windows foram exercitados offline após inicialização, sem pedidos externos observados no escopo dos testes. A análise do código confirmou estado temporário para cálculos e nenhuma capacidade de plugin Tauri. [Auditoria de segurança e licenças](security.md)

## 8. Compatibilidade

Foram verificados o Windows 11 x64 real com WebView2, a CLI nativa, Chrome 158.0.8127.38 em cenário isolado e WASM em Node. Os testes de 320, 390, 768 e 1280 px são simulações de viewport em navegador desktop. Em clone limpo, o CI confirmou a CLI e o navegador no Linux x64, a CLI e a compilação desktop no macOS arm64 e a compilação desktop no Windows x64. O macOS recebeu verificação de compilação do desktop, sem abertura de janela. [Matriz de compatibilidade](compatibility.md) · [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034)

## 9. Problemas encontrados

- O ambiente inicial não expunha Rust no PATH. A configuração opcional do projeto permite usar a ferramenta local sem alterar o PATH global. A reprodução padrão usa Rustup e o toolchain fixado. [Ambiente](environment.json) · [Configuração local](../../scripts/dev-env.ps1)
- O primeiro acesso web precisa receber os assets. Para oferecer reabertura offline sem baixar catálogos desnecessários, o service worker usa cache por versão, precache do inglês e cache sob demanda para os outros catálogos. O ensaio confirmou a reabertura offline em português depois da seleção. [Verificação offline](web-offline.json) · [Implementação do cache](../../apps/web/offline-plugin.mjs)
- O nome genérico “Universal Calculator” já aparece nas lojas. Foi preservado o nome completo solicitado, “Universal Calculator (DARS)”. As consultas ao identificador não retornaram listagem pública e não provam reserva ou exclusividade. [Auditoria de ambiente e identificadores](environment.json)

## 10. Decisões arquiteturais

Um núcleo Rust compartilha gramática, limites e resultado JSON entre a CLI e o WASM da interface. A entrega desktop incorpora o mesmo build Vite usado no navegador. Números cruzam a interface como texto para preservar a precisão. Raízes irracionais usam intervalos e a função só apresenta a aproximação quando os limites certificam o mesmo arredondamento. [ADR 001](../../docs/adr/0001-shared-calculation-core.md) · [Semântica do módulo Standard](../../docs/pt-BR/standard.md)

## 11. Regressões

Este é o primeiro objetivo, de modo que não há módulos aprovados de objetivos anteriores para testar. O material anterior do portfólio, as ferramentas locais e o estado interno permanecem fora da árvore pública. [Árvore do commit](https://github.com/daniloatila/universal-calculator-dars/tree/164af9e4fb1719834cbf7858d1dc7781ac9bfacf) · [Registro de alterações](changes.md)

## 12. Evidências

- Código e artefatos auditados. [Commit de implementação](https://github.com/daniloatila/universal-calculator-dars/commit/164af9e4fb1719834cbf7858d1dc7781ac9bfacf) · [Manifesto SHA-256](artifacts.json)
- Execução real no Windows. [Resultados WebView2](windows-x64.json) · [Captura desktop](windows-x64.png)
- Visual e comportamento web. [Captura desktop claro](web-desktop-light.png) · [Captura celular escuro emulado](web-mobile-dark.png) · [Métricas de layout](web-validation.json)
- Precisão e paridade. [Oráculo Python](oracle.json) · [CLI e WASM](parity.json)

## 13. Reprodução

Os comandos de cópia da revisão, compilação, CLI, navegador, desktop, oráculo, instrumentação, benchmarks e auditoria constam do roteiro de reprodução. [Reprodução independente](reproduction.md)

## 14. Autoavaliação crítica

As medições usam um hardware e os testes de acessibilidade são automatizados. Compatibilidade física com dispositivos móveis, suporte a instaladores assinados e desempenho em classes diferentes de hardware requerem validação nas respectivas etapas. O consumo observado da WebView2 pede uma futura medição de memória privada e observação ociosa de maior duração. Os avisos do desktop Linux precisam de nova análise antes de qualquer distribuição desse alvo.

## 15. Estado final

**READY_FOR_REVIEW**. Os 55 critérios do Objetivo 01 têm evidências registradas. Os quatro jobs de CI passaram. O Objetivo 02 permanece em **NOT_STARTED** e requer aprovação explícita do senhor. [Estado do projeto](../../PROJECT_STATE.md) · [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45487008034)
