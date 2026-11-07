// Ajustes de la herramienta de video.
import { t } from "./messages.js";
import { $ } from "./shared-ui.js";

const STORE = "audiolocal-video";
const containerRadios = [...document.querySelectorAll('input[name="videoContainer"]')];
const qualityRadios = [...document.querySelectorAll('input[name="videoQuality"]')];
const heightSelect = $("videoHeight");

const checked = (radios) => radios.find((radio) => radio.checked)?.value;

function checkRadio(radios, value) {
  const radio = radios.find((candidate) => candidate.value === value);
  if (radio) radio.checked = true;
}

export const videoSettings = {
  controls: [...containerRadios, ...qualityRadios, heightSelect],

  get() {
    return { container: checked(containerRadios), quality: checked(qualityRadios), height: Number(heightSelect.value) };
  },

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify(this.get()));
    } catch (err) {
      console.warn("No se pudieron guardar las preferencias:", err);
    }
  },

  load() {
    try {
      const settings = JSON.parse(localStorage.getItem(STORE));
      if (settings) {
        checkRadio(containerRadios, settings.container);
        checkRadio(qualityRadios, settings.quality);
        if ([...heightSelect.options].some((option) => option.value === String(settings.height))) heightSelect.value = settings.height;
      }
    } catch (err) {
      console.warn("No se pudieron cargar las preferencias guardadas:", err);
    }
    // Las páginas por conversión fijan el destino sin tocar las preferencias guardadas.
    const preset = document.querySelector("[data-preset]")?.dataset;
    checkRadio(containerRadios, preset?.preset);
    checkRadio(qualityRadios, preset?.presetQuality);
  },

  async prepare() {
    const { availableContainers } = await import("./video.js");
    const available = await availableContainers();
    for (const radio of containerRadios) {
      radio.disabled = !available[radio.value];
      if (radio.disabled) radio.closest("label").querySelector("[data-detail]").textContent = t.unavailableHere;
    }
    if (containerRadios.find((radio) => radio.checked)?.disabled) {
      const usable = containerRadios.find((radio) => !radio.disabled);
      if (usable) usable.checked = true;
    }
    // Sin codificadores aún se puede copiar el video a otro contenedor, por eso solo se avisa.
    $("videoNote").hidden = containerRadios.some((radio) => !radio.disabled);
  },

  sync() {},
};
