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
  createdAt: string;
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
  professionalId: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  professionalId: string;
  date: string;
  time: string;
  content: string;
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

export interface Professional {
  id: string;
  fullName: string;
  email: string;
  clinicName?: string;
  specialty?: string;
}
