# Objetivo 04 · Finanças e negócios

[English](REPORT.md) · [Estado do projeto](../../docs/pt-BR/project-state.md)

O DARS 0.4.0 está **READY_FOR_REVIEW** no branch dedicado. O commit auditado passou nos jobs de Linux, macOS, Windows e segurança. A versão 0.3.1 permanece como referência para a Standard e para as medições de recursos. [Ficha de aceitação](acceptance.json) · [GitHub Actions](ci.json)

| Etapa | Escopo | Evidência |
| --- | --- | --- |
| Financeira | Juros, taxas equivalentes, valor presente e futuro, anuidades, descontos, fluxos, VPL, TIR, TIRM e payback | [Método e limites](financial/methods.pt-BR.md) |
| Investimentos | Saldos, aportes, resgates, inflação, custos, tributos, taxas variáveis e modelos de produtos brasileiros | [Método e limites](investment/README.pt-BR.md) |
| Empréstimos | Price, SAC, parcelas uniformes, pagamento único, carência, amortização antecipada e custo efetivo econômico | [Método e limites](loans/methods.pt-BR.md) |
| Tributos | Simulações brasileiras por vigência para previdência, renda, salários, investimentos, IOF, ICMS paulista e IBS/CBS em 2026 | [Matriz de regras](tax/rules.pt-BR.md) |
| Negócios | Precificação, margens, ponto de equilíbrio, indicadores, ciclos, orçamento e projeções de caixa | [Método e limites](business/README.pt-BR.md) |
| Comparador | Cenários locais com duplicação, edição, comparação por indicador e arquivo de reprodução | [Decisões e formato](changes.pt-BR.md) |

A ficha de aceitação registra as verificações, o escopo e as pendências. A documentação descreve como reproduzir os resultados e interpretar as medidas.

Os oráculos independentes no CLI Windows verificaram 128 casos de Financeira e Empréstimos, 87 de Investimentos e Negócios e 362 de Tributos. O fluxo periódico de referência tem TIRs exatas de 10% e 20%. O produto com custo 100 e markup de 25% tem preço 125 e margem sobre a receita de 20%. Os casos tributários incluem exemplos da Receita Federal, faixas com vigência e o tratamento de mês sem dia correspondente no prazo de LCI e LCA. [Resultados independentes](tests.json) · [Referências tributárias](tax/rules.pt-BR.md)

Os 160 testes de produção em Chrome passaram, inclusive os 146 anteriores. As 42 transições foram verificadas nas dez ferramentas anteriores e nas cinco financeiras. Cada módulo financeiro rodou nos cinco perfis, com pico de um worker e nenhum worker ativo ao final do lote. As cinco ferramentas calcularam offline depois que seus ativos entraram no cache. [Navegador](browser.json) · [Matriz de idiomas](locale-transition-matrix.json) · [Capturas](captures.json)

A cobertura de linhas financeiras ficou em 95,68% entre testes Rust e oráculos no CLI instrumentado. O cenário Price de 360 parcelas com arredondamento final teve p95 de 1,91 segundo no WASM inicializado. A interface mantém esse trabalho no worker cancelável e pagina a tabela. [Cobertura](coverage.json) · [Benchmarks](benchmarks.json) · [Dependências](dependencies.json)

O executável de revisão Windows x64 gerado pelo runner passou em 17 verificações históricas e cinco exemplos financeiros offline no WebView2 instalado. Foram verificadas a suspensão, a retomada e a liberação dos workers. Os 15 arquivos WASM extraídos da execução corresponderam aos hashes do build hospedado. O executável tem 17.565.184 bytes e está sem assinatura Authenticode. [Proveniência](windows-artifact.json) · [Verificações históricas](windows-regression.json) · [Verificações financeiras](desktop.json)

O tempo até o primeiro resultado conferido da Standard passou de 574 para 1.730 ms na primeira comparação com a 0.3.1 e de 621 para 577 ms na repetição. Cada execução usou um perfil WebView2 novo, conservou o estado dos caches do Windows e incluiu uma chamada ao coletor nativo. A variação entre as duplas limita conclusões sobre uma mudança sistemática na inicialização. A meta de RAM física incremental segue em aberto. [Primeira comparação](desktop.json) · [Repetição](desktop-repeat.json) · [Acompanhamento de memória](../objective-02/revision-02/memory-debt.pt-BR.md)

- [Reprodução](reproduction.pt-BR.md)
- [Segurança e privacidade](security.pt-BR.md)
- [Alterações e dependências](changes.pt-BR.md)
- [Regressões e compatibilidade](regression.pt-BR.md)
