# Objetivo 06 · Produtividade, automação e inteligência artificial

[English](REPORT.md) · [Critérios de aceitação](acceptance.json)

**0.6.0 · READY_FOR_REVIEW** após a aprovação dos quatro jobs do commit de entrega. O proprietário aprovou o Objetivo 05 por 95/100. Sua versão 0.5.1 foi integrada à main e o desenvolvimento do Objetivo 06 foi publicado no branch próprio. Os Objetivos 01 a 05 estão aprovados com 95/100 cada. Os Objetivos 07 e 08 continuam NOT_STARTED. [Aprovação](../objective-05/approval.json) · [Código auditado](https://github.com/daniloatila/universal-calculator-dars/commit/9ca50cffaa31ab71867809c473968f3fcd46368d) · [CI do código](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45902255489)

## O que experimentar

| Módulo | Resultado reproduzível |
| --- | --- |
| [Math Notebook](math-notebook/REPORT.pt-BR.md) | R$ 10.000 a 1% ao mês durante 12 meses resultam em R$ 11.268,25 e ganho de R$ 1.268,25. Alterar a taxa atualiza a projeção, o gráfico e a prova que dependem dela. Capital inicial e prazo preservam os resultados anteriores. |
| [Formula Studio](formula-studio/README.pt-BR.md) | Quatro fórmulas comunitárias passam nos testes locais. O recibo exportado conserva expressão, versão exata, unidades, entradas, dependências e a prova individual do Rust. |
| [Automation Studio](automation-studio/REPORT.pt-BR.md) | Quatro fluxos reproduzem os cálculos. O financeiro compara cenários compatíveis. O empresarial produz margem ponderada de 14/45. O estatístico aplica uma regra explícita ao valor ausente. O científico reproduz os quantis pela semente e sinaliza a aproximação. |
| [DARS Intelligence](intelligence/README.pt-BR.md) | Os 25 módulos funcionam com a IA desativada. Após a proposta, o usuário autoriza a execução matemática. O exemplo financeiro devolve a mesma fração do caderno. |

## Conexão local

Em 26 de novembro, às 18h32 de Brasília, a compilação nativa de desenvolvimento consultou, pela janela WebView2 empacotada, o inventário do Ollama na porta 11434 e do LM Studio na 1234. As quatro combinações com 127.0.0.1 e ::1 recusaram conexão. As consultas não enviaram prompt nem credencial. O DARS agora faz conexão local direta em loopback numérico e preserva a política de proxy do sistema para os provedores externos. Já a candidata de distribuição se conectou a servidores HTTP controlados nas duas famílias de endereço, em outras portas temporárias. O resultado não identifica a VPN como causa. A VPN, as proteções do Windows e os serviços de modelos permaneceram intactos. Inferência com modelo instalado e chamadas pagas continuam sem validação. [Diagnóstico](intelligence/local-services.json) · [Transporte no executável de revisão](integrated-audit/windows-intelligence-native.json)

O OCR reconheceu a expressão impressa sintética 2+3. O Rust retornou 5 depois da confirmação. O Chrome detectou duas vozes locais para leitura em português e nenhum ditado local pronto nos sete idiomas. O teste preservou o microfone fechado e não reproduziu áudio. [Disponibilidade de voz](voice-vision/availability.json)

## Resultados da auditoria

- O Chrome instalado passou em 261 testes, incluindo os 232 da 0.5.1. O Chromium hospedado passou em 261 e o Node em 89. Há 1.050 comparações direcionais únicas dos 25 módulos e outras 42 específicas de IA. [Navegador](integrated-audit/browser.json) · [Matriz](locale-transition-matrix.json) · [Testes](tests.json)
- Passaram as 602 verificações históricas, os 2.355 casos matemáticos independentes, 305 comparações matemáticas CLI/WASM, 577 casos financeiros, 84+84 comparações financeiras, 79 reproduções de provas financeiras, 36 de simulação e 23 grupos do Data Lab com 31 comparações entre alvos. A cobertura científica LLVM ficou em 96,00% (6822/7106 linhas). Os caminhos defensivos ainda sem cobertura em Optimization continuam registrados. [Regressão](regression.pt-BR.md) · [Cobertura](coverage.json)
- O executável Windows x64 passou em 17 verificações históricas, cinco exemplos financeiros offline, sete módulos científicos, três módulos novos e chamadas locais controladas. Os hashes dos 22 WASM conferem com o pacote. O SHA-256 do executável é `fd81e7a025553ebf5ddfcf057beb6d5e0ae8204cfe90011c86e18c174094221f`. [Pacote Windows](integrated-audit/windows-artifact.json) · [Comparação física](integrated-audit/physical-windows-comparison.json)
- A revisão independente identificou ambiguidade em campos financeiros JSON e um selo de fluxo que atribuía verificação ao motor mesmo sem cálculo. A correção recusa campos duplicados e períodos fracionários, torna a aproximação visível e identifica as etapas que têm prova própria. [Verificações corretivas](integrated-audit/corrective-checks.json)

Uma execução no Linux revelou uma falha na reabertura offline do Data Lab após a primeira visita e um travamento ao abrir a IA. O DARS passou a guardar os arquivos usados pelo módulo durante a primeira carga e a consultar os serviços de voz somente após pedido explícito. Com o controle da página atrasado de propósito, três sessões independentes de Chrome reabriram o Data Lab offline. [Teste da primeira visita](integration/data-lab-first-visit.json)

No modo Padrão visível e em repouso, a árvore do aplicativo registrou 119537664 bytes residentes privados na 0.5.1 e 119656448 na 0.6.0. As diferenças físicas do sistema em relação ao controle foram 183762944 e 200093696 bytes. Um único par incorpora atividade concorrente do computador. A meta de menos de 100 MB de RAM física incremental continua aberta. [Benchmarks](benchmarks.json) · [Histórico da dívida](../objective-02/revision-02/memory-debt.pt-BR.md)

[Mudanças](changes.pt-BR.md) · [Contrato de integração](integration/REPORT.pt-BR.md) · [Privacidade](privacy.pt-BR.md) · [Segurança](security.pt-BR.md) · [Modelo de ameaças](threat-model.pt-BR.md) · [Cronologia do Windows](integrated-audit/windows-protection.pt-BR.md) · [Compatibilidade](compatibility.pt-BR.md) · [Reprodução](reproduction.pt-BR.md)

O histórico do branch identifica os commits de código e de entrega e seus respectivos runs. O manifesto contém os hashes das evidências. A decisão do proprietário permanece pendente. [Manifesto](manifest.json) · [Branch de revisão](https://github.com/daniloatila/universal-calculator-dars/tree/codex/objective-06-productivity-automation-ai)
