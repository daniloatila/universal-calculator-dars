# Reprodução das verificações do Objetivo 04

[English](reproduction.md) · [Estado do projeto](../../docs/pt-BR/project-state.md)

Use o commit-fonte registrado na ficha de aceitação e siga o procedimento de build com as versões travadas de Rust e Node. Os pedidos de teste usam valores e datas sintéticos. [Instruções de build](../../docs/pt-BR/build.md) · [Comandos](reproduction.md)

No Windows, use `target/release/dars.exe`. Em uma máquina com o canal Chrome instalado, configure `DARS_BROWSER_CHANNEL=chrome` para o Playwright. A verificação offline independente também aceita `DARS_CHROME_EXECUTABLE`. O workflow do GitHub seleciona as verificações da plataforma e instala as bibliotecas fixadas do oráculo em ambiente temporário.

Confira o hash do executável e dos arquivos WASM empacotados com a proveniência do artefato de revisão antes do teste nativo. Use o executável 0.3.1 verificado nas medições pareadas do Standard. Execute no WebView2 instalado, com um perfil novo por execução. Mantenha os perfis e logs brutos fora da evidência pública. [Protocolo de memória do Windows](../objective-02/revision-02/memory-debt.pt-BR.md)

Abra Financeira, escolha Taxas internas de retorno, carregue o exemplo e calcule. A tabela contém as taxas 0,10 e 0,20, ambas de multiplicidade um. Alterne entre inglês e português e calcule novamente. A apresentação dos números acompanha o idioma e a prova preserva a notação de origem e as entradas canônicas.

Em Negócios, abra Precificação e carregue o exemplo. O preço é 125 e a margem bruta sobre receita é 0,20. Altere uma premissa, calcule ambos os cenários e guarde-os para comparação. O cálculo exibe a diferença entre os resultados e deixa em branco a diferença relativa quando a referência é zero.
