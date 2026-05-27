(function () {
  function initNav() {
    var toggle = document.getElementById("navToggle");
    var links = document.getElementById("navLinks");
    if (toggle && links) {
      toggle.addEventListener("click", function () {
        toggle.classList.toggle("open");
        links.classList.toggle("open");
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();
