# Contrato de comparação financeira

[English](comparison-contract.md) · [Matriz de compatibilidade](compatibility-matrix.json)

O motor Rust local recalcula os dois cenários a partir da operação, da entrada canônica e das opções aceitas pelo módulo. Cada indicador tem identidade semântica, unidade, valor de apresentação, precisão e contexto financeiro derivados do cálculo. Selecionar um indicador acrescenta os dois operandos e suas premissas, a decisão, a transformação e os resultados à prova. As receitas canônicas presentes na prova permitem repetir o cálculo.

Uma comparação direta exige indicadores equivalentes e contextos compatíveis. A normalização admite taxas discretas conhecidas em uma base efetiva anual, com a fórmula `(1 + i)^m - 1` para a taxa efetiva periódica e `(1 + j/m)^m - 1` para a taxa nominal anual. A transformação parte da taxa de origem e da frequência informadas, preservando a exatidão da entrada. Para periodicidade desconhecida, a prova explica o contexto necessário. [Capitalização e taxas efetivas](https://openstax.org/books/contemporary-mathematics/pages/6-4-compound-interest)

Horizontes, moedas, convenções de contagem de dias, períodos contábeis, bases de índices e regras tributárias são avaliados conforme a definição de cada indicador. Valores finais de investimentos com prazos diferentes podem aparecer lado a lado, com indicação de contexto. Retorno acumulado, nominal, real, bruto e líquido conservam seus significados. A seleção de custo nominal de Empréstimos é restrita a propostas com principal, prazo, datas e base de liquidação compatíveis.

O motor prioriza o valor canônico. Se o valor disponível vier da apresentação, a prova identifica a precisão limitada pelo arredondamento. A interface exibe `≈0` quando uma diferença não nula arredonda para zero na precisão de tela ou quando a origem aproximada impede demonstrar igualdade exata. De 10% para 12%, a diferença fracionária é 0,02, a variação é de 2 pontos percentuais e a variação relativa é de 20%. A divisão usa o módulo da referência e omite a variação relativa quando a referência é zero.

Se um indicador aproximado declara tolerância de parada, a prova registra as tolerâncias originais e sua soma. O passo exibido é pelo menos igual à soma. A diferença dentro dessa resolução fica indisponível. A variação relativa também considera a sensibilidade ao denominador e pode ficar indisponível mesmo quando há uma diferença exibida. A prova informa a resolução empregada e deixa vazio o limite de erro certificado.

Arquivos de cenário históricos são recalculados com o motor corrente. O arquivo conserva o limite de 64 KiB, a prova portátil o de 128 KiB e cada cálculo individual o de 4 KiB. A entrada comparativa tem orçamento próprio de 18 KiB dentro do envelope de 24 KiB. [Reprodução](reproduction.md)
