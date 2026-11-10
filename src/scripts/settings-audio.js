// Ajustes de la herramienta de audio.
import { FORMAT_MAP, hasAudioEncoder, isOutputFormatSupported } from "./audio.js";
import { t } from "./messages.js";
import { $ } from "./shared-ui.js";

const STORE = "audiolocal-settings";
const typeRadios = [...document.querySelectorAll('input[name="format"]')];
const qualityRadios = [...document.querySelectorAll('input[name="quality"]')];
const channelsSelect = $("channels");
const sampleRateSelect = $("sampleRate");
const normalizeSelect = $("normalize");
const keepSampleRateCheckbox = $("keepSampleRate");
let encoders = { ogg: false, aac: false }; // Formatos que este navegador codifica directo, sin tiempo real

function selectedFormat() {
  const type = typeRadios.find((radio) => radio.checked)?.value ?? "wav";
  if (type !== "mp3") return type;
  return `mp3_${qualityRadios.find((radio) => radio.checked)?.value ?? 256}`;
}

function setSelect(select, value) {
  if ([...select.options].some((option) => option.value === String(value))) select.value = value;
}

function checkRadio(radios, value) {
  const radio = radios.find((candidate) => candidate.value === value);
  if (radio) radio.checked = true;
}

export const audioSettings = {
  controls: [...typeRadios, ...qualityRadios, channelsSelect, sampleRateSelect, normalizeSelect, keepSampleRateCheckbox],

  get() {
    return {
      format: selectedFormat(),
      channels: Number(channelsSelect.value),
      sampleRate: Number(sampleRateSelect.value),
      normalize: normalizeSelect.value === "1",
      keepSampleRate: keepSampleRateCheckbox.checked,
      encoders,
    };
  },

  // Las claves son las del sitio anterior, para conservar las preferencias ya guardadas.
  save() {
    const settings = {
      mode: selectedFormat(),
      colors: channelsSelect.value,
      smooth: sampleRateSelect.value,
      normalize: normalizeSelect.value,
      keepSampleRate: keepSampleRateCheckbox.checked,
    };
    try {
      localStorage.setItem(STORE, JSON.stringify(settings));
    } catch (err) {
      console.warn("No se pudieron guardar las preferencias:", err);
    }
  },

  load() {
    try {
      const settings = JSON.parse(localStorage.getItem(STORE));
      if (settings) {
        const [type, quality] = String(settings.mode).split("_");
        checkRadio(typeRadios, type);
        checkRadio(qualityRadios, quality);
        setSelect(channelsSelect, settings.colors);
        setSelect(sampleRateSelect, settings.smooth);
        setSelect(normalizeSelect, settings.normalize);
        if (typeof settings.keepSampleRate === "boolean") keepSampleRateCheckbox.checked = settings.keepSampleRate;
      }
    } catch (err) {
      console.warn("No se pudieron cargar las preferencias guardadas:", err);
    }
    // Las páginas por conversión fijan el destino sin tocar las preferencias guardadas.
    checkRadio(typeRadios, document.querySelector("[data-preset]")?.dataset.preset);
  },

  async prepare() {
    encoders = { ogg: await hasAudioEncoder("opus"), aac: await hasAudioEncoder("mp4a.40.2") };
    for (const radio of typeRadios) {
      radio.disabled = radio.value !== "mp3" && !isOutputFormatSupported(radio.value) && !encoders[radio.value];
      if (!radio.disabled) continue;
      radio.closest("label").querySelector("[data-detail]").textContent = t.unavailableHere;
      if (radio.checked) checkRadio(typeRadios, "mp3");
    }
  },

  sync() {
    const formatInfo = FORMAT_MAP[selectedFormat()];
    const isMp3 = formatInfo.type === "mp3";
    const option96k = [...sampleRateSelect.options].find((option) => option.value === "96000");
    option96k.disabled = isMp3; // MP3 no admite más de 48 kHz
    if (isMp3 && sampleRateSelect.value === "96000") sampleRateSelect.value = "48000";
    sampleRateSelect.disabled = keepSampleRateCheckbox.checked || Boolean(formatInfo.realtime);
    $("qualityField").hidden = !isMp3;
    $("formatNote").hidden = !formatInfo.realtime || encoders[formatInfo.type];
  },
};
