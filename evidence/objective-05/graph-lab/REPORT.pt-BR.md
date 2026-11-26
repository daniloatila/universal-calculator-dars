# Laboratório de gráficos

[English](REPORT.md)

A interface Canvas desenha curvas amostradas e projeta a geometria 3D. Foram exercitados a câmera, a exportação, as lacunas em descontinuidades, a inspeção pelo teclado e o tratamento de eventos de recuperação. O teste despachou eventos do navegador. Ele não simula falha física de GPU.

A suíte independente da CLI verificou 25 casos. A comparação nativo/WASM passou em 16 requisições e rejeitou 3 chamadas a outras ferramentas. O benchmark mede 120 chamadas após aquecimento do WASM. A cobertura local de linhas instrumentadas do módulo foi 98,95%. [Algoritmos e limites](contract.pt-BR.md) · [Casos independentes](tests.json) · [Paridade e tempo](parity.json) · [Cobertura](coverage.json) · [Captura do navegador](web.png)

As capturas usam fórmulas analíticas. As curvas 2D são `sin(x)` e `cos(x)`. A superfície 3D usa `sin(x)*cos(y)`. [2D](web-2d.png) · [3D](web.png)
