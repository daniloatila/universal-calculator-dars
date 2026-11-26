# Biblioteca de fórmulas do DARS

[English](README.md) · [Esquema do arquivo](formula-v1.schema.json)

Quatro definições declarativas acompanham o Formula Studio e funcionam offline. Cada arquivo contém autoria, licença, domínio, parâmetros, unidade de saída e testes. Selecionar um arquivo abre um rascunho editável. **Verificar e salvar** executa os testes no motor Rust local e inclui a versão aprovada na biblioteca da sessão. **Executar fórmula** também verifica rascunhos antes de calcular. Para conservar a fórmula depois de limpar a sessão ou fechar a aplicação, exporte sua definição.

| Definição | Entradas | Resultado padrão |
| --- | --- | --- |
| [Área do retângulo](rectangle-area.json) | Largura e altura em metros | 12 m² |
| [Juros simples](simple-interest.json) | Capital em BRL, taxa por período como fração, períodos inteiros | R$ 1.200 de juros |
| [Média aritmética](arithmetic-mean.json) | Dois racionais exatos | 1/2 |
| [Velocidade média](constant-speed.json) | Distância em metros e tempo em segundos | 5/2 m/s |

## Criação e revisão

1. Duplique um exemplo ou crie uma fórmula. Escolha um identificador estável em minúsculas e uma versão numérica de três partes. O editor JSON inclui parâmetros, limites inclusivos, testes, referências, autoria e licença. A expressão aceita variáveis nomeadas, decimais, parênteses, sinais unários, `+`, `-`, `*`, `/`, `^`, `sqrt` e `cbrt`.
2. Especifique as unidades de entrada e saída. Use `1` para grandezas adimensionais. Nomes de unidades admitem produtos, divisões e potências inteiras, como `m/s^2`. A soma e a subtração exigem dimensões compatíveis. Escalas diferentes e moedas exigem conversão explícita antes do cálculo. Uma base com dimensão exige expoente inteiro literal. As potências das unidades devem ser divisíveis pelo índice de uma raiz.
3. Inclua pelo menos um caso de resultado válido. Cubra os limites do domínio, o zero, unidades incompatíveis ou entradas inválidas quando pertinente. Números são strings decimais ou racionais, inclusive os inteiros. Um parâmetro inteiro exige valor matematicamente inteiro. Para resultado aproximado, informe a tolerância absoluta não negativa. A comparação inclui a incerteza de exibição certificada pelo Rust. Casos de erro usam códigos estáveis.
4. Fixe o ID e a versão de cada dependência, atribua um nome local e ligue seus parâmetros às entradas disponíveis ou aos resultados anteriores. Cadastre primeiro as dependências. Referências ausentes, ciclos, unidades incompatíveis e tentativa de reutilizar resultados intermediários arredondados são recusados. Cada par de ID e versão salvo identifica uma definição imutável na biblioteca.
5. Compartilhe o documento JSON e sua procedência mediante ação explícita e autorizada. Inclua a fonte da equação, as convenções, justificativas de tolerância, licença e casos com verificação independente. Os revisores conferem o documento e executam os testes antes de incluí-lo. Qualquer mudança em definição pública exige uma nova versão.

Um arquivo aberto localmente permanece em rascunho até a ação da pessoa. A biblioteca funciona sem acesso à rede. Referências são texto descritivo. A aplicação verifica tamanho e complexidade além do esquema público. O registro de execução contém as definições fixadas e as provas Rust das dependências. Fórmulas e resultados ficam temporários até a exportação explícita.
