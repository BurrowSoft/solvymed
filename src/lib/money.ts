// Appointment and procedure amounts are stored in BRL. Shown the way the
// dashboard and payments pages already show them ("R$ 150,00").
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(amount: number): string {
  return BRL.format(amount);
}
