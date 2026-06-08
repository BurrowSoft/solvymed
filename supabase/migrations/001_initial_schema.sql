-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Professionals (linked to Supabase auth users)
create table professionals (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  clinic_name text,
  specialty text,
  created_at timestamptz default now()
);

-- Patients
create table patients (
  id uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references professionals(id) on delete cascade,
  full_name text not null,
  cpf text,
  rg text,
  sex text check (sex in ('male', 'female', 'other')),
  birth_date date,
  profession text,
  email text,
  phone text,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Appointments
create table appointments (
  id uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references professionals(id) on delete cascade,
  patient_id uuid references patients(id) on delete set null,
  patient_name text not null default '',
  date date not null,
  start_time time not null,
  end_time time not null,
  duration_minutes int not null default 60,
  type text not null check (type in ('online', 'in-person')),
  consultation_type text not null default '',
  payment_type text not null check (payment_type in ('private', 'insurance')) default 'private',
  payment_amount numeric(10,2),
  payment_status text not null check (payment_status in ('pending', 'paid')) default 'pending',
  status text not null check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'blocked')) default 'scheduled',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Medical records
create table medical_records (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  date date not null,
  time time not null,
  content text not null,
  created_at timestamptz default now()
);

-- Prescriptions
create table prescriptions (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid not null references patients(id) on delete cascade,
  professional_id uuid not null references professionals(id) on delete cascade,
  date date not null,
  notes text,
  created_at timestamptz default now()
);

create table prescription_items (
  id uuid primary key default uuid_generate_v4(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  name text not null,
  dosage text not null,
  frequency text not null,
  duration text not null
);

-- Row Level Security
alter table professionals enable row level security;
alter table patients enable row level security;
alter table appointments enable row level security;
alter table medical_records enable row level security;
alter table prescriptions enable row level security;
alter table prescription_items enable row level security;

-- RLS Policies: professionals can only see their own data
create policy "professionals: own row" on professionals
  for all using (auth.uid() = id);

create policy "patients: own" on patients
  for all using (auth.uid() = professional_id);

create policy "appointments: own" on appointments
  for all using (auth.uid() = professional_id);

create policy "records: own" on medical_records
  for all using (auth.uid() = professional_id);

create policy "prescriptions: own" on prescriptions
  for all using (auth.uid() = professional_id);

create policy "prescription_items: via prescription" on prescription_items
  for all using (
    exists (
      select 1 from prescriptions p
      where p.id = prescription_id and p.professional_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger patients_updated_at before update on patients
  for each row execute function update_updated_at();

create trigger appointments_updated_at before update on appointments
  for each row execute function update_updated_at();
