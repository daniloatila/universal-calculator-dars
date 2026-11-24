# Reprodução · Objetivo 01

Execute a [compilação da fundação](../../docs/pt-BR/build.md) na raiz do projeto. As notas abaixo serão atualizadas de acordo com os comandos executados durante a validação.

## Oráculo e verificações de interface

- Execute os testes do núcleo Rust, incluindo os casos matemáticos de referência.
- Reproduza os resultados com o oráculo independente de Python e a CLI nativa.
- Execute os testes Playwright sobre o build web e verifique a paridade com o WASM do desktop.
- Abra o executável Windows e confirme a inicialização da interface e do avaliador.

## Medições e diagnóstico

Registre a versão da revisão, as dependências locais, as amostras de inicialização a frio e a quente e a separação entre o processo principal e a WebView. Confirme que as ferramentas mediram a execução em vez de apenas a existência do processo. A [matriz de compatibilidade](compatibility.md) identifica os ambientes realmente observados.
