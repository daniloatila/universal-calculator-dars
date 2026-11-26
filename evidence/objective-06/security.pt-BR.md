# Verificação de segurança

Os novos módulos encaminham cálculos apenas para operações registradas. Há regressões específicas para ciclos, testes de fórmulas que falham, operações desconhecidas, unidades incompatíveis, orçamento esgotado e resultados obsoletos. A reprodução de automação compara etapas, resultados e hashes originais. Um novo cálculo funciona após o cancelamento. [Caderno](math-notebook/tests.json) · [Fórmulas](formula-studio/checks.json) · [Automação](automation-studio/execution.json)

Antes de criar a conexão, o gateway aplica o modo selecionado e a política offline. Limita chamadas por minuto e tamanho da resposta, exige destino permitido e autorização de uso único. O teste do Gerenciador de Credenciais do Windows usa um valor sintético isolado. O provedor controlado reproduz o pedido financeiro ambíguo e a recusa de uma capacidade indisponível. Os adaptadores têm verificação independente da disponibilidade de modelos ou contas do usuário. [Evidências dos provedores](intelligence/README.pt-BR.md) · [Modelo de ameaças](threat-model.pt-BR.md)

A investigação do Windows preservou as configurações do sistema. O Smart App Control se encontrava desativado. O histórico registra bloqueios anteriores. A qualificação de distribuição assinada sob política ativa permanece para o Objetivo 07. [Cronologia](integrated-audit/windows-protection.pt-BR.md)
