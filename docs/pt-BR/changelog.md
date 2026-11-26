# Histórico de alterações

[English](../../CHANGELOG.md)

## 0.6.0 · Produtividade, automação e IA opcional

- Adicionados Math Notebook, Formula Studio e Automation Studio, com documentos locais versionados, limites de execução e provas reproduzíveis no Rust.
- Adicionado um gateway opcional para desktop com revisão por solicitação, diagnóstico local IPv4/IPv6 e OCR local. A calculadora abre com IA desativada.

## 0.5.1 · Revisão do Laboratório de Dados

- Interpreta os números nativos de JSON e de planilhas segundo a gramática do formato e conserva a notação configurada para texto.
- Preserva o tipo, a época de datas, a fórmula e o estado de cache das células XLSX.
- Aplica um orçamento de processamento no ciclo de vida do arquivo e versiona a reprodução de receitas e provas.

## 0.5.0 · Ciência, engenharia e dados

- Adiciona Estatística, Probabilidade, Simulação, Otimização, Física e Engenharia, Gráficos e Dados ao registro de módulos sob demanda.
- Acrescenta progresso e prazos por classe de tarefa, lotes determinísticos, gráficos 2D/3D sob demanda e transformação local de tabelas.
- Preserva a notação de origem entre idiomas e amplia os registros de cálculo com convenções, unidades, sementes e hashes das fontes.
- Integra o Objetivo 04 aprovado na main e registra a avaliação de 95/100.

## 0.4.1 · Revisão da comparação financeira do Objetivo 04

- Registra as tolerâncias de parada disponíveis e omite diferenças dentro da resolução do método numérico.
- Recalcula os dois cenários em Rust e classifica a compatibilidade pelo significado, unidade e contexto financeiro de cada indicador.
- Normaliza taxas compostas conhecidas para a base efetiva anual. Apresenta separadamente pontos percentuais, variação relativa e precisão.
- Preserva a importação de cenários históricos e exporta provas reproduzíveis. Restringe a seleção pelo custo nominal a propostas de empréstimo compatíveis.

## 0.4.0 · Candidata à revisão do Objetivo 04

- Incluídas cinco ferramentas financeiras e empresariais com aritmética racional, unidades monetárias e arredondamento explícito.
- Adicionadas projeções de investimento, tabelas de amortização, regras tributárias brasileiras com vigência e análise empresarial.
- Ampliada a prova de cálculo para preservar premissas financeiras, com comparação e reprodução local de cenários.
- Validação da candidata no ambiente compartilhado e frente à referência 0.3.1. [Evidências do Objetivo 04](../../evidence/objective-04/REPORT.pt-BR.md)

## 0.3.1 · Revisão de idioma do Objetivo 03

- As entradas mantêm a notação em que foram preenchidas ao mudar o idioma da interface. O aviso no campo indica a notação retida e como limpá-la. Células da matriz e outros campos editáveis mantêm origens independentes.
- Cada gramática trata seus separadores numéricos, de argumentos, matrizes, conjuntos e calendários. O registro de cálculo pode indicar o idioma da expressão original junto aos dados canônicos de reprodução.
- A matriz de sete idiomas compara requisições normalizadas e registros matemáticos das dez ferramentas. [Relatório da revisão](../../evidence/objective-03/revision-01/REPORT.pt-BR.md)

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
