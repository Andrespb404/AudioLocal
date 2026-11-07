// Script clásico aparte: si falla el módulo de la herramienta, este sigue funcionando y avisa en vez de dejar la página muerta.
addEventListener("load", () => {
  if (!document.body.dataset.state) document.getElementById("loadError").hidden = false;
});
