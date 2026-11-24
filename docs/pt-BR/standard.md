# Semântica dos cálculos Standard

[English](../en/standard.md) · [Arquitetura](architecture.md)

## Usar a calculadora

Digite ou cole no campo **Expressão** ou insira símbolos na posição do cursor pelo teclado na tela. Pressione Enter ou = para calcular e Esc para limpar. Durante a edição, Ctrl+Z ou ⌘Z desfaz a ação. Ctrl+Y, Ctrl+Shift+Z ou ⌘Shift+Z refaz a ação. Também é possível operar os controles com Tab e Espaço ou Enter. O editor guarda até 80 alterações para desfazer.

Alterne entre **Decimal** e **Exato**. **Copiar resultado** copia a representação ativa. É possível colá-la no campo de expressão dentro dos limites de entrada do analisador. Um resultado apenas aproximado mantém a indicação de aproximação e desativa a visualização Exato.

| Tecla de memória | Ação |
| --- | --- |
| MS | Calcular a expressão atual e armazenar seu valor |
| M+ | Somar o valor calculado à memória, partindo de zero se ela estiver vazia |
| M− | Subtrair o valor calculado da memória, partindo de zero se ela estiver vazia |
| MR | Recuperar o valor na expressão |
| MC | Limpar a memória |

A memória guarda um racional irredutível ou um intervalo certificado pelo núcleo. M+ e M− combinam esses valores diretamente. Por exemplo, com `100` na memória, digitar `sqrt(2)%` e pressionar M+ soma √2 dividido por 100, dando aproximadamente `100,014142135623730950488`.

MR substitui uma entrada vazia, um cálculo concluído ou a expressão ainda intacta usada pela última operação de memória bem-sucedida. Em uma expressão editada, MR insere o valor entre parênteses na posição do cursor ou substitui a seleção. Quando o resultado é apenas aproximado ou um numerador ou denominador exato supera 256 dígitos, o editor usa uma referência como `@1` ao recuperar o valor ou continuar um cálculo. Cada referência conserva o mesmo valor enquanto estiver em uso no editor, no desfazer/refazer ou no histórico. Limpar a memória preserva essas referências durante a sessão atual.

Selecione um item do **Histórico** para editar ou refazer o cálculo. O histórico mantém os últimos 32 cálculos bem-sucedidos nesta sessão. Se o histórico for limpo durante um cálculo, esse cálculo não aparece na lista recém-limpa. MC cancela uma operação de memória pendente antes de limpar seu valor. **Cancelar cálculo** interrompe a operação atual. Editar, desfazer ou refazer uma edição também cancela a operação da expressão anterior.

Fechar ou recarregar limpa o estado da calculadora. **Configurações** salva as escolhas explícitas de tema e idioma no dispositivo. Em um perfil novo, o tema Escuro em tons de azul-marinho é o padrão. Para seguir o sistema, escolha Sistema. Também é possível escolher Claro ou OLED. Sem idioma salvo, a interface segue a preferência de idioma do navegador e usa inglês como fallback.

O campo de expressão aceita dígitos e separador decimal locais. Em idiomas que usam vírgula decimal, separe argumentos de funções com `;`. Por exemplo, em português brasileiro use `root(-32;5)`. No núcleo e na CLI, a expressão canônica é `root(-32,5)`. Digite números sem separadores de milhares. A separação de milhares no resultado serve apenas para apresentação.

## Expressões

O núcleo usa dígitos ASCII e ponto decimal. São permitidos espaços entre os elementos da expressão. O ponto decimal pode vir antes ou depois dos dígitos. Cada número precisa ter pelo menos um dígito. A interface trata a entrada e a apresentação de acordo com o idioma.

| Forma | Significado | Exemplo |
| --- | --- | --- |
| `+`, `-` ou `−` | Soma, subtração ou sinal prefixado | `-2^2 = -4` |
| `*` ou `×`, `/` ou `÷` | Multiplicação e divisão racional exata | `1/3` retorna exatamente `1/3` |
| `^` | Potência associativa à direita | `2^3^2 = 512` |
| `%` após um termo | Divisão por 100, com a regra contextual abaixo | `50% = 1/2` |
| `sqrt(x)`, `cbrt(x)`, `root(x,n)`, `√x` | Raízes reais | `root(-32,5) = -2` |
| `(x)` | Expressão entre parênteses | `(-2)^2 = 4` |

Da maior à menor precedência vêm a raiz prefixada `√`, a porcentagem, a potência, o sinal prefixado, os operadores multiplicativos e os aditivos. Parênteses e limites de argumentos de função delimitam uma expressão completa. Multiplicação e divisão no mesmo nível associam-se à esquerda, assim como soma e subtração. Escreva a multiplicação de forma explícita. A gramática aceita literais decimais sem notação científica nem variáveis.

Uma porcentagem diretamente à direita de uma soma ou subtração usa o valor avaliado à esquerda como base. Por exemplo, `200 + 10% = 220` e `200 - (10%) = 180`. Sinais unários e parênteses mantêm essa forma percentual. Outros operandos seguem a divisão por 100, de modo que `200 * 10% = 20` e `200 + (10% * 2) = 200.2`. Um valor recuperado ou uma referência como `@1` é um operando numérico. Um `%` acrescentado a ele segue a mesma gramática.

## Exatidão, aproximação e limites

Decimais são racionais exatos. Um inteiro é retornado como texto de inteiro. Outros racionais são representados como numerador e denominador irredutíveis. Por exemplo, `0.1 + 0.2` produz `3/10` exato e `0.3` em decimal. Raízes reais permanecem exatas quando numerador e denominador têm raízes exatas.

A saída decimal é arredondada para até 24 algarismos significativos, com empates resolvidos para o par mais próximo. Cálculos irracionais usam intervalos arredondados para fora com 52 algarismos decimais significativos. Se os dois extremos não certificarem o mesmo arredondamento de saída, o núcleo retorna `precision_limit`. Subexpressões válidas idênticas podem se cancelar exatamente na subtração, exceto quando a regra de porcentagem contextual se aplica. O núcleo usa aritmética racional e limites de raiz inteira em todo esse processo.

A entrada é limitada a 4.096 bytes UTF-8, 256 dígitos por literal, 256 nós de expressão e 48 níveis de análise recursiva. O núcleo limita a magnitude racional a 8.192 bits por numerador ou denominador. O grau da raiz deve ser um inteiro de 2 a 64. Expoentes racionais exatos usam denominador reduzido de no máximo 64 e numerador absoluto de no máximo 10.000. Divisão por zero, raízes pares de valores negativos e `0^0` retornam erros. Operações sem suporte, limites de recursos e falhas de precisão têm códigos distintos.
