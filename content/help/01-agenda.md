# Help batch 1: Agenda (pt-BR + en)

---
## A1. Marcar uma consulta / Book an appointment
**pt-BR**
1. Toque no botão **+** (ou em **Nova consulta**).
2. Escolha o paciente (digite o nome para buscar) ou cadastre um novo.
3. Escolha a data, o horário e a duração.
4. Escolha o tipo (presencial ou online), o procedimento e o valor, se quiser.
5. Toque em **Salvar**.
Se o horário estiver bloqueado, o app mostra o bloqueio e pergunta se você quer agendar mesmo assim. Se já houver outra consulta no mesmo horário, não é possível salvar: o app diz com quem é e você escolhe outro horário.
{pending:mobile#91} Fora do horário de atendimento (ou num dia que não é de atendimento), o app também pergunta antes de agendar.
{pending:mobile#111,linked-bookings} Se o paciente tiver conta no SolvyMed, ele recebe uma notificação quando você agenda pelo app (também em consultas recorrentes). Horários bloqueados e consultas no passado não notificam.
{pending:linked-bookings} No site também: se o paciente tiver conta no SolvyMed, ele recebe uma notificação quando você agenda.
{pending:status-reason-live} No site, ao **Rejeitar** um pedido ou mudar uma consulta para **Cancelado**, você pode escrever um **Motivo (opcional)** de até 200 caracteres. No site (e no app a partir da versão 1.4.0), o paciente vê "Recusado pela clínica: …" ou "Cancelado pela clínica: …" na consulta dele (se foi ele quem cancelou, "Você cancelou"). Ao confirmar ou propor um horário, a **Mensagem ao paciente (opcional)** aparece para ele como "Mensagem da clínica: …". A notificação nunca traz o texto: só avisa que há uma mensagem da clínica.
{pending:status-reason-live,app-1.4.0} No app também: no pedido em **Início**, **Recusar** abre **Motivo (opcional)**, e **Confirmar** / **Propor** têm **Mensagem ao paciente (opcional)**; na **Agenda**, mudar para **Cancelada** ou **Recusada** abre o motivo. O paciente vê o mesmo que no site.
{pending:app-1.4.0,notice-queue-on} No app também: logo depois de marcar, remarcar ou cancelar, **Desfazer** aparece por 10 segundos, enquanto o aviso ao paciente ainda não saiu. Desfazer uma série remove a série inteira. Se o aviso já saiu ou a consulta mudou nesse meio-tempo, aparece "Não foi possível desfazer. Abra o item para ajustar."
**en**
1. Tap **+** (or **New appointment**).
2. Pick the patient (type the name to search) or add a new one.
3. Choose the date, time and duration.
4. Choose the type (in person or online), the procedure and the value, if you want.
5. Tap **Save**.
If the time is blocked, the app shows the block and asks whether to book anyway. If another appointment already takes that time, it can't be saved: the app says whose it is and you pick another time.
{pending:mobile#91} Outside the working hours (or on a day that isn't a working day), the app also asks before booking.
{pending:mobile#111,linked-bookings} If the patient has a SolvyMed account, they get a notification when you book in the app (recurring appointments too). Blocked time and past appointments don't notify.
{pending:linked-bookings} On the website too: if the patient has a SolvyMed account, they get a notification when you book.
{pending:status-reason-live} On the website, when you **Reject** a request or change an appointment to **Cancelled**, you can write a **Reason (optional)** of up to 200 characters. On the website (and in the app from version 1.4.0), the patient sees "Declined by the clinic: …" or "Cancelled by the clinic: …" on their appointment ("You cancelled" if they did). When you confirm or propose a time, the **Message to the patient (optional)** shows to them as "Message from the clinic: …". The notification never carries the text: it only says there's a message from the clinic.
{pending:status-reason-live,app-1.4.0} In the app too: on a request in **Home**, **Decline** opens **Reason (optional)**, and **Confirm** / **Propose** have **Message to the patient (optional)**; in the **Schedule**, changing to **Cancelled** or **Declined** opens the reason. The patient sees the same as on the website.
{pending:app-1.4.0,notice-queue-on} In the app too: right after you book, move or cancel, **Undo** shows for 10 seconds, while the notice to the patient hasn't gone out yet. Undoing a series removes the whole series. If the notice has already gone out or the appointment changed meanwhile, you see "Couldn't undo. Open the item to adjust it."
**No site:** {unless:notice-queue-on} Em **Agenda**, clique em **Nova Consulta** (também há o botão na **Visão geral**). Escolha o paciente, a data, o início, a duração, o tipo, o procedimento e a forma de pagamento (particular ou convênio), e clique em **Salvar Consulta**. O valor vem do procedimento escolhido.
**No site:** {pending:notice-queue-on} Em **Agenda**, clique em **Nova Consulta** (também há o botão na **Visão geral**). Escolha o paciente, a data, o início, a duração, o tipo, o procedimento e a forma de pagamento (particular ou convênio), e clique em **Salvar Consulta**. O valor vem do procedimento escolhido. Logo depois de marcar, remarcar ou cancelar, **Desfazer** aparece por 10 segundos, enquanto o aviso ao paciente ainda não saiu. Desfazer uma série remove a série inteira. Se o aviso já saiu ou a consulta mudou nesse meio-tempo, aparece "Não foi possível desfazer. Abra o item para ajustar."
**On the website:** {unless:notice-queue-on} In the **Schedule**, click **New Appointment** (there's also a button on the **Overview**). Choose the patient, date, start, duration, type, procedure and payment (private or insurance), and click **Save Appointment**. The amount comes from the chosen procedure.
**On the website:** {pending:notice-queue-on} In the **Schedule**, click **New Appointment** (there's also a button on the **Overview**). Choose the patient, date, start, duration, type, procedure and payment (private or insurance), and click **Save Appointment**. The amount comes from the chosen procedure. Right after you book, move or cancel, **Undo** shows for 10 seconds, while the notice to the patient hasn't gone out yet. Undoing a series removes the whole series. If the notice has already gone out or the appointment changed meanwhile, you see "Couldn't undo. Open the item to adjust it."
`open:new-appointment`

---
## A2. Consultas recorrentes / Recurring appointments
**pt-BR**
1. Em **Nova consulta**, preencha a primeira consulta.
2. Ative **Repetir** e escolha semanal, quinzenal ou mensal, e quantas vezes.
3. Toque em **Salvar**.
Se alguma das datas tiver conflito, nenhuma é salva, e o app mostra qual data conflita.
**en**
1. In **New appointment**, fill in the first appointment.
2. Turn on **Repeat** and choose weekly, every two weeks or monthly, and how many times.
3. Tap **Save**.
If any date conflicts, none are saved, and the app shows which date conflicts.
**No site:** Em **Nova Consulta**, escolha **Repetir** (semanal, a cada 2 semanas ou mensal) e **Quantas consultas** (de 2 a 52), e clique em **Salvar ×N**. Todas as datas são verificadas: se alguma conflitar com outra consulta, nenhuma é salva e o site mostra qual data; horário bloqueado ou fora do atendimento é perguntado uma vez, com a data.
**On the website:** In **New Appointment**, choose **Repeat** (weekly, every 2 weeks or monthly) and **Number of appointments** (2 to 52), and click **Save ×N**. Every date is checked: if any conflicts with another appointment, none is saved and the website shows which date; blocked time or outside the working hours is asked once, with the date.
`open:new-appointment`

---
## A3. Bloquear horários / Block time
**pt-BR**
1. Na **Agenda**, toque em **+** e escolha **Bloquear horário**.
2. Escolha a data e o período (início e fim).
3. Toque em **Salvar**.
Pacientes não conseguem pedir consultas em horários bloqueados. Você ainda pode agendar por cima, se precisar (o app pede confirmação).
**en**
1. In the **Schedule**, tap **+** and choose **Block time**.
2. Choose the date and the period (start and end).
3. Tap **Save**.
Patients can't request appointments in blocked time. You can still book over it if you need to (the app asks you to confirm).
**No site:** Em **Agenda**, clique em **Bloquear Horário**, escolha a data, o início e o fim, e salve.
**On the website:** In the **Schedule**, click **Block Time**, choose the date, start and end, and save.
`open:schedule`

---
## A4. Remarcar ou cancelar / Move or cancel an appointment
**pt-BR**
1. Na **Agenda**, toque na consulta.
2. Para remarcar: altere a data ou o horário e toque em **Salvar**.
3. Para cancelar: mude o status para **Cancelado**.
{pending:mobile#116} Consultas concluídas, canceladas ou com falta não mudam de data. Para uma consulta com falta, toque em **Nova consulta** na própria consulta: ela abre com o mesmo paciente, procedimento e duração.
{pending:mobile#111,linked-bookings} Se o paciente tiver conta no SolvyMed, ele recebe uma notificação quando você remarca ou cancela pelo app (também ao arquivar o paciente). Consultas no passado não notificam.
{pending:linked-bookings} No site também: se o paciente tiver conta no SolvyMed, ele recebe uma notificação quando você remarca ou cancela (ou arquiva o paciente). Consultas no passado não notificam.
{pending:app-1.4.0,notice-queue-on} No app também: logo depois de marcar, remarcar ou cancelar, **Desfazer** aparece por 10 segundos, enquanto o aviso ao paciente ainda não saiu. Desfazer uma série remove a série inteira. Se o aviso já saiu ou a consulta mudou nesse meio-tempo, aparece "Não foi possível desfazer. Abra o item para ajustar."
**en**
1. In the **Schedule**, tap the appointment.
2. To move it: change the date or time and tap **Save**.
3. To cancel it: change the status to **Cancelled**.
{pending:mobile#116} Completed, cancelled and missed appointments don't change date. For a missed one, tap **New appointment** on it: it opens with the same patient, procedure and duration.
{pending:mobile#111,linked-bookings} If the patient has a SolvyMed account, they get a notification when you move or cancel in the app (also when you archive the patient). Past appointments don't notify.
{pending:linked-bookings} On the website too: if the patient has a SolvyMed account, they get a notification when you move or cancel (or archive the patient). Past appointments don't notify.
{pending:app-1.4.0,notice-queue-on} In the app too: right after you book, move or cancel, **Undo** shows for 10 seconds, while the notice to the patient hasn't gone out yet. Undoing a series removes the whole series. If the notice has already gone out or the appointment changed meanwhile, you see "Couldn't undo. Open the item to adjust it."
**No site:** {unless:notice-queue-on} Para remarcar: em **Agenda**, clique no ícone **Remarcar** ao lado da consulta, escolha a nova data e o horário e clique em **Remarcar** (a duração e os outros dados continuam os mesmos). Uma consulta marcada como **Ausente** não é remarcada (a falta fica registrada): use o ícone **Nova consulta (mesmo paciente)** ao lado dela. Para cancelar: em **Agenda**, mude o status da consulta para **Cancelado**.
**No site:** {pending:notice-queue-on} Para remarcar: em **Agenda**, clique no ícone **Remarcar** ao lado da consulta, escolha a nova data e o horário e clique em **Remarcar** (a duração e os outros dados continuam os mesmos). Uma consulta marcada como **Ausente** não é remarcada (a falta fica registrada): use o ícone **Nova consulta (mesmo paciente)** ao lado dela. Para cancelar: em **Agenda**, mude o status da consulta para **Cancelado**. Logo depois de marcar, remarcar ou cancelar, **Desfazer** aparece por 10 segundos, enquanto o aviso ao paciente ainda não saiu. Desfazer uma série remove a série inteira. Se o aviso já saiu ou a consulta mudou nesse meio-tempo, aparece "Não foi possível desfazer. Abra o item para ajustar."
**On the website:** {unless:notice-queue-on} To move it: in the **Schedule**, click the **Reschedule** icon next to the appointment, choose the new date and time and click **Reschedule** (the duration and other details stay the same). An appointment marked **Absent** isn't moved (the no-show stays on record): use the **New appointment (same patient)** icon next to it. To cancel: in the **Schedule**, change the appointment's status to **Cancelled**.
**On the website:** {pending:notice-queue-on} To move it: in the **Schedule**, click the **Reschedule** icon next to the appointment, choose the new date and time and click **Reschedule** (the duration and other details stay the same). An appointment marked **Absent** isn't moved (the no-show stays on record): use the **New appointment (same patient)** icon next to it. To cancel: in the **Schedule**, change the appointment's status to **Cancelled**. Right after you book, move or cancel, **Undo** shows for 10 seconds, while the notice to the patient hasn't gone out yet. Undoing a series removes the whole series. If the notice has already gone out or the appointment changed meanwhile, you see "Couldn't undo. Open the item to adjust it."
`open:schedule`

---
## A5. Status das consultas / Appointment statuses
**pt-BR**
Agendado, Confirmado, Concluído, Cancelado, Atrasado, Ausente e Rejeitado. Toque na consulta e escolha o status. Consultas pedidas por pacientes aparecem como pedidos até você confirmar ou rejeitar.
**en**
Scheduled, Confirmed, Completed, Cancelled, Late, Absent and Rejected. Tap the appointment and choose the status. Appointments requested by patients show as requests until you confirm or reject them.
**No site:** Em **Agenda**, cada consulta da lista tem um seletor de status; escolha o novo status nele.
**On the website:** In the **Schedule**, each appointment in the list has a status selector; pick the new status there.
`open:schedule`

---
## A6. Pedidos de pacientes / Patient booking requests
**pt-BR**
1. Os pedidos aparecem em **Início**, em **Solicitações**.
2. Toque no pedido e escolha **Confirmar**, **Rejeitar** (com uma mensagem opcional) ou proponha **outro horário**.
3. O paciente recebe uma notificação com a sua resposta.
Um paciente novo que pediu pelo seu link fica ligado à sua clínica quando você confirma.
**en**
1. Requests show on **Home**, under **Requests**.
2. Tap the request and choose **Confirm**, **Reject** (with an optional note) or propose **another time**.
3. The patient gets a notification with your answer.
A new patient who requested through your link is connected to your clinic when you confirm.
**No site:** Os pedidos aparecem em **Agenda**, em **Solicitações de consulta**. Clique em **Confirmar**, **Rejeitar** ou **Propor novo horário** (dá para escrever uma mensagem ao paciente). Para um paciente novo, **Confirmar e Adicionar Paciente** já cria o cadastro.
**On the website:** Requests show in the **Schedule**, under **Booking Requests**. Click **Confirm**, **Reject** or **Propose new time** (you can add a note for the patient). For a new patient, **Confirm and Add New Patient** also creates their record.
`open:home`

---
## A7. Ver o dia, a semana ou o mês / Day, week and month views
**pt-BR**
Na **Agenda**, use os botões **Dia**, **Semana** e **Mês**. Use as setas para avançar ou voltar, e toque num dia do mês para abrir esse dia.
**en**
In the **Schedule**, use **Day**, **Week** and **Month**. Use the arrows to move forward or back, and tap a day in the month view to open that day.
**No site:** Igual, com **Dia**, **Semana** e **Mês**, as setas e **Hoje**; clique num dia do mês para abri-lo.
**On the website:** The same, with **Day**, **Week** and **Month**, the arrows and **Today**; click a day in the month view to open it.
`open:schedule`

---
## A8. Pedidos de remarcação do paciente / Patient reschedule requests
**pt-BR**
Quando um paciente pede para remarcar uma consulta confirmada, o pedido aparece em **Início**. **Aceitar** muda a consulta para o novo horário; **Recusar** mantém o horário original.
{pending:app-1.4.0} No app do paciente: ele só pode pedir remarcação antes do horário da consulta, e não cancela sozinho uma consulta marcada (o app diz "Para cancelar, fale com a clínica."). Ele pode cancelar um pedido que ainda está pendente, e aceitar ou recusar um novo horário que você propôs (o app mostra o horário proposto e, se for remarcação, o horário atual).
**en**
When a patient asks to reschedule a confirmed appointment, the request shows on **Home**. **Accept** moves the appointment to the new time; **Decline** keeps the original time.
{pending:app-1.4.0} In the patient's app: they can only ask to reschedule before the appointment starts, and they can't cancel a booked appointment themselves (the app says "To cancel, talk to the clinic."). They can cancel a request that's still pending, and accept or decline a new time you proposed (the app shows the proposed time and, for a reschedule, the current one).
**No site:** O pedido aparece em **Agenda**, em **Solicitações de consulta**, marcado **Remarcação solicitada**, com **Aceitar** e **Recusar**.
**On the website:** The request shows in the **Schedule**, under **Booking Requests**, marked **Reschedule Requested**, with **Accept** and **Decline**.
`open:home`
