import { Colors } from '@/constants/Colors';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors,
): string {
  return props.light ?? Colors[colorName] ?? '';
}
