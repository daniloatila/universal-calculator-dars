# Reprodução do Objetivo 06

Parta do commit de código informado em acceptance.json e use as versões fixadas no guia de compilação e nos lockfiles. Os testes do Formula Studio comparam o executável CLI de release com o WASM gerado. Para a suíte hospedada, instale o Chromium da versão Playwright. Para o Google Chrome instalado, use DARS_BROWSER_CHANNEL com o valor chrome. O teste offline separado aceita o caminho do Chrome em DARS_CHROME_EXECUTABLE.

```sh
cargo fmt --all --check
cargo test --locked
cargo build --release --locked -p dars-cli
node scripts/install-wasm-bindgen.mjs
node scripts/build-wasm.mjs
npm ci --prefix apps/web --ignore-scripts
npm run build --prefix apps/web
npm test --prefix apps/web
npm run test:e2e --prefix apps/web
node tests/verify-web-offline.mjs
node scripts/verify-capability-session.mjs
node scripts/verify-automation-flows.mjs
```

No Windows, execute os testes nativos de release, inclusive o teste isolado do Gerenciador de Credenciais. Use o verificador do artefato e os scripts pareados para testar a aplicação WebView2 e medir a memória. O teste controlado usa um socket temporário de loopback. A consulta aos serviços reais usa o controle de inventário no aplicativo empacotado. Na ausência de listener, a interface deve indicar conexão recusada. [Método Windows](integrated-audit/windows-method.pt-BR.md) · [Testes de provedores](intelligence/README.pt-BR.md)

O workflow do commit executa os oráculos Python, a comparação CLI/WASM, a cobertura LLVM e os testes de credenciais. Para a matriz do Chrome, execute collect-browser.py snapshot com o SHA antes das suítes. Salve a saída do Node em node.log, o relatório Playwright em playwright.json e a saída do teste offline em offline.log sob artifacts/objective-06/integrated-run. Execute collect-browser.py collect com o mesmo SHA. collect-source-ci.py recebe SHA e ID do run aprovado. collect-regression.py combina os resultados com o recibo do Windows físico. [Workflow](../../.github/workflows/ci.yml) · [Coleta da regressão](integrated-audit/collect-regression.py)

O job Linux usa o canal chromium do Playwright, que executa o navegador completo em modo headless. A execução anterior com Headless Shell reportou travamentos nas páginas do painel. A nova execução mantém o conjunto integral de testes. [Configuração do navegador](https://playwright.dev/docs/browsers#chromium-new-headless-mode)
