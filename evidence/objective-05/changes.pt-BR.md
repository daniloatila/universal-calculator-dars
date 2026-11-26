# Correções encontradas na integração

[English](changes.md)

- A comparação com SciPy revelou erro na CDF binomial perto do centro de um milhão de tentativas equiprováveis. As rotinas corrigidas calculam as duas caudas com convergência limitada e preservam saltos de pequenas binomiais justas. A regressão verifica a CDF, o quantil e o predecessor de um salto.
- O produto em ponto flutuante de um nível de risco decimal pelo tamanho da amostra podia deslocar o VaR histórico em uma posição. A regressão distingue 0,56 de um decimal ligeiramente maior em 100 perdas ordenadas. As simulações financeiras também exercitam pequenas variações em relação a um patrimônio inicial elevado.
- A auditoria da otimização encontrou um resíduo pequeno causado por cancelamento aritmético. O algoritmo passou a informar quando a resolução aritmética não sustenta a conclusão de que há uma raiz. O avaliador de expressões é compartilhado com o Laboratório de Gráficos.
- O Vite extraiu o agendador visual usado por Geometria e Gráficos. Um teste Chrome de cache frio detectou seu carregamento com a Standard. O cache offline passou a adiar esse recurso até a ativação da ferramenta.
- O Laboratório de Dados conserva separadamente o esquema de entrada e o de saída. Assim, é possível editar os tipos originais quando uma etapa já renomeou ou selecionou colunas.
- Cada worker científico confere seus próprios identificadores públicos antes do despacho. Isso mantém o reuso interno mesmo quando a dependência também oferece uma calculadora independente.
- Os controles científicos usam rótulos próprios da operação. A correção abrange o método do intervalo na simulação, o resultado de probabilidade, a taxa de uma distribuição, a distinção entre amostra e população e o ponto ou estado inicial em otimização e simulação. A regressão de navegador exercita os sete idiomas da interface.
- O comparador Price de 600 parcelas com arredondamento final levou 9,29 e 9,38 s no worker da 0.5.0. A revisão da 0.4.1 chegou a 11,04 s. Todos os cenários de 360 e 600 parcelas mantiveram os custos e as diferenças de referência. O caminho de aritmética exata continua caro. O estudo manteve o prazo financeiro em 15 s e introduziu execução por lotes nas simulações longas. As duas amostras por versão não estabelecem um ganho de velocidade. [Medição do comparador](integrated-audit/finance-price.json)
