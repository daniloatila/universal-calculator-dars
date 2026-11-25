# Histórico de alterações

[English](../../CHANGELOG.md)

## 0.3.0 · Revisão do Objetivo 03

- Incluídas as ferramentas Scientific, Álgebra, Cálculo, Álgebra Linear, Geometria, Matemática Discreta, Programador, Conversor e Data e Hora, com avaliadores Rust limitados e verificações matemáticas independentes.
- Incluídas a busca entre dez ferramentas, a separação dos arquivos WASM avançados e a integração com cinco perfis adaptativos e sete idiomas.
- Incluídos registros locais de cálculo versionados com classificação, métodos, opções e dados de reprodução. Registros abertos do disco são mostrados como texto sem verificação de autoria ou resultado.
- Ampliadas as evidências no Windows e no navegador para cobrir troca de ferramentas, suspensão, preparação offline, encerramento de workers e medições comparáveis de memória. [Etapas do Objetivo 03](../../evidence/objective-03/PLAN.pt-BR.md)

## 0.2.2 · Revisão 02 do Objetivo 02

- Encerramento do worker dedicado de uma tarefa expirada ou cancelada antes da admissão da sucessora.
- Descarte de respostas de workers encerrados, com suspensão por módulo, limites das filas e admissão adaptativa durante a recuperação.
- Acompanhamento do commit privado do WebView2 e da meta de memória no modo básico nos objetivos restantes.

## 0.2.1 · Revisão 01 do Objetivo 02

- Provedor de capacidades Windows com escopo mínimo e diagnóstico local.
- Registro de módulos desacoplado, limites para inicialização e tarefas e limpeza integral da sessão.
- Desenho simplificado no Ultraleve e comparações de desempenho nativo.

## 0.2.0 · Objetivo 02

- Ciclo de vida com um módulo ativo e recuperação dos valores da sessão da Standard em memória.
- Cinco perfis de recursos, suspensão nativa e retomada do worker sob demanda.
- Central de privacidade, modo web explícito para usar apenas o cache e diagnóstico traduzido.
- Rótulos legíveis para valores matemáticos retidos, com a mesma representação no cálculo.

## 0.1.1 · Revisão 01 do Objetivo 01

- Armazenamento de racionais exatos e aproximações por intervalo independentemente da expressão original. A memória e a reutilização de resultados preservam seu valor em expressões percentuais.
- Prazo de execução, cancelamento, isolamento de respostas obsoletas e recuperação limitada do worker.
- Tema Escuro em tons de azul-marinho por padrão em perfis novos, com as escolhas explícitas de tema preservadas.
- Regressões de navegador, Rust e oráculo independente, além de benchmark Windows com *working set* privado, memória comprometida e amostras mais longas de repouso.

## 0.1.0 · Revisão do Objetivo 01

- Registro da missão original, dos oito marcos planejados e do processo de evidências e aprovação.
- Implementação e validação da calculadora Standard com núcleo Rust compartilhado entre Windows x64, web e CLI. Publicação do código auditado e das evidências para revisão do autor.
