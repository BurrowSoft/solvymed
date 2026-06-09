/**
 * Minimal i18n module — no external dependencies.
 * Locale is detected once from the device's Intl settings.
 * To add a language: add a matching key block to `translations`.
 * To add a language picker later: expose a setLocale() that writes to AsyncStorage
 * and reloads the app (or use a React Context instead of the module-level const).
 */

function detectLocale(): string {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale;
    if (loc.startsWith('pt')) return 'pt-BR';
    return 'en';
  } catch {
    return 'pt-BR';
  }
}

export const locale: string = detectLocale();

// ─── Translation strings ──────────────────────────────────────────────────────

const en = {
  // Tabs
  'tab.home': 'Home',
  'tab.schedule': 'Schedule',
  'tab.patients': 'Patients',
  'tab.payments': 'Payments',
  'tab.settings': 'Settings',

  // Common actions
  'common.save': 'Save',
  'common.update': 'Update',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.close': 'Close',
  'common.apply': 'Apply',
  'common.seeAll': 'See all',
  'common.add': 'Add',
  'common.clear': 'Clear all',
  'common.loading': 'Loading…',
  'common.comingSoon': '{{feature}} is coming soon!',

  // Appointment status
  'status.scheduled': 'Scheduled',
  'status.confirmed': 'Confirmed',
  'status.completed': 'Completed',
  'status.cancelled': 'Cancelled',
  'status.blocked': 'Blocked',

  // Appointment type
  'apptType.online': 'Online',
  'apptType.inPerson': 'In-Person',

  // Home screen
  'home.morning': 'Good morning',
  'home.afternoon': 'Good afternoon',
  'home.evening': 'Good evening',
  'home.today': 'Today',
  'home.done': 'Done',
  'home.unpaid': 'Unpaid',
  'home.pendingAmount': 'Pending R$',
  'home.todayAppointments': "Today's Appointments",
  'home.recentPatients': 'Recent Patients',
  'home.allDone': 'All appointments completed',
  'home.noAppointments': 'No appointments today',
  'home.pendingPayments': '{{n}} pending payment',
  'home.pendingPayments_plural': '{{n}} pending payments',
  'home.toCollect': 'R$ {{amount}} to collect',

  // Schedule screen
  'schedule.newAppointment': 'New Appointment',
  'schedule.blockTime': 'Block time',
  'schedule.filters': 'Filters',
  'schedule.status': 'Status',
  'schedule.type': 'Type',
  'schedule.allTypes': 'All',
  'schedule.legend.scheduled': 'Scheduled',
  'schedule.legend.confirmed': 'Confirmed',
  'schedule.legend.completed': 'Completed',
  'schedule.legend.cancelled': 'Cancelled',
  'schedule.legend.blocked': 'Blocked',
  'schedule.day': 'Day',
  'schedule.week': 'Week',
  'schedule.viewDay': 'Day view',
  'schedule.viewWeek': 'Week view',

  // Appointment modal
  'appt.title': 'Appointment',
  'appt.delete': 'Delete appointment',
  'appt.deleteTitle': 'Delete appointment?',
  'appt.deleteMessage': 'This action cannot be undone.',
  'appt.sendConfirmation': 'Send confirmation',
  'appt.noPhoneAdd': 'No phone — add in patient profile',
  'appt.openWhatsapp': 'Open WhatsApp chat',
  'appt.call': 'Call {{phone}}',
  'appt.noPhone': 'No phone number',
  'appt.sharePaymentLink': 'Share payment link',
  'appt.generateInvoice': 'Generate invoice PDF',
  'appt.markPaid': 'Mark as paid',
  'appt.paid': 'Paid',
  'appt.setAmount': 'Set amount',
  'appt.details': 'Details',
  'appt.notes': 'Notes',
  'appt.status': 'Status',
  'appt.scheduledBy': 'Scheduled by: {{name}}',
  'appt.additionalItems': 'Additional Items',

  // Block time modal
  'block.title': 'Block Time',
  'block.reason': 'Reason (optional)',
  'block.reasonPlaceholder': 'e.g. Lunch break, Meeting…',

  // Patient list
  'patients.title': 'Patients',
  'patients.add': 'Add',
  'patients.searchPlaceholder': 'Search patient',
  'patients.noFound': 'No patients found',
  'patients.openProfile': 'Open profile',
  'patients.deletePatient': 'Delete patient',
  'patients.deleteConfirm': 'All their records will be permanently deleted.',
  'patients.filters': 'Filters',
  'patients.filter.sex': 'Sex',
  'patients.filter.all': 'All',
  'patients.filter.male': 'Male',
  'patients.filter.female': 'Female',
  'patients.filter.other': 'Other',

  // Patient detail
  'patients.recentAppts': 'Recent Appointments',
  'patients.noTags': 'No tags',
  'patients.noExams': 'No exams yet',
  'patients.ageField': 'Age',

  // Patient detail tabs
  'patients.tab.info': 'Patient Info',
  'patients.tab.records': 'Records',
  'patients.tab.prescriptions': 'Prescriptions',
  'patients.tab.exams': 'Exams',
  'patients.tab.appointments': 'Appointments',
  'patients.tab.files': 'Files',

  // Patient form
  'patients.form.title.new': 'New Patient',
  'patients.form.title.edit': 'Edit Patient',
  'patients.form.section.personal': 'Personal Information',
  'patients.form.section.contact': 'Contact',
  'patients.form.fullName': 'Full Name',
  'patients.form.fullNamePlaceholder': 'Full name',
  'patients.form.fullNameRequired': 'Full name is required',
  'patients.form.sex': 'Sex',
  'patients.form.male': 'Male',
  'patients.form.female': 'Female',
  'patients.form.other': 'Other',
  'patients.form.dob': 'Date of Birth',
  'patients.form.dobPlaceholder': 'YYYY-MM-DD',
  'patients.form.profession': 'Profession',
  'patients.form.professionPlaceholder': 'e.g. Engineer, Teacher…',
  'patients.form.phone': 'Phone',
  'patients.form.phonePlaceholder': '(11) 99999-9999',
  'patients.form.email': 'Email',
  'patients.form.emailPlaceholder': 'email@example.com',
  'patients.form.cpf': 'CPF',
  'patients.form.cpfPlaceholder': '000.000.000-00',
  'patients.form.tags': 'Tags',
  'patients.form.tagsPlaceholder': 'Add tag…',
  'patients.form.selectCountry': 'Select Country Code',
  'patients.form.saveFailed': 'Failed to save patient. Please try again.',

  // Medical records
  'records.noRecords': 'No records yet',
  'records.newRecord': 'New Record',
  'records.type.freeText': 'Free text',
  'records.type.soap': 'SOAP note',
  'records.type.followUp': 'Follow-up',
  'records.type.surgical': 'Surgical report',
  'records.type.referral': 'Referral',
  'records.contentPlaceholder': 'Write the medical record here…',
  'records.contentRequired': 'Record content cannot be empty',
  'records.saveFailed': 'Failed to save record. Please try again.',
  'records.unknown': 'Unknown',

  // Prescriptions
  'prescriptions.noPrescriptions': 'No prescriptions yet',
  'prescriptions.new': 'New Prescription',

  // Files
  'files.noFiles': 'No files uploaded yet',
  'files.upload': 'Upload file',
  'files.uploading': 'Uploading…',
  'files.downloadFailed': 'Could not open file.',

  // Appointments tab in patient detail
  'appts.noAppointments': 'No appointments yet',

  // Payments screen
  'payments.title': 'Payments',
  'payments.account': 'Payment Account',
  'payments.active': 'Active',
  'payments.inactive': 'Inactive',
  'payments.deactivate': 'Deactivate',
  'payments.activate': 'Activate',
  'payments.deactivateTitle': 'Deactivate account?',
  'payments.deactivateMessage': 'Deactivating will prevent new payment links from being generated.',
  'payments.activateTitle': 'Activate account?',
  'payments.activateMessage': 'Activate to enable payment links.',
  'payments.installmentLimit': 'Installment Limit',
  'payments.maxInstallments': 'Max {{n}} installment',
  'payments.maxInstallments_plural': 'Max {{n}} installments',
  'payments.pending': 'Pending',
  'payments.received': 'Received',
  'payments.markPaid': 'Mark paid',
  'payments.allUpToDate': 'All payments up to date',
  'payments.monthlyReport': 'Monthly Report',
  'payments.filter.week': 'This week',
  'payments.filter.month': 'This month',
  'payments.filter.lastMonth': 'Last month',
  'payments.filter.all': 'All time',
  'payments.appointment': '{{n}} appointment',
  'payments.appointment_plural': '{{n}} appointments',
  'payments.pendingInProgress': '{{n}} pending',
  'payments.pendingReport': '{{amount}} pending',

  // Settings screen
  'settings.title': 'Settings',
  'settings.signOut': 'Sign Out',
  'settings.group.profile': 'Profile',
  'settings.group.configuration': 'Configuration',
  'settings.group.support': 'Support',
  'settings.myProfile': 'My Profile',
  'settings.myClinic': 'My Clinic',
  'settings.procedures': 'Manage Procedures',
  'settings.workingHours': 'Working Hours',
  'settings.documentTemplates': 'Document Templates',
  'settings.integrations': 'Integrations',
  'settings.modules': 'Modules',
  'settings.help': 'Help',
  'settings.about': 'About SolvyMed',
  'settings.profilePlaceholder': 'Dr. Professional',
  'settings.profileSubPlaceholder': 'Complete your profile',
  'settings.group.procedures': 'My Procedures',
  'settings.registrations': 'Registrations',
  'settings.patientData': 'Patient Data',
  'settings.medicalRecords': 'Medical Records',
  'settings.documents': 'Documents',
  'settings.comingSoon': 'This feature is coming soon.',

  // MyClinic modal
  'clinic.title': 'My Clinic',
  'clinic.name': 'Clinic Name',
  'clinic.cnpj': 'CNPJ',
  'clinic.phone': 'Phone',
  'clinic.website': 'Website',
  'clinic.address': 'Street Address',
  'clinic.city': 'City',
  'clinic.state': 'State',
  'clinic.saveFailed': 'Failed to save. Please try again.',
  'clinic.infoSection': 'Clinic Information',
  'clinic.addressSection': 'Address',

  // Age units
  'age.year': '{{n}} yr',
  'age.years': '{{n}} yrs',
  'age.month': '{{n}} mo',
  'age.months': '{{n}} mo',
  'age.old': '{{age}} old',

  // Duration
  'duration.minutes': '{{n}}m',

  // New appointment modal
  'newAppt.title.new': 'New Appointment',
  'newAppt.title.edit': 'Edit Appointment',
  'newAppt.patient': 'Patient',
  'newAppt.patientPlaceholder': 'Select or enter a patient name',
  'newAppt.date': 'Date',
  'newAppt.datePlaceholder': 'YYYY-MM-DD',
  'newAppt.dateInvalid': 'Date must be YYYY-MM-DD',
  'newAppt.time': 'Start Time',
  'newAppt.duration': 'Duration (min)',
  'newAppt.type': 'Type',
  'newAppt.consultation': 'Consultation type',
  'newAppt.payment': 'Payment',
  'newAppt.private': 'Private',
  'newAppt.insurance': 'Insurance',
  'newAppt.amount': 'Amount (R$)',
  'newAppt.notes': 'Notes',
  'newAppt.notesPlaceholder': 'Optional notes…',
  'newAppt.recurrence': 'Recurrence',
  'newAppt.occurrences': 'Occurrences',
  'newAppt.additionalItems': 'Additional Items',
  'newAppt.addItem': '+ Add item',
  'newAppt.itemName': 'Item name',
  'newAppt.itemPrice': 'Price',
  'newAppt.noRepeat': 'No repeat',
  'newAppt.weekly': 'Weekly',
  'newAppt.biweekly': 'Biweekly',
  'newAppt.monthly': 'Monthly',
  'newAppt.online': 'Online',
  'newAppt.inPerson': 'In-Person',
  'newAppt.saveMultiple': 'Save ×{{n}}',
  'newAppt.patientRequired': 'Select or enter a patient name',
  'newAppt.saveFailed': 'Failed to save. Please try again.',
  'newAppt.dateTime': 'Date & Time',
  'newAppt.endsAt': 'Ends at: {{time}}',
  'newAppt.optional': '(optional)',
  'newAppt.procedureHint': 'Configure your procedures in Settings → My Procedures for quicker booking.',
  'newAppt.numberOfAppts': 'Number of appointments',
};

const ptBR: typeof en = {
  'tab.home': 'Início',
  'tab.schedule': 'Agenda',
  'tab.patients': 'Pacientes',
  'tab.payments': 'Pagamentos',
  'tab.settings': 'Configurações',

  'common.save': 'Salvar',
  'common.update': 'Atualizar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Excluir',
  'common.edit': 'Editar',
  'common.close': 'Fechar',
  'common.apply': 'Aplicar',
  'common.seeAll': 'Ver tudo',
  'common.add': 'Adicionar',
  'common.clear': 'Limpar tudo',
  'common.loading': 'Carregando…',
  'common.comingSoon': '{{feature}} em breve!',

  'status.scheduled': 'Agendado',
  'status.confirmed': 'Confirmado',
  'status.completed': 'Concluído',
  'status.cancelled': 'Cancelado',
  'status.blocked': 'Bloqueado',

  'apptType.online': 'Online',
  'apptType.inPerson': 'Presencial',

  'home.morning': 'Bom dia',
  'home.afternoon': 'Boa tarde',
  'home.evening': 'Boa noite',
  'home.today': 'Hoje',
  'home.done': 'Realizadas',
  'home.unpaid': 'A receber',
  'home.pendingAmount': 'Pendente',
  'home.todayAppointments': 'Consultas de hoje',
  'home.recentPatients': 'Pacientes recentes',
  'home.allDone': 'Todas as consultas realizadas',
  'home.noAppointments': 'Sem consultas hoje',
  'home.pendingPayments': '{{n}} pagamento pendente',
  'home.pendingPayments_plural': '{{n}} pagamentos pendentes',
  'home.toCollect': '{{amount}} a receber',

  'schedule.newAppointment': 'Nova consulta',
  'schedule.blockTime': 'Bloquear horário',
  'schedule.filters': 'Filtros',
  'schedule.status': 'Status',
  'schedule.type': 'Tipo',
  'schedule.allTypes': 'Todos',
  'schedule.legend.scheduled': 'Agendado',
  'schedule.legend.confirmed': 'Confirmado',
  'schedule.legend.completed': 'Concluído',
  'schedule.legend.cancelled': 'Cancelado',
  'schedule.legend.blocked': 'Bloqueado',
  'schedule.day': 'Dia',
  'schedule.week': 'Semana',
  'schedule.viewDay': 'Vista dia',
  'schedule.viewWeek': 'Vista semana',

  'appt.title': 'Consulta',
  'appt.delete': 'Excluir consulta',
  'appt.deleteTitle': 'Excluir consulta?',
  'appt.deleteMessage': 'Esta ação não pode ser desfeita.',
  'appt.sendConfirmation': 'Enviar confirmação',
  'appt.noPhoneAdd': 'Sem telefone — adicione no perfil do paciente',
  'appt.openWhatsapp': 'Abrir chat no WhatsApp',
  'appt.call': 'Ligar para {{phone}}',
  'appt.noPhone': 'Sem telefone',
  'appt.sharePaymentLink': 'Compartilhar link de pagamento',
  'appt.generateInvoice': 'Gerar recibo em PDF',
  'appt.markPaid': 'Marcar como pago',
  'appt.paid': 'Pago',
  'appt.setAmount': 'Definir valor',
  'appt.details': 'Detalhes',
  'appt.notes': 'Observações',
  'appt.status': 'Status',
  'appt.scheduledBy': 'Agendado por: {{name}}',
  'appt.additionalItems': 'Itens adicionais',

  'block.title': 'Bloquear horário',
  'block.reason': 'Motivo (opcional)',
  'block.reasonPlaceholder': 'ex: Almoço, Reunião…',

  'patients.title': 'Pacientes',
  'patients.add': 'Adicionar',
  'patients.searchPlaceholder': 'Buscar paciente',
  'patients.noFound': 'Nenhum paciente encontrado',
  'patients.openProfile': 'Abrir perfil',
  'patients.deletePatient': 'Excluir paciente',
  'patients.deleteConfirm': 'Todos os prontuários serão excluídos permanentemente.',
  'patients.filters': 'Filtros',
  'patients.filter.sex': 'Sexo',
  'patients.filter.all': 'Todos',
  'patients.filter.male': 'Masculino',
  'patients.filter.female': 'Feminino',
  'patients.filter.other': 'Outro',

  'patients.recentAppts': 'Consultas recentes',
  'patients.noTags': 'Sem tags',
  'patients.noExams': 'Nenhum exame ainda',
  'patients.ageField': 'Idade',

  'patients.tab.info': 'Dados do paciente',
  'patients.tab.records': 'Prontuários',
  'patients.tab.prescriptions': 'Receituários',
  'patients.tab.exams': 'Exames',
  'patients.tab.appointments': 'Consultas',
  'patients.tab.files': 'Arquivos',

  'patients.form.title.new': 'Novo Paciente',
  'patients.form.title.edit': 'Editar Paciente',
  'patients.form.section.personal': 'Dados Pessoais',
  'patients.form.section.contact': 'Contato',
  'patients.form.fullName': 'Nome completo',
  'patients.form.fullNamePlaceholder': 'Nome completo',
  'patients.form.fullNameRequired': 'Nome completo é obrigatório',
  'patients.form.sex': 'Sexo',
  'patients.form.male': 'Masculino',
  'patients.form.female': 'Feminino',
  'patients.form.other': 'Outro',
  'patients.form.dob': 'Data de nascimento',
  'patients.form.dobPlaceholder': 'AAAA-MM-DD',
  'patients.form.profession': 'Profissão',
  'patients.form.professionPlaceholder': 'ex: Engenheiro, Professor…',
  'patients.form.phone': 'Telefone',
  'patients.form.phonePlaceholder': '(11) 99999-9999',
  'patients.form.email': 'E-mail',
  'patients.form.emailPlaceholder': 'email@exemplo.com',
  'patients.form.cpf': 'CPF',
  'patients.form.cpfPlaceholder': '000.000.000-00',
  'patients.form.tags': 'Tags',
  'patients.form.tagsPlaceholder': 'Adicionar tag…',
  'patients.form.selectCountry': 'Selecionar código de país',
  'patients.form.saveFailed': 'Erro ao salvar paciente. Tente novamente.',

  'records.noRecords': 'Nenhum prontuário ainda',
  'records.newRecord': 'Novo prontuário',
  'records.type.freeText': 'Texto livre',
  'records.type.soap': 'SOAP',
  'records.type.followUp': 'Retorno',
  'records.type.surgical': 'Relatório cirúrgico',
  'records.type.referral': 'Encaminhamento',
  'records.contentPlaceholder': 'Escreva o prontuário aqui…',
  'records.contentRequired': 'O prontuário não pode estar vazio',
  'records.saveFailed': 'Erro ao salvar prontuário. Tente novamente.',
  'records.unknown': 'Desconhecido',

  'prescriptions.noPrescriptions': 'Nenhum receituário ainda',
  'prescriptions.new': 'Novo receituário',

  'files.noFiles': 'Nenhum arquivo enviado ainda',
  'files.upload': 'Enviar arquivo',
  'files.uploading': 'Enviando…',
  'files.downloadFailed': 'Não foi possível abrir o arquivo.',

  'appts.noAppointments': 'Nenhuma consulta ainda',

  'payments.title': 'Pagamentos',
  'payments.account': 'Conta de pagamento',
  'payments.active': 'Ativa',
  'payments.inactive': 'Inativa',
  'payments.deactivate': 'Desativar',
  'payments.activate': 'Ativar',
  'payments.deactivateTitle': 'Desativar conta?',
  'payments.deactivateMessage': 'Desativando, novos links de pagamento não serão gerados.',
  'payments.activateTitle': 'Ativar conta?',
  'payments.activateMessage': 'Ative para habilitar links de pagamento.',
  'payments.installmentLimit': 'Limite de parcelas',
  'payments.maxInstallments': 'Máx {{n}} parcela',
  'payments.maxInstallments_plural': 'Máx {{n}} parcelas',
  'payments.pending': 'A receber',
  'payments.received': 'Recebido',
  'payments.markPaid': 'Marcar como pago',
  'payments.allUpToDate': 'Todos os pagamentos em dia',
  'payments.monthlyReport': 'Relatório mensal',
  'payments.filter.week': 'Esta semana',
  'payments.filter.month': 'Este mês',
  'payments.filter.lastMonth': 'Mês passado',
  'payments.filter.all': 'Todo o período',
  'payments.appointment': '{{n}} consulta',
  'payments.appointment_plural': '{{n}} consultas',
  'payments.pendingInProgress': '{{n}} pendente',
  'payments.pendingReport': '{{amount}} pendente',

  'settings.title': 'Configurações',
  'settings.signOut': 'Sair',
  'settings.group.profile': 'Perfil',
  'settings.group.configuration': 'Configuração',
  'settings.group.support': 'Suporte',
  'settings.myProfile': 'Meu perfil',
  'settings.myClinic': 'Minha clínica',
  'settings.procedures': 'Gerenciar procedimentos',
  'settings.workingHours': 'Horário de atendimento',
  'settings.documentTemplates': 'Modelos de documentos',
  'settings.integrations': 'Integrações',
  'settings.modules': 'Módulos',
  'settings.help': 'Ajuda',
  'settings.about': 'Sobre o SolvyMed',
  'settings.profilePlaceholder': 'Dr(a). Profissional',
  'settings.profileSubPlaceholder': 'Complete seu perfil',
  'settings.group.procedures': 'Meus procedimentos',
  'settings.registrations': 'Cadastros',
  'settings.patientData': 'Dados do paciente',
  'settings.medicalRecords': 'Prontuários',
  'settings.documents': 'Documentos',
  'settings.comingSoon': 'Esta funcionalidade estará disponível em breve.',

  'clinic.title': 'Minha Clínica',
  'clinic.name': 'Nome da clínica',
  'clinic.cnpj': 'CNPJ',
  'clinic.phone': 'Telefone',
  'clinic.website': 'Site',
  'clinic.address': 'Endereço',
  'clinic.city': 'Cidade',
  'clinic.state': 'Estado',
  'clinic.saveFailed': 'Erro ao salvar. Tente novamente.',
  'clinic.infoSection': 'Dados da clínica',
  'clinic.addressSection': 'Endereço',

  'age.year': '{{n}} ano',
  'age.years': '{{n}} anos',
  'age.month': '{{n}} mês',
  'age.months': '{{n}} meses',
  'age.old': '{{age}}',

  'duration.minutes': '{{n}} min',

  'newAppt.title.new': 'Nova Consulta',
  'newAppt.title.edit': 'Editar Consulta',
  'newAppt.patient': 'Paciente',
  'newAppt.patientPlaceholder': 'Selecione ou digite o nome do paciente',
  'newAppt.date': 'Data',
  'newAppt.datePlaceholder': 'AAAA-MM-DD',
  'newAppt.dateInvalid': 'Data deve estar no formato AAAA-MM-DD',
  'newAppt.time': 'Horário de início',
  'newAppt.duration': 'Duração (min)',
  'newAppt.type': 'Tipo',
  'newAppt.consultation': 'Tipo de consulta',
  'newAppt.payment': 'Pagamento',
  'newAppt.private': 'Particular',
  'newAppt.insurance': 'Plano de saúde',
  'newAppt.amount': 'Valor (R$)',
  'newAppt.notes': 'Observações',
  'newAppt.notesPlaceholder': 'Observações opcionais…',
  'newAppt.recurrence': 'Recorrência',
  'newAppt.occurrences': 'Ocorrências',
  'newAppt.additionalItems': 'Itens adicionais',
  'newAppt.addItem': '+ Adicionar item',
  'newAppt.itemName': 'Nome do item',
  'newAppt.itemPrice': 'Valor',
  'newAppt.noRepeat': 'Sem repetição',
  'newAppt.weekly': 'Semanal',
  'newAppt.biweekly': 'Quinzenal',
  'newAppt.monthly': 'Mensal',
  'newAppt.online': 'Online',
  'newAppt.inPerson': 'Presencial',
  'newAppt.saveMultiple': 'Salvar ×{{n}}',
  'newAppt.patientRequired': 'Selecione ou digite o nome do paciente',
  'newAppt.saveFailed': 'Erro ao salvar. Tente novamente.',
  'newAppt.dateTime': 'Data e horário',
  'newAppt.endsAt': 'Término: {{time}}',
  'newAppt.optional': '(opcional)',
  'newAppt.procedureHint': 'Configure seus procedimentos em Configurações → Meus procedimentos.',
  'newAppt.numberOfAppts': 'Número de consultas',
};

const translations: Record<string, typeof en> = { en, 'pt-BR': ptBR };

/** Translate a key, optionally interpolating {{variable}} placeholders. */
export function t(key: keyof typeof en, vars?: Record<string, string | number>): string {
  const map = translations[locale] ?? en;
  let str: string = map[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/** Map a canonical record type string (stored in DB) to a localised display label. */
export function tRecordType(type: string): string {
  const map: Partial<Record<string, keyof typeof en>> = {
    'Free text': 'records.type.freeText',
    'SOAP note': 'records.type.soap',
    'Follow-up': 'records.type.followUp',
    'Surgical report': 'records.type.surgical',
    'Referral': 'records.type.referral',
  };
  const key = map[type];
  return key ? t(key) : type;
}

/** Pluralizing variant: picks key or key_plural based on count. */
export function tn(key: keyof typeof en, count: number, vars?: Record<string, string | number>): string {
  const pluralKey = `${key}_plural` as keyof typeof en;
  const map = translations[locale] ?? en;
  const base = count === 1
    ? (map[key] ?? en[key] ?? key)
    : (map[pluralKey] ?? en[pluralKey] ?? map[key] ?? en[key] ?? key);
  let str = base as string;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    }
  }
  return str.replace('{{n}}', String(count));
}
