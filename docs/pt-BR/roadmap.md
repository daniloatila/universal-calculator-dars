# Roteiro

[English](../../ROADMAP.md) · [Estado do projeto](project-state.md) · [Missão original](../../PROJECT_SPEC.md)

Os marcos descrevem o escopo planejado. A missão original reúne os requisitos detalhados. Cada objetivo tem seu próprio pacote de evidências e exige aprovação explícita do proprietário antes do início do próximo.

| Objetivo | Versão planejada | Escopo | Foco da aceitação |
| --- | --- | --- | --- |
| 01 · Fundação | 0.1.0 | Núcleo Rust, módulo Standard, desktop Windows, navegador, CLI inicial, design original, internacionalização, segurança e CI | Executar no Windows e no navegador. Verificar operação offline, aritmética exata, erros, paridade entre ambientes e reprodução. Registrar inicialização, tamanho, CPU, memória e latência. |
| 02 · Inteligência operacional | 0.2.0 | Ciclo de vida dos módulos, adaptação de recursos, centro de privacidade, diagnóstico e localização completa | Medir suspensão, cancelamento, recuperação e ganhos sob restrições reais e simuladas. Verificar sete idiomas, RTL, privacidade e comportamento anterior. |
| 03 · Matemática universal | 0.3.0 | Scientific, Álgebra, Cálculo, Álgebra Linear, Geometria, Matemática Discreta, Programador, Conversor, Data e Hora e Calculation Proof | Validar cada módulo com referências independentes, propriedades, extremos e verificações de plataforma e ciclo de vida. |
| 04 · Finanças e negócios | 0.4.0 | Finanças, investimento, empréstimos, tributos, negócios e comparação de cenários | Verificar decimais e arredondamento, fórmulas documentadas, casos financeiros independentes, exportação auditável e privacidade. |
| 05 · Ciência, engenharia e dados | 0.5.0 | Estatística, probabilidade, simulação, otimização, física e engenharia, gráficos e dados | Comparar com referências científicas. Medir responsividade e recursos. Verificar cancelamento, sementes, entradas grandes e regressões. |
| 06 · Produtividade, automação e IA | 0.6.0 | Caderno, fórmulas, automação declarativa, IA opcional e reconhecimento de voz e imagem | Verificar operação local, esquemas, permissões, automações reproduzíveis, cancelamento, compatibilidade de arquivos e matemática validada. |
| 07 · Distribuição e atualizações | 0.9.0 | Pacotes por plataforma, atualizações obrigatórias assinadas, CLI e SDK e demonstração web pública | Verificar instaladores, atualizações assinadas, recuperação de interrupções, rejeição de adulteração e compatibilidade declarada. |
| 08 · Auditoria global e lançamento | 1.0.0 | Auditoria dos 25 módulos, otimização, documentação open source completa e preparação da distribuição final | Verificar metas medidas e as plataformas declaradas, resolver os bloqueios de lançamento e obter aprovação explícita antes da release estável. |

Consulte o [estado do projeto](project-state.md) para saber qual é o objetivo vigente. Relatórios e decisões de aprovação permanecem junto às evidências de cada objetivo.

Os Objetivos 01 e 02 foram aprovados nas versões 0.1.1 e 0.2.2. A primeira auditoria independente do Objetivo 03 solicitou corrigir as transições de idioma. O proprietário aprovou a revisão 0.3.1 com 95/100 após a avaliação independente final e autorizou o Objetivo 04 com branch próprio de revisão. [Aprovação do Objetivo 03](../../evidence/objective-03/approval.json) [Aprovação do Objetivo 01](../../evidence/objective-01/approval.json) · [Aprovação do Objetivo 02](../../evidence/objective-02/approval.json) · [Revisão do Objetivo 03](../../evidence/objective-03/revision-01/REPORT.pt-BR.md)

## Acompanhamento de memória no Windows

Cada objetivo autorizado de 03 a 08 inclui uma verificação comparável de memória no Windows. A meta de menos de 100 MB de RAM incremental no modo básico desktop visível permanece aberta após as medições pareadas da 0.3.1. A auditoria anterior à versão 1.0 investigará o aumento do commit privado observado durante a repetição de ciclos e documentará sua situação antes da release estável. [Medições pareadas da 0.3.1](../../evidence/objective-03/revision-01/benchmarks.json) · [Protocolo de investigação](../../evidence/objective-02/revision-02/memory-debt.pt-BR.md)
