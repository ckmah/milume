export function mdSchemeIsDark(scheme: string | null): boolean | null {
  if (!scheme) return null;
  if (scheme === "default") return false;
  if (scheme === "slate") return true;
  return null;
}

function isWidgetThemeRoot(el: HTMLElement): boolean {
  return (
    el.classList.contains("landmarks") ||
    el.classList.contains("milume-widget") ||
    el.classList.contains("milume-recipe-studio-host") ||
    el.hasAttribute("data-theme") ||
    el.hasAttribute("data-mode") ||
    el.hasAttribute("data-md-color-scheme")
  );
}

export function resolveNotebookDark(node: HTMLElement | null): boolean {
  for (const n of [document.documentElement, document.body]) {
    const md = mdSchemeIsDark(n.getAttribute("data-md-color-scheme"));
    if (md != null) return md;
  }

  let el: HTMLElement | null = node;
  while (el) {
    if (
      el.classList.contains("dark") ||
      el.classList.contains("dark-theme") ||
      el.classList.contains("theme-dark") ||
      el.classList.contains("landmarks--dark")
    ) {
      return true;
    }
    if (
      el.classList.contains("landmarks--light") ||
      (isWidgetThemeRoot(el) &&
        (el.classList.contains("light") ||
          el.classList.contains("light-theme") ||
          el.classList.contains("theme-light")))
    ) {
      return false;
    }
    const theme = el.getAttribute("data-theme") ?? el.getAttribute("data-mode");
    if (theme === "dark") return true;
    if (theme === "light") return false;
    const md = mdSchemeIsDark(el.getAttribute("data-md-color-scheme"));
    if (md != null) return md;
    el = el.parentElement;
  }

  for (const n of [document.documentElement, document.body]) {
    if (
      n.classList.contains("dark") ||
      n.classList.contains("dark-theme") ||
      n.getAttribute("data-theme") === "dark" ||
      n.getAttribute("data-mode") === "dark"
    ) {
      return true;
    }
    if (
      n.classList.contains("light") ||
      n.classList.contains("light-theme") ||
      n.getAttribute("data-theme") === "light" ||
      n.getAttribute("data-mode") === "light"
    ) {
      return false;
    }
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
}
