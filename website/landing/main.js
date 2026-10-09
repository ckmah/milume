(() => {
  const buttons = document.querySelectorAll("[data-copy]");
  for (const button of buttons) {
    button.addEventListener("click", async () => {
      const selector = button.getAttribute("data-copy");
      const target = selector ? document.querySelector(selector) : null;
      const text = target?.textContent?.trim() ?? "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        button.dataset.copied = "true";
        button.textContent = "Copied";
        window.setTimeout(() => {
          button.dataset.copied = "false";
          button.textContent = "Copy";
        }, 1600);
      } catch {
        button.textContent = "Select & copy";
      }
    });
  }
})();
