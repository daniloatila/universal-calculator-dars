# MISSÃO PERMANENTE — UNIVERSAL CALCULATOR (DARS)

## IDENTIDADE DO PROJETO

- **Nome oficial:** Universal Calculator (DARS)
- **Identidade visual:** DARS
- **Slogan:** Compute anything. Anywhere.
- **Autor:** Danilo Átila
- **GitHub:** https://github.com/daniloatila
- **Repositório pretendido:** daniloatila/universal-calculator-dars
- **Identificador sugerido:** io.github.daniloatila.dars
- **Licença:** Apache 2.0
- **Distribuição:** gratuita, pública e open source.
- **Idioma principal da documentação e do código:** inglês.
- **Idioma secundário da documentação:** português brasileiro.

# MISSÃO PRINCIPAL

Desenvolver uma plataforma universal de computação matemática, financeira, científica e tecnológica que seja extremamente competente, rápida, segura, leve, inteligente, extensível e visualmente sofisticada.

O DARS não deverá ser apenas uma calculadora científica. Deverá constituir um ecossistema completo de ferramentas computacionais, capaz de atender estudantes, profissionais financeiros, engenheiros, cientistas, analistas de dados, desenvolvedores e usuários comuns.

O projeto deverá contribuir genuinamente para a comunidade open source internacional e funcionar como uma demonstração pública de excelência em engenharia de software.

O objetivo é impressionar pela qualidade efetivamente comprovada, não pela quantidade artificial de funcionalidades, tecnologias, arquivos ou linhas de código.

# REGRAS PERMANENTES DE EXECUÇÃO

Estas regras são obrigatórias durante os oito objetivos.

## Autonomia operacional

Você possui autonomia para investigar, planejar, implementar, testar, corrigir, refatorar e otimizar o projeto.

Identifique os recursos disponíveis no ambiente e utilize ferramentas, agentes especializados, documentação oficial, bibliotecas, integrações e processamento paralelo quando isso gerar benefícios reais.

Não interrompa o trabalho para fazer perguntas cujas respostas possam ser descobertas autonomamente.

Quando encontrar um problema:

1. Investigue a causa.
2. Desenvolva uma solução.
3. Implemente a solução.
4. Execute testes.
5. Analise os resultados.
6. Corrija as falhas.
7. Repita o processo.
8. Valide o resultado global.

Não abandone um objetivo por dificuldades técnicas solucionáveis.

Quando uma abordagem falhar, investigue alternativas. Quando uma biblioteca não atender às necessidades, substitua-a por outra tecnicamente adequada.

Entretanto, autonomia não autoriza ignorar segurança, permissões, licenças, integridade dos dados ou limitações reais das plataformas.

Não realize compras, contrate serviços pagos, exponha informações privadas ou modifique projetos externos sem autorização.

Se houver um impedimento que dependa genuinamente de credenciais, dispositivos, permissões ou serviços externos indisponíveis, conclua todas as demais atividades possíveis e documente precisamente o bloqueio. Nunca simule sua resolução.

## Continuidade e governança

Crie e mantenha:

- AGENTS.md
- PROJECT_SPEC.md
- ROADMAP.md
- PROJECT_STATE.md
- CHANGELOG.md
- docs/en/
- docs/pt-BR/
- docs/adr/
- evidence/
- benchmarks/
- tests/

Registre decisões, requisitos, arquitetura, progresso, evidências e procedimentos de recuperação.

Preserve o contexto entre sessões do Codex.

Cada objetivo deverá possuir identificador, estado, critérios de aceitação e relatório próprio.

Utilize os seguintes estados:

- NOT_STARTED
- IN_PROGRESS
- BLOCKED
- FAILED_VALIDATION
- READY_FOR_REVIEW
- APPROVED

Um objetivo somente poderá receber o estado APPROVED após minha aprovação explícita.

Ao concluir um objetivo, interrompa o avanço para o próximo e entregue o relatório de validação.

Após minha autorização, retome o desenvolvimento a partir do estado registrado, sem reconstruir desnecessariamente componentes já aprovados.

## Integridade do ambiente

Identifique o diretório existente do projeto Calculadora e preserve os trabalhos anteriores.

Caso exista um repositório local, investigue seu estado antes de criar outro.

Não interfira em outros projetos, arquivos pessoais, configurações globais ou repositórios privados.

Preserve alterações não relacionadas ao projeto.

Nunca utilize comandos destrutivos indiscriminadamente.

Utilize dependências oficiais, versões verificadas, lockfiles, ambientes reproduzíveis e o princípio do menor privilégio.

## Arquitetura tecnológica

Adote inicialmente:

- Rust para o núcleo matemático e processamento de alto desempenho.
- TypeScript para lógica de apresentação e integrações.
- React para interface.
- Tauri para integração nativa multiplataforma.
- WebAssembly para execução do motor matemático no navegador.
- Vite para compilação e divisão de código.
- Python exclusivamente como ferramenta de desenvolvimento, testes independentes e benchmarks, salvo decisão arquitetural excepcional devidamente justificada.
- GitHub Actions para integração contínua.
- Playwright para testes de interface web.
- SQLite e IndexedDB apenas quando a persistência correspondente for necessária.
- Canvas e WebGL para visualizações avançadas, com alternativas compatíveis.

Prefira uma arquitetura monorepo modular, com núcleo independente da interface e dos serviços externos.

Não utilize tecnologias apenas para aumentar a diversidade de linguagens do repositório.

## Bibliotecas preferenciais

Utilize como primeira escolha, conforme a necessidade de cada módulo:

- num-bigint: inteiros de precisão arbitrária.
- num-rational: números racionais exatos.
- num-complex: números complexos.
- num-traits: abstrações numéricas.
- bigdecimal: representação decimal de precisão configurável.
- astro-float: ponto flutuante de precisão configurável.
- nalgebra: álgebra linear.
- statrs: estatística e probabilidade.
- uom: unidades e análise dimensional.
- nerdamer: computação simbólica em componente isolado e carregado sob demanda.
- serde: serialização.
- wasm-bindgen: integração WebAssembly.
- SymPy, NumPy, SciPy, mpmath e Python Decimal: validações matemáticas independentes.
- proptest: testes baseados em propriedades.
- Criterion: benchmarks Rust.
- cargo-fuzz: fuzzing, quando suportado.

Avalie outras dependências específicas conforme necessário, sem instalá-las antecipadamente.

Antes de aprovar uma biblioteca, verifique:

- Licença e dependências transitivas.
- Segurança.
- Manutenção.
- Compatibilidade.
- Precisão.
- Desempenho.
- Tamanho.
- Estabilidade.
- Integração com Rust, WebAssembly ou a plataforma correspondente.

Não utilize versões experimentais sem justificativa e validação.

Isole bibliotecas substituíveis atrás de interfaces estáveis.

Se houver uma alternativa comprovadamente superior, você poderá substituir a biblioteca recomendada, registrando a decisão em um ADR com resultados comparativos.

Evite dependências pesadas e restritivas quando existirem alternativas equivalentes e permissivas.

## Precisão matemática

A matemática é a autoridade central da aplicação.

Nunca permita que resultados sejam determinados exclusivamente por inteligência artificial generativa.

Utilize:

- Aritmética inteira e racional exata quando aplicável.
- Aritmética decimal apropriada para finanças.
- Precisão configurável em operações científicas.
- Representação simbólica quando possível.
- Arredondamento explícito.
- Tolerâncias numéricas documentadas.
- Estimativas de erro quando aplicáveis.
- Validação de domínios matemáticos.
- Limites seguros de processamento e memória.

Uma operação não suportada deverá retornar uma mensagem clara, jamais um resultado inventado.

Diferencie resultados exatos, aproximados, indefinidos, divergentes, incompatíveis e inconclusivos.

Não reduza silenciosamente a precisão para melhorar o desempenho.

Não utilize conversões implícitas para ponto flutuante quando elas puderem comprometer o resultado.

## Privacidade e segurança

O DARS deverá funcionar segundo os princípios Privacy by Design e Security by Design.

Requisitos:

- Nenhuma telemetria.
- Nenhum rastreamento.
- Nenhuma publicidade.
- Nenhuma conta obrigatória.
- Nenhum servidor próprio obrigatório.
- Nenhuma coleta de cálculos ou arquivos dos usuários.
- Nenhuma chave de API embutida.
- Nenhuma credencial registrada em logs.
- Histórico temporário por padrão.
- Persistência local somente quando autorizada.
- Credenciais protegidas pelos mecanismos seguros disponíveis no sistema operacional.
- Comunicação externa limitada às funcionalidades autorizadas e ao mecanismo transparente de atualizações.
- Inteligência artificial externa desativada por padrão.
- Sincronização externa desativada por padrão.
- Nenhuma execução arbitrária de código originado de expressões matemáticas, arquivos ou respostas de IA.

Não armazene credenciais de API no localStorage ou IndexedDB.

Implemente uma política explícita de comunicações externas, com destinos, finalidades, permissões, retenção e possibilidade de inspeção.

Não permita que o aplicativo se transforme em um mecanismo de acesso irrestrito ao computador.

Realize verificações contínuas de segurança, dependências, segredos, permissões, entradas maliciosas e cadeia de fornecimento.

## Internacionalização

Disponibilize sete idiomas completos:

- English — en
- Português brasileiro — pt-BR
- 简体中文 — zh-CN
- हिन्दी — hi
- Español — es
- العربية — ar
- Français — fr

Detecte o idioma do sistema operacional automaticamente e utilize inglês como fallback.

Permita alteração manual persistente.

Adapte:

- Formatação numérica.
- Separadores decimais.
- Separadores de milhares.
- Datas.
- Moedas.
- Pluralização.
- Mensagens de erro.
- Acessibilidade.
- Escrita da direita para a esquerda no idioma árabe.

Carregue apenas os recursos linguísticos necessários.

Toda documentação oficial deverá possuir versão equivalente em inglês e português brasileiro, mantendo inglês como principal.

## Identidade visual

Desenvolva uma identidade original para o DARS.

A interface deverá ser:

- Premium.
- Moderna.
- Minimalista.
- Profissional.
- Responsiva.
- Acessível.
- Fluida.
- Leve.
- Personalizável.
- Consistente entre plataformas.

Crie temas claro, escuro, OLED e suporte à redução de movimento.

Priorize legibilidade, produtividade e interação eficiente.

A interface deverá adaptar-se a celulares, tablets, notebooks, desktops e navegadores.

Ofereça suporte a teclado, mouse, toque e recursos de acessibilidade conforme a plataforma.

Utilize referências de qualidade visual de produtos profissionais, sem copiar suas identidades.

Evite efeitos gráficos que consumam recursos sem proporcionar benefícios reais.

## Qualidade obrigatória

Em cada objetivo, execute conforme aplicável:

- Testes unitários.
- Testes de integração.
- Testes funcionais.
- Testes ponta a ponta.
- Testes de regressão.
- Testes de propriedades matemáticas.
- Fuzzing.
- Testes de segurança.
- Testes de acessibilidade.
- Testes de internacionalização.
- Benchmarks.
- Testes de estresse.
- Testes de compatibilidade.
- Testes de recuperação de falhas.

Não fabrique evidências.

Não altere testes simplesmente para esconder defeitos.

Não ignore falhas sem justificativa verificável.

Não considere compilação bem-sucedida como prova de funcionamento integral.

Diferencie claramente funcionalidades implementadas, compiladas, testadas em simulador e verificadas em dispositivos reais.

# OBJETIVO 01/08 — CONSTRUIR A FUNDAÇÃO E O PRIMEIRO PRODUTO FUNCIONAL

**Marco planejado: v0.1.0**

## Objetivo

Estabelecer uma fundação técnica, visual e matemática robusta, produzindo uma primeira versão efetivamente utilizável do DARS.

Ao concluir este objetivo, a aplicação deverá existir, possuir identidade própria e executar cálculos básicos corretamente por meio de um núcleo matemático reutilizável.

## Resultados exigidos

- Auditoria do ambiente de desenvolvimento.
- Validação dos identificadores e do nome pretendido nos canais relevantes.
- Arquitetura modular documentada.
- Estrutura monorepo organizada.
- Design system original do DARS.
- Logotipo e ícones originais, leves e escaláveis.
- Interface inicial responsiva.
- Motor matemático independente em Rust.
- Integração funcional entre Rust, TypeScript e WebAssembly.
- Aplicação desktop funcional no Windows.
- Aplicação web funcional.
- Provas iniciais de compilação para outras plataformas, quando disponíveis.
- Estrutura inicial de CLI.
- Infraestrutura de internacionalização.
- Estrutura inicial de segurança.
- Estrutura inicial do gerenciador de módulos.
- Integração contínua.
- Documentação bilíngue.
- Ambiente de testes independentes.

## Primeiro módulo: Standard

Implemente uma calculadora padrão completa, incluindo:

- Operações aritméticas.
- Porcentagens.
- Frações.
- Potências.
- Raízes.
- Parênteses.
- Ordem de precedência.
- Números negativos.
- Memória.
- Histórico temporário.
- Desfazer e refazer.
- Cópia de resultados.
- Entrada por teclado.
- Expressões editáveis.
- Representação exata e aproximada.
- Tratamento correto de erros.

Construa um parser matemático seguro, com gramática explícita, representação estruturada de expressões e limites de processamento.

Defina uma interface estável para futuros módulos.

## Critérios de conclusão

O DARS deverá:

- Abrir e funcionar efetivamente no Windows.
- Funcionar no navegador.
- Executar os cálculos básicos sem internet.
- Retornar exatamente 0,3 para 0,1 + 0,2.
- Representar 1/3 de maneira racional exata.
- Tratar divisão por zero corretamente.
- Produzir resultados matemáticos consistentes entre os ambientes testados.
- Passar pelos testes automatizados previstos.
- Possuir benchmark inicial de memória, CPU, inicialização, tamanho e latência.
- Possuir documentação completa da fundação.
- Possuir instruções reproduzíveis de instalação e execução.

Prepare o repositório público dedicado, sem publicar segredos ou apresentar funcionalidades planejadas como prontas.

Publique somente código e documentação devidamente auditados. Não publique uma release estável para usuários finais nesta etapa.

Entregue o aplicativo funcional e o relatório de evidências.

# OBJETIVO 02/08 — CONSTRUIR A INTELIGÊNCIA OPERACIONAL

**Marco planejado: v0.2.0**

## Objetivo

Transformar o DARS em uma aplicação capaz de administrar inteligentemente seus próprios recursos, adaptar-se ao ambiente e garantir privacidade, modularidade e eficiência operacional.

## Resultados exigidos

### DARS Module Manager

Construa um gerenciador de módulos com ciclo de vida explícito:

- Não carregado.
- Carregando.
- Ativo.
- Suspendendo.
- Suspenso.
- Encerrado.
- Falha recuperável.

Somente um módulo principal deverá permanecer ativo por padrão.

Ao trocar de módulo:

- Preserve o estado necessário.
- Cancele ou finalize tarefas conforme a política definida.
- Suspenda atividades desnecessárias.
- Encerre workers ociosos.
- Libere recursos gráficos.
- Libere caches e memória quando tecnicamente possível.

Utilize lazy loading, code splitting, carregamento dinâmico, feature flags e isolamento de processamento.

Não mantenha dependências pesadas ativas sem necessidade.

### DARS Adaptive

Desenvolva um motor determinístico de auto-otimização.

Detecte, quando disponível e autorizado:

- Sistema operacional.
- Arquitetura.
- Capacidade do processador.
- Memória disponível.
- Pressão de memória.
- Capacidade gráfica.
- Condição de energia.
- Bateria.
- Estado térmico.
- Latência da interface.
- Desempenho observado.
- Estado da janela.
- Recursos consumidos pelo próprio aplicativo.

Implemente perfis:

- Ultra Light.
- Efficiency.
- Balanced.
- Performance.
- Maximum.

Adapte automaticamente:

- Paralelismo.
- Frequência de renderização.
- Complexidade visual.
- Limites de cache.
- Quantidade de workers.
- Frequência de monitoramento.
- Processamento gráfico.
- Tarefas secundárias.

Evite oscilações constantes mediante histerese, limites adaptativos e períodos mínimos entre mudanças.

O monitoramento deverá consumir menos recursos do que os benefícios que proporciona.

Não utilize IA generativa para esse sistema.

Jamais altere silenciosamente precisão, fórmulas ou resultados matemáticos.

### DARS Privacy Center

Implemente uma central de privacidade funcional.

Permita visualizar permissões, recursos ativos, conexões externas autorizadas, política de armazenamento e exclusão de dados.

Implemente modo offline explícito.

Crie os mecanismos seguros de persistência e proteção de credenciais necessários aos futuros módulos.

### Internacionalização completa

Finalize os sete idiomas e valide a adaptação visual, numérica e cultural.

Implemente suporte RTL para árabe.

### Diagnóstico inteligente

Crie um painel opcional de diagnóstico, com dados exclusivamente locais, apresentando informações de recursos, módulo ativo, perfil de desempenho, versão e capacidades disponíveis.

Não mantenha esse painel coletando métricas de alta frequência quando não estiver sendo utilizado.

## Critérios de conclusão

Comprove:

- Carregamento exclusivo dos módulos necessários.
- Suspensão efetiva de recursos inativos.
- Encerramento de tarefas canceladas.
- Recuperação de estado.
- Adaptação a restrições simuladas e reais.
- Benefícios mensuráveis da auto-otimização.
- Ausência de regressões matemáticas.
- Ausência de telemetria.
- Funcionamento offline.
- Funcionamento completo dos sete idiomas.

Não declare que a memória foi liberada apenas porque um componente deixou de aparecer na interface. Apresente medições reais.

# OBJETIVO 03/08 — CONSTRUIR A MATEMÁTICA UNIVERSAL

**Marco planejado: v0.3.0**

## Objetivo

Construir um ecossistema matemático de alta precisão, capaz de atender desde necessidades escolares até operações científicas e algébricas avançadas.

Implemente e valide individualmente os seguintes módulos.

### Scientific

Trigonometria, logaritmos, exponenciais, constantes, números complexos, funções hiperbólicas, notação científica, graus, radianos e precisão configurável.

### Algebra

Simplificação, expansão, fatoração, polinômios, equações, inequações e sistemas de equações dentro do domínio matemático implementado.

### Calculus

Derivadas, integrais definidas e indefinidas, limites, séries, métodos numéricos e aproximações.

### Linear Algebra

Matrizes, vetores, determinantes, inversão, transposição, sistemas lineares, autovalores, autovetores e decomposições.

### Geometry

Áreas, volumes, perímetros, geometria plana, espacial e analítica.

### Discrete Mathematics

Combinatória, conjuntos, lógica, permutações, combinações, números primos e teoria elementar dos números.

### Programmer

Conversão entre bases, operações lógicas, operações bit a bit, deslocamentos, complemento de dois e largura de bits configurável.

### Converter

Unidades de comprimento, massa, volume, temperatura, pressão, energia, potência, velocidade, armazenamento digital e outras categorias relevantes.

Inclua conversão monetária com fonte, data, validade e atualização autorizada. Permita taxas inseridas manualmente e nunca apresente cotações antigas como atuais.

### Date & Time

Intervalos, idade, datas, fusos horários, prazos, dias úteis e calendários configuráveis.

## Recurso transversal: DARS Calculation Proof

Crie um registro matemático estruturado contendo, quando aplicável:

- Expressão original.
- Fórmula.
- Variáveis.
- Unidade.
- Domínio.
- Método empregado.
- Resultado.
- Precisão.
- Arredondamento.
- Premissas.
- Restrições.
- Estimativa de erro.
- Versão do motor.
- Referências.

Permita exportar e reproduzir cálculos sem depender de IA.

Não confunda um registro de execução com uma demonstração matemática formal.

## Critérios de conclusão

- Cada módulo deverá possuir testes próprios.
- Os resultados deverão ser comparados com referências independentes, incluindo SymPy e mpmath.
- Utilize testes baseados em propriedades.
- Verifique entradas inválidas, casos extremos, singularidades e divergências.
- Confirme a compatibilidade com os ambientes disponíveis.
- Confirme a suspensão correta de cada módulo.
- Não utilize resultados fictícios ou funcionalidades decorativas.

Operações matemáticas não suportadas deverão ser explicitamente identificadas.

# OBJETIVO 04/08 — CONSTRUIR O ECOSSISTEMA FINANCEIRO E DE NEGÓCIOS

**Marco planejado: v0.4.0**

## Objetivo

Transformar o DARS em uma plataforma financeira profissional, transparente e verificável, capaz de atender estudantes, investidores, analistas, gestores e profissionais de finanças.

### Financial

Implemente juros simples e compostos, equivalência de taxas, valor presente, valor futuro, anuidades, séries de pagamentos, VPL, TIR, TIR modificada e payback.

### Investment

Implemente aportes, projeções patrimoniais, rentabilidade nominal e real, inflação, renda fixa, comparação de investimentos, reinvestimento e análise de cenários.

Permita taxas, custos, tributos, periodicidades e premissas configuráveis.

### Loans

Implemente financiamentos, empréstimos, amortização SAC, Price, pagamentos extraordinários, quitação antecipada e comparação de custo total.

### Tax

Construa um motor tributário extensível por país, jurisdição e período de vigência.

Priorize o Brasil como primeiro conjunto regional.

Utilize fontes oficiais, referências, datas de vigência e regras versionadas.

Não misture legislações incompatíveis.

Não apresente simulações como pareceres fiscais definitivos.

Quando não houver regra validada para determinada região ou período, informe a indisponibilidade.

### Business

Implemente precificação, markup, margem, ponto de equilíbrio, ROI, ROE, ROA, custos fixos e variáveis, projeções de fluxo de caixa, indicadores financeiros e análise de sensibilidade.

### Scenario Comparator

Permita comparar cenários lado a lado, alterar variáveis interativamente e identificar o impacto de cada premissa.

Implemente tabelas e gráficos gerados a partir de resultados efetivamente calculados.

## Critérios de conclusão

- Aritmética decimal apropriada.
- Convenções de arredondamento explicitadas.
- Fórmulas documentadas.
- Validação independente de resultados.
- Testes com casos financeiros reconhecidos.
- Tratamento de taxas zero e negativas, quando aplicáveis.
- Tratamento de fluxos que possuam múltiplas TIRs ou nenhuma solução.
- Preservação da privacidade dos dados financeiros.
- Exportação de cálculos auditáveis.
- Regressão completa dos objetivos anteriores.

# OBJETIVO 05/08 — CONSTRUIR O ECOSSISTEMA CIENTÍFICO, DE ENGENHARIA E DADOS

**Marco planejado: v0.5.0**

## Objetivo

Ampliar o DARS para computação científica, análise estatística, engenharia, visualização e processamento de dados, preservando desempenho, precisão e modularidade.

### Statistics

Estatística descritiva, medidas de dispersão, correlação, covariância, regressão, testes de hipóteses, intervalos de confiança e análise de amostras.

### Probability

Distribuições discretas e contínuas, probabilidades condicionais, quantis e funções de densidade.

### Simulation

Monte Carlo, simulações probabilísticas, projeções, análise de risco e sensibilidade.

Permita sementes reproduzíveis, identificação do algoritmo aleatório, cancelamento e execução controlada.

### Optimization

Minimização, maximização, busca de raízes, otimização com restrições e métodos numéricos adequados.

Informe convergência, tolerância e critérios de encerramento.

### Physics & Engineering

Fórmulas e constantes físicas, conversões dimensionais, mecânica, cinemática, energia, eletricidade, termodinâmica e ferramentas técnicas selecionadas.

### Graph Lab

Gráficos 2D e 3D interativos, múltiplas funções, zoom, navegação, raízes, interseções, parâmetros dinâmicos, exportação e visualização adaptativa.

Suspenda a renderização quando o módulo estiver inativo.

Utilize alternativas gráficas quando a GPU ou WebGL não estiverem disponíveis.

Trate descontinuidades e domínios inválidos corretamente.

### Data Lab

Importação e análise local de CSV, JSON e XLSX, incluindo:

- Visualização tabular.
- Filtragem.
- Ordenação.
- Tratamento de valores ausentes.
- Resumos estatísticos.
- Transformações.
- Agrupamentos.
- Visualização.
- Exportação.
- Cálculos em massa.

Proteja contra arquivos maliciosos, consumo excessivo de memória, arquivos compactados abusivos e injeção de fórmulas em exportações.

Não envie arquivos a servidores por padrão.

## Critérios de conclusão

- Validação com NumPy, SciPy, SymPy e outras referências independentes.
- Testes de precisão e estabilidade.
- Processamento de conjuntos de dados representativos.
- Interface responsiva durante tarefas longas.
- Possibilidade de cancelamento.
- Simulações reproduzíveis.
- Controle de memória.
- Benchmarks científicos.
- Regressão completa dos módulos anteriores.

# OBJETIVO 06/08 — CONSTRUIR PRODUTIVIDADE, AUTOMAÇÃO E INTELIGÊNCIA ARTIFICIAL

**Marco planejado: v0.6.0**

## Objetivo

Transformar o DARS em uma ferramenta de produtividade capaz de criar, conectar, reutilizar, explicar e automatizar cálculos complexos, preservando a autoridade do motor matemático e a privacidade dos usuários.

### Math Notebook

Implemente documentos interativos contendo textos, fórmulas, variáveis, cálculos, tabelas e gráficos.

Construa um grafo de dependências entre células.

Atualize automaticamente cálculos dependentes.

Detecte referências circulares.

Crie um formato de arquivo aberto, documentado, versionado e portável.

### Formula Studio

Permita criar, testar, salvar, documentar e reutilizar fórmulas personalizadas.

Construa uma biblioteca de fórmulas comunitárias, com referências, testes e versionamento.

Contribuições deverão ser declarativas e validadas. Não execute código comunitário arbitrário sem isolamento seguro.

### Automation Studio

Implemente fluxos automatizados, operações em massa, variáveis, sequências de cálculos, condições, importação e exportação.

Utilize linguagem ou representação declarativa restrita, com limites de memória, tempo e processamento.

Não conceda acesso irrestrito ao terminal ou ao sistema de arquivos.

### DARS Intelligence

Construa um gateway modular de inteligência artificial com três modos:

1. Desativado.
2. IA local.
3. IA externa via API.

Modo desativado deverá ser o padrão.

Implemente integração local com Ollama, LM Studio e endpoints locais compatíveis.

Implemente adaptadores opcionais para APIs como OpenAI, Anthropic, Gemini e provedores compatíveis, utilizando credenciais fornecidas pelo usuário.

Não inclua modelos no instalador.

Não realize download automático de modelos.

Não utilize contas ou credenciais do autor para fornecer serviços aos usuários.

A IA poderá:

- Interpretar linguagem natural.
- Identificar variáveis.
- Sugerir ferramentas matemáticas.
- Explicar fórmulas.
- Auxiliar na construção de cálculos.
- Detectar informações faltantes.
- Explicar resultados verificados.

A IA não poderá:

- Substituir o motor matemático.
- Inventar resultados.
- Acessar credenciais.
- Acessar arquivos sem autorização.
- Executar comandos arbitrários.
- Transmitir dados sem autorização.
- Migrar automaticamente do processamento local para a nuvem.

Utilize respostas estruturadas e validadas por esquemas.

Proteja contra prompt injection.

Mostre quais informações serão transmitidas a provedores externos.

Não prometa ausência de retenção de dados por terceiros sem fundamento verificável.

### Voz e reconhecimento visual

Implemente, quando tecnicamente viável, reconhecimento de expressões matemáticas por imagem, OCR, comandos de voz e leitura de resultados.

Priorize processamento local e componentes leves.

Disponibilize esses recursos sob demanda, sem prejudicar a inicialização ou o consumo do aplicativo básico.

## Critérios de conclusão

- Todos os recursos matemáticos continuam funcionando sem IA.
- Testes com provedores simulados e integrações reais autorizadas.
- Validação de resultados produzidos pelo motor matemático.
- Ausência de transmissões externas não autorizadas.
- Proteção de credenciais.
- Resistência a entradas maliciosas.
- Automações reproduzíveis.
- Compatibilidade do formato de arquivos.
- Cancelamento e isolamento de tarefas.
- Regressão completa dos objetivos anteriores.

# OBJETIVO 07/08 — CONSTRUIR A DISTRIBUIÇÃO UNIVERSAL E AS ATUALIZAÇÕES OBRIGATÓRIAS

**Marco planejado: v0.9.0**

## Objetivo

Preparar o DARS para distribuição segura e profissional, permitindo que usuários de diferentes plataformas instalem, utilizem e atualizem a aplicação com facilidade.

## Plataformas-alvo

- Windows x64 e ARM64.
- Linux x64 e ARM64, conforme suporte.
- macOS Intel e Apple Silicon.
- Android.
- iOS.
- iPadOS.
- Navegadores modernos.
- PWA.
- ChromeOS por meio dos canais compatíveis.
- Tablets e dispositivos híbridos.

Defina versões mínimas de sistemas operacionais com base em testes e dependências.

Não declare compatibilidade universal sem provas.

Diferencie alvos compilados, testados, distribuídos e oficialmente suportados.

### DARS Update Manager

Implemente um sistema inteligente e seguro de atualizações obrigatórias.

Utilize GitHub Releases como principal fonte de distribuição oficial, respeitando os mecanismos próprios das lojas de aplicativos.

Requisitos:

- Identificação automática da versão instalada.
- Identificação de plataforma e arquitetura.
- Verificação da versão estável publicada.
- Canais estável e experimental separados.
- Metadados de atualização autenticados.
- Artefatos assinados.
- Verificação criptográfica antes da instalação.
- Validação da integridade.
- Proteção contra downgrade malicioso.
- Recuperação após falhas.
- Preservação de dados.
- Proteção contra versões incompatíveis.
- Controle de downloads.
- Tentativas com backoff.
- Timeout.
- Tratamento de indisponibilidade do GitHub.
- Nenhum envio de cálculos ou informações pessoais.

Ao confirmar uma versão estável mais recente, compatível e efetivamente disponível para aquela plataforma, preserve o trabalho existente e exija a atualização antes de permitir novas operações.

Permita acesso seguro à recuperação e exportação dos dados existentes.

Não trate commits, branches, betas ou releases incompletas como atualizações obrigatórias.

Não publique a política de obrigatoriedade antes de todos os artefatos correspondentes estarem disponíveis e validados.

Se o aplicativo estiver offline e nenhuma atualização obrigatória tiver sido previamente confirmada, permita funcionamento offline.

Se uma versão tiver sido autenticadamente identificada como bloqueada, preserve o estado de bloqueio e permita os mecanismos seguros de recuperação.

Não bloqueie usuários devido exclusivamente à indisponibilidade temporária do servidor, erro de consulta ou metadados inválidos.

Respeite as regras de atualização e distribuição de Android, iOS e gerenciadores de pacotes.

Para web e PWA, implemente versionamento e atualização consistente de caches, sem misturar recursos incompatíveis de diferentes versões.

Documente que forks, compilações modificadas e usuários permanentemente offline não podem ser obrigados tecnicamente a instalar atualizações oficiais.

### Segurança da distribuição

Utilize:

- Chaves privadas protegidas.
- Assinaturas de atualização.
- Checksums.
- SBOM.
- Proveniência de artefatos.
- Builds reproduzíveis quando viáveis.
- Permissões mínimas nos workflows.
- Dependências e ações de CI verificadas.
- Proteção das etapas de release.
- Processo de revogação e recuperação de chaves.

Não publique chaves privadas.

Diferencie assinatura do updater, assinatura de código do sistema operacional e notarização.

Não desative mecanismos de segurança para facilitar instalações.

### DARS CLI e DARS SDK

Finalize a interface de terminal e as bibliotecas de integração.

Exponha APIs estáveis e documentadas para operações suportadas pelo núcleo.

Permita integrações Rust e JavaScript/TypeScript, incluindo WebAssembly.

Avalie bindings Python quando forem tecnicamente vantajosos.

Documente diferenças de suporte entre SDK, CLI e aplicação gráfica.

### Demonstração pública

Prepare uma versão web hospedada no GitHub Pages ou infraestrutura estática equivalente.

A demonstração deverá executar cálculos localmente, sem servidor matemático obrigatório.

## Critérios de conclusão

- Compilações verificadas para os alvos disponíveis.
- Instaladores funcionais nas plataformas efetivamente testadas.
- Atualização de uma versão anterior para uma posterior.
- Rejeição de artefatos adulterados.
- Rejeição de metadados inválidos.
- Preservação de dados após atualização.
- Recuperação de instalação interrompida.
- Testes de indisponibilidade de rede.
- Testes de canais de distribuição.
- Demonstração web funcional.
- Documentação de instalação.
- Matriz honesta de compatibilidade.
- Auditoria de segurança da distribuição.

Quando assinatura, notarização, dispositivos ou publicação em lojas dependerem de credenciais externas indisponíveis, registre a pendência sem simular sua conclusão.

# OBJETIVO 08/08 — ATINGIR EXCELÊNCIA E REALIZAR O LANÇAMENTO MUNDIAL

**Marco planejado: v1.0.0**

## Objetivo

Auditar, aperfeiçoar, validar e publicar a versão estável do Universal Calculator (DARS), entregando um projeto open source profissional, internacional, sustentável e genuinamente útil.

Não trate este objetivo como simples preparação de documentação.

Realize uma investigação crítica de toda a aplicação, procurando defeitos, inconsistências, riscos, gargalos e oportunidades de melhoria.

### Auditoria matemática global

Revise todas as fórmulas, operações, algoritmos, premissas, tolerâncias, resultados e regras de arredondamento.

Utilize referências independentes.

Investigue erros silenciosos, casos extremos, resultados inconsistentes e diferenças entre plataformas.

### Auditoria de segurança

Revise código, dependências, cadeia de fornecimento, arquivos, persistência, comunicações, IA, importação, automações, credenciais e atualizações.

Realize fuzzing e testes adversariais.

Não aceite vulnerabilidades críticas ou altas aplicáveis sem mitigação adequada.

### Auditoria de desempenho

Investigue gargalos de CPU, RAM, GPU, armazenamento, inicialização, renderização e tempo de resposta.

Compare os resultados com os objetivos anteriores.

Otimize com base em medições.

Teste perfis de dispositivos diferentes.

Não utilize exclusivamente o computador de desenvolvimento como referência.

### Metas iniciais de engenharia

Busque:

- Inicialização desktop em até 1 segundo no hardware de referência.
- Operações básicas abaixo de 10 ms.
- Interações comuns abaixo de 100 ms.
- CPU em repouso próxima de zero.
- Consumo incremental de RAM inferior a 100 MB no modo básico desktop, quando viável.
- Instalador desktop inferior a 30 MB, excluindo runtimes externos.
- Carregamento web inicial comprimido inferior a 2 MB.
- Cobertura superior a 95% no núcleo matemático.
- Um módulo principal ativo por padrão.
- Zero modelos de IA embutidos.
- Zero telemetria.
- Zero regressões conhecidas impeditivas.

Meça e documente todos os indicadores.

Diferencie consumo total da aplicação e consumo incremental, incluindo processos auxiliares e WebViews.

Informe desvios e justificativas técnicas.

Não manipule métricas para atingir metas artificialmente.

### Auditoria de experiência

Revise:

- Design.
- Responsividade.
- Acessibilidade.
- Legibilidade.
- Navegação.
- Atalhos.
- Temas.
- Traduções.
- Experiência mobile.
- Interface em árabe.
- Mensagens de erro.
- Recuperação de falhas.
- Instalação.
- Atualização.
- Desinstalação.

Utilize WCAG 2.2 AA como referência para acessibilidade aplicável.

### Ecossistema open source

Prepare:

- README.md em inglês.
- README.pt-BR.md.
- Documentação técnica completa.
- Manual do usuário bilíngue.
- Documentação de API.
- Documentação das fórmulas.
- Diagramas arquiteturais.
- Guia de contribuição.
- Código de conduta.
- Política de segurança.
- Política de privacidade.
- Roadmap público.
- Changelog.
- Licença Apache 2.0.
- Avisos de terceiros.
- Templates de issues.
- Templates de pull requests.
- Relatórios de testes.
- Benchmarks reproduzíveis.
- Matriz de compatibilidade.
- Instalação e execução.
- Exemplos funcionais.
- Demonstrações reais.
- Procedimentos de manutenção.

Crie uma apresentação pública memorável, profissional e internacional.

Não fabrique estrelas, seguidores, downloads, contribuições, depoimentos ou resultados.

### Publicação final

Prepare a versão estável 1.0.0, com artefatos oficiais, assinaturas, documentação, demonstração e release notes.

Após aprovação final explícita, publique a release estável e habilite sua distribuição pelo sistema de atualização correspondente.

Prepare a integração do projeto ao meu perfil profissional no GitHub, atualizando os READMEs em inglês e português e colocando o DARS como principal destaque, quando os mecanismos autorizados estiverem disponíveis.

Não altere a visibilidade dos meus outros repositórios.

Prepare também uma apresentação profissional do projeto para o LinkedIn, sem publicá-la automaticamente.

## Critérios de conclusão

- Todos os 25 módulos implementados conforme o escopo validado.
- Infraestrutura transversal funcional.
- Segurança auditada.
- Resultados matemáticos verificados.
- Desempenho medido.
- Sete idiomas revisados.
- Documentação bilíngue completa.
- Demonstração pública funcional.
- Distribuição segura nas plataformas declaradas como suportadas.
- Nenhum defeito impeditivo conhecido.
- Relatórios reproduzíveis.
- Aprovação final explícita.

# PROTOCOLO OBRIGATÓRIO DE ENTREGA DE CADA OBJETIVO

Antes de solicitar aprovação, realize uma autoauditoria crítica.

Verifique novamente tudo que foi desenvolvido no objetivo atual e todos os componentes anteriormente aprovados.

Corrija regressões antes de apresentar o resultado.

Crie uma pasta de evidências individual:

- evidence/objective-01/
- evidence/objective-02/
- evidence/objective-03/
- evidence/objective-04/
- evidence/objective-05/
- evidence/objective-06/
- evidence/objective-07/
- evidence/objective-08/

Cada entrega deverá possuir:

- REPORT.md
- acceptance.json
- tests.json
- benchmarks.json
- security.md
- compatibility.md
- changes.md
- reproduction.md

Adicione logs sanitizados, capturas de tela, relatórios técnicos e outras evidências relevantes.

Inclua hashes dos commits e artefatos correspondentes.

Os relatórios deverão ser gerados a partir de resultados reais sempre que possível.

Não publique dados privados, segredos, caminhos pessoais sensíveis ou logs confidenciais.

# RELATÓRIO FINAL DE CADA OBJETIVO

Apresente em português brasileiro:

## 1. Identificação

Objetivo, versão, commit, branch e estado atual.

## 2. Resumo executivo

O que foi efetivamente entregue.

## 3. Implementação

Componentes criados, alterações realizadas e funcionalidades disponíveis.

## 4. Critérios de aceitação

Cada critério individualmente identificado como aprovado, reprovado, parcialmente atendido, não aplicável ou bloqueado, com justificativa e evidência.

## 5. Testes

Quantidade executada, aprovados, reprovados, ignorados, cobertura, comandos utilizados e links para evidências.

## 6. Desempenho

CPU, RAM, inicialização, tamanho, latência, ambiente de medição e comparações.

## 7. Segurança

Verificações executadas, riscos encontrados, mitigações e limitações.

## 8. Compatibilidade

Ambientes efetivamente compilados e testados, diferenciando simulação e dispositivo real.

## 9. Problemas encontrados

Causas, soluções implementadas e pendências.

## 10. Decisões arquiteturais

Mudanças, justificativas e impactos.

## 11. Regressões

Resultados da revisão dos objetivos anteriores.

## 12. Evidências

Links diretos para commits, arquivos, relatórios, artefatos e capturas de tela.

## 13. Reprodução

Comandos necessários para executar a aplicação e repetir as verificações de forma independente.

## 14. Autoavaliação crítica

O que ainda pode ser melhorado, quais riscos permanecem e quais afirmações ainda não puderam ser comprovadas.

## 15. Estado final

Utilize READY_FOR_REVIEW somente quando os critérios obrigatórios estiverem efetivamente satisfeitos.

Caso contrário, utilize BLOCKED ou FAILED_VALIDATION, conforme aplicável.

Nunca declare o objetivo aprovado por conta própria.

# DIRETRIZ FINAL

Você está construindo um produto profissional e não um exercício de programação.

Atue como uma equipe multidisciplinar especializada em:

- Engenharia de software.
- Arquitetura de sistemas.
- Matemática computacional.
- Ciência de dados.
- Finanças.
- Segurança.
- DevOps.
- Design.
- Acessibilidade.
- Qualidade.
- Engenharia de desempenho.
- Inteligência artificial.
- Open source.

Seja autônomo, criterioso, persistente, eficiente e rigoroso.

Questione suas próprias decisões.

Analise o impacto de cada modificação em toda a aplicação.

Não sacrifique arquitetura, segurança, precisão ou manutenção por conveniência imediata.

Não entregue funcionalidades falsas, botões sem implementação, testes artificiais ou promessas não verificadas.

Resolva problemas reais até atingir os critérios estabelecidos.

# ORDEM DE EXECUÇÃO IMEDIATA

1. Localize e audite o ambiente existente.
2. Registre integralmente esta missão nos arquivos permanentes do projeto.
3. Estabeleça o sistema de acompanhamento dos oito objetivos.
4. Inicie exclusivamente o OBJETIVO 01/08.
5. Trabalhe autonomamente até satisfazer seus critérios de aceitação ou identificar um bloqueio externo incontornável.
6. Execute a auditoria correspondente.
7. Entregue o aplicativo funcional, as evidências e o relatório.
8. Aguarde minha aprovação explícita antes de iniciar o OBJETIVO 02/08.

Inicie agora a execução do Objetivo 01/08 — Fundação e primeiro produto funcional.