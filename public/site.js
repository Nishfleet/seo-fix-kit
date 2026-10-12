// Progressive enhancement for the worker-rendered public pages: turns the
// header nav into a disclosure menu on small screens. Without this script
// the nav stays visible and wraps, so nothing depends on it.
(() => {
  const button = document.querySelector("[data-site-menu]");
  const nav = button && document.getElementById(button.getAttribute("aria-controls"));
  if (!nav) return;

  function setOpen(open) {
    button.setAttribute("aria-expanded", String(open));
    nav.toggleAttribute("data-open", open);
  }

  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && button.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      button.focus();
    }
  });
  window.matchMedia("(min-width: 761px)").addEventListener("change", () => setOpen(false));
})();
