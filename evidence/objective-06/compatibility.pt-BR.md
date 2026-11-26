# Compatibilidade

Os 25 módulos incluem os 22 anteriores, Math Notebook, Formula Studio e Automation Studio. Eles reutilizam os mesmos 22 recursos WASM. A CLI e os contratos numéricos em Rust continuam disponíveis. O tema azul-marinho escuro de fábrica, os sete idiomas, os cinco perfis adaptativos e as regras de notação de origem permanecem aplicáveis.

O Notebook v1 aceita o subconjunto v0 documentado por migração explícita. Fórmulas v1 fixam versões semânticas e incluem a declaração nos recibos. O Automation Studio v1 aceita fluxos JSON validados e provas históricas. Uma divergência na reprodução exige revisão. Abrir os documentos independe de modelo ou conta. O Data Lab v2 conserva as regras anteriores para cache de fórmula, datas e migração de receitas v1. [Caderno](math-notebook/REPORT.pt-BR.md) · [Fórmulas](../../community/formulas/README.pt-BR.md) · [Fluxos](automation-studio/REPORT.pt-BR.md)

O Windows oferece transporte nativo e armazenamento persistente opcional de chaves. O navegador valida e executa as propostas localmente. O branch de revisão não disponibiliza proxy hospedado. A compilação no macOS e os resultados medidos em dispositivo têm registros próprios. A web precisa carregar os recursos estáticos na primeira visita. O Windows traz os recursos no executável. [Plataformas](integrated-audit/ci.json)

O service worker também recupera recursos visitados cujo carregamento começou antes de assumir o controle da página. Um teste atrasa a instalação inicial e confere o cache tanto do módulo já aberto quanto da dependência em trânsito. Outros módulos permanecem adiados.
