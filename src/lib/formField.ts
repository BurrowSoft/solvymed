// Reads an uncontrolled field of a form by its id (auth pages, #332/#333).
// The inputs deliberately have NO name attribute: a submit before hydration
// (a slow load) is the browser's own GET to the page, and named fields
// would put their values, the password included, in the URL (3e). Without
// names that submit carries nothing, and the forms are method="post" too,
// so it's never a GET (9a). form.elements also covers a field outside the
// <form> joined by its form="…" attribute.
export function fieldValue(form: HTMLFormElement, id: string): string {
  const el = form.elements.namedItem(id);
  return el instanceof HTMLInputElement ? el.value : "";
}
