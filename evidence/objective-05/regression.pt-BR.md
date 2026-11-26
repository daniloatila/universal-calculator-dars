# Mapeamento de regressão

[English](regression.md)

A auditoria do Objetivo 05 revalidou as 602 verificações herdadas. A contagem inclui 578 verificações locais do motor, da web e do navegador, 17 no WebView2 do Windows físico e sete no job Windows hospedado com a fonte exata. As reexecuções numéricas e financeiras anteriores mantêm seus recibos originais. Os oráculos financeiros e do comparador que identificam o executável registram o SHA-256 `62855de300d81f877ac1723d7d26a44896dad1b0ac42defd5d904d4b3d6a8fd4` da CLI usada naquele grupo de testes locais. [Registro estruturado](regression.json) · [Mapeamento aprovado da 0.4.1](../objective-04/revision-01/tests.json)

## As 602 verificações herdadas

| Categoria histórica | Mapeadas | Observado no Objetivo 05 |
| --- | ---: | --- |
| Suíte Rust de Standard | 16 | Passaram dez testes de Standard e seis de valores estruturados. Outros cinco testes de prova passaram em `review-tests.log`. |
| Oráculo CLI independente de Standard | 157 | 157 passaram na CLI local de lançamento em `history/oracle.txt`. |
| Oráculo WASM independente de valores estruturados | 291 | 291 passaram no WASM gerado em `history/structured.txt`. |
| Resultados de Standard em CLI e WASM | 20 | 20 passaram em `history/check-targets.txt`. |
| TypeScript e Node | 57 | A suíte da fonte final passou em 70 testes, incluindo os 57 equivalentes herdados, em `frontend-label-node.log`. |
| Chrome no Windows físico | 27 | Os sete arquivos de teste herdados passaram na compilação da fonte final. O JSON registra a contagem por arquivo. |
| Verificação web explícita offline | 10 | 10 passaram na suíte offline independente. Ela verifica recarga offline e catálogos de idioma sob demanda. |
| WebView2 nativo no Windows | 17 | As 17 passaram no Windows físico com o WebView2 `158.0.4370.33` e o executável hospedado verificado. [Recibo da execução](integrated-audit/windows-regression.json) · [Proveniência do artefato](integrated-audit/windows-artifact.json) |
| Provedor de credenciais do Windows | 2 | As duas passaram na etapa de release do Windows hospedado, incluindo a gravação e leitura de uma credencial sintética, habilitada com `--include-ignored`. [Recibo hospedado](integrated-audit/ci.json) |
| Sensores e capacidades do Windows em Rust | 5 | As cinco verificações identificadas de capacidades e sensores passaram na etapa desktop do Windows hospedado. [Recibo hospedado](integrated-audit/ci.json) |

## Suítes matemáticas e financeiras

| Módulo matemático | CLI independente | CLI/WASM | Isolamento |
| --- | ---: | ---: | ---: |
| Científica | 102 reais, 75 complexos | 19 | 1 |
| Álgebra | 184 | 28 | 1 |
| Cálculo | 210 | 27 | 2 |
| Álgebra Linear | 223 | 30 | 3 |
| Geometria | 159 | 32 | 4 |
| Matemática Discreta | 289 | 38 | 5 |
| Programador | 368 | 36 | 6 |
| Conversor | 342 | 46 | 7 |
| Data e Hora | 403 | 49 | 8 |
| **Total de cada suíte** | **2.355** | **305** | **37** |

A suíte de Prova de Cálculo de Standard passou separadamente em nove casos CLI/WASM, incluindo cinco reexecuções. Finanças passou em 577 casos independentes na CLI, distribuídos entre Financeira e Empréstimos (128), Investimentos e Negócios (87) e Tributos (362). Os 87 incluem 49 de Investimentos e 38 de Negócios. As cinco suítes financeiras herdadas passaram em 49 comparações CLI/WASM com outras 20 verificações de isolamento. Foram 15 de Financeira, 3 de Investimentos, 7 de Empréstimos, 17 de Tributos e 7 de Negócios.

O comparador semântico passou em 84 casos independentes na CLI e 79 reexecuções de prova. A suíte isolada CLI/WASM também passou em 84 casos com 79 reexecuções. São verificações distintas do mesmo conjunto de cenários. O Chrome executou 14 testes dos módulos financeiros e 12 do comparador, incluindo taxas normalizadas, resolução do solver e reexecução histórica. O script de produção web offline passou um caso para cada módulo financeiro.

O executável verificado da 0.5.0 passou em cinco exemplos financeiros offline no WebView2 do Windows físico, cobrindo TIR, projeção de investimentos, amortização SAC, retenção do IRRF e preço por margem. Em uma execução separada, o comparador importou e reproduziu o cenário histórico, manteve o resultado após a troca de módulo e confirmou diferença zero na base normalizada das taxas. As duas execuções financeiras têm contagens próprias, além das 602 verificações herdadas. Os recibos da 0.4.1 conservam a proveniência original. [Finanças offline na versão atual](integrated-audit/windows-finance-offline.json) · [Comparador na versão atual](integrated-audit/windows-finance-comparison.json) · [Prova exportada](integrated-audit/windows-finance-comparison-proof.json) · [Finanças no Windows da versão aprovada](../objective-04/revision-01/desktop.json) · [Comparador no Windows da versão aprovada](../objective-04/revision-01/after-windows.json)

## Escopo dos navegadores e da execução hospedada

O Chrome local 158.0.8127.38 passou em 224 testes no commit `50225fb5dccb677b10653058f81d89c168a5743c`, com SHA-256 dos arquivos de produção `9e19135cd5e85d01f60ae30c0a2b891de49ca696ec252c2cc61ec42889f1b491`. Foram 146 testes herdados de matemática e interface, 14 dos módulos financeiros, 12 do comparador e 52 de ciência. A falha original no carregamento sob demanda e na recarga offline de Geometria permanece no recibo anterior. Duas execuções completas anteriores passaram em 223 testes cada, nas respectivas compilações. [Recibo final do Chrome](integrated-audit/browser.json)

A matriz final cobre 42 transições direcionais de idioma e contém 420 comparações matemáticas herdadas, 210 financeiras herdadas e 294 científicas. As 924 comparações canônicas coincidem com as da execução completa anterior com fonte verificada. Os recortes de navegador, notação, prova e oráculo podem cobrir os mesmos fluxos e mantêm contagens próprias. [Matriz final de idiomas](locale-transition-matrix.json)

O fluxo hospedado `45860076452`, executado a partir da fonte exata, passou nos quatro jobs. O job Ubuntu passou em 224 testes no Chromium via Playwright. Os resultados locais de navegador usam Chrome no Windows, e os resultados do aplicativo desktop físico usam WebView2. Firefox fica fora do escopo medido. [Recibo hospedado](integrated-audit/ci.json) · [Método de verificação no Windows](integrated-audit/windows-method.pt-BR.md) · [Reprodução](reproduction.pt-BR.md)
