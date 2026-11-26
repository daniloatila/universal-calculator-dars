# Modelo de ameaças

A janela desktop, o gateway Rust, o gerenciador de workers e os motores matemáticos possuem limites de confiança distintos. Respostas de modelos, documentos e provas armazenadas chegam como entradas para revisão.

| Risco | Controle observado | Limite residual |
| --- | --- | --- |
| Documento tenta pedir terminal, seleção de arquivos ou comunicação | Linguagem declarativa fechada, validação e catálogo sem essas capacidades | O usuário pode exportar o documento ou autorizar um envio separado. |
| Modelo atribui um resultado a si próprio ou escolhe o destino | Esquema fechado, revisão da proposta e execução explícita no motor | Uma proposta válida pode interpretar mal a intenção. As entradas permanecem visíveis. |
| Reutilização de autorização após mudança de destino ou conteúdo | Autorização nativa com expiração, uso único e controle de geração. Cancelamento encerra a espera. | Um provedor pode continuar processando uma requisição já recebida. |
| Redirecionamento ou indisponibilidade | Loopback numérico, hosts externos fixos, TLS, rejeição de redirecionamentos e erro específico | O proxy do sistema e o servidor compatível escolhido têm políticas próprias. |
| Esgotamento de recursos | Limites de grafo e de chamadas, prazo, um trabalho auxiliar ativo, cobrança acumulada e encerramento do worker | O orçamento estima alocações. A RAM do sistema e o consumo do servidor de IA são medidas distintas. |
| Troca silenciosa de dados ou resultados | Valores exatos em texto, versões, hash dos dados e reprodução explícita | O hash identifica os bytes. A atualidade de um cache de planilha depende da origem. |
| Erro no reconhecimento | OCR local limitado, rejeição de incerteza e confirmação editável | Manuscritos, expressões multilinha e composição densa excedem a gramática implementada. |

[Execução](automation-studio/execution.json) · [Gateway nativo](intelligence/README.pt-BR.md) · [Voz e visão](voice-vision/README.pt-BR.md)
