(() => {
  const groups = [...document.querySelectorAll("[data-nav-group]")];

  function setGroup(group, open) {
    group.querySelector("button").setAttribute("aria-expanded", String(open));
    group.toggleAttribute("data-open", open);
  }

  function closeGroups(except) {
    for (const group of groups) if (group !== except) setGroup(group, false);
  }

  for (const group of groups) {
    const trigger = group.querySelector("button");
    trigger.addEventListener("click", () => {
      const open = trigger.getAttribute("aria-expanded") !== "true";
      closeGroups(group);
      setGroup(group, open);
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-nav-group]")) closeGroups();
  });

  const button = document.querySelector("[data-site-menu]");
  const nav = button && document.getElementById(button.getAttribute("aria-controls"));

  function setOpen(open) {
    button.setAttribute("aria-expanded", String(open));
    nav.toggleAttribute("data-open", open);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openGroup = groups.find((group) => group.hasAttribute("data-open"));
    if (openGroup) {
      setGroup(openGroup, false);
      openGroup.querySelector("button").focus();
    } else if (nav && button.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      button.focus();
    }
  });

  if (!nav) return;
  button.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  window.matchMedia("(min-width: 761px)").addEventListener("change", () => {
    setOpen(false);
    closeGroups();
  });
})();
