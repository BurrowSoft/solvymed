# Privacy policy, clinics (1.5.0): DRAFT for review

Status: draft (web dev, 2 Oct 2026), for 9a's review and UX & PM (e7).
It is not shown anywhere yet. It ships only when all of these hold:
- the clinic data model (38's specs/multi-doctor-design.md v2) is reviewed;
- every sentence below matches what the database and both apps enforce (policy = enforcement);
- PRIVACY_VERSION is bumped after mobile's accepting migration is live;
- it sits behind the `clinics-live` condition.

The source is specs/multi-doctor-ux.md (Vitor's decisions of 2 Oct, "Holes closed" item 10). Each block says which section of the live policy it changes. Where the draft depends on a data-model choice not yet final, it is marked **[CHECK]**, with the question at the end.

---

## §2 Our role / Nosso papel (replaces the second bullet)

**en**
- For **patient records** that a professional enters (clinical notes, prescriptions, exams, files, appointments), the **professional is the controller** and BurrowSoft is the **operator** (processor), acting only on their instructions.
- In a **clinic** on SolvyMed (several professionals working together), the **clinic** is the controller of the data its professionals share: the clinic's patient registry (identification, contact, address and administrative notes), the clinic schedule and the "Any professional" request queue.
- Each professional remains the controller of the medical records they create, including any item they choose to share with the clinic.
- Requests about these records should go to the clinic or professional first. We will help them answer.

**pt-BR**
- Para os **registros de pacientes** que um profissional insere (anotações clínicas, receitas, exames, arquivos, consultas), o **profissional é o controlador** e a BurrowSoft é a **operadora**, agindo apenas conforme as instruções dele.
- Numa **clínica** no SolvyMed (vários profissionais trabalhando juntos), a **clínica** é a controladora dos dados que seus profissionais compartilham: o cadastro de pacientes da clínica (identificação, contato, endereço e observações administrativas), a agenda da clínica e a fila de pedidos "Qualquer profissional".
- Cada profissional continua controlador dos prontuários que cria, inclusive dos itens que decidir compartilhar com a clínica.
- Solicitações sobre esses registros devem ir primeiro à clínica ou ao profissional. Nós ajudaremos a respondê-las.

---

## §3.1 Account information (adds a sentence)

**en**
Professionals who create or join a clinic: the clinic's name, address and type, its members and admins, and join requests.

**pt-BR**
Profissionais que criam uma clínica ou entram em uma: o nome, o endereço e o tipo da clínica, seus membros e administradores e os pedidos de entrada.

---

## §3.2 Patient data (changes "entered by professionals or their secretaries")

**en**
"…entered by professionals, other professionals of the same clinic, or their secretaries: …"

**pt-BR**
"…inseridos por profissionais, por outros profissionais da mesma clínica ou por suas secretárias: …"

---

## §7 Who can see data inside a clinic (rewritten)

**en**
- **Each professional** sees all the data of their own patients, including the medical records they created.
- **In a clinic that works as an "Integrated team"**:
  - every professional of the clinic sees the clinic's patient list (identification, contact, address and administrative notes) **[CHECK 1]** and the clinic schedule **[CHECK 2]**;
  - a professional never sees another professional's medical records, prescriptions, exams or files, unless that professional shares a specific item with the clinic (see below).
- **In a clinic that works as a "Shared space"**:
  - each professional sees only their own patients;
  - nothing is shared between professionals unless one shares a specific item;
  - "Refer a colleague" sends the patient only the colleague's link, and no patient data.
- **Sharing an item:** a professional may share a specific record, prescription, exam or file with their clinic. The clinic's other professionals can then view and download it, but never edit or delete it. Every time another professional opens a shared item, the access log records it. The professional can stop sharing at any time. When a professional leaves the clinic, the items they shared stop being visible to it.
- **"Any professional" requests:** a clinic that offers this lets a patient book the first available time with any of its professionals. Until a professional is assigned, the request (the patient's name and contact, the requested time and type, and the patient's message) is visible to the clinic's secretaries and all its professionals **[CHECK 3]**. Medical records are created only by the assigned professional.
- **Secretaries** belong to the clinic and serve all its professionals. They can see and manage patients' identification and contact data (including the profile photo), the schedule and appointment payments of the professionals they serve, and can add, archive and restore patients. They **cannot** see medical records, prescriptions, exams or clinical files, shared or not. **[CHECK 4]**
- **Patients** may be connected to several professionals and clinics. Each professional and clinic sees only the data of their own practice. A professional doesn't learn which other professionals, outside their clinic, a patient sees. Patients see their own appointments with each one, and each one's booking and payment information.
- **Leaving or closing a clinic:**
  - a professional who leaves keeps their own medical records, and the patients they saw keep a direct connection to them;
  - the clinic keeps its patient registry;
  - when a clinic closes, each patient keeps a direct connection to the professionals they saw. **[CHECK 5]**
- Nobody outside the clinic, including other SolvyMed users, can see a clinic's data. SolvyMed staff access data only when needed for support or legal obligations.

Access log paragraph (unchanged, plus one sentence):
"…An item shared with the clinic logs every open by another professional; the professional who shared it can see those entries. **[CHECK 6]**"

**pt-BR**
- **Cada profissional** vê todos os dados dos próprios pacientes, inclusive os prontuários que criou.
- **Numa clínica que funciona como "Equipe integrada"**:
  - todos os profissionais da clínica veem a lista de pacientes da clínica (identificação, contato, endereço e observações administrativas) **[CHECK 1]** e a agenda da clínica **[CHECK 2]**;
  - um profissional nunca vê prontuários, receitas, exames ou arquivos de outro profissional, a menos que ele compartilhe um item específico com a clínica (veja abaixo).
- **Numa clínica que funciona como "Espaço compartilhado"**:
  - cada profissional vê só os próprios pacientes;
  - nada é compartilhado entre os profissionais, a menos que um deles compartilhe um item específico;
  - "Indicar colega" envia ao paciente só o link do colega, sem dados do paciente.
- **Compartilhar um item:** um profissional pode compartilhar com a clínica um prontuário, receita, exame ou arquivo específico. Os outros profissionais da clínica podem então vê-lo e baixá-lo, mas nunca editá-lo ou apagá-lo. Cada abertura de um item compartilhado por outro profissional fica no registro de acessos. O profissional pode deixar de compartilhar a qualquer momento. Quando um profissional sai da clínica, os itens que ele compartilhou deixam de ser visíveis para ela.
- **Pedidos "Qualquer profissional":** uma clínica que oferece essa opção permite que o paciente marque o primeiro horário disponível com qualquer um dos seus profissionais. Até um profissional ser definido, o pedido (nome e contato do paciente, horário e tipo pedidos e a mensagem do paciente) fica visível para as secretárias e todos os profissionais da clínica **[CHECK 3]**. Prontuários são criados só pelo profissional definido.
- **Secretárias** fazem parte da clínica e atendem todos os seus profissionais. Elas podem ver e gerenciar os dados de identificação e contato dos pacientes (inclusive a foto de perfil), a agenda e os pagamentos de consultas dos profissionais que atendem, e podem cadastrar, arquivar e restaurar pacientes. Elas **não** podem ver prontuários, receitas, exames ou arquivos clínicos, compartilhados ou não. **[CHECK 4]**
- **Pacientes** podem estar conectados a vários profissionais e clínicas. Cada profissional e clínica vê só os dados do próprio atendimento. Um profissional não fica sabendo quais outros profissionais, fora da sua clínica, o paciente consulta. O paciente vê as próprias consultas com cada um e as informações de agendamento e pagamento de cada um.
- **Sair de uma clínica ou encerrá-la:**
  - o profissional que sai mantém os próprios prontuários, e os pacientes que ele atendeu mantêm uma conexão direta com ele;
  - a clínica mantém o seu cadastro de pacientes;
  - quando uma clínica é encerrada, cada paciente mantém uma conexão direta com os profissionais que o atenderam. **[CHECK 5]**
- Ninguém de fora da clínica, inclusive outros usuários do SolvyMed, pode ver os dados de uma clínica. A equipe do SolvyMed acessa dados só quando necessário para suporte ou obrigações legais.

Registro de acessos (inalterado, mais uma frase):
"…Um item compartilhado com a clínica registra cada abertura por outro profissional; o profissional que o compartilhou vê esses registros. **[CHECK 6]**"

---

## §9 Data retention (adds one bullet)

**en**
- **Clinics:** the clinic's patient registry is kept while the clinic exists. Medical records always follow the professional who created them, and the 20-year retention above applies to them, whether the professional stays in, leaves or closes the clinic. **[CHECK 7]**

**pt-BR**
- **Clínicas:** o cadastro de pacientes da clínica é mantido enquanto a clínica existir. Os prontuários sempre acompanham o profissional que os criou, e a guarda de 20 anos acima vale para eles, quer o profissional continue na clínica, saia dela ou a encerre. **[CHECK 7]**

---

## §10 Your rights (adds a sentence)

**en**
Requests about a clinic's shared registry or schedule go to the clinic. Requests about medical records go to the professional who created them.

**pt-BR**
Solicitações sobre o cadastro ou a agenda compartilhados de uma clínica devem ir à clínica. Solicitações sobre prontuários devem ir ao profissional que os criou.

---

## Open points (to settle against v2 before shipping)

1. **Registry fields:** do the other doctors of an integrated clinic see the address and the administrative notes, or only name + contact? The ⓘ bullet says "name and contact"; the shared-registry bullet lists identity, contact, address and admin notes. The policy must say exactly what the RLS returns.
2. **Clinic schedule:** in an integrated clinic, does a doctor see the other doctors' appointments (patient name, time, type), or only the secretaries? (Shared space: "the shared schedule view is for secretaries only".)
3. **Any-professional queue:** which fields are visible to all of the clinic's doctors before assignment? Does that change once a doctor is assigned (do the others lose sight of it)?
4. **Secretaries:** is the "up to 3" limit per doctor or per clinic? Do secretaries see payments of every doctor in the clinic, or only of the doctors they're added to? (Joining rules: "serves all its doctors"; Q5: notifications per doctor.)
5. **Closing / leaving:** is the registry deleted when a clinic closes, and what happens to its administrative notes? Who closes a clinic (the admins only)?
6. **Access log of shared items:** who sees the log entries of a shared item: the sharing doctor only, or every admin?
7. **Retention of the registry:** how long after a clinic closes is its registry kept? Is it the 20-year rule when it holds appointment history?
8. **Patient notice on sharing:** Vitor's open question (default: no per-item notice, covered by this policy).
9. **Thai version:** the policy is pt-BR + en today. Thai privacy/terms are a separate backlog story.
10. **Legal review:** this goes to the lawyer post-launch (not a gate, per Vitor 10-01). Text = enforcement and Vitor's go are the gates.
