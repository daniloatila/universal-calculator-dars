# Universal Calculator (DARS)

*Compute anything. Anywhere.*

[English](README.md)

O DARS é uma plataforma de computação local de Danilo Átila. O branch de revisão 0.5.0 reúne 22 ferramentas no Windows e no navegador. O Rust calcula os resultados, incluindo agregações racionais exatas e simulações reproduzíveis por semente. Cada registro identifica o método, as entradas e os limites aplicáveis. [Objetivo 05](evidence/objective-05/REPORT.pt-BR.md)

Use a busca de ferramentas para encontrar o módulo pelo nome ou pela descrição. Na seção científica, escolha uma operação e carregue o exemplo para conferir o resultado e a prova de cálculo.

- **Ciência, engenharia e dados** — Estatística, Probabilidade, Simulação, Otimização, Física e Engenharia, Laboratório de Gráficos e Laboratório de Dados.
- **Finanças e negócios** — Financeira, Investimentos, Empréstimos, Tributos e Negócios, incluindo o Comparador de Cenários aprovado na 0.4.1.
- **Aritmética e análise** — Standard, Scientific, Álgebra, Cálculo e Álgebra Linear.
- **Ferramentas especializadas** — Geometria, Matemática Discreta, Programador, Conversor e Data e Hora.

A ferramenta ativa carrega seus próprios recursos matemáticos. Os registros de cálculo podem ser consultados e baixados localmente. A Standard funciona offline após a preparação da interface web, e as ferramentas avançadas ficam disponíveis offline quando seus recursos entram no cache. [Auditoria de idioma da 0.3.1](evidence/objective-03/revision-01/REPORT.pt-BR.md) · [Auditoria da 0.3.0](evidence/objective-03/REPORT.pt-BR.md) · [Registros de cálculo](evidence/objective-03/calculation-proof/contract.pt-BR.md)

## Fundação

O proprietário aprovou a revisão 01 do Objetivo 01 (0.1.1). A calculadora Standard usa o mesmo núcleo matemático Rust no aplicativo Windows x64, no navegador e na interface de linha de comando. Ela oferece aritmética, porcentagens, frações, potências e raízes, expressões editáveis, histórico temporário e memória de valores avaliados. O tema Escuro em azul-marinho abre por padrão em perfis novos.

- [Compilar a partir do código-fonte](docs/pt-BR/build.md)
- [Usar a calculadora Padrão](docs/pt-BR/standard.md)
- [Operação, privacidade e diagnóstico](docs/pt-BR/operations.md)
- [Arquitetura e contrato numérico](docs/pt-BR/architecture.md)
- [Projeto de privacidade e segurança](docs/pt-BR/security.md)
- [Roteiro](docs/pt-BR/roadmap.md) e [estado do projeto](docs/pt-BR/project-state.md)
- [Revisão 01 do Objetivo 01](evidence/objective-01/revision-01/REPORT.md) e [linha de base 0.1.0](evidence/objective-01/REPORT.md)
- [Missão original](PROJECT_SPEC.md) e [tradução para o inglês](docs/en/mission.md)

A versão aprovada 0.2.2 do Objetivo 02 recupera a capacidade do agendador quando uma tarefa isolada deixa de responder e serve de referência para a regressão. [Revisão 02 do Objetivo 02](evidence/objective-02/revision-02/REPORT.pt-BR.md) · [Capacidades nativas e desempenho](evidence/objective-02/revision-01/REPORT.pt-BR.md)

O DARS usa a [licença Apache 2.0](LICENSE).
