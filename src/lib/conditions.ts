import conditions from "../../content/help/conditions.json";

// The shared "is it true yet?" registry (content/help/conditions.json):
// the Help build, the App Map and legal pages (the privacy policy's
// SolvyAI / LINE blocks) all read the same flags, so text never goes live
// before the feature does.
export type ConditionId = keyof typeof conditions;
export function conditionMet(id: ConditionId): boolean {
  return conditions[id].met === true;
}
