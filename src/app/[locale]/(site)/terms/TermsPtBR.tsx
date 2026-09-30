import { Link } from "@/i18n/navigation";
import { Mail, Section } from "@/components/LegalDoc";

// Termos de Uso em português (Brasil). Autoritativos junto com a versão em
// inglês; mantenha as duas alinhadas.
export function TermsPtBR() {
  return (
    <>
      <Section title="1. Aceitação dos Termos">
        <p>
          Ao criar uma conta ou usar o SolvyMed (o &quot;Serviço&quot;), operado por Vitor Carvalho sob o nome comercial
          BurrowSoft (&quot;BurrowSoft&quot;, &quot;nós&quot;), você concorda com estes Termos de Uso (&quot;Termos&quot;). Se não
          concordar, não use o Serviço.
        </p>
        <p>Estes Termos se aplicam a todos os usuários do Serviço, incluindo profissionais de saúde, secretárias e pacientes.</p>
      </Section>

      <Section title="2. Descrição do Serviço">
        <p>
          O SolvyMed é uma plataforma de gestão de clínicas que permite a profissionais de saúde gerenciar consultas,
          prontuários, receitas, procedimentos e tarefas administrativas relacionadas. Pacientes podem usar o Serviço
          para agendar consultas e ver as informações compartilhadas pelo seu profissional de saúde.
        </p>
      </Section>

      <Section title="3. Contas de usuário">
        <p>
          Para usar o Serviço, você precisa criar uma conta com um e-mail válido e uma senha segura. Você é responsável
          por manter as suas credenciais em sigilo e por toda atividade realizada na sua conta. Avise-nos imediatamente
          em <Mail /> se suspeitar de acesso não autorizado.
        </p>
        <p>É preciso ter pelo menos 18 anos para criar uma conta.</p>
        <p>
          Profissionais podem convidar secretárias para o seu consultório. O profissional é responsável por quem
          convida e pelas ações das suas secretárias no Serviço, e pode remover o acesso de uma secretária a qualquer
          momento.
        </p>
      </Section>

      <Section title="4. Uso aceitável">
        <p>Você concorda em não:</p>
        <ul>
          <li>Usar o Serviço para fins ilícitos ou em desacordo com a regulamentação aplicável, incluindo as normas sobre saúde e privacidade de dados de pacientes.</li>
          <li>Enviar ou transmitir informações falsas, enganosas ou fraudulentas, incluindo prontuários fabricados.</li>
          <li>Tentar obter acesso não autorizado a qualquer parte do Serviço ou dos sistemas relacionados.</li>
          <li>Fazer engenharia reversa, descompilar ou tentar extrair de outra forma o código-fonte do Serviço.</li>
          <li>Usar o Serviço para enviar mensagens não solicitadas ou spam a pacientes ou outros usuários.</li>
          <li>Interferir na integridade ou no desempenho do Serviço, ou prejudicá-los.</li>
        </ul>
      </Section>

      <Section title="5. Assinatura e pagamento">
        <p>
          Os recursos para profissionais exigem uma assinatura ativa do SolvyMed Pro. Novas contas de profissional têm
          15 dias de teste grátis. A assinatura é cobrada mensalmente, de forma antecipada, no cartão, pela Stripe. O
          preço depende do país do seu consultório: R$ 89 por mês no Brasil, ฿690 por mês na Tailândia e US$ 19 por mês
          nos demais países; o preço é sempre exibido antes do pagamento. Se você assinar durante o teste grátis com mais
          de 2 dias restantes, o teste continua e a primeira cobrança é feita quando ele termina; se cancelar antes
          disso, você mantém o teste até o fim.
        </p>
        <p>
          A assinatura é renovada automaticamente todo mês até que você a cancele. Você pode cancelar a qualquer
          momento pelo <Mail /> ou, quando disponível, no portal de cobrança. Encerrar sua conta também cancela sua
          assinatura. Não reembolsamos períodos parciais, salvo quando exigido pela legislação aplicável.
        </p>
        <p>
          Se um pagamento falhar, o acesso aos recursos para profissionais é suspenso imediatamente. Ele volta assim que
          você atualizar o cartão e o pagamento for aprovado.
        </p>
        <p>
          Podemos alterar os preços com 30 dias de antecedência. Continuar usando o Serviço depois que a alteração
          entrar em vigor significa que você aceita o novo preço.
        </p>
      </Section>

      <Section title="6. Dados de pacientes e responsabilidades do profissional">
        <p>
          Os profissionais de saúde que armazenam dados de pacientes no SolvyMed são os controladores desses dados,
          nos termos da legislação de privacidade aplicável, incluindo a LGPD. A BurrowSoft atua como operadora em nome
          deles.
        </p>
        <p>Os profissionais de saúde são os únicos responsáveis:</p>
        <ul>
          <li>Pela licitude dos dados de pacientes que registram, incluindo ter uma base legal e obter qualquer consentimento necessário antes de registrá-los.</li>
          <li>Por garantir que o seu uso do Serviço cumpra a regulamentação de saúde aplicável e os códigos de ética profissional.</li>
          <li>Pela exatidão e completude dos prontuários que criam ou mantêm.</li>
          <li>Por garantir que as secretárias que convidam tratem os dados de pacientes de acordo com a lei.</li>
        </ul>
      </Section>

      <Section title="7. Propriedade intelectual">
        <p>
          Todos os direitos de propriedade intelectual sobre o Serviço, incluindo software, design, marcas e conteúdo
          criados pela BurrowSoft, pertencem à BurrowSoft. Você recebe uma licença limitada, não exclusiva e
          intransferível para usar o Serviço para as suas finalidades durante a vigência da sua assinatura.
        </p>
        <p>
          Você continua sendo titular dos dados que envia ao Serviço. Você concede à BurrowSoft uma licença limitada
          para armazenar e tratar os seus dados exclusivamente para prestar e operar o Serviço.
        </p>
      </Section>

      <Section title="8. Isenções">
        <p>
          O Serviço é fornecido &quot;no estado em que se encontra&quot; e &quot;conforme disponível&quot;, sem garantias de
          qualquer tipo, expressas ou implícitas, incluindo garantias de comercialização, adequação a uma finalidade
          específica ou não violação. A BurrowSoft não garante que o Serviço será ininterrupto, livre de erros ou
          totalmente seguro.
        </p>
        <p>
          O SolvyMed é uma ferramenta de gestão e não é um dispositivo médico. Ele não fornece aconselhamento,
          diagnóstico ou tratamento médico. Os profissionais de saúde são os únicos responsáveis por todas as decisões
          clínicas tomadas com o uso do Serviço.
        </p>
      </Section>

      <Section title="9. Limitação de responsabilidade">
        <p>
          Na máxima extensão permitida pela legislação aplicável, a BurrowSoft não será responsável por danos
          indiretos, incidentais, especiais, consequenciais ou punitivos, incluindo perda de dados, receitas ou lucros,
          decorrentes do uso ou da impossibilidade de uso do Serviço.
        </p>
        <p>
          A nossa responsabilidade total perante você por qualquer reclamação decorrente destes Termos ou do uso do
          Serviço não excederá o valor que você nos pagou nos 12 meses anteriores à reclamação.
        </p>
      </Section>

      <Section title="10. Encerramento da conta e rescisão">
        <p>
          Você pode excluir ou encerrar a sua conta a qualquer momento em Configurações, ou pedindo a nós em <Mail />.
          Encerrar a conta cancela a assinatura. Os prontuários são guardados pelo prazo legal, bloqueados e
          inacessíveis, e depois apagados definitivamente, como descrito na seção 9 da{" "}
          <Link href="/privacy" className="text-teal-600 underline">Política de Privacidade</Link>.
        </p>
        <p>
          A BurrowSoft pode suspender ou encerrar o seu acesso ao Serviço por violação destes Termos ou por qualquer
          outro motivo, a seu critério, com ou sem aviso prévio. Com o encerramento, o seu direito de usar o Serviço
          termina imediatamente. As seções 6, 7, 9 e 11 continuam válidas após o encerramento.
        </p>
      </Section>

      <Section title="11. Lei aplicável">
        <p>
          Estes Termos são regidos pelas leis do Brasil. Quaisquer disputas decorrentes destes Termos ou do uso do
          Serviço serão submetidas à jurisdição exclusiva do foro de São Paulo, Brasil, salvo quando a legislação local
          obrigatória dispuser de outra forma.
        </p>
      </Section>

      <Section title="12. Alterações nestes Termos">
        <p>
          Podemos atualizar estes Termos periodicamente. Avisaremos sobre alterações relevantes no aplicativo ou por
          e-mail com pelo menos 14 dias de antecedência. Continuar usando o Serviço depois que as alterações entrarem em
          vigor significa que você aceita os Termos atualizados.
        </p>
      </Section>

      <Section title="13. Contato">
        <p>
          Vitor Carvalho, sob o nome comercial BurrowSoft, 297 Moo 1, Baan Sanian, Mueang Nan, Nan 55000, Tailândia.
          <br />
          E-mail: <Mail />
        </p>
      </Section>
    </>
  );
}
