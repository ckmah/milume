/** Sync marimo cell tokens and Landmarks dark mode with Zensical palette toggles. */
(function syncRecipeStudioTheme() {
  const host = document.querySelector(".milume-recipe-studio-host");
  if (!host) return;

  const apply = () => {
    const scheme =
      document.body.getAttribute("data-md-color-scheme") ||
      document.documentElement.getAttribute("data-md-color-scheme") ||
      "default";
    const dark = scheme === "slate";
    host.dataset.mdColorScheme = scheme;
    host.dataset.theme = dark ? "dark" : "light";
    host.classList.toggle("dark", dark);
    host.classList.toggle("light", !dark);
  };

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
  document.querySelectorAll('input[data-md-color-scheme]').forEach((input) => {
    input.addEventListener("change", () => requestAnimationFrame(apply));
  });
})();
