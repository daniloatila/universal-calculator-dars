# Otimização

[English](REPORT.md)

A suíte verifica a raiz de x²−2, o mínimo quadrático em x=3, Rosenbrock, descontinuidades, ótimos locais limitados e factibilidade linear exata. A programação linear e os métodos locais possuem interpretações distintas.

A suíte independente da CLI verificou 39 casos. A comparação nativo/WASM passou em 17 requisições e rejeitou 3 chamadas a outras ferramentas. O benchmark mede 120 chamadas após aquecimento do WASM. A cobertura local de linhas instrumentadas do módulo foi 93,69%. [Algoritmos e limites](contract.pt-BR.md) · [Casos independentes](tests.json) · [Paridade e tempo](parity.json) · [Cobertura](coverage.json) · [Captura do navegador](web.png)
