# Compatibilidade do Data Lab na 0.5.1

[English](compatibility.md)

A versão 2 distingue a gramática do valor nativo do formato da notação usada nos textos. O usuário pode consultar o resultado registrado em uma prova da versão 1 e escolher explicitamente a migração. A migração recalcula segundo as regras da versão 2 e preserva o registro histórico. Uma prova vinculada ao arquivo continua exigindo o hash dos bytes originais. Uma nova importação avulsa segue as regras atuais.

A reprodução v2 vincula o SHA-256 do arquivo à versão semântica, às configurações, às transformações e ao orçamento de recursos efetivo. A CLI aceita `dataset-replay DESCRITOR_JSON` com o descritor contido em `normalized` na prova e calcula o resultado novamente. O navegador compara a execução com o resultado registrado. Versão incompatível e bytes diferentes do original produzem erros explícitos. [Contrato de tipos](data-type-contract.pt-BR.md) · [Observações da versão anterior](before.json)
