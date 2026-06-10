import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';
import { DocumentTemplate, DocumentType } from './types';

export const DEFAULT_TEMPLATE: Omit<DocumentTemplate, 'professionalId' | 'documentType'> = {
  primaryColor: '#208AEF',
  accentColor: '#E8F4FE',
};

function toDocumentTemplate(row: Record<string, unknown>): DocumentTemplate {
  return {
    id: row.id as string,
    professionalId: row.professional_id as string,
    documentType: row.document_type as DocumentType,
    primaryColor: (row.primary_color as string) ?? '#208AEF',
    accentColor: (row.accent_color as string) ?? '#E8F4FE',
    logoUrl: (row.logo_url as string) || undefined,
    headerText: (row.header_text as string) || undefined,
    footerText: (row.footer_text as string) || undefined,
  };
}

export async function getTemplate(
  professionalId: string,
  documentType: DocumentType,
): Promise<DocumentTemplate> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('document_type', documentType)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_TEMPLATE, professionalId, documentType };
  }
  return toDocumentTemplate(data);
}

export async function getAllTemplates(
  professionalId: string,
): Promise<Partial<Record<DocumentType, DocumentTemplate>>> {
  const { data, error } = await supabase
    .from('document_templates')
    .select('*')
    .eq('professional_id', professionalId);

  if (error) return {};
  const result: Partial<Record<DocumentType, DocumentTemplate>> = {};
  for (const row of data ?? []) {
    result[row.document_type as DocumentType] = toDocumentTemplate(row);
  }
  return result;
}

export async function saveTemplate(template: DocumentTemplate): Promise<void> {
  const { error } = await supabase.from('document_templates').upsert(
    {
      professional_id: template.professionalId,
      document_type: template.documentType,
      primary_color: template.primaryColor,
      accent_color: template.accentColor,
      logo_url: template.logoUrl ?? null,
      header_text: template.headerText ?? null,
      footer_text: template.footerText ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'professional_id,document_type' },
  );
  if (error) throw error;
}

export async function uploadLogo(
  professionalId: string,
  documentType: DocumentType,
  uri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${professionalId}/${documentType}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const { error } = await supabase.storage
    .from('document-logos')
    .upload(path, bytes, { upsert: true, contentType: mimeType });

  if (error) throw error;

  const { data } = supabase.storage.from('document-logos').getPublicUrl(path);
  // Append cache buster so the PDF preview reflects the latest upload immediately
  return `${data.publicUrl}?t=${Date.now()}`;
}
