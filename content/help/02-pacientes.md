# Help batch 2: Pacientes / Patients (pt-BR + en)

---
## P1. Cadastrar um paciente / Add a patient
**pt-BR**
1. Abra **Pacientes** e toque em **+** (Novo paciente).
2. Preencha nome, data de nascimento, telefone e, se quiser, CPF e e-mail.
3. Toque em **Salvar**.
Se o CPF já estiver cadastrado, o app avisa e não cria um paciente repetido. Se o telefone ou nome + data de nascimento parecerem de alguém já cadastrado, o app mostra o paciente parecido para você abrir o existente ou criar mesmo assim.
**en**
1. Open **Patients** and tap **+** (New patient).
2. Fill in the name, date of birth, phone and, if you want, CPF and email.
3. Tap **Save**.
If the CPF is already registered, the app warns you and doesn't create a duplicate. If the phone, or the name + date of birth, look like an existing patient, the app shows the similar patient so you can open it or create a new one anyway.
**No site:** Em **Pacientes**, clique em **Novo Paciente**, preencha os dados e clique em **Salvar Paciente**. Os mesmos avisos de CPF repetido e de paciente parecido aparecem no site.
**On the website:** In **Patients**, click **New Patient**, fill in the details and click **Save Patient**. The same duplicate-CPF and similar-patient warnings appear on the website.
**No site:** {pending:patient-address-live} Em **Pacientes**, clique em **Novo Paciente**, preencha os dados e clique em **Salvar Paciente**. Os mesmos avisos de CPF repetido e de paciente parecido aparecem no site. Em **Endereço** (fechado enquanto vazio) ficam CEP, rua, número, complemento, bairro, cidade e UF (numa clínica fora do Brasil, os campos do país: na Tailândia, บ้านเลขที่, ซอย, ตำบล, อำเภอ, จังหวัด). Clínicas no Brasil têm também o **CNS** (15 dígitos, no cartão do SUS). **Observações** é para informações administrativas: não escreva dados clínicos ali, use o prontuário. A secretária vê e edita esses campos. O endereço aparece numa linha na página do paciente (com **Editar**) e na receita impressa, abaixo do nome.
**On the website:** {pending:patient-address-live} In **Patients**, click **New Patient**, fill in the details and click **Save Patient**. The same duplicate-CPF and similar-patient warnings appear on the website. **Address** (collapsed while empty) has the postal code, street, number, complement, neighbourhood, city and state (in a clinic outside Brazil, that country's fields: in Thailand, house number, soi, subdistrict, district, province). Clinics in Brazil also have the **CNS** (15 digits, on the SUS card). **Notes** is for administrative information: don't write clinical details there, use the medical record. The secretary sees and edits these fields. The address shows on one line on the patient's page (with **Edit**) and on the printed prescription, under the name.
Thai title: "เพิ่มผู้ป่วย"
**th**
1. เปิด **ผู้ป่วย** แล้วแตะ **+** (**ผู้ป่วยใหม่**)
2. กรอก **ชื่อ-นามสกุล** **วันเกิด** **โทรศัพท์** และหากต้องการ **เลขประจำตัวประชาชน** (หรือ **เลขหนังสือเดินทาง / เลขประจำตัว**) และ **อีเมล**
3. แตะ **บันทึก**
เลขประจำตัวประชาชนต้องมี 13 หลักที่ถูกต้อง หากเลขนี้มีอยู่แล้ว แอปจะแจ้งเตือนและไม่สร้างผู้ป่วยซ้ำ หากเบอร์โทรศัพท์ หรือชื่อกับวันเกิด ดูเหมือนผู้ป่วยที่มีอยู่แล้ว แอปจะแสดงผู้ป่วยที่คล้ายกัน ให้คุณเปิดรายการเดิมหรือสร้างใหม่ต่อไป
**ในเว็บไซต์:** ใน **ผู้ป่วย** คลิก **ผู้ป่วยใหม่** กรอกข้อมูล แล้วคลิก **บันทึกผู้ป่วย** การแจ้งเตือนเลขซ้ำและผู้ป่วยที่คล้ายกันแสดงบนเว็บไซต์เช่นกัน
`open:new-patient`

---
## P2. Encontrar um paciente / Find a patient
**pt-BR**
Em **Pacientes**, use a busca (lupa) e digite o nome, o CPF ou o telefone.
**en**
In **Patients**, use search (the magnifier) and type the name, CPF or phone.
**No site:** Em **Pacientes**, use a caixa **Buscar pacientes…** (nome, telefone ou CPF).
**On the website:** In **Patients**, use the **Search patients…** box (name, phone or CPF).
Thai title: "ค้นหาผู้ป่วย"
**th**
ใน **ผู้ป่วย** ใช้ช่อง **ค้นหาผู้ป่วย** แล้วพิมพ์ชื่อ เลขบัตรประชาชน หรือเบอร์โทรศัพท์
**ในเว็บไซต์:** ใน **ผู้ป่วย** ใช้ช่อง **ค้นหาผู้ป่วย…** (ชื่อ เบอร์โทรศัพท์ หรือเลขบัตรประชาชน)
`open:patients`

---
## P3. Arquivar e restaurar / Archive and restore a patient
**pt-BR**
1. Abra o paciente e toque no menu (⋯).
2. Toque em **Arquivar** e confirme. As próximas consultas desse paciente são canceladas; o histórico continua guardado.
3. Para ver arquivados: em **Pacientes**, abra **Arquivados**. Abra o paciente e toque em **Restaurar**.
Pacientes com prontuário, receita ou arquivo só podem ser arquivados, nunca apagados (o prontuário deve ser guardado por lei).
{pending:app-1.4.0} Um paciente com consultas também não pode ser excluído: ao tocar em **Excluir cadastro**, o app explica e oferece **Arquivar**.
{pending:migration-134} Não é possível excluir um paciente que tem consultas (de qualquer status): o servidor recusa, em qualquer versão do app e no site. Arquive-o.
**en**
1. Open the patient and tap the menu (⋯).
2. Tap **Archive** and confirm. The patient's upcoming appointments are cancelled; the history stays saved.
3. To see archived patients: in **Patients**, open **Archived**. Open the patient and tap **Restore**.
Patients with a record, prescription or file can only be archived, never deleted (records must be kept by law).
{pending:app-1.4.0} A patient with appointments can't be deleted either: tapping **Delete patient** explains why and offers **Archive**.
{pending:migration-134} You can't delete a patient who has appointments (any status): the server refuses it, in any app version and on the website. Archive them instead.
**No site:** Abra o paciente e, na aba **Informações**, clique em **Arquivar cadastro** e confirme. Para ver arquivados: em **Pacientes**, clique em **Arquivados**; abra o paciente e clique em **Restaurar**. **Excluir cadastro** só aparece para pacientes sem prontuário, receita ou arquivo. Se o paciente tiver consultas, ao clicar o site explica que ele não pode ser excluído e oferece **Arquivar**.
**On the website:** Open the patient and, on the **Info** tab, click **Archive patient** and confirm. To see archived patients: in **Patients**, click **Archived**; open the patient and click **Restore**. **Delete patient** shows only for patients with no record, prescription or file. If the patient has appointments, clicking it explains they can't be deleted and offers **Archive**.
Thai title: "เก็บถาวรและกู้คืนผู้ป่วย"
**th**
1. เปิดผู้ป่วย แล้วแตะเมนู (⋯)
2. แตะ **เก็บประวัติผู้ป่วยเข้าคลัง** แล้วแตะ **เก็บถาวร** นัดหมายที่กำลังจะมาถึงของผู้ป่วยจะถูกยกเลิก ประวัติยังคงอยู่
3. ดูแฟ้มที่เก็บถาวร: ใน **ผู้ป่วย** เปิด **เก็บถาวร** เปิดผู้ป่วย แล้วแตะ **กู้คืน**
ผู้ป่วยที่มีเวชระเบียน ใบสั่งยา หรือไฟล์ เก็บถาวรได้เท่านั้น ลบไม่ได้ (ต้องเก็บเวชระเบียนไว้ตามกฎหมาย)
{pending:app-1.4.0} ผู้ป่วยที่มีนัดหมายก็ลบไม่ได้เช่นกัน: เมื่อแตะ **ลบประวัติผู้ป่วย** แอปจะอธิบายเหตุผลและเสนอให้เก็บถาวรแทน
{pending:migration-134} ลบผู้ป่วยที่มีนัดหมาย (ทุกสถานะ) ไม่ได้: เซิร์ฟเวอร์จะปฏิเสธ ไม่ว่าในแอปเวอร์ชันใดหรือในเว็บไซต์ ให้เก็บถาวรแทน
**ในเว็บไซต์:** เปิดผู้ป่วย ในแท็บ **ข้อมูล** คลิก **เก็บประวัติผู้ป่วยเข้าคลัง** แล้วคลิก **เก็บถาวร** ดูแฟ้มที่เก็บถาวร: ใน **ผู้ป่วย** คลิก **เก็บถาวร** เปิดผู้ป่วย แล้วคลิก **กู้คืน** **ลบประวัติผู้ป่วย** จะแสดงเฉพาะผู้ป่วยที่ไม่มีเวชระเบียน ใบสั่งยา หรือไฟล์ หากผู้ป่วยมีนัดหมาย เมื่อคลิก เว็บไซต์จะอธิบายว่าลบไม่ได้และเสนอให้เก็บถาวรแทน
`open:patients`

---
## P4. Escrever no prontuário / Write a medical record
**pt-BR**
1. Abra o paciente e a aba **Prontuários**.
2. Toque em **+**, escreva (texto livre ou um modelo) e toque em **Salvar**.
Só você vê os prontuários; secretárias(os) não têm acesso.
**en**
1. Open the patient and the **Records** tab.
2. Tap **+**, write (free text or a template) and tap **Save**.
Only you can see records; secretaries have no access.
**No site:** Abra o paciente, a aba **Registros** e clique em **Novo Registro**. Escolha o **Tipo de Registro**, escreva e clique em **Salvar Registro**.
**On the website:** Open the patient, the **Records** tab, and click **New Record**. Choose the **Record Type**, write and click **Save Record**.
Thai title: "เขียนเวชระเบียน"
**th**
1. เปิดผู้ป่วย แล้วเปิดแท็บ **เวชระเบียน**
2. แตะ **+** เขียน (ข้อความอิสระหรือแม่แบบ) แล้วแตะ **บันทึก**
เฉพาะคุณเท่านั้นที่เห็นเวชระเบียน เลขานุการเข้าถึงไม่ได้
**ในเว็บไซต์:** เปิดผู้ป่วย แท็บ **บันทึก** แล้วคลิก **บันทึกใหม่** เลือก **ประเภทบันทึก** เขียน แล้วคลิก **บันทึก**
`open:patients`

---
## P5. Corrigir um prontuário ou receita / Correct a record or prescription
**pt-BR**
Nas primeiras 24 horas você pode editar ou apagar. Depois disso, o registro fica protegido: toque em **Adicionar correção**, escreva a correção e salve. O texto original continua guardado e visível, marcado como corrigido.
**en**
In the first 24 hours you can edit or delete. After that the entry is protected: tap **Add correction**, write the correction and save. The original text stays saved and visible, marked as corrected.
**No site:** Nas primeiras 24 horas aparecem **Editar** e **Excluir**. Depois, clique em **Adicionar correção**, escreva a correção e o motivo, e salve.
**On the website:** In the first 24 hours you'll see **Edit** and **Delete**. After that, click **Add correction**, write the correction and the reason, and save.
Thai title: "แก้ไขเวชระเบียนหรือใบสั่งยา"
**th**
ภายใน 24 ชั่วโมงแรก คุณแก้ไขหรือลบได้ หลังจากนั้นรายการจะถูกป้องกัน: แตะ **เพิ่มรายการแก้ไข** เขียนรายการแก้ไขแล้วบันทึก ข้อความเดิมยังคงอยู่และมองเห็นได้ โดยมีเครื่องหมายว่าแก้ไขแล้ว
**ในเว็บไซต์:** ภายใน 24 ชั่วโมงแรกจะเห็น **แก้ไข** และ **ลบ** หลังจากนั้น คลิก **เพิ่มรายการแก้ไข** เขียนรายการแก้ไขและเหตุผล แล้วบันทึก
`open:patients`

---
## P6. Fazer uma receita / Write a prescription
**pt-BR**
1. Abra o paciente e a aba **Receitas**.
2. Toque em **+**, adicione os medicamentos e toque em **Salvar**.
3. Toque em **PDF** para gerar a receita com sua assinatura e compartilhar.
Para a receita sair com seus dados, preencha seu registro profissional (ex.: CRM) em **Configurações → Cadastros** e a assinatura em **Configurações**.
{pending:app-1.7.0} O PDF sai em papel A4.
**en**
1. Open the patient and the **Prescriptions** tab.
2. Tap **+**, add the medications and tap **Save**.
3. Tap **PDF** to create the prescription with your signature and share it.
For the prescription to show your details, fill in your professional registration (e.g. CRM) in **Settings → Registrations** and your signature in **Settings**.
{pending:app-1.7.0} The PDF is on A4 paper.
**No site:** Abra o paciente, a aba **Receitas** e clique em **Nova Receita**; use **+ Adicionar medicamento** e clique em **Salvar Receita**. Para imprimir ou salvar em PDF, clique em **PDF** na receita e depois em **Imprimir / Salvar PDF**; para o arquivo, escolha **Salvar como PDF** na janela de impressão. No site a receita sai com uma linha em branco para assinar à mão, com seu nome e registro embaixo. A impressão sai em papel A4.
**On the website:** Open the patient, the **Prescriptions** tab, and click **New Prescription**; use **+ Add medication** and click **Save Prescription**. To print it or save it as a PDF, click **PDF** on the prescription and then **Print / Save as PDF**; for the file, choose **Save as PDF** in the print window. On the website the prescription has a blank line to sign by hand, with your name and registration under it. It prints on A4 paper.
Thai title: "เขียนใบสั่งยา"
**th**
1. เปิดผู้ป่วย แล้วเปิดแท็บ **ใบสั่งยา**
2. แตะ **+** เพิ่มรายการยา แล้วแตะ **บันทึก**
3. แตะ PDF เพื่อสร้างใบสั่งยาพร้อมลายเซ็นของคุณและแชร์
เพื่อให้ใบสั่งยาแสดงข้อมูลของคุณ ให้กรอกเลขที่ใบอนุญาตประกอบวิชาชีพ (เช่น ว.12345) ใน **การตั้งค่า → เลขทะเบียน** และลายเซ็นใน **การตั้งค่า**
{pending:app-1.7.0} PDF เป็นกระดาษขนาด A4
**ในเว็บไซต์:** เปิดผู้ป่วย แท็บ **ใบสั่งยา** แล้วคลิก **ใบสั่งยาใหม่** ใช้ **+ เพิ่มยา** แล้วคลิก **บันทึกใบสั่งยา** หากต้องการพิมพ์หรือบันทึกเป็น PDF ให้คลิก PDF ที่ใบสั่งยา แล้วคลิก **พิมพ์ / บันทึกเป็น PDF** หากต้องการไฟล์ ให้เลือก "บันทึกเป็น PDF" ในหน้าต่างการพิมพ์ ในเว็บไซต์ ใบสั่งยามีเส้นว่างสำหรับเซ็นด้วยมือ โดยมีชื่อและเลขทะเบียนของคุณอยู่ด้านล่าง พิมพ์บนกระดาษขนาด A4
`open:patients`

---
## P7. Exames e arquivos / Exams and files
**pt-BR**
1. Abra o paciente e a aba **Exames** (ou **Arquivos**).
2. Toque em **Enviar** e escolha uma foto ou um PDF.
Os arquivos são privados: só você acessa, por links temporários.
**en**
1. Open the patient and the **Exams** (or **Files**) tab.
2. Tap **Upload** and choose a photo or a PDF.
Files are private: only you can open them, through temporary links.
**No site:** Abra o paciente, a aba **Exames** (ou **Arquivos**) e clique em **Enviar**. Nas primeiras 24 horas depois do envio você pode excluir o arquivo em **Remover**; depois disso, ele só pode ser ocultado, informando o motivo.
**On the website:** Open the patient, the **Exams** (or **Files**) tab, and click **Upload**. For 24 hours after the upload you can delete the file with **Remove**; after that it can only be hidden, with a reason.
Thai title: "ผลตรวจและไฟล์"
**th**
1. เปิดผู้ป่วย แล้วเปิดแท็บ **ผลตรวจ** (หรือ **ไฟล์**)
2. แตะ **อัปโหลดผลตรวจ** (หรือ **อัปโหลดไฟล์**) แล้วเลือกรูปภาพหรือ PDF
ไฟล์เป็นข้อมูลส่วนตัว: เฉพาะคุณเท่านั้นที่เปิดได้ ผ่านลิงก์ชั่วคราว
**ในเว็บไซต์:** เปิดผู้ป่วย แท็บ **ผลตรวจ** (หรือ **ไฟล์**) แล้วคลิก **อัปโหลด** ภายใน 24 ชั่วโมงหลังอัปโหลด คุณลบไฟล์ได้ด้วย **นำออก** หลังจากนั้นทำได้เพียงซ่อนไฟล์ โดยต้องระบุเหตุผล
`open:patients`

---
## P8. Histórico em PDF / Export a patient's history as PDF
**pt-BR**
Abra o paciente e toque no ícone de exportar histórico. O PDF sai no idioma do app, com datas e valores no formato local.
{pending:app-1.7.0} O PDF sai em papel A4.
**en**
Open the patient and tap the export-history icon. The PDF comes out in the app's language, with local date and currency formats.
{pending:app-1.7.0} The PDF is on A4 paper.
**No site:** Abra o paciente e clique em **PDF do histórico** (no topo), depois em **Imprimir / Salvar PDF**; para o arquivo, escolha **Salvar como PDF** na janela de impressão. Sai no idioma do site, com as datas no formato do país da clínica (na Tailândia, na era budista), com todos os registros e receitas e uma linha em branco para assinar à mão. A impressão sai em papel A4.
**On the website:** Open the patient and click **History PDF** (at the top), then **Print / Save as PDF**; for the file, choose **Save as PDF** in the print window. It comes out in the website's language, with dates in the clinic country’s format (in Thailand, the Buddhist era), with every record and prescription and a blank line to sign by hand. It prints on A4 paper.
Thai title: "ส่งออกประวัติผู้ป่วยเป็น PDF"
**th**
เปิดผู้ป่วย แล้วแตะไอคอนส่งออกประวัติ PDF จะเป็นภาษาของแอป โดยใช้รูปแบบวันที่และสกุลเงินท้องถิ่น
{pending:app-1.7.0} PDF เป็นกระดาษขนาด A4
**ในเว็บไซต์:** เปิดผู้ป่วย แล้วคลิก **PDF ประวัติการรักษา** (ด้านบน) จากนั้นคลิก **พิมพ์ / บันทึกเป็น PDF** หากต้องการไฟล์ ให้เลือก "บันทึกเป็น PDF" ในหน้าต่างการพิมพ์ เอกสารจะเป็นภาษาของเว็บไซต์ วันที่ใช้รูปแบบของประเทศของคลินิก (ในประเทศไทยเป็นพุทธศักราช) มีทุกบันทึกและใบสั่งยา พร้อมเส้นว่างสำหรับเซ็นด้วยมือ พิมพ์บนกระดาษขนาด A4
`open:patients`

---
## P9. Convidar o paciente para o app / Invite a patient to the app
**pt-BR**
Abra o paciente e toque em **Convidar para o app**. Envie o código pessoal (ou o link) por WhatsApp ou outro app. Quando o paciente se cadastra com ele, fica ligado a este cadastro e pode pedir consultas.
**en**
Open the patient and tap **Invite to the app**. Send the personal code (or link) by WhatsApp or another app. When the patient signs up with it, they're connected to this record and can request appointments.
**No site:** Abra o paciente e, na aba **Informações**, em **Código de Convite**, clique em **Gerar código** e depois em **Copiar** para enviar ao paciente.
**On the website:** Open the patient and, on the **Info** tab, under **Invite Code**, click **Generate code** and then **Copy** to send it to the patient.
Thai title: "เชิญผู้ป่วยเข้าแอป"
**th**
เปิดผู้ป่วย แล้วแตะ **เชิญเข้าแอป** ส่งรหัสส่วนตัว (หรือลิงก์) ทาง WhatsApp หรือแอปอื่น เมื่อผู้ป่วยสมัครด้วยรหัสนี้ บัญชีจะเชื่อมกับแฟ้มนี้และขอนัดหมายได้
**ในเว็บไซต์:** เปิดผู้ป่วย ในแท็บ **ข้อมูล** ใต้ **รหัสเชิญ** คลิก **สร้างรหัส** แล้วคลิก **คัดลอก** เพื่อส่งให้ผู้ป่วย
`open:patients`

---
## P10. Exportar a lista de pacientes / Export the patient list (CSV)
**pt-BR**
**Configurações → Exportar pacientes (CSV)**. O arquivo abre direto no Excel. O app apaga a cópia do celular na próxima exportação, ao abrir o app de novo ou ao sair da conta.
**en**
**Settings → Export patients (CSV)**. The file opens directly in Excel. The app deletes the copy from the phone on the next export, the next time the app opens, or when you sign out.
**No site:** {unless:migration-126} Ainda não disponível no site; use o app.
**On the website:** {unless:migration-126} Not available on the website yet; use the app.
**No site:** {pending:migration-126} Em **Configurações → Exportar pacientes (CSV)** (só para médicos) o site baixa a planilha com todos os pacientes, ativos e arquivados. O registro de acesso de cada paciente anota "Exportado na lista de pacientes (CSV)"; se esse registro não puder ser gravado, nada é baixado e aparece "Não foi possível registrar o acesso. Tente novamente."
**On the website:** {pending:migration-126} In **Settings → Export patients (CSV)** (doctors only) the website downloads the spreadsheet with every patient, active and archived. Each patient's access log records "Exported in the patient list (CSV)"; if that can't be recorded, nothing is downloaded and you see "Couldn't record the access. Please try again."
Thai title: "ส่งออกรายชื่อผู้ป่วย (CSV)"
**th**
**การตั้งค่า → ส่งออกรายชื่อผู้ป่วย (CSV)** ไฟล์เปิดใน Excel ได้ทันที แอปจะลบสำเนาออกจากโทรศัพท์เมื่อส่งออกครั้งถัดไป เมื่อเปิดแอปครั้งถัดไป หรือเมื่อออกจากระบบ
**ในเว็บไซต์:** {unless:migration-126} ยังไม่มีในเว็บไซต์ ให้ใช้แอป
**ในเว็บไซต์:** {pending:migration-126} ใน **การตั้งค่า → ส่งออกผู้ป่วย (CSV)** (เฉพาะแพทย์) เว็บไซต์จะดาวน์โหลดสเปรดชีตที่มีผู้ป่วยทุกคน ทั้งที่ใช้งานอยู่และที่เก็บถาวร บันทึกการเข้าถึงของผู้ป่วยแต่ละคนจะบันทึกว่า "ส่งออกในรายชื่อผู้ป่วย (CSV)" หากบันทึกไม่ได้ จะไม่มีการดาวน์โหลด และคุณจะเห็น "ไม่สามารถบันทึกการเข้าถึงได้ กรุณาลองอีกครั้ง"
`open:settings`

---
## P11. Dados importados / Imported data
**pt-BR**
Pacientes trazidos de outro sistema podem ter **Dados importados**: as colunas da planilha que não viraram um campo do SolvyMed. No app, abra o paciente e toque em **Dados importados** para ver os campos e de onde vieram ("Importado de … em …").
Só você (médico) vê os dados importados; secretárias(os) e o paciente não. Quando você os abre, isso fica registrado na aba **Acessos** do paciente ("Abriu os dados importados"); aberturas repetidas em menos de um minuto contam uma vez só.
**en**
Patients brought from another system may have **Imported data**: the spreadsheet columns that didn't become a SolvyMed field. In the app, open the patient and tap **Imported data** to see the fields and where they came from ("Imported from … on …").
Only you (the doctor) can see imported data; secretaries and the patient can't. When you open it, it's recorded in the patient's **Access** tab ("Opened the imported data"); repeated openings within a minute count once.
**No site:** Em **Pacientes**, abra o paciente: abaixo das abas, clique em **Dados importados** para ver os campos e de onde vieram ("Importado de … em …"). Só o médico vê essa seção, e a abertura fica registrada na aba **Registro de acessos** do paciente, como no app.
**On the website:** In **Patients**, open the patient: below the tabs, click **Imported data** to see the fields and where they came from ("Imported from … on …"). Only the doctor sees this section, and opening it is recorded in the patient's **Access log** tab, as in the app.
Thai title: "ข้อมูลที่นำเข้า"
**th**
ผู้ป่วยที่นำมาจากระบบอื่นอาจมี **ข้อมูลที่นำเข้า**: คอลัมน์ในสเปรดชีตที่ไม่ได้กลายเป็นช่องข้อมูลของ SolvyMed ในแอป เปิดผู้ป่วยแล้วแตะ **ข้อมูลที่นำเข้า** เพื่อดูข้อมูลและแหล่งที่มา ("นำเข้าจาก … เมื่อ …")
เฉพาะคุณ (แพทย์) เท่านั้นที่เห็นข้อมูลที่นำเข้า เลขานุการและผู้ป่วยมองไม่เห็น เมื่อคุณเปิดดู จะมีการบันทึกในแท็บ **การเข้าถึง** ของผู้ป่วย ("เปิดข้อมูลที่นำเข้า") การเปิดซ้ำภายในหนึ่งนาทีนับเป็นครั้งเดียว
**ในเว็บไซต์:** ใน **ผู้ป่วย** เปิดผู้ป่วย ใต้แท็บต่างๆ คลิก **ข้อมูลที่นำเข้า** เพื่อดูข้อมูลและแหล่งที่มา ("นำเข้าจาก … เมื่อ …") เฉพาะแพทย์เท่านั้นที่เห็นส่วนนี้ และการเปิดดูจะถูกบันทึกในแท็บ **บันทึกการเข้าถึง** ของผู้ป่วย เหมือนในแอป
`open:patients`
`requires:import-extras-live`

---
## P12. Mesclar pacientes duplicados / Merge duplicate patients
**pt-BR**
Quando a mesma pessoa tem dois cadastros, você pode mesclá-los: tudo passa para o cadastro que fica.
{pending:merge-patients-live} 1. Em **Pacientes**, toque no menu (⋯) do paciente e em **Mesclar com outro paciente…** (só o médico).
{pending:merge-patients-live} 2. Busque o outro cadastro (os arquivados também aparecem).
{pending:merge-patients-live} 3. Aparecem só os campos diferentes: toque no valor que quer manter. Em **Manter este cadastro**, escolha qual cadastro fica (vem marcado o que usa o app). Cada cadastro mostra a data de nascimento, o final do telefone e quando foi cadastrado ou importado; ao trocar qual fica, os valores escolhidos continuam escolhidos.
{pending:merge-patients-live} 4. Confirme (dois cadastros com o mesmo nome aparecem com o que os diferencia, por exemplo «Maria Silva (nasc. 12/03/1980)»). Se um dos cadastros usa o app, confirme de novo em **São a mesma pessoa**.
Consultas, prontuários, receitas e arquivos passam para o cadastro que fica (os arquivos podem levar alguns segundos). A mesclagem não pode ser desfeita. A aba **Acessos** registra "Mesclou com «nome»".
Se um dos cadastros estava com o agendamento bloqueado, o que fica continua bloqueado. Um cadastro importado como falecido precisa ser restaurado antes de mesclar. O código de convite do cadastro removido deixa de valer. Para auditoria, uma cópia do cadastro removido é guardada enquanto a clínica existir.
{pending:patient-address-live} O **Endereço** é escolhido inteiro, de um cadastro ou do outro; o **CNS** como os outros campos. Em **Observações** diferentes, vem marcado **As duas, juntas** (a do cadastro que fica primeiro); se juntas passarem de 2.000 caracteres, escolha uma (e edite depois, se quiser).
**en**
When the same person has two records, you can merge them: everything moves to the record that stays.
{pending:merge-patients-live} 1. In **Patients**, tap the patient's menu (⋯) and **Merge with another patient…** (doctor only).
{pending:merge-patients-live} 2. Search for the other record (archived ones are listed too).
{pending:merge-patients-live} 3. Only the fields that differ are shown: tap the value to keep. Under **Keep this record**, choose which record stays (the one that uses the app is preselected). Each record shows its birth date, the end of its phone number and when it was added or imported; switching which one stays keeps the values you chose.
{pending:merge-patients-live} 4. Confirm (two records with the same name are named by what tells them apart, for example «Maria Silva (born 12/03/1980)»). If either record uses the app, confirm again with **Same person**.
Appointments, records, prescriptions and files move to the record that stays (files can take a few seconds). A merge can't be undone. The **Access** tab records "Merged with “name”".
If either record had booking blocked, the one that stays remains blocked. A record imported as deceased must be restored before merging. The removed record's invite code stops working. For auditing, a copy of the removed record is kept while the practice exists.
{pending:patient-address-live} The **Address** is chosen as a whole, from one record or the other; the **CNS** like the other fields. When the **Notes** differ, **Both, joined** is preselected (the kept record's first); if together they exceed 2,000 characters, pick one (and edit it afterwards if you like).
**No site:** Abra o paciente e, na aba **Informações**, clique em **Mesclar com outro paciente…** (só o médico). Busque o outro cadastro (os arquivados também aparecem), escolha em **Manter este cadastro** qual fica, marque o valor que quer manter em cada campo diferente e clique em **Mesclar**; se um dos cadastros usa o app, confirme em **São a mesma pessoa**. Cada cadastro mostra a data de nascimento, o final do telefone e quando foi cadastrado ou importado; ao trocar qual fica, os valores marcados continuam marcados. Dois cadastros com o mesmo nome aparecem na confirmação com o que os diferencia, por exemplo «Maria Silva (nasc. 12/03/1980)».
**On the website:** Open the patient and, on the **Info** tab, click **Merge with another patient…** (doctor only). Search for the other record (archived ones are listed too), choose under **Keep this record** which one stays, mark the value to keep in each field that differs and click **Merge**; if either record uses the app, confirm with **Same person**. Each record shows its birth date, the end of its phone number and when it was added or imported; switching which one stays keeps the values you marked. Two records with the same name are named in the confirmation by what tells them apart, for example «Maria Silva (born 12/03/1980)».
Thai title: "รวมแฟ้มผู้ป่วยที่ซ้ำกัน"
**th**
เมื่อบุคคลเดียวกันมีสองแฟ้ม คุณรวมแฟ้มได้: ทุกอย่างจะย้ายไปยังแฟ้มที่เก็บไว้
{pending:merge-patients-live} 1. ใน **ผู้ป่วย** แตะเมนู (⋯) ของผู้ป่วย แล้วแตะ **รวมกับผู้ป่วยอีกคน…** (เฉพาะแพทย์)
{pending:merge-patients-live} 2. ค้นหาอีกแฟ้มหนึ่ง (แฟ้มที่เก็บถาวรก็แสดงด้วย)
{pending:merge-patients-live} 3. จะแสดงเฉพาะช่องที่ต่างกัน: แตะค่าที่ต้องการเก็บไว้ ใต้ **เก็บประวัตินี้ไว้** เลือกแฟ้มที่จะเก็บไว้ (แฟ้มที่ใช้แอปจะถูกเลือกไว้ก่อน) แต่ละแฟ้มแสดงวันเกิด เลขท้ายของหมายเลขโทรศัพท์ และวันที่เพิ่มหรือนำเข้า หากสลับแฟ้มที่จะเก็บไว้ ค่าที่คุณเลือกจะยังคงอยู่
{pending:merge-patients-live} 4. ยืนยัน (หากสองแฟ้มมีชื่อเดียวกัน จะระบุด้วยสิ่งที่แตกต่างกัน เช่น วันเกิด) หากแฟ้มใดแฟ้มหนึ่งใช้แอป ให้ยืนยันอีกครั้งด้วย **เป็นคนเดียวกัน**
นัดหมาย เวชระเบียน ใบสั่งยา และไฟล์ จะย้ายไปยังแฟ้มที่เก็บไว้ (ไฟล์อาจใช้เวลาสองสามวินาที) การรวมแฟ้มยกเลิกไม่ได้ แท็บ **การเข้าถึง** จะบันทึก "รวมกับ «ชื่อ»"
หากแฟ้มใดแฟ้มหนึ่งถูกปิดการขอนัด แฟ้มที่เก็บไว้จะยังถูกปิดการขอนัด แฟ้มที่นำเข้าในสถานะเสียชีวิตต้องกู้คืนก่อนจึงจะรวมได้ รหัสเชิญของแฟ้มที่ถูกรวมออกจะใช้ไม่ได้อีก เพื่อการตรวจสอบ ระบบจะเก็บสำเนาของแฟ้มที่ถูกรวมออกไว้ตราบเท่าที่คลินิกยังอยู่
{pending:patient-address-live} **ที่อยู่** จะเลือกทั้งชุด จากแฟ้มใดแฟ้มหนึ่ง ส่วน CNS (คลินิกในบราซิล) เลือกเหมือนช่องอื่น เมื่อ **หมายเหตุ** ต่างกัน จะเลือก **ทั้งสอง รวมกัน** ไว้ก่อน (หมายเหตุของแฟ้มที่เก็บไว้อยู่ก่อน) หากรวมกันเกิน 2,000 ตัวอักษร ให้เลือกอย่างใดอย่างหนึ่ง (และแก้ไขภายหลังได้)
**ในเว็บไซต์:** เปิดผู้ป่วย ในแท็บ **ข้อมูล** คลิก **รวมกับผู้ป่วยอีกคน…** (เฉพาะแพทย์) ค้นหาอีกแฟ้มหนึ่ง (แฟ้มที่เก็บถาวรก็แสดงด้วย) เลือกแฟ้มที่จะเก็บไว้ใต้ **เก็บประวัตินี้ไว้** ทำเครื่องหมายค่าที่ต้องการเก็บในแต่ละช่องที่ต่างกัน แล้วคลิก **รวม** หากแฟ้มใดแฟ้มหนึ่งใช้แอป ให้ยืนยันด้วย **เป็นคนเดียวกัน** แต่ละแฟ้มแสดงวันเกิด เลขท้ายของหมายเลขโทรศัพท์ และวันที่เพิ่มหรือนำเข้า หากสลับแฟ้มที่จะเก็บไว้ ค่าที่คุณทำเครื่องหมายจะยังคงอยู่ หากสองแฟ้มมีชื่อเดียวกัน ในการยืนยันจะระบุด้วยสิ่งที่แตกต่างกัน เช่น วันเกิด
`open:patients`
`requires:merge-web-live`

---
## P13. Importar pacientes de outro sistema / Import patients from another system
**pt-BR**
A importação é feita no site (só o médico), a partir de uma planilha CSV ou Excel: a exportação do seu sistema anterior (iClinic e Prontuário Verde são reconhecidos automaticamente) ou o nosso modelo de planilha.
Os pacientes importados aparecem no app normalmente.
{pending:app-361-batch} No app (só médicos): em **Configurações → Integrações**, na seção **Importação**, **Importar pacientes** explica que a importação é feita pelo site, em um computador (solvymed.com → Pacientes → Importar pacientes). A lista de **Pacientes** vazia mostra "Vindo de outro sistema? Importe seus pacientes pelo site.".
**en**
The import is done on the website (doctor only), from a CSV or Excel spreadsheet: your previous system's export (iClinic and Prontuário Verde are recognised automatically) or our spreadsheet template.
Imported patients show up in the app as usual.
{pending:app-361-batch} In the app (doctors only): in **Settings → Integrations**, under **Import**, **Import patients** explains that importing is done on the website, on a computer (solvymed.com → Patients → Import patients). An empty **Patients** list shows "Coming from another system? Import your patients on the website.".
**No site:** Em **Pacientes**, clique em **Importar pacientes** e escolha o arquivo (ou baixe o **modelo de planilha**). Confira para onde vai cada coluna: as que não têm campo no SolvyMed ficam como **dados importados**, visíveis só para você; nome e sobrenome em colunas separadas viram o nome completo. Escolha o que fazer com **pacientes que já existem** (**Pular** ou **Preencher campos vazios**) e clique em **Verificar planilha**: aparece o resumo de novos, já existentes e com erro, e você pode baixar a lista de erros. Nada é salvo até você clicar em **Importar**. Por 24 horas, **Desfazer importação** remove os pacientes novos que ainda não foram editados nem usados; depois de sair da página, ele fica em **Importar pacientes**, no quadro **Última importação** (a importação mais recente). Pacientes inativos ou falecidos no sistema anterior entram como arquivados. Anos no calendário budista são convertidos automaticamente. Um CPF que perdeu o zero inicial no Excel (ficou com 9 ou 10 dígitos) é completado quando os dígitos verificadores conferem; se não conferirem, formate a coluna do CPF como Texto no Excel e exporte de novo.
**On the website:** In **Patients**, click **Import patients** and choose the file (or download the **spreadsheet template**). Check where each column goes: the ones with no SolvyMed field are kept as **imported data**, visible only to you; first and last name in separate columns become the full name. Choose what to do with **patients who already exist** (**Skip** or **Fill in empty fields**) and click **Check the spreadsheet**: you see how many are new, already exist or have errors, and you can download the error list. Nothing is saved until you click **Import**. For 24 hours, **Undo the import** removes the new patients that haven't been edited or used yet; after you leave the page, it's in **Import patients**, under **Last import** (the most recent import). Patients inactive or deceased in the previous system come in archived. Buddhist-era years are converted automatically. A CPF that lost its leading zero in Excel (left with 9 or 10 digits) is completed when its check digits match; if they don't, format the CPF column as Text in Excel and export again.
**No site:** {pending:patient-address-live} Em **Pacientes**, clique em **Importar pacientes** e escolha o arquivo (ou baixe o **modelo de planilha**). Confira para onde vai cada coluna: as que não têm campo no SolvyMed ficam como **dados importados**, visíveis só para você; nome e sobrenome em colunas separadas viram o nome completo. Escolha o que fazer com **pacientes que já existem** (**Pular** ou **Preencher campos vazios**) e clique em **Verificar planilha**: aparece o resumo de novos, já existentes e com erro, e você pode baixar a lista de erros. Nada é salvo até você clicar em **Importar**. Por 24 horas, **Desfazer importação** remove os pacientes novos que ainda não foram editados nem usados; depois de sair da página, ele fica em **Importar pacientes**, no quadro **Última importação** (a importação mais recente). Pacientes inativos ou falecidos no sistema anterior entram como arquivados. Anos no calendário budista são convertidos automaticamente. Um CPF que perdeu o zero inicial no Excel (ficou com 9 ou 10 dígitos) é completado quando os dígitos verificadores conferem; se não conferirem, formate a coluna do CPF como Texto no Excel e exporte de novo. O endereço (CEP, rua, número, complemento, bairro, cidade, UF) e o CNS também são importados; um CEP que perdeu o zero inicial no Excel é completado. As observações do sistema anterior ficam como dados importados.
**On the website:** {pending:patient-address-live} In **Patients**, click **Import patients** and choose the file (or download the **spreadsheet template**). Check where each column goes: the ones with no SolvyMed field are kept as **imported data**, visible only to you; first and last name in separate columns become the full name. Choose what to do with **patients who already exist** (**Skip** or **Fill in empty fields**) and click **Check the spreadsheet**: you see how many are new, already exist or have errors, and you can download the error list. Nothing is saved until you click **Import**. For 24 hours, **Undo the import** removes the new patients that haven't been edited or used yet; after you leave the page, it's in **Import patients**, under **Last import** (the most recent import). Patients inactive or deceased in the previous system come in archived. Buddhist-era years are converted automatically. A CPF that lost its leading zero in Excel (left with 9 or 10 digits) is completed when its check digits match; if they don't, format the CPF column as Text in Excel and export again. The address (postal code, street, number, complement, neighbourhood, city, state) and the CNS are imported too; a CEP that lost its leading zero in Excel is completed. The previous system's notes are kept as imported data.
Thai title: "นำเข้าผู้ป่วยจากระบบอื่น"
**th**
การนำเข้าทำในเว็บไซต์ (เฉพาะแพทย์) จากสเปรดชีต CSV หรือ Excel: ไฟล์ที่ส่งออกจากระบบเดิมของคุณ หรือแม่แบบสเปรดชีตของเรา
ผู้ป่วยที่นำเข้าจะแสดงในแอปตามปกติ
{pending:app-361-batch} ในแอป (เฉพาะแพทย์): ใน **การตั้งค่า → การเชื่อมต่อ** ใต้ **การนำเข้า** **นำเข้าผู้ป่วย** จะอธิบายว่าการนำเข้าทำในเว็บไซต์ บนคอมพิวเตอร์ (solvymed.com → ผู้ป่วย → นำเข้าผู้ป่วย) เมื่อรายการ **ผู้ป่วย** ว่างอยู่ จะแสดง "ย้ายมาจากระบบอื่น? นำเข้าผู้ป่วยได้ทางเว็บไซต์"
**ในเว็บไซต์:** ใน **ผู้ป่วย** คลิก **นำเข้าผู้ป่วย** แล้วเลือกไฟล์ (หรือ **ดาวน์โหลดแม่แบบสเปรดชีต** ซึ่งสำหรับคลินิกในประเทศไทยมีคอลัมน์เลขประจำตัวประชาชนและหนังสือเดินทาง) ตรวจสอบว่าแต่ละคอลัมน์จะไปอยู่ที่ช่องใด คอลัมน์ที่ไม่มีช่องใน SolvyMed จะเก็บไว้เป็น **ข้อมูลที่นำเข้า** ซึ่งเห็นได้เฉพาะคุณ ชื่อและนามสกุลที่อยู่คนละคอลัมน์จะรวมเป็นชื่อ-นามสกุล เลือกว่าจะทำอย่างไรกับ **ผู้ป่วยที่มีอยู่แล้ว** (**ข้าม** หรือ **เติมช่องที่ว่าง**) แล้วคลิก **ตรวจสอบสเปรดชีต**: คุณจะเห็นจำนวนผู้ป่วยใหม่ ที่มีอยู่แล้ว และที่มีข้อผิดพลาด และดาวน์โหลดรายการข้อผิดพลาดได้ จะยังไม่มีการบันทึกใดๆ จนกว่าคุณจะคลิกปุ่มนำเข้า ภายใน 24 ชั่วโมง **ย้อนการนำเข้า** จะลบผู้ป่วยใหม่ที่ยังไม่ได้แก้ไขหรือใช้งาน หลังจากออกจากหน้านี้ ปุ่มนี้อยู่ใน **นำเข้าผู้ป่วย** ใต้ **การนำเข้าครั้งล่าสุด** ผู้ป่วยที่ไม่ใช้งานหรือเสียชีวิตในระบบเดิมจะนำเข้าเป็นแฟ้มที่เก็บถาวร ปี พ.ศ. จะถูกแปลงเป็น ค.ศ. ให้อัตโนมัติ
**ในเว็บไซต์:** {pending:patient-address-live} ใน **ผู้ป่วย** คลิก **นำเข้าผู้ป่วย** แล้วเลือกไฟล์ (หรือ **ดาวน์โหลดแม่แบบสเปรดชีต** ซึ่งสำหรับคลินิกในประเทศไทยมีคอลัมน์เลขประจำตัวประชาชนและหนังสือเดินทาง) ตรวจสอบว่าแต่ละคอลัมน์จะไปอยู่ที่ช่องใด คอลัมน์ที่ไม่มีช่องใน SolvyMed จะเก็บไว้เป็น **ข้อมูลที่นำเข้า** ซึ่งเห็นได้เฉพาะคุณ ชื่อและนามสกุลที่อยู่คนละคอลัมน์จะรวมเป็นชื่อ-นามสกุล เลือกว่าจะทำอย่างไรกับ **ผู้ป่วยที่มีอยู่แล้ว** (**ข้าม** หรือ **เติมช่องที่ว่าง**) แล้วคลิก **ตรวจสอบสเปรดชีต**: คุณจะเห็นจำนวนผู้ป่วยใหม่ ที่มีอยู่แล้ว และที่มีข้อผิดพลาด และดาวน์โหลดรายการข้อผิดพลาดได้ จะยังไม่มีการบันทึกใดๆ จนกว่าคุณจะคลิกปุ่มนำเข้า ภายใน 24 ชั่วโมง **ย้อนการนำเข้า** จะลบผู้ป่วยใหม่ที่ยังไม่ได้แก้ไขหรือใช้งาน หลังจากออกจากหน้านี้ ปุ่มนี้อยู่ใน **นำเข้าผู้ป่วย** ใต้ **การนำเข้าครั้งล่าสุด** ผู้ป่วยที่ไม่ใช้งานหรือเสียชีวิตในระบบเดิมจะนำเข้าเป็นแฟ้มที่เก็บถาวร ปี พ.ศ. จะถูกแปลงเป็น ค.ศ. ให้อัตโนมัติ ที่อยู่ (รหัสไปรษณีย์ ถนน/ซอย บ้านเลขที่ อาคาร ชั้น ห้อง แขวง/ตำบล เขต/อำเภอ จังหวัด) นำเข้าได้ด้วย หมายเหตุจากระบบเดิมจะเก็บไว้เป็นข้อมูลที่นำเข้า
`open:patients`
`requires:patient-import-live`
---
## P14. Aviso para todos os pacientes / Send to Patients
**pt-BR**
Em **Início**, toque em **Enviar para Pacientes** (só o médico): escreva um **Título da Notificação** (até 100 caracteres) e uma **Mensagem** (até 500) e toque em **Enviar Notificação**. Ela é enviada aos pacientes conectados a você, e só recebe quem tem as notificações do SolvyMed ativadas; a mensagem não pode ficar em branco. Não inclua dados de pacientes. São no máximo 10 avisos a cada 24 horas.
**en**
On **Home**, tap **Send to Patients** (doctor only): write a **Notification Title** (up to 100 characters) and a **Message** (up to 500) and tap **Send Notification**. It goes to the patients connected to you, and only those with SolvyMed notifications on receive it; the message can't be blank. Don't include patient details. You can send at most 10 notices every 24 hours.
**No site:** Em **Visão geral**, clique em **Enviar para Pacientes** (só o médico): o mesmo título, mensagem e limites; **Enviar Notificação** só fica disponível com título e mensagem preenchidos.
**On the website:** On **Overview**, click **Send to Patients** (doctor only): the same title, message and limits; **Send Notification** is only available once both the title and the message are filled in.
Thai title: "ส่งถึงผู้ป่วย"
**th**
ใน **หน้าแรก** แตะ **ส่งถึงผู้ป่วย** (เฉพาะแพทย์): เขียน **หัวข้อการแจ้งเตือน** (ไม่เกิน 100 ตัวอักษร) และ **ข้อความ** (ไม่เกิน 500 ตัวอักษร) แล้วแตะ **ส่งการแจ้งเตือน** ข้อความจะส่งถึงผู้ป่วยที่เชื่อมต่อกับคุณ และจะได้รับเฉพาะผู้ที่เปิดการแจ้งเตือนของ SolvyMed ไว้ ข้อความต้องไม่ว่างเปล่า อย่าใส่ข้อมูลของผู้ป่วย คุณส่งได้ไม่เกิน 10 ครั้งทุก 24 ชั่วโมง
**ในเว็บไซต์:** ใน **ภาพรวม** คลิก **ส่งถึงผู้ป่วย** (เฉพาะแพทย์): หัวข้อ ข้อความ และขีดจำกัดเหมือนในแอป **ส่งการแจ้งเตือน** จะกดได้เมื่อกรอกทั้งหัวข้อและข้อความแล้วเท่านั้น
`open:home`
`requires:broadcast-live`
---
## P15. Documentos do paciente / Patient documents
**pt-BR**
A aba **Documentos** do paciente reúne exames, receitas, atestados e outros arquivos em pastas (as mesmas para todos os seus pacientes): **Comece aqui**, **Exames**, **Prescrições**, **Atestados e laudos**, **Termos** e **Documentos internos**. Ela substitui as abas Exames e Arquivos; os arquivos que já estavam lá aparecem em **Exames** ou em **Documentos internos**, sem compartilhar.
Ao adicionar um arquivo (PDF, JPG, PNG ou HEIC, até 20 MB), dê um **Título**, escolha a pasta e decida se quer **Compartilhar com o paciente**. Um documento compartilhado aparece para o paciente no app enquanto ele estiver conectado a você; ele recebe uma notificação com o seu nome, nunca com o título. **Documentos internos** nunca são compartilhados.
Em cada documento: **Abrir**, **Ocultar do paciente** (ou **Compartilhar com o paciente**), **Renomear**, **Mover para pasta** (mover para Documentos internos deixa de compartilhar) e **Remover**. Um arquivo que você enviou pode ser excluído nas primeiras 24 horas; depois disso, e para qualquer outro documento, **Remover** oculta com um motivo (também do paciente) e o documento fica guardado no prontuário.
Documentos **Enviado pelo paciente** chegam nas pastas em que você permite envios (Exames, de início); você recebe uma notificação só com o nome do paciente. Só você vê os documentos do paciente; secretárias(os) não têm acesso. Cada abertura fica no registro de acessos.
O paciente vê os documentos compartilhados no app e no site (**Minhas consultas → Documentos**), por médico e por pasta, e pode **Enviar documento** nas pastas que permitem envios (PDF, JPG, PNG ou HEIC, até 20 MB; até 10 por dia e 200 MB no total para cada médico). Ele pode remover um documento que enviou até você abri-lo, em até 24 horas; depois disso, o documento fica no prontuário. Se ele se desconectar de você ou encerrar a conta, deixa de ver os documentos, que continuam no seu prontuário.
{pending:patient-documents-live,app-1.8.0} No app, uma receita nova tem **Compartilhar com o paciente** (ligado de início): ao salvar, uma cópia em PDF vai para a pasta **Prescrições** do paciente. Uma cópia sem a sua assinatura desenhada traz "Cópia sem assinatura, para consulta do paciente."; uma edição ou uma correção da receita substitui a cópia, e o paciente vê **Atualizado em** (edição) ou **Corrigido em** (correção). Depois de salvar com o compartilhamento ligado, o app mostra **Compartilhando com o paciente…** e espera: o X e o voltar ficam bloqueados até o compartilhamento terminar; se falhar, o aviso oferece **Tentar de novo**. Se o seu espaço de documentos estiver cheio, a receita é salva mas não compartilhada.
**en**
The patient's **Documents** tab keeps exams, prescriptions, certificates and other files in folders (the same for all your patients): **Start here**, **Exams**, **Prescriptions**, **Certificates and reports**, **Consent terms** and **Internal documents**. It replaces the Exams and Files tabs; the files already there show in **Exams** or **Internal documents**, not shared.
When you add a file (PDF, JPG, PNG or HEIC, up to 20 MB), give it a **Title**, pick the folder and choose whether to **Share with the patient**. A shared document shows to the patient in the app while they are connected to you; they get a notification with your name, never the title. **Internal documents** are never shared.
On each document: **Open**, **Hide from the patient** (or **Share with the patient**), **Rename**, **Move to folder** (moving it to Internal documents stops sharing it) and **Remove**. A file you uploaded can be deleted within 24 hours; after that, and for any other document, **Remove** hides it with a reason (from the patient too) and the document stays in the record.
Documents **Sent by the patient** arrive in the folders where you allow uploads (Exams, to start with); you get a notification with the patient's name only. Only you see the patient's documents; secretaries have no access. Every opening is in the access log.
The patient sees the shared documents in the app and on the website (**My appointments → Documents**), by doctor and by folder, and can **Send a document** to the folders that allow uploads (PDF, JPG, PNG or HEIC, up to 20 MB; up to 10 a day and 200 MB in total for each doctor). They can remove a document they sent until you open it, within 24 hours; after that it stays in the record. If they disconnect from you or close their account, they no longer see the documents, which stay in your record.
{pending:patient-documents-live,app-1.8.0} In the app, a new prescription has **Share with the patient** (on by default): when you save, a PDF copy goes to the patient's **Prescriptions** folder. A copy without your drawn signature says "Unsigned copy, for the patient's reference."; an edit or a correction of the prescription replaces the copy, and the patient sees **Updated on** (an edit) or **Corrected on** (a correction). After saving with sharing on, the app shows **Sharing with the patient…** and waits: X and back are blocked until the share finishes; if it fails, the alert offers **Try again**. If your document storage is full, the prescription is saved but not shared.
**No site:** Abra o paciente e a aba **Documentos**. **Enviar** adiciona um arquivo: escolha o **Título**, **Enviar para a pasta** e **Compartilhar com o paciente**. Os botões de cada documento são os mesmos do app; **Remover** pede o motivo quando o documento não pode mais ser excluído.
**No site:** Ao salvar uma receita, ou um atestado, declaração ou solicitação de exames (aba **Receitas e documentos**), **Compartilhar com o paciente** (ligado) coloca uma cópia em PDF na pasta do paciente: receitas em **Receitas**, atestados e declarações em **Atestados e laudos**, solicitações de exames em **Exames**. A cópia diz "Cópia sem assinatura, para consulta do paciente." (no idioma do documento). Uma edição (nas primeiras 24 horas) ou uma correção substitui a cópia anterior: o paciente vê **Atualizado em** (edição) ou **Corrigido em** (correção), e na aba **Documentos** a cópia anterior fica como histórico, marcada **Substituído por uma cópia mais recente**; excluir o documento (nas primeiras 24 horas) também apaga a cópia do paciente. Enquanto a cópia é compartilhada, aparece **Compartilhando com o paciente…**: espere terminar antes de sair da página. A receita de controle especial nunca é compartilhada. Se o seu espaço de documentos estiver cheio, o documento é salvo, mas não compartilhado; se o compartilhamento falhar por outro motivo, **Tentar de novo** refaz a cópia.
**On the website:** Open the patient and the **Documents** tab. **Upload** adds a file: choose the **Title**, **Send to folder** and **Share with the patient**. Each document has the same buttons as in the app; **Remove** asks for a reason when the document can no longer be deleted.
**On the website:** When you save a prescription, or a certificate, declaration or exam request (**Prescriptions & documents** tab), **Share with the patient** (on) puts a PDF copy in the patient's folder: prescriptions in **Prescriptions**, certificates and declarations in **Certificates and reports**, exam requests in **Exams**. The copy says "Unsigned copy, for the patient's reference." (in the document's language). An edit (within 24 hours) or a correction replaces the earlier copy: the patient sees **Updated on** (an edit) or **Corrected on** (a correction), and in the **Documents** tab the earlier copy stays as history, marked **Replaced by a newer copy**; deleting the document (within 24 hours) also removes the patient's copy. While the copy is being shared, **Sharing with the patient…** shows: wait for it to finish before leaving the page. A special control prescription is never shared. If your document storage is full, the document is saved but not shared; if sharing fails for another reason, **Try again** makes the copy again.
`open:patients`
`requires:patient-documents-live`

---
## P16. Atestados, declarações e solicitações de exames / Certificates, declarations and exam requests
**pt-BR**
Na aba **Receitas e documentos** do paciente, **+ Documento** cria um documento clínico (só o médico). Os tipos seguem o país da clínica: no Brasil, **Atestado médico**, **Declaração médica**, **Solicitação de exames** e **Receita de controle especial (impressa)**; na Tailândia, **Atestado médico** (o modelo tailandês), **Declaração médica** e **Solicitação de exames**.
Escolha o **Idioma do documento** (muda os rótulos, a data e o calendário; o texto é você quem escreve) e preencha os campos. O atestado tailandês sai em tailandês ou inglês (o modelo do Conselho Médico existe nesses dois). O CID só entra no atestado se você marcar **Incluir CID** (só com o consentimento do paciente).
As datas são digitadas como dd/mm/aaaa, com o ano no calendário gregoriano (em tailandês, o ano budista aparece logo abaixo; um ano budista digitado não é aceito). No atestado tailandês, o fim do afastamento é preenchido pelos dias e pelo início, e pode ser alterado. Ao fechar o documento com alterações não salvas, aparece **Descartar alterações?** (**Descartar** / **Continuar editando**).
Receitas e documentos aparecem numa só lista, do mais novo ao mais antigo. **Baixar PDF** gera o documento. Você pode editar ou excluir um documento nas primeiras 24 horas; depois, use **Adicionar correção**: o original fica guardado junto com a correção.
Todo documento termina com a linha para a assinatura (e a sua assinatura, se salva), o seu nome como está no perfil e o seu registro profissional. Um registro só com números sai formatado: no Brasil "CRM 12345/SP" (com a UF da clínica); na Tailândia, o número da licença médica no idioma do documento. Com letras, ele sai como você digitou.
Se seu CRM for de outro estado, escolha o estado em **Configurações → Cadastros** (app) ou **Configurações → Perfil** (site).
A **Receita de controle especial** é só impressa: **Imprimir** abre a impressão das duas vias (se a janela de impressão não abrir, use **Abrir PDF** e imprima de lá); assine à mão e entregue as duas ao paciente. Ela precisa do CPF ou do passaporte do paciente.
Só você vê esses documentos; secretárias(os) não têm acesso. Cada PDF gerado fica registrado no **Registro de acessos**.
**en**
In the patient's **Prescriptions & documents** tab, **+ Document** creates a clinical document (doctors only). The types follow the practice country: in Brazil, **Medical certificate**, **Medical declaration**, **Exam request** and **Special control prescription (print)**; in Thailand, **Medical certificate** (the Thai form), **Medical declaration** and **Exam request**.
Choose the **Document language** (it changes the labels, the date and the calendar; you write the text) and fill in the fields. The Thai medical certificate is in Thai or English (the Medical Council form exists in those two). The ICD code is on a certificate only if you tick **Include ICD code** (only with the patient's consent).
Dates are typed as dd/mm/yyyy, in the Gregorian year (in Thai, the Buddhist-era year shows just below; a Buddhist-era year typed in isn't accepted). On the Thai medical certificate, the rest period's end date is filled from the days and the start, and can be changed. Closing a document with unsaved changes asks **Discard changes?** (**Discard** / **Keep editing**).
Prescriptions and documents are in one list, newest first. **Download PDF** creates the document. You can edit or delete a document within 24 hours; after that, use **Add correction**: the original is kept with the correction.
Every document ends with the signature line (and your signature, if saved), your name as it is in your profile and your professional registration. A registration of numbers only is formatted: in Brazil "CRM 12345/SP" (with the clinic's state); in Thailand, the medical licence number in the document's language. With letters, it shows as you typed it.
If your registration is from another state, choose the state in **Settings → Registrations** (app) or **Settings → Profile** (website).
The **Special control prescription** is print-only: **Print** opens the print dialog with both copies (if it doesn't open, use **Open PDF** and print from there); sign them by hand and give both to the patient. It needs the patient's CPF or passport.
Only you see these documents; secretaries have no access. Every PDF created is logged in the **Access log**.
Thai title: "ใบรับรองแพทย์ ใบรับรองการมาพบแพทย์ และใบส่งตรวจ"
**th**
ในแท็บ **ใบสั่งยาและเอกสาร** ของผู้ป่วย กด **+ เอกสาร** เพื่อสร้างเอกสารทางการแพทย์ (เฉพาะแพทย์) ประเภทเอกสารเป็นไปตามประเทศของคลินิก สำหรับคลินิกในประเทศไทยมี **ใบรับรองแพทย์** (แบบฟอร์มของไทย) **ใบรับรองการมาพบแพทย์** และ **ใบส่งตรวจ**
เลือก **ภาษาของเอกสาร** (ภาษาจะเปลี่ยนป้ายกำกับ วันที่ และปฏิทิน ส่วนข้อความคุณเป็นผู้เขียนเอง) แล้วกรอกข้อมูล ใบรับรองแพทย์ของไทยออกได้เป็นภาษาไทยหรือภาษาอังกฤษเท่านั้น (แบบฟอร์มของแพทยสภามีสองภาษานี้)
วันที่พิมพ์เป็น วว/ดด/ปปปป โดยใช้ปี ค.ศ. (ปี พ.ศ. จะแสดงอยู่ด้านล่าง และระบบไม่รับปีที่พิมพ์เป็น พ.ศ.) ในใบรับรองแพทย์ วันที่สิ้นสุดการพักรักษาตัวจะคำนวณจากจำนวนวันและวันที่เริ่ม และยังแก้ไขได้ หากปิดเอกสารที่ยังไม่ได้บันทึก ระบบจะถาม **ทิ้งการเปลี่ยนแปลงหรือไม่** (**ทิ้ง** / **แก้ไขต่อ**)
ใบสั่งยาและเอกสารอยู่ในรายการเดียวกัน เรียงจากใหม่ไปเก่า **ดาวน์โหลด PDF** จะสร้างเอกสาร คุณแก้ไขหรือลบเอกสารได้ภายใน 24 ชั่วโมง หลังจากนั้นให้ใช้ **เพิ่มรายการแก้ไข** โดยต้นฉบับจะยังเก็บไว้คู่กับรายการแก้ไข
เอกสารทุกฉบับปิดท้ายด้วยเส้นสำหรับลงชื่อ (และลายมือชื่อของคุณ หากบันทึกไว้) ชื่อของคุณตามโปรไฟล์ และเลขทะเบียนวิชาชีพ หากเลขทะเบียนเป็นตัวเลขล้วน จะแสดงเป็นเลขที่ใบอนุญาตประกอบวิชาชีพเวชกรรมในภาษาของเอกสาร หากมีตัวอักษร จะแสดงตามที่คุณพิมพ์
มีเพียงคุณที่เห็นเอกสารเหล่านี้ เลขานุการเข้าถึงไม่ได้ และทุกครั้งที่สร้าง PDF จะถูกบันทึกไว้ใน **บันทึกการเข้าถึง**
`open:patients`
`requires:clinical-documents-live`
