import { Mail, Section, Table } from "@/components/LegalDoc";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { noticeChannels } from "@/lib/noticeChannels";

// Política de Privacidade em português (Brasil). Autoritativa junto com a
// versão em inglês; mantenha as duas alinhadas.
export function PrivacyPtBR({ turnstile, solvyai = false, line = false, notices = false, whatsapp = false, address = false, founders = false, founderUploads = false, secretaryInvites = false, closureNotices = false, whatsappAuto = false, referrals = false, clinicalDocs = false, patientDocs = false, selfFields = false, demo = false, appDemo = false, patientChannel = false, pcCover = false, pcAi = false, reminders = false, appReferrer = false, pcNotify = false, whatsappOptout = false }: { demo?: boolean; appDemo?: boolean; patientChannel?: boolean; pcCover?: boolean; pcAi?: boolean; reminders?: boolean; appReferrer?: boolean; pcNotify?: boolean; whatsappOptout?: boolean; clinicalDocs?: boolean; patientDocs?: boolean; selfFields?: boolean; turnstile: boolean; whatsappAuto?: boolean; referrals?: boolean; secretaryInvites?: boolean; closureNotices?: boolean; solvyai?: boolean; line?: boolean; notices?: boolean; whatsapp?: boolean; address?: boolean; founders?: boolean; founderUploads?: boolean }) {
  return (
    <>
      <Section title="1. Visão geral">
        <p>
          O SolvyMed é uma plataforma de gestão de clínicas (aplicativo e site, o &quot;Serviço&quot;) operada por
          Vitor Carvalho, pessoa física, sob o nome comercial BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan
          55000, Tailândia (&quot;BurrowSoft&quot;, &quot;nós&quot;). Esta política explica quais dados pessoais tratamos, por
          que os tratamos e quais são os seus direitos segundo a Lei Geral de Proteção de Dados (LGPD, Lei n.º
          13.709/2018) e, quando aplicável, outras leis de proteção de dados.
        </p>
      </Section>

      <Section title="2. Nosso papel">
        <ul>
          <li>
            Para os <strong>dados de conta</strong> de profissionais, secretárias e pacientes (nome, e-mail, login,
            assinatura), a BurrowSoft é a <strong>controladora</strong>.
          </li>
          <li>
            Para os <strong>prontuários</strong> que o profissional registra (anotações clínicas, receitas,{" "}
            {clinicalDocs && "atestados, declarações médicas, solicitações de exames, "}exames,
            arquivos, consultas{patientDocs && ", e documentos compartilhados com o paciente ou enviados por ele"}), o <strong>profissional ou a clínica é o controlador</strong> e a BurrowSoft é a{" "}
            <strong>operadora</strong>, agindo apenas conforme as instruções dele. Solicitações sobre esses registros
            devem ser feitas primeiro à clínica. Nós ajudaremos a clínica a respondê-las.
          </li>
        </ul>
      </Section>

      <Section title="3. Dados que coletamos">
        <p><strong>3.1 Dados de conta:</strong> nome, e-mail e, se você se cadastrar com e-mail, senha (armazenada somente como hash seguro). Profissionais podem incluir especialidade, registro profissional, nome da clínica, endereço, telefone, um identificador fiscal (CNPJ no Brasil, o número fiscal de 13 dígitos na Tailândia), uma chave Pix ou ID PromptPay e um link de pagamento com cartão. Também guardamos o país e o fuso horário do consultório, escolhidos no cadastro (para &quot;Outro país&quot;, o país detectado pela conexão no cadastro). Quando alguém cria uma conta, registramos qual versão dos Termos de Uso e da Política de Privacidade foi aceita, e quando. Se você escolher entrar com o Google, o Google nos informa seu nome e seu e-mail e que o endereço é verificado; usamos esses dados somente para criar sua conta e permitir que você entre. O Google também pode enviar um link para sua foto de perfil; ele fica guardado no seu registro de acesso, mas nunca o exibimos nem o usamos. Não publicamos nada na sua conta Google nem lemos nada além disso, e você pode remover o acesso do SolvyMed nas configurações da sua conta Google a qualquer momento.</p>
        {referrals && <p>Lista de colegas: um profissional pode manter uma lista privada de colegas, adicionados pelo código público do colega, para enviar ao paciente o link público de um colega. Só esse profissional vê a lista, o colega não é avisado e nenhum dado do paciente é compartilhado. Códigos errados digitados ficam guardados por 1 dia, para evitar tentativas de adivinhação.</p>}
        <p><strong>{selfFields ? "3.2 Dados de pacientes registrados por profissionais, suas secretárias ou pelos próprios pacientes:" : "3.2 Dados de pacientes registrados por profissionais ou suas secretárias:"}</strong> dados de identificação e contato (nome; CPF e RG, só clínicas no Brasil, ou, para clínicas fora do Brasil, um documento de identidade nacional; número de passaporte; data de nascimento; sexo; profissão; telefone; e-mail; telefone de um contato de emergência; tipo de convênio; foto; etiquetas que o profissional adiciona ao paciente; situação de arquivamento (por exemplo, falecido, quando importado){address && "; endereço, CNS (Cartão Nacional de Saúde, só clínicas no Brasil) e observações administrativas"}) e dados de saúde (anotações, diagnósticos, receitas, exames, arquivos, histórico de consultas). Dados de saúde são dados pessoais sensíveis segundo a LGPD.{selfFields && " Um paciente com conta pode completar os dados que o seu profissional solicita (entre os campos listados acima); eles são salvos no cadastro do paciente desse profissional."}</p>
        <p><strong>3.3 Consultas e pagamentos:</strong> datas, horários, status, valores e situação do pagamento. Clínicas na Tailândia podem incluir um ID PromptPay (celular ou ID nacional / fiscal), usado apenas para gerar o QR de pagamento das consultas.</p>
        <p><strong>3.4 Cobrança da assinatura:</strong> feita pela Stripe. Nunca vemos nem armazenamos o número completo do cartão; guardamos apenas uma referência da Stripe e o status da sua assinatura.</p>
        <p><strong>3.5 Dados técnicos e do dispositivo:</strong> tipo de dispositivo, versão do sistema operacional, versão do aplicativo, tokens de notificação push e relatórios técnicos de erro.</p>
        <p>
          <strong>3.6 Uso do site e atribuição de marketing:</strong> somente com o seu consentimento, estatísticas
          anônimas de uso do nosso site e a origem da sua visita: guardamos a campanha que trouxe você (tags UTM), o
          site de origem, a primeira página que você visitou e quando, com a sua conta quando você se cadastra
          {founders
            ? ", ou, se você se inscrever no Programa Fundadores, com a sua inscrição (guardada até 12 meses após a última mudança de status, ou enquanto a sua conta existir, se você for aceito)."
            : "."}
          {appReferrer && " No app Android, com o consentimento opcional do próprio app, salvamos a campanha que levou à instalação (tags UTM do Google Play) com a sua conta ao se cadastrar."}{" "}
          Até você confirmar o e-mail, guardamos esses dados com o seu cadastro pendente (apagados na confirmação ou em no máximo 30 dias).{" "}
          <strong>Dados de pacientes nunca são usados para análise ou marketing.</strong>
        </p>
        {secretaryInvites && <p><strong>3.7 Convites de secretária:</strong> quando um profissional convida uma secretária, guardamos o e-mail informado e enviamos o convite para esse endereço (até um reenvio por hora). O convite expira em 7 dias e o e-mail é apagado 30 dias após o convite expirar ou ser cancelado.</p>}
        {patientDocs && (
          <div>
            <p><strong>3.8 Documentos compartilhados com pacientes:</strong></p>
            <ul>
              <li>Um profissional pode compartilhar documentos com um paciente (por exemplo receitas, atestados, solicitações de exames e termos de consentimento), e um paciente pode enviar documentos ao seu profissional (por exemplo resultados de exames ou fotos). Eles podem conter dados de saúde.</li>
              <li><strong>Assinatura nos documentos:</strong> no aplicativo, o profissional pode desenhar a sua assinatura de próprio punho e adicioná-la aos documentos que emite, como receitas, atestados e o PDF do histórico do paciente (opcional, desativada por padrão). Ela fica guardada no celular dele (e no backup do próprio celular, se ele usar um) e não é enviada para nós separadamente. Ela não é uma assinatura digital.</li>
              <li>Um documento emitido com a assinatura a contém, inclusive quando é impresso ou compartilhado com o paciente; uma cópia compartilhada é mantida como qualquer documento compartilhado (seção 9). Remover ou trocar a assinatura vale para os documentos impressos ou compartilhados a partir de então; uma cópia já compartilhada com o paciente mantém a assinatura com que foi compartilhada.</li>
              <li>Para cada documento guardamos o arquivo, o título, o tipo, o tamanho, quando foi enviado e quem o enviou. Todo arquivo compartilhado com o paciente ou enviado por ele é verificado pelo formato real: apenas PDF, JPG, PNG ou HEIC, até 20 MB cada.</li>
              <li>Somente o profissional do paciente vê os documentos do paciente, inclusive os que o paciente envia. Secretárias(os) e outros profissionais da mesma clínica não veem.</li>
              <li>O paciente vê apenas os documentos que seu profissional compartilha com ele e os documentos que ele enviou, e somente enquanto estiver conectado a esse profissional. Ativar o recurso não compartilha nenhum arquivo já existente: o profissional compartilha cada documento.</li>
              <li>Os documentos ficam no mesmo armazenamento privado, na mesma região, dos demais arquivos de pacientes, e são abertos por links que expiram em 5 minutos.</li>
              <li>Os documentos compartilhados e enviados fazem parte do prontuário e são mantidos pelo mesmo prazo (ver seção 9). O profissional pode ocultar um documento do paciente, ou ocultá-lo por completo informando o motivo, mas não pode excluí-lo, exceto um arquivo que ele mesmo enviou, em até 24 horas após o envio. Excluir uma receita ou um documento nas primeiras 24 horas também remove a cópia compartilhada com o paciente (o registro de acessos mantém as visualizações).</li>
              <li>O paciente pode remover um documento que enviou até o profissional abri-lo pela primeira vez, no máximo 24 horas após o envio. Ele é então excluído, e a remoção fica registrada no registro de acessos. Depois disso, ele é mantido como qualquer outro documento do prontuário.</li>
              <li>Quando o paciente se desconecta ou encerra a conta, o acesso termina na hora, mas os documentos continuam no prontuário do profissional.</li>
              <li>Registramos quando um paciente abre ou baixa um documento compartilhado e quando o profissional abre um documento enviado pelo paciente (aberturas repetidas em menos de um minuto são registradas uma vez). O profissional pode ver esse registro; o paciente pode solicitá-lo.</li>
            </ul>
          </div>
        )}
      </Section>

      <Section title="4. Como usamos os dados">
        <ul>
          <li>Para prestar o Serviço (agenda, prontuários, receitas, pagamentos, acesso de secretárias).</li>
          <li>Para enviar notificações de consultas (notificações push) e e-mails do serviço (como confirmação de conta, redefinição de senha e avisos sobre a conta).</li>
          {reminders && <li>Para enviar, no máximo uma vez, um lembrete para concluir o cadastro ou configurar sua clínica (por e-mail e, se você usa o app, por notificação push). Todo lembrete tem um link para não recebê-los mais.</li>}
          <li>Para cobrar assinaturas e gerenciar contas.</li>
          <li>Para detectar e corrigir erros e manter o Serviço seguro. Os relatórios de erro não contêm dados de pacientes e trazem no máximo um identificador interno do usuário.</li>
          <li>Com o seu consentimento: para medir quais campanhas trazem novos profissionais ao SolvyMed e melhorar o cadastro.</li>
          <li>Para cumprir obrigações legais, incluindo a guarda de prontuários.</li>
        </ul>
        <p>Não vendemos dados pessoais. Não usamos dados de pacientes para publicidade.</p>
      </Section>

      <Section title="5. Prestadores de serviço">
        <p>Todos atuam sob contrato e apenas para operar o Serviço:</p>
        <Table
          head={["Prestador", "Finalidade", "Localização"]}
          rows={[
            ["Supabase", "Banco de dados, autenticação, armazenamento de arquivos", "Brasil (região de São Paulo)"],
            ["Vercel", "Hospedagem do site; processamento no Brasil (São Paulo), conteúdo estático por rede global", "Brasil / global"],
            ["Stripe", "Pagamento de assinaturas", "EUA / global"],
            ["Resend", `E-mails transacionais (confirmações, redefinição de senha${reminders ? ", lembretes únicos sobre a conta" : ""}${pcNotify ? ", o aviso do Canal do Paciente de que a clínica respondeu (uma frase fixa e um link)" : ""})${secretaryInvites ? ", convites enviados a pedido de um profissional" : ""} e alertas à nossa equipe de suporte sobre uma conta (por exemplo, um pedido de exclusão ou uma configuração da clínica que precisa de ação nossa)`, "EUA"],
            ["Expo", "Envio de notificações push", "EUA"],
            ["Sentry", "Monitoramento de erros do aplicativo e do site (sem dados de pacientes)", "EUA"],
            ["PostHog", "Estatísticas de uso do site, somente com o seu consentimento", "UE"],
            ["Google Workspace", "E-mail de suporte", "EUA / global"],
            ["OpenStreetMap", "Converte o endereço da clínica em uma localização no mapa e exibe o mapa quando um profissional ajusta o marcador, a partir dos nossos servidores, do aplicativo ou do navegador (sem dados de pacientes)", "UE / Reino Unido"],
            ...(turnstile
              ? [["Cloudflare Turnstile", "Protege cadastro, login e redefinição de senha contra abuso automatizado, verificando sinais técnicos do seu navegador", "Global"]]
              : []),
            // A verificação contra robôs da demonstração (OK do Vitor): linha própria.
            ...(demo ? [["Cloudflare (Turnstile)", "Verifica que é uma pessoa, e não um robô, que está iniciando a demonstração", "Global"]] : []),
            ...(solvyai
              ? [[pcAi ? "Anthropic (SolvyAI, quando usado)" : "Anthropic (SolvyAI, só profissionais, quando usado)", `Processa as perguntas e pedidos digitados pelo profissional para respondê-los; nas ações que o profissional ativou, o nome e a data de nascimento do paciente e os dados da consulta necessários ao pedido${pcAi ? "; e, quando um profissional ativa a opção de IA do Canal do Paciente, as mensagens que os pacientes dele enviam ali, com os nomes do paciente e do profissional, números de documento, telefones e e-mails mascarados, apenas para sugerir sintomas da própria lista do profissional" : ""}`, "EUA"]]
              : []),
            ...(line
              ? [["LY Corporation (LINE), só clínicas na Tailândia, para pacientes que conectam o LINE", `Envia avisos de consulta (os nomes do médico e da clínica, a data e o horário, e o que aconteceu: confirmada, remarcada, lembrete, cancelada); guardamos o identificador LINE do paciente para entregá-los${pcNotify ? "; e, no Canal do Paciente, o aviso de que a clínica respondeu (uma frase fixa e um link, sem informação de saúde)" : ""}`, "Japão / Tailândia"]]
              : []),
            ...(whatsappAuto
              ? [
                  ["Z-API, clínicas no Brasil que ativam mensagens automáticas de WhatsApp", `Envia as mensagens automáticas de WhatsApp da clínica pela conta Z-API e pelo número de WhatsApp da própria clínica: confirmações, alterações, cancelamentos, lembretes, lembretes de pagamento e uma mensagem de boas-vindas quando ele se conecta${pcNotify ? ", e o aviso do Canal do Paciente de que a clínica respondeu (uma frase fixa e um link)" : ""}, ao paciente (o telefone dele e a mensagem), e pedidos de remarcação à clínica (o nome do paciente e o horário proposto)`, "Brasil"],
                  ["WhatsApp (Meta)", "Entrega essas mensagens de WhatsApp", "EUA / global"],
                ]
              : []),
          ]}
        />
        <p>Podemos divulgar informações quando exigido por lei ou ordem judicial.</p>
      </Section>

      <Section title="6. Transferências internacionais">
        <p>
          Alguns dos prestadores acima tratam dados fora do Brasil. Só usamos prestadores que se comprometem com um
          nível adequado de proteção (por exemplo, cláusulas contratuais padrão), conforme o art. 33 da LGPD e as
          normas da ANPD. Os prontuários são armazenados no Brasil.
          {(solvyai || line) && (
            <>
              {" "}
              {solvyai && line
                ? "Os pedidos ao SolvyAI são processados pela Anthropic nos Estados Unidos, e os avisos LINE pela LY Corporation, com as salvaguardas contratuais exigidas pela LGPD (art. 33) e pela PDPA."
                : solvyai
                  ? "Os pedidos ao SolvyAI são processados pela Anthropic nos Estados Unidos, com as salvaguardas contratuais exigidas pela LGPD (art. 33) e pela PDPA."
                  : "Os avisos LINE são processados pela LY Corporation, com as salvaguardas contratuais exigidas pela LGPD (art. 33) e pela PDPA."}
              {/* A retenção da Anthropic para esta organização (Console do Vitor, 1/10: o padrão de
                  30 dias, sem acordo de retenção zero). Se a retenção zero vier, vira
                  "não é armazenado pela Anthropic" (UX). */}
              {solvyai && " A Anthropic apaga o que é enviado ao SolvyAI em até 30 dias, exceto conteúdo sinalizado por violar suas políticas de uso (guardado por até 2 anos) ou quando a lei exigir guardar por mais tempo. Esses dados não são usados para treinar modelos de IA."}
            </>
          )}
        </p>
      </Section>

      {solvyai && (
        <Section title="6b. SolvyAI (só profissionais)">
          <ul className="list-disc space-y-1 pl-5">
            <li>O SolvyAI é um assistente opcional para profissionais. Ele nunca lê prontuários, receitas, exames ou arquivos{pcAi && ", exceto a mensagem de um paciente no Canal do Paciente, quando o profissional ativa essa opção (veja 6i)"}.</li>
            <li>O que você digita no chat é enviado como você escreveu; não digite dados clínicos. Números de CPF e de identidade tailandesa, telefones e e-mails são mascarados antes do envio.</li>
            <li>As ações (marcar, remarcar, cancelar, bloquear horários, cadastrar pacientes, marcar pagamentos) vêm desativadas; quando o profissional as ativa, os dados do paciente necessários para cada pedido são enviados como descrito na seção 5, e nada é salvo sem a confirmação do profissional.</li>
            <li>Não guardamos as conversas depois da sessão. Um 👍/👎 numa resposta é registrado só como voto, nunca a conversa.</li>
          </ul>
        </Section>
      )}

      {line && (
        <Section title="6c. Avisos pelo LINE (Tailândia)">
          <ul className="list-disc space-y-1 pl-5">
            <li>Pacientes de clínicas na Tailândia podem conectar o LINE para receber avisos de consulta. Eles escolhem conectar e podem parar a qualquer momento.</li>
            <li>O LINE recebe só os nomes do médico e da clínica, a data e o horário da consulta e o que aconteceu com ela (confirmada, remarcada, lembrete, cancelada): nunca informações clínicas.</li>
            <li>Se você bloquear a conta SolvyMed no LINE, paramos de enviar mensagens, mas guardamos a ligação para retomar se você desbloquear. Para removê-la, toque em Desconectar (Configurações → LINE) no app ou exclua sua conta.</li>
            <li>O histórico de envios dos avisos LINE é apagado após 90 dias.</li>
          </ul>
        </Section>
      )}

      {founders && (
        <Section title="6d. Inscrições no Programa Fundadores">
          <p>Programa Fundadores: se você se inscrever, tratamos seu nome, e-mail, telefone, profissão e registro profissional, o sistema de clínica que você usa, o porte do consultório e como nos conheceu, para avaliar a inscrição e falar com você. Inscrições não aceitas são apagadas 12 meses após a última mudança de status; as de fundadores aceitos ficam guardadas enquanto a conta existir (ou são apagadas 12 meses após a aceitação, se nenhuma conta for vinculada).</p>
          <p className="mt-2">Para evitar abuso, guardamos por 2 dias uma forma embaralhada (hash com sal) do seu endereço IP, nunca o endereço em si. Para apagar sua inscrição antes, escreva para support@solvymed.com.</p>
          {founderUploads && <p className="mt-2">Exportações de teste: fundadores aceitos podem enviar em Configurações arquivos de exportação de teste (CSV, Excel ou ZIP) do sistema que usam, para construirmos a importação. Antes de cada envio, o fundador confirma que o arquivo contém só pacientes de teste que ele criou; não verificamos o conteúdo antes de guardá-lo. Os arquivos ficam num local privado que só a equipe SolvyMed acessa, com registro de quem enviou e quando, e são apagados 180 dias após o envio, ou antes: quando a importação daquele sistema fica pronta, quando o fundador deixa de ser aceito ou quando a conta é excluída.</p>}
        </Section>
      )}

      {(notices || whatsapp) && (
        <Section title="6e. Avisos ao paciente">
          <p>Avisos ao paciente: quando a clínica marca, remarca ou cancela uma consulta, o aviso ao paciente{whatsapp && ` (${noticeChannels(notices, "ou")})`} espera cerca de 1 minuto antes de ser enviado, para a clínica poder desfazer um engano. Guardamos um registro de cada aviso (qual consulta, o tipo de aviso, o horário e se foi enviado), sem nomes nem dados clínicos, por 30 dias, e depois o apagamos.</p>
          {whatsappAuto && <p className="mt-2">As mensagens automáticas de WhatsApp saem dos nossos servidores pela Z-API, com a conta Z-API e o número de WhatsApp da própria clínica, e são entregues pelo WhatsApp (Meta).{whatsappOptout && " As mensagens automáticas pelo WhatsApp têm um link para não recebê-las mais."}</p>}
        </Section>
      )}

      <Section title="6f. Minha marca e Document Studio (profissionais)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Em Minha marca e no Document Studio, o profissional pode adicionar nome de exibição, título, especialidade, linha do registro e cor da marca, um logo quadrado, um logo horizontal (para documentos) e uma foto, e escolher a aparência dos seus documentos (modelo, cores, fonte, os contatos e locais de atendimento mostrados no rodapé e os textos de cabeçalho e rodapé). Guardamos o que ele salva, junto com as imagens.</li>
          <li><strong>O logo e a foto ficam públicos depois de salvos:</strong> qualquer pessoa com o link de uma imagem pode abri-la. O logo (ou, sem ele, a foto), o nome, o título, a especialidade e a cor aparecem para qualquer pessoa na página do link de convite público do profissional, e na página de agendamento para os pacientes conectados a ele; os documentos que ele emite mostram o logo, a cor, o nome, a especialidade e a linha do registro. Não envie nada que você não queira que seja público.</li>
          <li>O profissional pode trocar ou remover qualquer imagem a qualquer momento em Minha marca. Uma imagem removida ou trocada deixa de estar acessível em cerca de um minuto.</li>
          <li>Uma foto de perfil adicionada antes de Minha marca continua privada: ela não aparece nessas páginas.</li>
          <li>Cartazes, imagens para redes sociais e papéis timbrados são gerados no próprio aparelho do profissional a partir do seu design: não guardamos esses arquivos nem o texto digitado para eles. Eles nunca incluem dados de pacientes nem assinatura. O QR code do cartaz de agendamento contém o link público de convite do profissional.</li>
          <li>A marca, o design dos documentos e suas imagens são apagados quando o profissional encerra ou exclui a conta.</li>
        </ul>
      </Section>

      <Section title="6g. Notificações">
        <ul>
          <li>Enviamos notificações (push) sobre consultas: pedidos e suas respostas, confirmações, alterações e cancelamentos.{reminders && " No máximo uma vez, também enviamos uma notificação push lembrando de configurar sua clínica."} O profissional também pode enviar um aviso geral aos pacientes conectados a ele (um título e uma mensagem). As notificações chegam ao seu aparelho pela Expo (veja a seção 5).</li>
          <li>Quando nossos servidores enviam uma notificação, nós a guardamos numa fila só para entregá-la: para quem é e quem a gerou, de qual consulta e tipo de aviso se trata, a data e o horário da consulta, os nomes que aparecem nela e o status de entrega (no aviso geral, o título e a mensagem). Cada uma é apagada no máximo 30 dias depois de criada.</li>
          {closureNotices && (
            <li>Quando um profissional encerra a conta, nosso servidor envia aos pacientes dele um aviso de que o consultório foi encerrado ou de que uma consulta foi cancelada. Para isso, guardamos apenas o nome da clínica (que pode ser o próprio nome do profissional) e o país dela, a data e o horário da consulta (no caso de consultas canceladas) e o status de entrega, e apagamos o aviso assim que ele é enviado (no máximo 30 dias).</li>
          )}
          {patientDocs && (
            <li>Quando um profissional compartilha um documento, o paciente recebe uma notificação apenas com o nome do profissional. Quando um paciente envia um documento, o profissional recebe uma apenas com o nome do paciente. A notificação nunca inclui o título nem o conteúdo do documento.</li>
          )}
          {pcNotify && (
            <li>Canal do Paciente: quando um paciente envia uma solicitação, o profissional (ou, nas solicitações administrativas, as secretárias da clínica) recebe uma notificação push &ldquo;Nova mensagem de um paciente&rdquo;. Quando a clínica responde, o paciente recebe uma notificação push dizendo que o profissional respondeu ou vai ligar, e no máximo uma mensagem fora do app: pelo LINE, se ele conectou o LINE; senão, pelo WhatsApp, do número da própria clínica, se a clínica ativou as mensagens automáticas de WhatsApp e o cadastro do paciente tem telefone; senão, por e-mail, para o endereço com que ele entra no SolvyMed. Essa mensagem diz apenas &ldquo;Você recebeu uma resposta no Canal do Paciente.&rdquo; com um link para a página do canal. Os e-mails têm um link para não recebê-los mais; guardamos essa escolha na sua conta, e ela é apagada junto com a conta. As respostas continuam no app e no site. Se um aviso não puder ser enviado em até um dia, ele é descartado; a resposta continua visível no canal. Nenhuma notificação do Canal do Paciente inclui a mensagem, os sintomas ou qualquer outra informação de saúde, e a mensagem fora do app não traz o nome do profissional. Mensagens fora do app não são enviadas entre 21h e 8h no fuso horário da clínica: elas aguardam até as 8h. As notificações para a clínica são só push.</li>
          )}
          {pcNotify && (
            <li>Os avisos do Canal do Paciente aguardam numa fila própria só para serem entregues: qual solicitação, para quem é, o tipo de aviso e o canal, o idioma, quando enviar e se foi enviado (com, no máximo, o código de erro do provedor). Ela não guarda mensagem, nome nem informação de saúde, e cada registro é apagado no máximo 30 dias depois de criado, tenha sido enviado ou não. Depois de enviada, a mensagem fica na conversa do LINE ou do WhatsApp ou na caixa de e-mail do paciente, e o LINE, a Z-API, o WhatsApp (Meta), a Resend e a Expo mantêm os próprios registros de entrega (veja a seção 5).</li>
          )}
          <li>Você pode desativar as notificações a qualquer momento nas configurações do seu aparelho.</li>
        </ul>
      </Section>

      {demo && (
        <Section title="6h. Modo demonstração">
          <ul className="list-disc space-y-1 pl-5">
            <li>Você pode experimentar o SolvyMed sem conta em solvymed.com/demo{appDemo && " ou no app Android"}. Criamos uma sessão temporária e anônima (um identificador aleatório, sem nome, e-mail ou senha) e uma clínica de demonstração com pacientes e consultas fictícios.</li>
            <li>Antes de a demonstração começar, o Cloudflare Turnstile verifica que você é uma pessoa, e não um robô. O Cloudflare recebe seu endereço IP e informações técnicas do seu navegador para essa verificação (veja a seção 5). Guardamos apenas a forma embaralhada do seu endereço IP descrita abaixo.</li>
            <li><strong>Não digite dados reais de pacientes na demonstração.</strong> O que você digitar fica nessa sessão temporária, visível só para você.</li>
            <li>A demonstração não contata ninguém: ela não envia notificações, e-mails nem mensagens de WhatsApp/LINE, não recebe pagamentos, não permite enviar arquivos e não se conecta nem agenda com profissionais ou pacientes reais.</li>
            <li>A SolvyAI funciona na demonstração por até 5 mensagens, com as mesmas regras da seção 6b: o que você digita é enviado à Anthropic para gerar a resposta (veja a seção 5), e o SolvyMed não guarda esse texto. Guardamos só uma contagem anônima do uso da SolvyAI, sem nenhum texto.</li>
            <li>Para evitar abusos, guardamos uma forma embaralhada (hash com sal) do seu endereço IP junto com a sessão de demonstração, nunca o endereço em si.</li>
            <li>A sessão de demonstração e tudo o que estiver nela são apagados em até 24 horas depois do início, ou na hora, quando você sai da demonstração ou cria uma conta. Nada da demonstração é copiado para uma conta real.</li>
            <li>Contamos, sem identificar ninguém, quantas demonstrações são abertas e quais etapas são usadas. São totais por dia, por país e por idioma; nenhuma conta, endereço IP ou identificador do aparelho é guardado junto. Para contar cada demonstração uma única vez, guardamos uma anotação junto da demonstração, que é apagada com ela.</li>
            <li>As estatísticas de uso do site na demonstração seguem a seção 3.6 e o banner de cookies: só com o seu consentimento.</li>
          </ul>
        </Section>
      )}

      {patientChannel && (
        <Section title={'6i. Canal do Paciente ("Fale com o Médico")'}>
          <ul className="list-disc space-y-1 pl-5">
            <li>O paciente conectado a um profissional pode enviar a ele uma dúvida ou solicitação pelo Canal do Paciente, se o profissional ativou o canal.</li>
            <li>A solicitação faz parte do prontuário do paciente com aquele profissional: o que o paciente respondeu e escreveu, o motivo, as orientações automáticas que ele viu, a resposta do profissional ou da secretária e as datas.</li>
            <li>O que o paciente enviou não pode ser alterado depois. Enviar uma nova solicitação substitui a que estava aberta, e a substituída continua no prontuário, marcada como substituída.</li>
            <li>Para ajudar o profissional a ver o que é mais urgente, cada solicitação recebe uma pontuação de prioridade pelas regras que o profissional define (sintomas, respostas, palavras-chave). O paciente nunca vê a pontuação nem a prioridade. Um sintoma que o profissional marcou com aviso de emergência sempre mostra ao paciente o número de emergência local antes do envio.</li>
            <li>As regras de pontuação (os pontos e os limites) ficam nos nossos servidores e só são mostradas ao profissional; nunca são enviadas ao aparelho do paciente.</li>
            <li>O canal não é para emergências, e o formulário avisa: em uma emergência, ligue para o número de emergência local. O formulário também avisa que a solicitação fica no prontuário do paciente.</li>
            <li>As perguntas frequentes e as orientações automáticas podem responder a uma dúvida sem que nada seja enviado. Quando isso acontece, só contamos para o profissional (quantas dúvidas foram resolvidas assim, por dia), sem quem perguntou nem o quê.</li>
            <li>O paciente sempre pode ler as solicitações que enviou e as respostas, mesmo que o profissional desligue o canal, o paciente não esteja mais conectado, o cadastro tenha sido arquivado ou o consultório encerrado; nesses casos não é possível enviar novas. Isso não vale enquanto pausamos o canal.</li>
            {pcCover && <li>O profissional pode adicionar uma imagem de capa à página do canal. Como o logo (veja 6f), a imagem de capa é pública depois de salva.</li>}
            {pcAi && <li>O SolvyAI lê a mensagem do paciente somente se o profissional ativar a opção de IA do canal, e apenas para sugerir sintomas da própria lista do profissional; usa os créditos de IA do profissional. Antes do envio da mensagem, os nomes do paciente e do profissional, números de documento, telefones e e-mails são mascarados; outros nomes escritos na mensagem podem não ser. Ele nunca responde ao paciente. Com a opção ativada, o formulário avisa ao paciente que a clínica usa IA para organizar as mensagens.</li>}
            {pcAi && <li>Os sintomas sugeridos pelo SolvyAI, com as palavras da mensagem em que se basearam, ficam salvos com a solicitação como parte do prontuário e são mantidos pelo mesmo período (veja 9), a menos que o profissional os desfaça, ou remova aquele sintoma da sua lista enquanto a solicitação ainda está aberta, o que os apaga. O prontuário também registra quem confirmou ou desfez as sugestões, e quando. O uso do SolvyAI é contado apenas como totais diários para os créditos de IA do profissional, sem a solicitação nem o paciente.</li>}
          </ul>
        </Section>
      )}

      <Section title="7. Quem vê os dados dentro de uma clínica">
        <ul>
          <li><strong>O profissional</strong> vê todos os dados dos seus próprios pacientes, incluindo os prontuários.</li>
          <li>
            <strong>As secretárias</strong> convidadas pelo profissional (até 3) podem ver e gerenciar os dados de
            identificação e contato dos pacientes (incluindo a foto de perfil do paciente), a agenda e os pagamentos
            das consultas, e podem cadastrar, arquivar e restaurar pacientes. Elas <strong>não</strong> podem ver
            prontuários, receitas, {clinicalDocs && "atestados, declarações, solicitações de exames, "}exames nem arquivos clínicos
            {patientDocs && ", nem documentos compartilhados com os pacientes ou enviados por eles"}.
            {patientChannel && " A exceção são as solicitações do Canal do Paciente: as secretárias veem as administrativas e, se o profissional permitir, podem ler as demais sem respondê-las (veja 6i)."}
          </li>
          <li>
            <strong>Os pacientes</strong> veem as próprias consultas e as informações de agendamento e pagamento da clínica
            {patientDocs && ", além dos documentos que o profissional compartilha com eles e dos documentos que eles enviam (ver 3.8)"}.
          </li>
          {patientChannel && (
            <li>Solicitações do Canal do Paciente: o profissional vê todas. As secretárias veem as solicitações administrativas (as enviadas à secretária) e podem respondê-las; se o profissional permitir, as secretárias também podem ler as demais solicitações, sem respondê-las. A abertura de uma solicitação fica registrada no log de acessos.</li>
          )}
          <li>
            Ninguém de fora da clínica, incluindo outros usuários do SolvyMed, pode ver os dados de uma clínica. A
            equipe do SolvyMed só acessa dados quando necessário para suporte ou obrigações legais.
          </li>
        </ul>
        <p>
          Um registro de acessos guarda quem abriu cada prontuário, receita,{" "}
          {clinicalDocs && "atestado, declaração, solicitação de exames, "}exame ou arquivo de paciente, e quando. O
          profissional responsável pelo paciente pode consultá-lo. Os registros são mantidos pelo mesmo prazo do
          prontuário e guardam o nome de quem acessou, mesmo que essa conta seja excluída depois.
        </p>
      </Section>

      <Section title="8. Segurança">
        <p>
          Criptografia em trânsito (TLS) e em repouso; regras de acesso por linha, para que cada clínica veja apenas os
          próprios dados; secretárias não acessam prontuários; as observações da clínica são privadas e não aparecem
          para o paciente (o paciente vê só a própria mensagem para a clínica); arquivos e fotos de pacientes são privados e só são
          exibidos por links temporários; bloqueio opcional por PIN/biometria no aplicativo. Nenhum sistema é
          totalmente seguro, por isso use uma senha forte e mantenha o seu dispositivo protegido.
        </p>
      </Section>

      <Section title="9. Guarda dos dados">
        <ul>
          <li>
            <strong>Prontuários</strong> (anotações clínicas, receitas,{" "}
            {clinicalDocs && "atestados, declarações, solicitações de exames, "}exames, arquivos,{" "}
            {patientDocs && "documentos compartilhados com o paciente ou enviados por ele, "}histórico de consultas) são
            guardados por no mínimo <strong>20 anos</strong> (para clínicas no Brasil, o prazo que a lei brasileira
            estabelece para prontuários, Lei n.º 13.787/2018), mesmo que a clínica arquive o paciente ou encerre a conta
            no SolvyMed. Para clínicas na Tailândia, vale o mesmo prazo de 20 anos: a clínica é responsável pelos
            prontuários dos seus pacientes, e nós os guardamos em nome da clínica durante esse prazo. Um paciente com
            prontuário pode ser arquivado, mas não excluído.
          </li>
          <li>
            Depois de 24 horas, uma anotação clínica{clinicalDocs ? ", receita, atestado, declaração ou solicitação de exames" : " ou receita"} não
            pode mais ser editada nem excluída. Ela pode ser
            corrigida, e cada correção fica registrada com data, autor e motivo. Arquivos removidos do prontuário depois
            de 24 horas ficam ocultos, não são excluídos, e são guardados pelo prazo legal.
          </li>
          <li>
            <strong>Quando um profissional encerra a conta</strong> (em Configurações ou pedindo a nós): login, dados
            de contato, foto, configurações de pagamento e assinatura são excluídos ou anonimizados imediatamente. O
            nome e o registro do profissional permanecem nos prontuários guardados, porque o prontuário precisa
            identificar o autor. Os prontuários e a lista de pacientes ficam bloqueados: ninguém, nem o próprio
            profissional, pode acessá-los no aplicativo. Eles são apagados definitivamente 20 anos após o encerramento
            da conta. Pacientes de uma clínica encerrada podem pedir uma cópia do prontuário (veja a seção 10). A conta
            de um profissional cujos pacientes não têm prontuário é excluída imediatamente.
          </li>
          <li>
            <strong>Quando um paciente ou uma secretária exclui a conta</strong>: o login, o perfil e os vínculos com
            clínicas são excluídos. Os prontuários que as clínicas mantêm sobre um paciente são guardados como descrito
            acima.
          </li>
          <li>O mesmo e-mail pode ser usado depois para abrir uma nova conta, vazia.</li>
          <li>
            <strong>Outros dados</strong>: dados de conta enquanto a conta estiver ativa. Relatórios de erro: até 90
            dias. Estatísticas de uso: até 12 meses. Registros de cobrança: pelo prazo exigido pela legislação
            tributária (guardados pela Stripe).
          </li>
          {demo && (
            <li>
              <strong>Modo demonstração</strong>: os dados fictícios da demonstração, e o que for digitado nela, não são prontuário e são apagados em até 24 horas (veja a seção 6h).
            </li>
          )}
          {patientChannel && (
            <li>As solicitações e respostas do Canal do Paciente fazem parte do prontuário: são mantidas pelo mesmo período (no mínimo 20 anos) e não podem ser excluídas, inclusive quando o paciente exclui a conta (a solicitação fica com a clínica, sem o vínculo com o login do paciente) ou o profissional encerra a dele (ela é bloqueada com os demais registros).</li>
          )}
        </ul>
      </Section>

      <Section title="10. Seus direitos">
        <p>
          Pela LGPD, você pode: confirmar se tratamos os seus dados; acessá-los; corrigi-los; pedir a anonimização, o
          bloqueio ou a eliminação de dados desnecessários; pedir a portabilidade; saber com quem os compartilhamos;
          revogar o consentimento (por exemplo, para estatísticas de uso, a qualquer momento nas configurações de
          cookies); e reclamar à ANPD (Autoridade Nacional de Proteção de Dados).
        </p>
        <p>
          Pedidos de exclusão não se sobrepõem à guarda legal dos prontuários (veja a seção 9).{" "}
          <strong>Pacientes que desejam uma cópia do prontuário</strong> devem pedi-la à clínica. Se a clínica
          encerrou a conta no SolvyMed, fale conosco em <Mail /> e enviaremos a cópia após confirmar a sua identidade.
        </p>
      </Section>

      <Section title="10b. Tailândia (PDPA)">
        <p>
          Para clínicas na Tailândia e as pessoas cujos dados elas cadastram, também se aplica a lei tailandesa de
          proteção de dados pessoais (Personal Data Protection Act B.E. 2562, PDPA). Tudo nesta política vale como
          está escrito; esta seção acrescenta o que a PDPA pede que informemos.
        </p>
        <ul>
          <li>
            <strong>Papéis:</strong> como na seção 2. Somos o controlador dos dados de conta. A clínica é a
            controladora dos prontuários que cadastra, e nós os tratamos apenas em nome dela.
          </li>
          <li>
            <strong>Bases legais:</strong> dados de conta, para prestar o Serviço conforme o nosso contrato com você;
            segurança e relatórios de erro, o nosso interesse legítimo em manter o Serviço seguro e funcionando;
            estatísticas de uso do site e atribuição de marketing, só com o seu consentimento (seção 11), que você pode
            revogar a qualquer momento; registros que precisam ser guardados (seção 9), para cumprir obrigações de
            guarda.
          </li>
          <li>
            <strong>Dados de saúde</strong> nos prontuários são dados sensíveis. A clínica os trata para o
            atendimento médico por um profissional sujeito ao sigilo, ou com o consentimento explícito do paciente.
            O paciente que cria uma conta no SolvyMed concorda com esta política, e registramos qual versão ele aceitou
            e quando.
          </li>
          <li>
            <strong>Transferências para o exterior:</strong> os prontuários ficam armazenados no Brasil, e alguns dos
            prestadores da seção 5 tratam dados em outros países, com as salvaguardas descritas na seção 6.
          </li>
          <li>
            <strong>Seus direitos pela PDPA:</strong> acesso e cópia dos seus dados; correção; exclusão, destruição ou
            anonimização; portabilidade; oposição; restrição do tratamento; e revogação do consentimento, que não
            afeta o tratamento feito antes dela. Registros que precisam ser guardados (seção 9) não podem ser excluídos
            antes do fim desse prazo. O paciente deve pedir primeiro à clínica, que controla o prontuário; nós ajudamos
            a clínica a responder. Pedidos para nós: <Mail />. Você também pode reclamar ao Escritório do Comitê de
            Proteção de Dados Pessoais da Tailândia (PDPC).
          </li>
          <li>
            <strong>Incidentes:</strong> se um incidente com dados pessoais puder colocar em risco os direitos das
            pessoas, notificamos o PDPC e, quando o risco for alto, as pessoas afetadas, como a PDPA exige.
          </li>
          <li>
            <strong>Menores:</strong> na Tailândia, quem tem menos de 20 anos é menor de idade. Quando o consentimento
            for a base para os dados de um paciente menor, a clínica é responsável por obter o consentimento dos pais
            ou responsável.
          </li>
          <li>
            <strong>Contato:</strong> como na seção 14.
          </li>
        </ul>
      </Section>

      <Section title="11. Cookies e consentimento">
        <p>
          O site usa, sem pedir consentimento, apenas cookies estritamente necessários: a sua sessão de login, o seu
          idioma (<code>NEXT_LOCALE</code>) e a sua escolha sobre cookies (<code>sm_consent</code>, guardada por 12
          meses). Todo o resto só é usado se você aceitar no aviso de cookies:
        </p>
        <ul>
          <li>
            <strong>Análise</strong>: um identificador aleatório no armazenamento do seu navegador
            (<code>sm_anon_id</code>) para estatísticas de uso, sem vínculo com a sua conta.
          </li>
          <li>
            <strong>Marketing</strong>: um cookie (<code>sm_attr</code>, até 90 dias) que lembra a campanha, o site de
            origem e a página da sua primeira visita. Se você se cadastrar, ele é salvo com a sua conta assim que o seu
            e-mail for confirmado.
          </li>
        </ul>
        <p>
          Perguntamos de novo após 12 meses, ou antes, se mudar o que essas categorias abrangem. Você pode mudar a sua
          escolha a qualquer momento em &quot;Configurações de cookies&quot;, no rodapé das nossas páginas, ou aqui:{" "}
          <CookieSettingsButton className="font-semibold text-teal-600 underline" />. Ao revogar uma categoria, o que
          ela guardou no seu navegador é apagado.
        </p>
      </Section>

      <Section title="12. Menores de idade">
        <p>
          Somente maiores de 18 anos podem criar uma conta. As clínicas podem manter prontuários de pacientes menores
          de idade; nesse caso, a clínica é responsável por obter o consentimento dos pais ou responsáveis, conforme
          exigido por lei.
        </p>
      </Section>

      <Section title="13. Alterações">
        <p>Avisaremos sobre alterações relevantes no aplicativo ou por e-mail antes que entrem em vigor.</p>
      </Section>

      <Section title="14. Contato e Encarregado de Dados">
        <p>
          Controlador: Vitor Carvalho, sob o nome comercial BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000,
          Tailândia.
          <br />
          Encarregado pelo tratamento de dados pessoais: Vitor Carvalho, <Mail />.
          <br />
          Suporte: <Mail />
        </p>
      </Section>
    </>
  );
}
