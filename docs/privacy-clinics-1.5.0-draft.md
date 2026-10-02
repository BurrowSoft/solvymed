# Privacy policy, clinics (1.5.0): DRAFT for review

Status: draft v2 (web dev, 2 Oct 2026). It takes in 9a's review of #328 (M1, M3, M4 and the notes; M2 withdrawn) and e7's answers of 2 Oct (page name, schedule visibility, registry fields, the queue, the secretary limit, subscription status, neutral §2 wording).
It is not shown anywhere yet. It ships only when all of these hold:
- the clinic data model (38's specs/multi-doctor-design.md v2) is reviewed;
- every **[CHECK n]** below resolves to what the database and both apps enforce (policy = enforcement);
- PRIVACY_VERSION is bumped after mobile's accepting migration is live;
- Vitor gives his go;
- it sits behind the `clinics-live` condition.

The sources are specs/multi-doctor-ux.md ("Joining rules, simplified" and "Holes closed" supersede the earlier bullets) and e7's answers. Each block names the section of the live policy it changes.

---

## §2 Our role / Nosso papel (replaces the second bullet)

Neutral wording for now (e7). Whether a clinic on SolvyMed is a "controller" (it's a group of professionals with admins, not necessarily a legal entity) goes to the lawyer after launch (not a gate).

**en**
- For **patient records** that a professional enters (clinical notes, prescriptions, exams, files, appointments), the **professional is the controller** and BurrowSoft is the **operator** (processor), acting only on their instructions.
- In a **clinic** on SolvyMed (several professionals working together), each professional is responsible for their own records, including any item they choose to share with the clinic. The clinic's administrators are responsible for the clinic's shared patient list, schedule and request queue.
- Requests about these records should go to the professional or the clinic first. We will help them answer.

**pt-BR**
- Para os **registros de pacientes** que um profissional insere (anotações clínicas, receitas, exames, arquivos, consultas), o **profissional é o controlador** e a BurrowSoft é a **operadora**, agindo apenas conforme as instruções dele.
- Numa **clínica** no SolvyMed (vários profissionais trabalhando juntos), cada profissional é responsável pelos próprios registros, inclusive pelos itens que decidir compartilhar com a clínica. Os administradores da clínica são responsáveis pela lista de pacientes, pela agenda e pela fila de pedidos compartilhadas da clínica.
- Solicitações sobre esses registros devem ir primeiro ao profissional ou à clínica. Nós ajudaremos a respondê-las.

---

## §3.1 Account information (adds a sentence)

**en**
Professionals who create or join a clinic: the clinic's name, address and type, its members and administrators, and join requests. The clinic's members see whether each colleague's subscription is active or has ended, but never the plan, amounts or payment details.

**pt-BR**
Profissionais que criam uma clínica ou entram em uma: o nome, o endereço e o tipo da clínica, seus membros e administradores e os pedidos de entrada. Os membros da clínica veem se a assinatura de cada colega está ativa ou encerrada, mas nunca o plano, os valores ou os dados de pagamento.

---

## §3.2 Patient data (changes "entered by professionals or their secretaries")

**en**
"…entered by professionals, other professionals of the same clinic, or their secretaries: …"

**pt-BR**
"…inseridos por profissionais, por outros profissionais da mesma clínica ou por suas secretárias: …"

---

## §7 Who can see data inside a clinic (rewritten)

**en**
- **Each professional** sees all the data of their own patients, including the medical records they created, and their own administrative notes about them.
- **In a clinic that works as an "Integrated team"**:
  - a patient becomes one of the **clinic's patients** by connecting with the clinic's code or link, or with the code or link of any of its professionals. Patients a professional already had before joining the clinic do **not** become the clinic's patients;
  - every professional and secretary of the clinic sees the clinic's patients' name, date of birth, phone, email and address **[CHECK 1]**. Administrative notes stay with the professional who wrote them;
  - the clinic's professionals see each other's appointments in the clinic schedule (time, patient name, type and professional), never their clinical content **[CHECK 2]**;
  - a professional never sees another professional's medical records, prescriptions, exams or files, unless that professional shares a specific item with the clinic (see below).
- **In a clinic that works as a "Shared space"**:
  - each professional sees only their own patients and appointments; the combined schedule is for the secretaries only;
  - nothing is shared between professionals unless one shares a specific item;
  - "Refer a colleague" sends the patient only the colleague's link, and no patient data.
- **Sharing an item:**
  - a professional may share a specific record, prescription, exam or file with their clinic;
  - the clinic's other professionals can then view and download it, but never edit or delete it;
  - every time another professional opens a shared item, the access log records it **[CHECK 6]**;
  - the professional can stop sharing at any time, and when they leave the clinic, the items they shared stop being visible to it.
- **"Any professional" requests** (integrated clinics only; a shared space has none):
  - a clinic that offers this lets a patient book the first available time with any of its professionals;
  - until a professional is assigned, the request is visible to all of the clinic's professionals and secretaries. That's booking data only (the patient's name and contact, the requested time and type, and the patient's message), never clinical content;
  - once a professional is assigned, it is that professional's appointment, seen as described above **[CHECK 3]**;
  - medical records are created only by the assigned professional.
- **Secretaries** belong to the clinic and serve all its professionals, in both clinic types (up to 3 per professional of the clinic):
  - they can see and manage patients' identification and contact data (including the profile photo), the schedule and appointment payments, and can add, archive and restore patients;
  - they **cannot** see medical records, prescriptions, exams or clinical files, shared or not **[CHECK 4]**.
- **Patients** may be connected to several professionals and clinics:
  - if you connect with a clinic's code or link, or with the code or link of a professional of an integrated clinic, the clinic's professionals and secretaries can see your name, date of birth, phone, email and address, and your appointments with the clinic;
  - your medical records stay with the professional who created them, unless that professional shares a specific item with the clinic;
  - each professional and clinic sees only the data of their own practice, and a professional doesn't learn which other professionals, outside their clinic, you see **[CHECK 8]**;
  - you can disconnect from a professional or a clinic at any time. Your past records stay with the professional, as the law requires (see section 9).
- **Leaving or closing a clinic:**
  - a professional who leaves keeps their own medical records, and the clinic's patients who booked with them keep a direct connection to them;
  - the clinic keeps its patient list;
  - when a clinic closes, each of its patients keeps a direct connection to the professionals they booked with **[CHECK 5]**.
- Nobody outside the clinic, including other SolvyMed users, can see a clinic's data. SolvyMed staff access data only when needed for support or legal obligations.

Access log paragraph (unchanged, plus one sentence):
"…An item shared with the clinic logs every open by another professional; the professional who shared it can see those entries. **[CHECK 6]**"

**pt-BR**
- **Cada profissional** vê todos os dados dos próprios pacientes, inclusive os prontuários que criou e as próprias observações administrativas sobre eles.
- **Numa clínica que funciona como "Equipe integrada"**:
  - um paciente passa a ser **paciente da clínica** ao se conectar com o código ou link da clínica, ou com o código ou link de qualquer um dos seus profissionais. Os pacientes que um profissional já tinha antes de entrar na clínica **não** passam a ser pacientes da clínica;
  - todos os profissionais e secretárias da clínica veem nome, data de nascimento, telefone, e-mail e endereço dos pacientes da clínica **[CHECK 1]**. As observações administrativas ficam com o profissional que as escreveu;
  - os profissionais da clínica veem as consultas uns dos outros na agenda da clínica (horário, nome do paciente, tipo e profissional), nunca o conteúdo clínico **[CHECK 2]**;
  - um profissional nunca vê prontuários, receitas, exames ou arquivos de outro profissional, a menos que ele compartilhe um item específico com a clínica (veja abaixo).
- **Numa clínica que funciona como "Espaço compartilhado"**:
  - cada profissional vê só os próprios pacientes e consultas; a agenda conjunta é só para as secretárias;
  - nada é compartilhado entre os profissionais, a menos que um deles compartilhe um item específico;
  - "Indicar colega" envia ao paciente só o link do colega, sem dados do paciente.
- **Compartilhar um item:**
  - um profissional pode compartilhar com a clínica um prontuário, receita, exame ou arquivo específico;
  - os outros profissionais da clínica podem então vê-lo e baixá-lo, mas nunca editá-lo ou apagá-lo;
  - cada abertura de um item compartilhado por outro profissional fica no registro de acessos **[CHECK 6]**;
  - o profissional pode deixar de compartilhar a qualquer momento, e quando sai da clínica, os itens que compartilhou deixam de ser visíveis para ela.
- **Pedidos "Qualquer profissional"** (só em clínicas integradas; um espaço compartilhado não tem):
  - uma clínica que oferece essa opção permite que o paciente marque o primeiro horário disponível com qualquer um dos seus profissionais;
  - até um profissional ser definido, o pedido fica visível para todos os profissionais e secretárias da clínica. São só dados do agendamento (nome e contato do paciente, horário e tipo pedidos e a mensagem do paciente), nunca conteúdo clínico;
  - depois de definido o profissional, é uma consulta dele, vista como descrito acima **[CHECK 3]**;
  - prontuários são criados só pelo profissional definido.
- **Secretárias** fazem parte da clínica e atendem todos os seus profissionais, nos dois tipos de clínica (até 3 por profissional da clínica):
  - elas podem ver e gerenciar os dados de identificação e contato dos pacientes (inclusive a foto de perfil), a agenda e os pagamentos de consultas, e podem cadastrar, arquivar e restaurar pacientes;
  - elas **não** podem ver prontuários, receitas, exames ou arquivos clínicos, compartilhados ou não **[CHECK 4]**.
- **Pacientes** podem estar conectados a vários profissionais e clínicas:
  - se você se conectar com o código ou link de uma clínica, ou de um profissional de uma clínica integrada, os profissionais e as secretárias da clínica podem ver seu nome, data de nascimento, telefone, e-mail e endereço, e as suas consultas na clínica;
  - seus prontuários ficam com o profissional que os criou, a menos que ele compartilhe um item específico com a clínica;
  - cada profissional e clínica vê só os dados do próprio atendimento, e um profissional não fica sabendo quais outros profissionais, fora da sua clínica, você consulta **[CHECK 8]**;
  - você pode se desconectar de um profissional ou de uma clínica a qualquer momento. Seus prontuários anteriores ficam com o profissional, como a lei exige (veja a seção 9).
- **Sair de uma clínica ou encerrá-la:**
  - o profissional que sai mantém os próprios prontuários, e os pacientes da clínica que marcaram com ele mantêm uma conexão direta com ele;
  - a clínica mantém a sua lista de pacientes;
  - quando uma clínica é encerrada, cada um dos seus pacientes mantém uma conexão direta com os profissionais com quem marcou **[CHECK 5]**.
- Ninguém de fora da clínica, inclusive outros usuários do SolvyMed, pode ver os dados de uma clínica. A equipe do SolvyMed acessa dados só quando necessário para suporte ou obrigações legais.

Registro de acessos (inalterado, mais uma frase):
"…Um item compartilhado com a clínica registra cada abertura por outro profissional; o profissional que o compartilhou vê esses registros. **[CHECK 6]**"

---

## §9 Data retention (adds one bullet)

**en**
- **Clinics:** the clinic's patient list is kept while the clinic exists. Medical records always follow the professional who created them, and the 20-year retention above applies to them, whether the professional stays in, leaves or closes the clinic **[CHECK 7]**.

**pt-BR**
- **Clínicas:** a lista de pacientes da clínica é mantida enquanto a clínica existir. Os prontuários sempre acompanham o profissional que os criou, e a guarda de 20 anos acima vale para eles, quer o profissional continue na clínica, saia dela ou a encerre **[CHECK 7]**.

---

## §10 Your rights (adds a sentence)

**en**
Requests about a clinic's shared patient list or schedule go to the clinic. Requests about medical records go to the professional who created them.

**pt-BR**
Solicitações sobre a lista de pacientes ou a agenda compartilhadas de uma clínica devem ir à clínica. Solicitações sobre prontuários devem ir ao profissional que os criou.

---

## CHECKs: each must match v2's RLS/RPCs before shipping

1. **Registry fields** (e7: name, date of birth, phone, email, address; admin notes per doctor, never shared): the clinic-patients read returns exactly these. Admin notes are readable only by the doctor who wrote them (and their secretaries?).
2. **Clinic schedule** (e7): integrated members read colleagues' appointments (time, patient name, type, doctor) with no clinical fields (notes, the clinic's private appointment notes?). Shared space: doctors read only their own; secretaries read all.
3. **Queue after assignment:** once assigned, the request leaves the queue and follows check 2 (still visible to integrated colleagues as an appointment, not as a queue item).
4. **Secretaries:** the limit is 3 × member doctors per clinic (e7). There's no read path to records or files, including shared items.
5. **Leaving / closing:** the patient links are converted to direct links exactly as described; who can close a clinic (admins only).
6. **Access log of shared items** (9a M4, design review B1): shared items are served **only** through a logging RPC (a plain SELECT can't log). Who reads those entries: the sharing doctor only, or the admins too? The same goes for SolvyAI and exports (B2): the policy must not imply SolvyAI reads colleagues' shared items unless that path logs too.
7. **Retention on close:** what happens to clinic_patient_links and the clinic's registry when a clinic closes (deleted at once? kept with the appointment history?); tie it to v2's deletion matrix.
8. **"The doctors they see"** (9a M3): the clinic-patients registry lists only the clinic's own doctors, never the patient's doctors outside the clinic (v2's get_clinic_patients).

## Other open points

- **Patient notice on sharing:** Vitor's open question (default: no per-item notice, covered by this policy).
- **Subscription status** (e7): the in-app clinic page shows a colleague's subscription only as active / ended, matching §3.1.
- **Thai version:** the policy is pt-BR + en today; Thai privacy/terms are a separate backlog story.
- **Legal review:** post-launch (Vitor 10-01, not a gate), incl. the §2 roles. Text = enforcement and Vitor's go are the gates.
