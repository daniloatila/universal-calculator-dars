# Regressão da versão 0.5.1 para a 0.6.0

[English](regression.md)

O código `9ca50cffaa31ab71867809c473968f3fcd46368d` passou em 261 testes no Chrome instalado 158.0.8127.38, incluindo os 232 testes da versão anterior, identificados por arquivo e título. Todos os 89 testes Node passaram. O executável Windows passou nas 17 verificações históricas no WebView2 físico 158.0.4370.33. [Chrome](integrated-audit/browser.json) · [Windows](integrated-audit/windows-regression.json) · [CI](https://github.com/daniloatila/universal-calculator-dars/actions/runs/45902255489)

As 602 verificações históricas abrangem o cálculo, a interface e os sistemas operacionais. Estão incluídas nas suítes atuais, que exercitam algumas operações em mais de uma camada. [0.5.1](../objective-05/revision-01/regression.json)

| Verificações históricas | Posições | Evidência |
| --- | ---: | --- |
| Testes Rust Standard e de valores estruturados | 16 | [ci.json](integrated-audit/ci.json) |
| Oráculo CLI com Fraction e Decimal | 157 | [regression.json](integrated-audit/regression.json) |
| Oráculo estruturado em WASM | 291 | [regression.json](integrated-audit/regression.json) |
| Paridade Standard entre CLI e WASM | 20 | [regression.json](integrated-audit/regression.json) |
| Testes Node | 57 | [browser.json](integrated-audit/browser.json) |
| Testes de Chrome no dispositivo físico | 27 | [browser.json](integrated-audit/browser.json) |
| Navegador de produção offline | 10 | [browser.json](integrated-audit/browser.json) |
| WebView2 do Windows físico | 17 | [windows-regression.json](integrated-audit/windows-regression.json) |
| Testes hospedados de credenciais do Windows | 2 | [ci.json](integrated-audit/ci.json) |
| Testes hospedados de capacidades do Windows | 5 | [ci.json](integrated-audit/ci.json) |

As referências independentes coincidiram em 2.355 casos de matemática avançada e 577 casos financeiros. O motor nativo e o WASM coincidiram em outras 305 comparações matemáticas. A comparação de cenários financeiros passou em 84 casos independentes, 84 entre plataformas e 79 reexecuções de provas. As 36 configurações de reexecução de simulação com semente reproduziram suas referências. A revisão do Data Lab passou em 23 grupos e comparou 31 requisições entre o nativo e o WASM. [JSON](integrated-audit/regression.json)

O Chrome instalado verificou dez comportamentos offline, cinco exemplos financeiros e sete científicos. Os 25 módulos passaram pelas 42 mudanças direcionais entre idiomas. Essa matriz conserva 924 comparações dos 22 módulos anteriores e acrescenta 126 do Math Notebook, Formula Studio e Automation Studio. [JSON](locale-transition-matrix.json)

A cobertura de linhas medida pelo LLVM no Linux atingiu 96,00% (6822/7106) nos motores científicos. Optimization cobriu 906/967 linhas. As 61 linhas ainda descobertas incluem saídas defensivas de iteração e leitura de coeficientes, acompanhadas desde a revisão anterior. A medição atual discrimina os totais e as linhas cobertas por arquivo. [LLVM](coverage.json)
