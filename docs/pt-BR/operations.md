# Inteligência operacional

[English](../en/operations.md) · [Evidências da revisão do Objetivo 02](../../evidence/objective-02/revision-01/REPORT.md)

Abra **Operação** abaixo da calculadora. Escolha **Automático** para deixar o dispositivo selecionar o perfil, ou escolha um perfil pelo nome. Abra **Diagnóstico local** para ver o perfil ativo e o motivo. A escolha manual permanece depois de recarregar. A suspensão da janela e a proteção em situações críticas podem substituí-la temporariamente.

| Perfil | Prazo de worker ocioso | Solicitações ativas e em fila | Entradas no cache de exibição | Intervalo gráfico opcional |
| --- | ---: | ---: | ---: | ---: |
| Ultraleve | 1 s | 1 | 0 | 250 ms, detalhe reduzido |
| Eficiência | 4 s | 2 | 4 | 100 ms |
| Equilibrado | 12 s | 4 | 8 | 50 ms |
| Desempenho | 45 s | 6 | 16 | 34 ms |
| Máximo | 120 s | 8 | 32 | 17 ms |

A Standard usa um worker dedicado enquanto há cálculos. As solicitações são executadas em ordem pelo mesmo avaliador Rust em todos os perfis. O worker encerra após o prazo de inatividade e o próximo cálculo inicia outro. Os perfis Ultraleve e Eficiência também reduzem efeitos decorativos. Os limites de cache se aplicam ao texto formatado temporário. Histórico, ações para desfazer e valores exatos retidos pertencem à sessão.

As decisões automáticas usam sinais sustentados, limiares distintos de entrada e saída e um período mínimo no perfil. Reduções comuns exigem oito segundos de evidência e aumentos exigem vinte, sujeitos a quinze segundos de permanência. Pressão crítica de memória ou temperatura e janela oculta podem ativar proteção imediata. O intervalo de amostragem varia de 15 a 60 segundos. O diagnóstico expandido coleta a cada dez segundos enquanto visível. A coleta para quando a janela fica oculta.

## Ciclo de vida dos módulos

O gerenciador importa o módulo selecionado ao ativá-lo. Os estados são não carregado, carregando, ativo, suspendendo, suspenso, encerrado e falha recuperável. Cada geração ativa mantém tarefas canceláveis e recursos que podem ser encerrados. A suspensão retém o estado necessário, cancela as tarefas, libera a posse de workers, gráficos e caches e desmonta a interface. Restaurar cria outra instância com o estado retido. Encerrar descarta esse estado. É possível repetir a ativação após uma falha.

O agendador classifica solicitações como essenciais, interativas, secundárias, opcionais, de manutenção ou renderização. Uma vaga reservada continua disponível para trabalho prioritário no Ultraleve. As duas filas são limitadas, e solicitações antigas ganham prioridade. Cada tarefa aceita tem prazo. Tarefas opcionais podem retornar adiamento explícito. Suspender cancela tarefas ativas e pendentes. O agendador gráfico agrupa pedidos e oferece desenho simplificado sob demanda no Ultraleve.

Um módulo que usa o agendador genérico fornece a fábrica de um worker dedicado do próprio pacote, uma requisição compatível com a clonagem estruturada e um decodificador síncrono do resultado. O agendador abre um worker para cada tarefa admitida e controla sua duração. Ao completar, expirar, cancelar ou encerrar o módulo, invalida a tarefa e termina o worker. A vaga fica disponível para a próxima operação aceita. Se o encerramento falhar, o agendador fecha as admissões e continua contabilizando a vaga ocupada. Resultados descartados ficam isolados e as tarefas só voltam a rodar mediante nova solicitação. O Standard continua com seu supervisor do worker Rust/WASM. [Evidências da recuperação](../../evidence/objective-02/revision-02/REPORT.pt-BR.md)

A Standard é o único módulo matemático em produção. Módulos sintéticos leves e pesados são usados nos testes de navegador para verificar troca, workers, buffers e cadência gráfica. A lista de descritores controla quais módulos podem ser importados. Os descritores de teste ficam fora do bundle do produto.

No Windows, a WebView2 pode informar que o documento está visível quando a janela nativa está minimizada. O processo desktop consulta a janela e envia um valor booleano por código fixo do aplicativo. Nenhum comando de gerenciamento de janelas é exposto ao JavaScript. A versão web usa o sinal de visibilidade do documento. [Eventos de janela do Tauri](https://docs.rs/tauri/latest/x86_64-pc-windows-msvc/tauri/enum.WindowEvent.html)

Quando o ambiente oferece `ICoreWebView2_19`, o aplicativo solicita ao WebView2 a meta de memória `LOW` durante a minimização nativa e repõe `NORMAL` ao restaurar a janela. O WebView2 decide como aplicar a meta. O módulo libera os próprios recursos pelo seu ciclo de vida. Nas interfaces anteriores do ambiente, a meta fica indisponível. [Meta de memória do WebView2](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19?view=webview2-1.0.2849.39)

## Valores, privacidade e leituras

O editor pode mostrar um rótulo como `@1 ≈ 100.014142135623730950488` ao lado da referência de sessão. A exibição facilita a leitura. O Rust continua recebendo o racional ou intervalo certificado que a referência representa.

A **Central de privacidade** exibe os destinos e a retenção dos dados usados pelo aplicativo. Em um ambiente web compatível, ativar o modo offline faz o service worker servir os arquivos do build somente pelo cache. A preferência vale para páginas controladas no mesmo escopo do aplicativo. Um idioma ainda sem cache pode exigir que o usuário volte a permitir downloads estáticos. O desktop usa arquivos incorporados. A primeira abertura web exige os arquivos estáticos e as verificações de atualização do próprio navegador ficam fora da política de requisições do aplicativo.

Limpar a sessão cancela o trabalho e descarta expressões, versões do editor, memória e cálculos concluídos. Redefinir preferências limpa apenas idioma, aparência e perfil do DARS. Os controles de armazenamento do navegador permitem remover os arquivos baixados. Copiar por ação do usuário escreve na área de transferência do sistema. Um provedor nativo do Gerenciador de Credenciais do Windows está disponível para futuros consumidores Rust autorizados. A WebView não recebe operações de credenciais, e o uso atual do aplicativo não armazena segredos de conta. Em outras plataformas, o provedor retorna indisponível. [Armazenamento de credenciais da Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)

O diagnóstico usa leituras locais. Contagem de processadores lógicos e estimativas de memória vêm do navegador. O atraso de agendamento da thread principal é um sinal de responsividade, separado da latência de interação medida. Uma API gráfica exposta pelo navegador não mede disponibilidade nem velocidade da GPU. O worker pode informar a capacidade alocada da memória linear WebAssembly. A memória JavaScript do navegador e a árvore nativa usam escopos diferentes. No Windows, o provedor mede CPU do sistema e do processo desktop, memória física total e disponível, sinal de memória baixa do sistema, arquitetura, processadores lógicos, memória do processo desktop, energia e bateria quando presente. As leituras são locais e reutilizadas por pelo menos dois segundos. O custo da amostra nativa e o ida e volta da WebView são medidos separadamente. Os contadores do processo desktop excluem os auxiliares da WebView2. A leitura térmica fica indisponível no provedor Windows validado. Criar um contexto gráfico comprova o acesso à API, com o adaptador específico fora da coleta.

Cada módulo registrado define apresentação, interface, estado e recursos opcionais. A carga do código e a ativação compartilham um prazo de quinze segundos. Selecionar outro módulo cancela o trabalho substituído. Limpar a sessão descarta os estados dos módulos registrados, incluindo os suspensos. Em macOS, Linux, Android e iOS, o contrato aceita apenas as leituras que o ambiente consegue fornecer. Os sensores nativos foram validados no Windows. [Relatório da revisão](../../evidence/objective-02/revision-01/REPORT.md)
