# Regressão e comparação com a 0.5.0

[English](regression.md)

O [mapeamento original](../regression.json) identifica as 602 posições históricas. A revisão usa equivalentes executáveis e identifica o ambiente de cada verificação. Algumas validações contribuem para mais de uma suíte. [Contagens atuais por suíte](regression.json)

| Verificação histórica | Posições | Evidência atual |
| --- | ---: | --- |
| Rust Standard e testes estruturados | 16 | CI Rust em três plataformas |
| Oráculo CLI com Fraction e Decimal | 157 | Referência independente no Linux |
| Oráculo de aritmética estruturada em WASM | 291 | Referência independente no Linux |
| Comparações Standard CLI/WASM | 20 | Paridade nativa/WASM no Linux |
| Testes Node | 57 | Suíte Node mantida |
| Chrome no Windows físico | 27 | Sete arquivos históricos na execução completa |
| Navegador de produção offline | 10 | Recursos da distribuição e idiomas sob demanda |
| Interface Windows nativa | 17 | Executável verificado no WebView2 físico |
| Credenciais e capacidades do Windows | 7 | Dois testes de credenciais e cinco de capacidades |

As contagens por suíte identificam os 2.355 casos matemáticos avançados, as 305 comparações matemáticas entre CLI e WASM e os 577 casos financeiros independentes. O Comparador de Cenários verificou 84 casos independentes e 84 casos entre as duas plataformas, com 79 reexecuções de prova. As suítes científicas cobrem referências numéricas, comportamentos de limite, gráficos, recursos e simulações reproduzíveis. Em 36 reexecuções por lotes, a prova coincidiu com a da execução integral. [CI](ci.json) · [Procedência do executável](windows-artifact.json) · [Interface nativa](windows-regression.json)

A execução completa no Chrome inclui os 224 testes representados na 0.5.0 e os casos novos da correção. A matriz de 924 transições verifica seis idiomas de destino a partir de cada um dos sete idiomas de origem, nos 22 módulos. Os exemplos financeiros e científicos foram executados offline no aplicativo Windows verificado. [Chrome](browser.json) · [Idiomas](locale-transition-matrix.json) · [Finanças offline](windows-finance-offline.json) · [Ciência offline](windows-candidate.json)
