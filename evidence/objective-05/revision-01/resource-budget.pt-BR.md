# Orçamento de recursos do Data Lab

[English](resource-budget.md)

O Data Lab 0.5.1 usa `data-lab-estimated-live-v1` para admitir operações antes de ampliar dados e buffers. A política integra a receita de conjunto de dados da versão 2. O limite é uma estimativa aplicada à sessão do conjunto e à operação atual. Memória residente de processo, commit privado, heap JavaScript e capacidade linear WASM têm escopos de medição distintos.

| Limite | Valor |
| --- | --- |
| `resource_budget_bytes` explícito | Inteiro de 65.536 a 268.435.456 bytes. Padrão de 192 MiB no nativo e na interface WASM de baixo nível. |
| Tetos do DARS Adaptive | Ultraleve 32 MiB, Eficiência 64 MiB, Balanceado 128 MiB, Desempenho 192 MiB, Máximo 256 MiB. Um teto explícito menor integra a receita escolhida. |
| Origem e configuração | 16 MiB de entrada e 16 KiB de configuração UTF-8. A entrada aceita até `min(16 MiB, floor((limite − 32768 − 8 × bytes_configuração)/3))`. Rust usa o maior tamanho entre as configurações recebida e normalizada nessa etapa. |
| Estrutura | 200.000 linhas de dados, 64 colunas, 1.200.000 células, 4.096 bytes UTF-8 por campo de célula, 32 etapas e 12.000.000 visitas a células no pipeline. |
| Planilha | Até 256 entradas ZIP. Partes declaradas de até 24 MiB expandidos cada e 48 MiB no conjunto, profundidade XML até 32 e até 4.096 definições ou índices de formatação. |
| Prévia, prova e exportação | Até 100 linhas e 4 MiB por página, descritor de replay de 4 KiB, resultado de prova de 32 KiB e envelope de 128 KiB, CSV gerado de 32 MiB. O orçamento disponível também se aplica a cada operação. |

A contabilidade inclui três cópias estimadas da origem, oito bytes por byte da configuração normalizada e 32 KiB para estruturas limitadas de controle. As cobranças estruturais portáveis incluem espaço de vetores, sobreposição durante realocação, textos retidos, fórmulas e metadados. A tabela comum usa 80 bytes por linha, 256 bytes por célula e 192 bytes por coluna, com verificações adicionais pelas capacidades retidas dos vetores. Textos não vazios contabilizam três vezes o comprimento UTF-8 mais 32 bytes. Metadados de planilha e referências a texto compartilhado são cobrados à medida que os registros são retidos. A importação ou a transformação pode atingir o orçamento antes dos tetos estruturais.

| Etapa | Alocações verificadas |
| --- | --- |
| Entrada | A CLI lê no máximo o tamanho admitido mais um byte sentinela. A interface ativa verifica `File.size`, a configuração e o perfil antes de ler ou transferir a origem. Rust repete a admissão com a configuração normalizada. |
| Importação | Buffers de decodificação e leitura, dimensões de registros CSV antes do crescimento, espaço para tokens e mapas de linhas JSON, e metadados do ZIP. XLSX valida os tamanhos declarados antes de descompactar. Cada parte reserva duas vezes o conteúdo declarado mais 96 KiB para decodificação. Eventos XML, cópias de texto compartilhado, fórmulas, metadados e células esparsas também passam pelo orçamento. |
| Tipagem e transformação | A tabela vigente e as estruturas em construção coexistem na estimativa. A cobrança inclui células copiadas, campos anexados, textos de reposição, chaves de ordenação e deduplicação, acumuladores de grupo, racionais exatos, mapas de junção e vetores temporários. O consumo retido é recalculado entre etapas. A nova etapa inclui a tabela produzida anteriormente. |
| Análise | Armazenamento temporário de amostras racionais, ordenação e espaço finito de aritmética exata. Os resultados racionais respeitam os limites numéricos e têm sua conversão a texto registrada no orçamento. |
| Prévia, prova e exportação | A serialização percorre as linhas por referência. A escrita verifica a expansão dos buffers, a coexistência entre capacidades antigas e novas e uma cópia de fronteira antes de reservar. Os modos protegido e literal de CSV compartilham o controle. O worker informa ao Rust a reserva das respostas ainda em uso antes da próxima saída, mantendo na estimativa os resultados já produzidos. |

`resource_budget` indica que a configuração ou operação excederia o orçamento estimado. `limit` indica um teto fixo de origem, estrutura, tamanho numérico ou saída. Uma importação ou pipeline recusado não entrega um conjunto parcial. A recusa de prévia ou exportação mantém o conjunto disponível para solicitações menores. Operações admitidas preservam precisão, contagem de linhas e resultados exatos. A prova registra a política. O replay usa a configuração normalizada, confere o hash da origem e reaplica o limite registrado. Um perfil de menor capacidade pode exigir uma nova execução explícita.

`resource_diagnostics()` informa o limite configurado, os bytes de base, a maior estimativa admitida, sua etapa e as estimativas por etapa observada. O diagnóstico pode incluir reservas de uma solicitação recusada mais adiante. Esses números representam o modelo e ficam fora do Calculation Proof. Páginas WASM podem continuar comprometidas durante a vida do worker após a liberação de alocações Rust. Cancelar a execução ou encerrar o módulo libera o worker. Processos auxiliares, fragmentação do alocador e outros custos da execução ficam nas evidências de desempenho e desktop.

Execute `cargo test --locked -p dars-universal --no-default-features --features data-lab budget_tests` na raiz. Os nove testes usam pequenas planilhas e tabelas comuns com tetos reduzidos. Conferem a admissão pelo replay canônico, registros CSV entre aspas, notas compartilhadas repetidas, alocações por preenchimento e junção, agrupamento, transformações textuais cumulativas, espaço temporário em análise exata e ordenação, combinação de respostas do navegador e recuperação com uma operação menor após recusa de saída. [Auditoria de segurança](security.pt-BR.md)
