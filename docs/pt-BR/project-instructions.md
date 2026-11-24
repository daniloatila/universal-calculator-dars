# Instruções do projeto DARS

English · [Project instructions](../../AGENTS.md)

- Trate o [PROJECT_SPEC.md](../../PROJECT_SPEC.md) como a missão original autorizada pelo proprietário. Consulte o [ROADMAP.md](../../ROADMAP.md) para os limites dos marcos e o [PROJECT_STATE.md](../../PROJECT_STATE.md) para o estado e as evidências atuais.
- Trabalhe apenas no objetivo atual. Conclua sua auditoria, registre os resultados e aguarde a aprovação. Somente a aprovação explícita do proprietário permite alterar o estado para `APPROVED` e iniciar o objetivo seguinte.
- Mantenha a pasta existente `github-portfolio/` e o estado local do Codex fora do controle de versão e dos artefatos públicos. Restrinja correções e ferramentas a este projeto. Caminhos pessoais encontrados em logs locais devem ser removidos das evidências publicadas.
- Use inglês nos identificadores, código, commits e documentação principal. Mantenha as versões correspondentes em português brasileiro. Preserve integralmente a missão original em português.
- Use Rust como autoridade para resultados matemáticos. Os avaliadores devem analisar e limitar entradas, preservar valores exatos quando possível, indicar aproximações e produzir erros estáveis. Nunca trate expressões como código do sistema, peça a um serviço de IA para calcular um resultado ou reduza silenciosamente a precisão.
- Mantenha temporário o estado da calculadora por padrão. Persista apenas preferências explícitas. Registre destinos, finalidades e permissões de comunicação antes de habilitar integrações. Minimize os recursos permitidos em execução e as permissões de CI.
- Verifique dependências e lockfiles. Separe código-fonte, arquivos gerados e evidências sanitizadas. Use resultados de dispositivos, navegadores e plataformas efetivamente testados para afirmar execução e diferencie geração de artefato de execução.
- Associe cada critério a um resultado reproduzível em `evidence/objective-NN/`. Registre falhas, plataformas indisponíveis e limites de cobertura. Use `READY_FOR_REVIEW` somente quando os critérios exigidos tiverem evidências. A publicação de código ou de um commit não aprova um objetivo.
- Publique somente o conteúdo auditado do DARS e os artefatos solicitados pelo objetivo em revisão. Respeite a autorização específica da missão para release estável, atualização do perfil e comunicações externas.
