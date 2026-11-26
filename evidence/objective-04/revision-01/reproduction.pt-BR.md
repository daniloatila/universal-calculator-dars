# Como reproduzir a revisão 0.4.1

[English e comandos](reproduction.md)

Na versão 0.4.0, abra Financeira e selecione Taxa equivalente. Salve um cenário com taxa `0,10`, dois períodos de origem por ano e dois de destino. Salve outro com a mesma taxa e origem, com um período de destino. Ao comparar o indicador da taxa, a interface anterior mostra diferença `0,11` e variação de `110%`. [Interface original](before-windows.png) · [Entradas e prova originais](before-windows.json)

Na versão 0.4.1, importe o arquivo histórico para o comparador. O motor reexecuta as duas receitas e apresenta `0,21` para ambas na base efetiva anual, com diferença fracionária, pontos percentuais e variação relativa iguais a zero. Abra a prova para ver as duas bases de origem e a transformação. [Arquivo histórico](historical-scenarios.json)

Para repetir o teste nativo, confira o commit, o digest do ZIP, a proveniência e o SHA-256 do executável antes de abri-lo. Use perfis WebView2 separados para cada versão. O roteiro em inglês registra os comandos de verificação do CLI, WASM, navegador e Windows. [Roteiro](reproduction.md)
