# Resultados no Windows físico

[English](physical-windows-results.md)

O executável x64 verificado da execução `45902255489` abriu e calculou no Windows físico. As duas versões usaram WebView2 158.0.4370.33. [Identidade do pacote](windows-artifact.json) · [Método](windows-method.pt-BR.md)

| Métrica | 0.5.1 | 0.6.0 |
| --- | ---: | ---: |
| Abertura até resultado Padrão conferido (ms) | 546,6 | 533,2 |
| Mediana de 12 recálculos (ms) | 47,25 | 34,44 |
| Memória residente privada em repouso (MiB) | 114,0 | 114,1 |
| Memória privada comprometida em repouso (MiB) | 256,1 | 259,9 |
| Conjunto residente total em repouso (MiB) | 390,2 | 391,5 |
| Uso físico do sistema, repouso menos ambiente inicial (MiB) | 175,2 | 190,8 |
| Processos restantes após o encerramento | 0 | 0 |

A aplicação passou nas 17 verificações históricas do Windows, nos cinco exemplos financeiros offline e nos sete módulos científicos e de dados. A comparação financeira histórica foi reproduzida. O aplicativo empacotado registrou 25 módulos e conferiu os hashes dos 22 WASM pela leitura dos respectivos bytes. Os três módulos de produtividade e a inteligência desativada concluíram os casos locais. O transporte nativo também concluiu os ensaios consentidos com servidores sintéticos em loopback numérico. [Teste histórico](windows-regression.json) · [Candidata](windows-candidate.json) · [Transporte nativo](windows-intelligence-native.json)

A tabela apresenta a mediana das amostras da árvore de processos. Os conjuntos residentes incluem páginas compartilhadas. A memória comprometida privada pode incluir páginas fora da RAM. As variações do sistema inteiro refletem outras atividades e o ensaio inclui instrumentação. A meta de menos de 100 MB de RAM física incremental permanece em aberto. Nenhum servidor de modelos de IA foi iniciado. [Dados por fase em bytes](physical-windows-comparison.json)
