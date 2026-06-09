import { t, tn, tRecordType, getLocale, setAppLocale } from '../../lib/i18n';

beforeEach(() => {
  setAppLocale('en');
});

// ─── getLocale / setAppLocale ─────────────────────────────────────────────────

describe('getLocale / setAppLocale', () => {
  it('returns the current locale', () => {
    setAppLocale('pt-BR');
    expect(getLocale()).toBe('pt-BR');
  });

  it('updates when called again', () => {
    setAppLocale('fr-FR');
    expect(getLocale()).toBe('fr-FR');
    setAppLocale('en');
    expect(getLocale()).toBe('en');
  });
});

// ─── t() ─────────────────────────────────────────────────────────────────────

describe('t()', () => {
  it('returns an English string for a known key', () => {
    expect(t('common.save')).toBe('Save');
  });

  it('returns a Portuguese string after locale change', () => {
    setAppLocale('pt-BR');
    expect(t('common.save')).toBe('Salvar');
  });

  it('returns a French string', () => {
    setAppLocale('fr-FR');
    expect(t('common.cancel')).toBe('Annuler');
  });

  it('returns a German string', () => {
    setAppLocale('de-DE');
    expect(t('common.cancel')).toBe('Abbrechen');
  });

  it('returns an Italian string', () => {
    setAppLocale('it-IT');
    expect(t('common.save')).toBe('Salva');
  });

  it('returns a Spanish string', () => {
    setAppLocale('es-ES');
    expect(t('common.save')).toBe('Guardar');
  });

  it('falls back to English for unknown locale', () => {
    setAppLocale('xx-XX' as any);
    expect(t('common.save')).toBe('Save');
  });

  it('interpolates a single variable', () => {
    expect(t('home.toCollect', { amount: 'R$ 100' })).toBe('R$ 100 to collect');
  });

  it('interpolates multiple variables', () => {
    setAppLocale('pt-BR');
    expect(t('home.toCollect', { amount: 'R$ 50' })).toBe('R$ 50 a receber');
  });

  it('handles missing variable gracefully (leaves placeholder)', () => {
    const result = t('home.toCollect');
    expect(result).toContain('{{amount}}');
  });

  it('returns the key itself if not found in any locale', () => {
    const result = t('nonexistent.key' as any);
    expect(result).toBe('nonexistent.key');
  });

  it('translates settings group labels for all locales', () => {
    const expected: Record<string, string> = {
      en: 'Scheduling',
      'pt-BR': 'Agendamento',
      'fr-FR': 'Planification',
      'de-DE': 'Terminplanung',
      'it-IT': 'Pianificazione',
      'es-ES': 'Programación',
    };
    for (const [locale, label] of Object.entries(expected)) {
      setAppLocale(locale as any);
      expect(t('settings.group.scheduling')).toBe(label);
    }
  });

  it('translates all 4 theme names in English', () => {
    expect(t('settings.theme.light')).toBe('Light');
    expect(t('settings.theme.dark')).toBe('Dark');
    expect(t('settings.theme.warm')).toBe('Warm');
    expect(t('settings.theme.ocean')).toBe('Ocean');
  });

  it('translates all 4 theme names in Portuguese', () => {
    setAppLocale('pt-BR');
    expect(t('settings.theme.light')).toBe('Claro');
    expect(t('settings.theme.dark')).toBe('Escuro');
    expect(t('settings.theme.warm')).toBe('Quente');
    expect(t('settings.theme.ocean')).toBe('Oceano');
  });
});

// ─── tn() ─────────────────────────────────────────────────────────────────────

describe('tn()', () => {
  it('uses the singular form for count = 1', () => {
    expect(tn('home.pendingPayments', 1)).toBe('1 pending payment');
  });

  it('uses the plural form for count > 1', () => {
    expect(tn('home.pendingPayments', 3)).toBe('3 pending payments');
  });

  it('uses the plural form for count = 0', () => {
    expect(tn('home.pendingPayments', 0)).toBe('0 pending payments');
  });

  it('interpolates count into the string', () => {
    expect(tn('payments.maxInstallments', 6)).toBe('Max 6 installments');
  });

  it('works in Portuguese', () => {
    setAppLocale('pt-BR');
    expect(tn('home.pendingPayments', 1)).toBe('1 pagamento pendente');
    expect(tn('home.pendingPayments', 2)).toBe('2 pagamentos pendentes');
  });

  it('falls back to singular when no plural key exists', () => {
    expect(tn('payments.appointment', 5)).toBe('5 appointments');
  });
});

// ─── tRecordType() ────────────────────────────────────────────────────────────

describe('tRecordType()', () => {
  it('translates known record types in English', () => {
    expect(tRecordType('Free text')).toBe('Free text');
    expect(tRecordType('SOAP note')).toBe('SOAP note');
    expect(tRecordType('Follow-up')).toBe('Follow-up');
    expect(tRecordType('Surgical report')).toBe('Surgical report');
    expect(tRecordType('Referral')).toBe('Referral');
  });

  it('translates known record types in Portuguese', () => {
    setAppLocale('pt-BR');
    expect(tRecordType('Free text')).toBe('Texto livre');
    expect(tRecordType('SOAP note')).toBe('SOAP');
    expect(tRecordType('Follow-up')).toBe('Retorno');
  });

  it('returns the raw type for unknown values', () => {
    expect(tRecordType('Custom Type')).toBe('Custom Type');
  });
});
