# Regressão e rastreabilidade

[English](regression.md)

O registro da 0.4.0 identifica as 602 verificações herdadas. A revisão preserva esse mapeamento e executa as suítes correspondentes, incluindo os oráculos avançados, a paridade entre CLI e WASM e as transições de idioma. As contagens descrevem seus respectivos escopos e podem abranger o mesmo cálculo. [Base da 0.4.0](../tests.json)

O oráculo novo calcula taxas efetivas com aritmética racional e calcula o custo anual independente com `Decimal`. O teste de paridade compara o envelope completo da prova entre CLI e WASM. O navegador testa importação histórica, troca de idioma, suspensão, recuperação e contagem de Workers. O Rust reexecuta receitas que exercitam as identidades, unidades e chaves de contexto da matriz. [Matriz de compatibilidade](compatibility-matrix.json)
