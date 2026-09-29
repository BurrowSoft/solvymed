// The dashboard's appearance (Help C8, UX 36): Automático (the system
// setting, the default), Claro or Escuro, per browser in a cookie so the
// server renders the right theme with no flash. Print views and emails
// stay light always.
export type ThemeChoice = "auto" | "light" | "dark";
export const THEME_COOKIE = "sm_theme";

export function parseTheme(v: string | undefined | null): ThemeChoice {
  return v === "light" || v === "dark" ? v : "auto";
}
