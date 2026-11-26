# 0002 · Computação científica em ambiente nativo e WASM

[English](0002-scientific-computation.md)

Cada ferramenta científica carrega seu próprio WebAssembly. A CLI e os workers usam o mesmo cálculo Rust e o mesmo registro de prova versionado. O worker aceita apenas o identificador público da ferramenta registrada. Otimização e Gráficos reutilizam a árvore de expressões limitada de Cálculo. Física utiliza o modelo dimensional do Conversor. Os parâmetros matemáticos permanecem na requisição. Os perfis do dispositivo controlam a amostragem visual e o agendamento.

A simulação mantém o estado do gerador determinístico e da agregação em Rust. O tamanho do lote controla a frequência das notificações. Um worker recebe uma tarefa e libera o estado ao concluir. Cancelar termina o worker, inclusive durante o cálculo WASM. A próxima tarefa recebe um worker novo. Para arquivos grandes, o Laboratório de Dados oferece uma API de bytes com limites próprios. A CLI recebe os mesmos bytes na entrada padrão. O manifesto vincula SHA-256, configuração e resumo. Reproduzir o cálculo exige o arquivo de origem.

Estatística usa racionais exatos quando aplicável e álgebra linear centrada para modelos ajustados. Probabilidade e inferência compartilham rotinas probabilísticas limitadas. A simulação registra versão do gerador e agregação. A otimização distingue soluções lineares factíveis ou comprovadamente ótimas de estimativas numéricas locais. A física confere dimensões SI antes do cálculo. A exportação gráfica registra geometria amostrada, domínio e resolução.

O Canvas 2D desenha curvas e a projeção de superfícies 3D com grade limitada e câmera ajustável. O desenho ocorre sob demanda. O módulo ativo controla os recursos temporários. [Contratos dos motores](../../evidence/objective-05/REPORT.pt-BR.md)
