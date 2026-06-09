# SolvyMed — Resumo de Funcionalidades

Aplicativo de gestão para profissionais de saúde. Organiza agenda, pacientes, pagamentos e configurações em um só lugar.

---

## Tela de Login

- Campo de e-mail e senha para entrar na conta
- Botão para mostrar ou esconder a senha
- Mensagem de erro caso os dados estejam incorretos

---

## Apresentação inicial (Onboarding)

Exibida apenas na primeira vez que o app é aberto.

- 4 telas explicando o que o app oferece: agenda inteligente, prontuários, pagamentos e organização geral
- Botão para pular e ir direto para o login
- Botão "Começar" na última tela

---

## 1. Início

Visão geral do dia para o profissional.

- Saudação com o nome do profissional (bom dia / boa tarde / boa noite)
- Data atual
- 4 indicadores rápidos:
  - Total de consultas do dia
  - Consultas já realizadas
  - Consultas sem pagamento
  - Valor total a receber
- Atalhos para as seções de Agenda, Pacientes, Pagamentos e Configurações
- Lista das próximas consultas do dia com horário, nome do paciente, tipo de atendimento e status
- Lista dos últimos pacientes atendidos (acesso rápido)
- Aviso de pagamentos pendentes com valor total

---

## 2. Agenda

Gerenciamento completo da agenda do profissional.

### Visualização
- Alternar entre vista de **dia** ou **semana**
- Navegar entre dias ou semanas com setas
- Botão "Hoje" para voltar ao dia atual
- Grade de horários das 7h às 21h com as consultas posicionadas no horário correto
- Cores diferentes por status da consulta (agendada, confirmada, realizada, cancelada, bloqueada)
- Horários fora do expediente ficam levemente sombreados

### Ações
- **Nova consulta**: selecionar paciente, data, horário, duração, tipo (presencial ou online), tipo de consulta, pagamento, valor, anotações e recorrência (semanal, quinzenal, mensal)
- **Bloquear horário**: marcar um período como indisponível com motivo opcional (almoço, reunião, pessoal, etc.)
- **Clicar numa consulta** para ver os detalhes e:
  - Enviar confirmação pelo WhatsApp
  - Abrir conversa no WhatsApp
  - Ligar para o paciente
  - Compartilhar link de pagamento
  - Gerar recibo em PDF
  - Definir ou marcar pagamento como recebido
  - Alterar o status (agendado → confirmado → realizado → cancelado)
  - Editar ou excluir a consulta
- **Filtrar** consultas por status e por tipo (presencial / online)
- **Buscar** consulta por nome de paciente

---

## 3. Pacientes

Cadastro e prontuário completo de cada paciente.

### Lista de pacientes
- Busca por nome
- Filtro por sexo (masculino, feminino, outro)
- Cada paciente mostra nome, idade, telefone e ícone de WhatsApp
- Menu rápido para abrir perfil ou excluir paciente
- Carregamento de mais pacientes ao rolar a lista
- Botão para cadastrar novo paciente

### Cadastro de novo paciente
- Nome completo (obrigatório)
- CPF, sexo, data de nascimento, profissão
- E-mail, telefone com seleção de código de país

### Perfil do paciente (5 abas)

**Dados do paciente**
- Foto do paciente (com opção de adicionar)
- Linha do tempo das últimas consultas
- Dados pessoais (nome, CPF, sexo, nascimento, idade calculada automaticamente, profissão)
- Contato (e-mail, telefone)
- Tags personalizadas para classificar o paciente
- Botão para exportar o histórico médico em PDF

**Prontuários**
- Lista de todos os prontuários com data e tipo
- Tipos disponíveis: texto livre, SOAP, retorno, relatório cirúrgico, encaminhamento
- Criação de novos prontuários com conteúdo em texto

**Receituários**
- Lista de todas as receitas com data e medicamentos
- Criação de receitas com nome do medicamento, posologia, frequência e duração
- Compartilhar receita como PDF

**Exames**
- Área reservada para exames (em desenvolvimento)

**Arquivos**
- Upload de documentos e imagens do paciente
- Visualização e compartilhamento de arquivos
- Exclusão de arquivos

**Consultas**
- Histórico de todas as consultas do paciente com data, horário, tipo e valor

---

## 4. Pagamentos

Controle financeiro das consultas.

- Filtro por período: esta semana, este mês, mês passado, todo o período
- **Conta de pagamento**: ativar ou desativar geração de links de pagamento
- **Limite de parcelas**: ajustar de 1 a 24 parcelas para cobranças parceladas
- **Resumo financeiro**: valor total a receber e valor já recebido no período selecionado
- **Lista de pendências**: consultas ainda não pagas, com botão para marcar como pago
- **Lista de recebidos**: consultas já pagas, com visual diferenciado
- **Relatório mensal**: visão mês a mês com número de consultas, valor recebido e valor pendente

---

## 5. Configurações

Personalização completa do app e do perfil profissional.

### Perfil
- **Meu Perfil**: nome, especialidade, nome da clínica
- **Minha Clínica**: nome, CNPJ, telefone, endereço, cidade, estado, site
- **Horário de Atendimento**: definir dias e horários de funcionamento por dia da semana

### Procedimentos
- **Meus Procedimentos**: cadastrar procedimentos com nome, duração, valor e tipo de pagamento — aparecem como opções rápidas ao criar consultas
- **Modelos de Documentos**: personalizar o modelo de receita, prontuário e recibo

### Agendamento
- **Duração padrão**: quanto tempo dura uma consulta por padrão (30, 45 ou 60 minutos)
- **Tipo padrão**: se as novas consultas começam como presencial ou online

### Notificações
- **Lembretes de consulta**: ativar ou desativar avisos antes das consultas
- **Antecedência do lembrete**: quanto antes avisar (15 minutos, 1 hora, 2 horas ou 24 horas)
- **Resumo diário**: receber uma notificação de manhã com as consultas do dia

### Aparência
- **Tema do app**: escolher entre 4 temas visuais com prévia das cores
  - Claro (azul e branco)
  - Escuro (tons escuros com azul)
  - Quente (tons âmbar e creme)
  - Oceano (tons de verde-azulado)
- **Idioma**: escolher entre 6 idiomas — Português, Inglês, Francês, Alemão, Italiano, Espanhol

### Privacidade e Segurança
- **Bloqueio biométrico**: exigir digital ou reconhecimento facial ao abrir o app
- **Bloqueio automático**: travar o app após ficar em segundo plano por um tempo definido (5, 15 ou 30 minutos, ou nunca)

### Financeiro
- **Tipo de pagamento padrão**: se novas consultas começam como "Particular" ou "Plano de saúde"
- **Rodapé do recibo**: texto personalizado que aparece no rodapé dos recibos gerados

### Dados e Informações
- **Exportar lista de pacientes**: gerar um arquivo CSV com todos os pacientes para usar em planilhas
- **Versão do app**: exibe a versão atual instalada

### Sair
- Encerra a sessão do profissional no app

---

## Funcionamento geral do app

- **6 idiomas**: todo o conteúdo do app muda conforme o idioma escolhido
- **4 temas**: as cores do app mudam completamente ao trocar o tema
- **Segurança biométrica**: o app pode ser travado e só aberto com digital ou rosto
- **Notificações push**: lembretes de consulta e resumo diário enviados automaticamente
- **Geração de PDF**: receitas, prontuários e recibos podem ser gerados e compartilhados
- **Recorrência de consultas**: ao criar uma consulta, é possível repetir automaticamente toda semana, quinzena ou mês
- **Acesso offline parcial**: algumas informações ficam carregadas mesmo sem internet
