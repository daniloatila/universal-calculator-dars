# Inteligência operacional

[English](../en/operations.md) · [Evidências do Objetivo 02](../../evidence/objective-02/REPORT.md)

Abra **Operação** abaixo da calculadora. Escolha **Automático** para deixar o dispositivo selecionar o perfil, ou escolha um perfil pelo nome. Abra **Diagnóstico local** para ver o perfil ativo e o motivo. A escolha manual permanece depois de recarregar. A suspensão da janela e a proteção em situações críticas podem substituí-la temporariamente.

| Perfil | Prazo de worker ocioso | Solicitações ativas e em fila | Entradas no cache de exibição | Intervalo gráfico opcional |
| --- | ---: | ---: | ---: | ---: |
| Ultraleve | 1 s | 1 | 0 | Desativado |
| Eficiência | 4 s | 2 | 4 | 100 ms |
| Equilibrado | 12 s | 4 | 8 | 50 ms |
| Desempenho | 45 s | 6 | 16 | 34 ms |
| Máximo | 120 s | 8 | 32 | 17 ms |

A Standard usa um worker dedicado enquanto há cálculos. As solicitações são executadas em ordem pelo mesmo avaliador Rust em todos os perfis. O worker encerra após o prazo de inatividade e o próximo cálculo inicia outro. Os perfis Ultraleve e Eficiência também reduzem efeitos decorativos. Os limites de cache se aplicam ao texto formatado temporário. Histórico, ações para desfazer e valores exatos retidos pertencem à sessão.

As decisões automáticas usam sinais sustentados, limiares distintos de entrada e saída e um período mínimo no perfil. Reduções comuns exigem oito segundos de evidência e aumentos exigem vinte, sujeitos a quinze segundos de permanência. Pressão crítica de memória ou temperatura e janela oculta podem ativar proteção imediata. O intervalo de amostragem varia de 15 a 60 segundos. O diagnóstico expandido coleta a cada dez segundos enquanto visível. A coleta para quando a janela fica oculta.

## Ciclo de vida dos módulos

O gerenciador importa o módulo selecionado ao ativá-lo. Os estados são não carregado, carregando, ativo, suspendendo, suspenso, encerrado e falha recuperável. Cada geração ativa mantém tarefas canceláveis e recursos que podem ser encerrados. A suspensão retém o estado necessário, cancela as tarefas, libera a posse de workers, gráficos e caches e desmonta a interface. Restaurar cria outra instância com o estado retido. Encerrar descarta esse estado. É possível repetir a ativação após uma falha.

O agendador opcional permite zero, uma, duas, três ou quatro tarefas secundárias, respectivamente, nos cinco perfis. Novas tarefas aguardam o limite de admissão e são canceladas quando o módulo é retirado. O agendador gráfico agrupa pedidos de desenho e cancela os pendentes durante a suspensão.

A Standard é o único módulo matemático em produção. Módulos sintéticos leves e pesados são usados nos testes de navegador para verificar troca, workers, buffers e cadência gráfica. A lista de descritores controla quais módulos podem ser importados. Os descritores de teste ficam fora do bundle do produto.

No Windows, a WebView2 pode informar que o documento está visível quando a janela nativa está minimizada. O processo desktop consulta a janela e envia um valor booleano por código fixo do aplicativo. Nenhum comando de gerenciamento de janelas é exposto ao JavaScript. A versão web usa o sinal de visibilidade do documento. [Eventos de janela do Tauri](https://docs.rs/tauri/latest/x86_64-pc-windows-msvc/tauri/enum.WindowEvent.html)

## Valores, privacidade e leituras

O editor pode mostrar um rótulo como `@1 ≈ 100.014142135623730950488` ao lado da referência de sessão. A exibição facilita a leitura. O Rust continua recebendo o racional ou intervalo certificado que a referência representa.

A **Central de privacidade** exibe os destinos e a retenção dos dados usados pelo aplicativo. Em um ambiente web compatível, ativar o modo offline faz o service worker servir os arquivos do build somente pelo cache. A preferência vale para páginas controladas no mesmo escopo do aplicativo. Um idioma ainda sem cache pode exigir que o usuário volte a permitir downloads estáticos. O desktop usa arquivos incorporados. A primeira abertura web exige os arquivos estáticos e as verificações de atualização do próprio navegador ficam fora da política de requisições do aplicativo.

Limpar a sessão cancela o trabalho e descarta expressões, versões do editor, memória e cálculos concluídos. Redefinir preferências limpa apenas idioma, aparência e perfil do DARS. Os controles de armazenamento do navegador permitem remover os arquivos baixados. Copiar por ação do usuário escreve na área de transferência do sistema. Um provedor nativo do Gerenciador de Credenciais do Windows está disponível para futuros consumidores Rust autorizados. A WebView não recebe operações de credenciais, e o uso atual do aplicativo não armazena segredos de conta. Em outras plataformas, o provedor retorna indisponível. [Armazenamento de credenciais da Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/wincred/ns-wincred-credentialw)

O diagnóstico usa leituras locais. Contagem de processadores lógicos e estimativas de memória vêm do navegador. O atraso de agendamento da thread principal é um sinal de responsividade, separado da latência de interação medida. Uma API gráfica exposta pelo navegador não mede disponibilidade nem velocidade da GPU. O worker pode informar a capacidade alocada da memória linear WebAssembly. A memória JavaScript do navegador e a árvore nativa usam escopos diferentes. Utilização de CPU, temperatura e pressão de memória do sistema ficam indisponíveis quando o runtime não fornece essas leituras.
