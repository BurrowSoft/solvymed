export type AppointmentType = 'online' | 'in-person';
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'blocked';
export type PaymentType = 'private' | 'insurance';
export type PaymentStatus = 'pending' | 'paid';

export interface Patient {
  id: string;
  fullName: string;
  cpf?: string;
  rg?: string;
  sex?: 'male' | 'female' | 'other';
  birthDate?: string;
  profession?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  photoUrl?: string;
  createdAt: string;
}

export interface Procedure {
  id: string;
  professionalId: string;
  name: string;
  durationMinutes: number;
  price?: number;
  paymentType: PaymentType;
  active: boolean;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  type: AppointmentType;
  consultationType: string;
  paymentType: PaymentType;
  paymentAmount?: number;
  paymentStatus: PaymentStatus;
  status: AppointmentStatus;
  notes?: string;
  extraItems?: AppointmentExtraItem[];
  scheduledBy?: string;
  professionalId: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  professionalId: string;
  date: string;
  time: string;
  content: string;
  recordType?: string;
  createdAt: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  professionalId: string;
  date: string;
  medications: PrescriptionItem[];
  notes?: string;
}

export interface PrescriptionItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface WorkingDay {
  enabled: boolean;
  start: string;
  end: string;
}

export type WorkingHoursKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type WorkingHours = Partial<Record<WorkingHoursKey, WorkingDay>>;

export interface Professional {
  id: string;
  fullName: string;
  email: string;
  photoUrl?: string;
  clinicName?: string;
  clinicCnpj?: string;
  clinicAddress?: string;
  clinicCity?: string;
  clinicState?: string;
  clinicPhone?: string;
  clinicWebsite?: string;
  specialty?: string;
  workingHours?: WorkingHours;
}

export interface AppointmentExtraItem {
  name: string;
  price?: number;
}

export interface PatientFile {
  name: string;
  storagePath: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export type DocumentType = 'prescription' | 'medical_record' | 'invoice';

export interface DocumentTemplate {
  id?: string;
  professionalId: string;
  documentType: DocumentType;
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  headerText?: string;
  footerText?: string;
}
