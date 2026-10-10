# Créditos de audio

## Música

La banda sonora y los temas musicales originales son de @llamakachera - Llama Kachera, con todos
los derechos reservados (ver [LICENSE](../../../../LICENSE)).

## Voces y efectos (ElevenLabs)

Las voces del anunciador y los efectos de `sfx/` se generaron con ElevenLabs el 9 de octubre de 2026,
con la cuenta paga del equipo (licencia de uso comercial del plan). Son audio sintético: no imitan
la voz de ninguna persona real ni de ningún personaje. El diseño, el guion completo y los prompts
están en [docs/audio-elevenlabs.md](../../../../docs/audio-elevenlabs.md).

- **Voz VELA**: diseñada con Voice Design (`eleven_ttv_v3`) a partir de una descripción propia
  y guardada en la biblioteca del equipo como «VELA · Stellar Impulse» (`GdnfUHQFx1a42tlgD8Mq`).
- **Frases**: `eleven_v4`, con `language_code` `es` o `en`. Se generaron 3 tomas por frase y se
  eligieron las que una transcripción local con Whisper confirmó palabra por palabra.
- **Paquete Analista** (`voice/analista/`): las mismas tomas de VELA con un procesado propio en
  ffmpeg (tono 3 % más grave, filtro comb corto, chorus y presencia en 2,5 kHz).
- **Procesado común**: recorte de silencios, filtro pasa-altos, normalización de sonoridad
  (voces a −16 LUFS, efectos por familia) con techo de −1 dBFS y codificación a MP3.

### Efectos

| Archivo | Prompt (`eleven_text_to_sound_v2`) | Generación |
| --- | --- | --- |
| `explosion-small-1` | Small starfighter exploding in space, a sharp metallic crack and hull crunch over a tight low thump with a quick crackle of debris, dry and short. | `ET5iLAFKJ3qBnixBtEq4` |
| `explosion-small-2` | Small starfighter exploding in space, a sharp metallic crack and hull crunch over a tight low thump with a quick crackle of debris, dry and short. | `lsNMq2JmcytNThVk4LQl` |
| `explosion-small-3` | Small starfighter exploding in space, a sharp metallic crack and hull crunch over a tight low thump with a quick crackle of debris, dry and short. | `bFuHDbkYS9PU3btjq8h0` |
| `explosion-large-1` | Large armored space structure exploding, a deep sub-bass boom with heavy steel tearing and a long rolling low rumble tail. | `Nft6b5FlF3FzA2pwkPVt` |
| `explosion-large-2` | Large armored space structure exploding, a deep sub-bass boom with heavy steel tearing and a long rolling low rumble tail. | `tkTqzKPnbgBUPT3ud5Mt` |
| `capture-own` | Single smooth rising crystalline synth shimmer swell with a soft airy tail. | `E1lLfhxSoKjMxUGWNLju` |
| `capture-rival-1` | Single detuned synth tone with a low electric buzz and a quick power-down fade. | `1lNCp6qAzjn7brDXf8Ic` |
| `capture-rival-2` | Single detuned synth tone with a low electric buzz and a quick power-down fade. | `KAcoElX5YFPkzeGUg0Uk` |
| `launch (capa 1)` | Heavy magnetic clamp releasing, a single sharp metallic clunk, dry. | `ep3JVdcv2Xe2yowSi8bH` |
| `launch (capa 2)` | Small spacecraft thruster igniting, a short rising whoosh with rough exhaust texture. | `tLlaBtbKejZpine9FBCC` |
| `alarm` | Single short electronic klaxon blast, an urgent mid-range tone with a hard metallic edge and an abrupt dry stop. | `BRkPFr6bPDEZ1mE97ae2` |
| `horn` | Deep capital ship horn blast, a low brassy synth drone swelling in and fading out with sub-bass resonance and a spacious metallic tail. | `g6Hp2REPGrZGSM7OS47E` |
| `victory` | Short bold rising synth brass chord, resolved and confident, with a warm sustained tail. | `2TgcWYoepfH2y1sjQrjk` |
| `defeat` | Low descending synth brass chord in a minor key over a fading sub-bass drone. | `ocX1k9rywCfxWZ1omskK` |

### Voces de VELA

| Archivo | Generación |
| --- | --- |
| `voice/es/start-1.mp3` | `kEMZmibF2frTMEJchnmd` |
| `voice/es/start-2.mp3` | `dXFjsAX3ZYtjr9fRkNdE` |
| `voice/en/start-1.mp3` | `1jsnbbr4jUmYRlycfg1x` |
| `voice/en/start-2.mp3` | `QFNg33tvXsOkEgS9iOIz` |
| `voice/es/ship-lost-1.mp3` | `h8GVL2IUtYR3nlfRLcMD` |
| `voice/es/ship-lost-2.mp3` | `8JvPPdyg9AFwhEIlUPQw` |
| `voice/es/ship-lost-3.mp3` | `Se88r2NpDj5Go8tYteJg` |
| `voice/en/ship-lost-1.mp3` | `dfKGxeAy1MsPWvjhtm4H` |
| `voice/en/ship-lost-2.mp3` | `wm8J0jj7Su1eiYAIW16I` |
| `voice/en/ship-lost-3.mp3` | `7scT4P2MhMIFzeldpRDz` |
| `voice/es/node-captured-1.mp3` | `ufdFlRUK6nSfL8NjCURp` |
| `voice/es/node-captured-2.mp3` | `UKxTJXnhraDen3Hm9Fsb` |
| `voice/en/node-captured-1.mp3` | `O3rPdlL0broJBtowUMpf` |
| `voice/en/node-captured-2.mp3` | `Mi0I5bqYKjAvoIUz2wjx` |
| `voice/es/node-lost-1.mp3` | `SBhh01A6oJeELESdSLSS` |
| `voice/es/node-lost-2.mp3` | `vT4up97UfBVWv4Qdags2` |
| `voice/en/node-lost-1.mp3` | `NMrvQJ8cBhBa0ZxnzW21` |
| `voice/en/node-lost-2.mp3` | `TBiHqkjksEJOagcNh4Et` |
| `voice/es/under-attack-1.mp3` | `6yHlMcX3UiZFuza85EG8` |
| `voice/es/under-attack-2.mp3` | `9pZ2Mt1QMSkUDp0kDwFP` |
| `voice/es/under-attack-3.mp3` | `6u4tfsqG1qpC7TPaVTjN` |
| `voice/en/under-attack-1.mp3` | `hSQOZBEd1BLaaROb8NXR` |
| `voice/en/under-attack-2.mp3` | `xdwNCiNOGHcjEdLPGMve` |
| `voice/en/under-attack-3.mp3` | `IJFsqiRkg9Yekx784gQc` |
| `voice/es/core-soon.mp3` | `Vq97yJANGeJpSQUUOrwe` |
| `voice/en/core-soon.mp3` | `nm9iEx4bfwTAb2fhSO99` |
| `voice/es/core-open-1.mp3` | `hC1sKiTaw6U0fRvHRY6r` |
| `voice/es/core-open-2.mp3` | `wyVq5dHiLHLA7nTeZlmI` |
| `voice/en/core-open-1.mp3` | `U8uu8qeKQgjlVTDDMskd` |
| `voice/en/core-open-2.mp3` | `DvmLIVBFbI0VOFL6lRZa` |
| `voice/es/core-own-capturing-1.mp3` | `gAColkQhnsWqAvKnEMx8` |
| `voice/es/core-own-capturing-2.mp3` | `XVio1cj4XxiPHJPmT9N2` |
| `voice/en/core-own-capturing-1.mp3` | `pTFHxN6Fp5QMxgXK4Xlg` |
| `voice/en/core-own-capturing-2.mp3` | `2MzYiI2f1lAn6zj4OuBz` |
| `voice/es/core-rival-capturing-1.mp3` | `5epLj2oi7exZmMtN0MqA` |
| `voice/es/core-rival-capturing-2.mp3` | `7yq5pxYZDJLkt1kS7Pry` |
| `voice/en/core-rival-capturing-1.mp3` | `wkmdhBoKhLokxxyMwffL` |
| `voice/en/core-rival-capturing-2.mp3` | `KfH1YZyhcmFe6iqscx2R` |
| `voice/es/victory-1.mp3` | `Dgr7REOOHPOW14m62FZR` |
| `voice/es/victory-2.mp3` | `ssT0c77y6oAdEpt32STx` |
| `voice/en/victory-1.mp3` | `1FpVTcMFNi8PkKGmKwn2` |
| `voice/en/victory-2.mp3` | `Xuk79yU4eeWK5oAeppcJ` |
| `voice/es/defeat-1.mp3` | `guS7Dq1xqqZzoMjdViiZ` |
| `voice/es/defeat-2.mp3` | `kFvwRzXRqS21EXxzBybc` |
| `voice/en/defeat-1.mp3` | `GpNETrrklhZ8LIy2mfkn` |
| `voice/en/defeat-2.mp3` | `oSYWxYqe4qEiDbwHRO9I` |
| `voice/es/base-under-attack-1.mp3` | `ZLBEysAVmA5USsa9IDf9` |
| `voice/es/base-under-attack-2.mp3` | `HLZw9WBoUnrFtKmhm8Ad` |
| `voice/es/base-under-attack-3.mp3` | `l5qUuX8DZh32ciGFY6V7` |
| `voice/en/base-under-attack-1.mp3` | `wGkbxgg7udKPMdsL3xMW` |
| `voice/en/base-under-attack-2.mp3` | `OilXUf28ST2HYT4ZBOQ2` |
| `voice/en/base-under-attack-3.mp3` | `AJuR9e63Siq7OhbcVX91` |
| `voice/es/base-hull-critical-1.mp3` | `88jEcZG8HWIxFLIZDP3K` |
| `voice/es/base-hull-critical-2.mp3` | `JQvOHBjBSK70c8DLQESf` |
| `voice/en/base-hull-critical-1.mp3` | `zgXVIRrqOx189fAzyze5` |
| `voice/en/base-hull-critical-2.mp3` | `zaxgCqdXqTG60CeMt0j4` |
| `voice/es/shields-down.mp3` | `Ow4vzyU0oqSdeLo2Gpvt` |
| `voice/en/shields-down.mp3` | `0MYxEnE58hvpokyXHFiw` |
| `voice/es/sudden-death.mp3` | `bphIptnkhMl79GC8ahOF` |
| `voice/en/sudden-death.mp3` | `CWXobl1QrCuM3A602yuW` |
| `voice/es/satellite-warning-1.mp3` | `JIekW7GD2K8RWzjD5GM5` |
| `voice/es/satellite-warning-2.mp3` | `LBYDQZyx3nunnszp6pD8` |
| `voice/en/satellite-warning-1.mp3` | `TjN463HUGWD8HFIaUsQS` |
| `voice/en/satellite-warning-2.mp3` | `VkCxemrjW2XGfgKOATLD` |
| `voice/es/nebula-advancing.mp3` | `S2DfXhyRmfo75n7N8QhI` |
| `voice/en/nebula-advancing.mp3` | `4j6R4O9Xm8HaxH3sWNsX` |
| `voice/es/belt-closing.mp3` | `UfdDNQFmH72XOVFlGeAc` |
| `voice/en/belt-closing.mp3` | `mSPsqolZAXNcSVgOUWIT` |
| `voice/es/core-guardian-down-1.mp3` | `9rxrBR1OAgyE9dO8yZAP` |
| `voice/es/core-guardian-down-2.mp3` | `5qNt9nnsQtExnfBuGdT2` |
| `voice/en/core-guardian-down-1.mp3` | `SKz1WUAyipiqONsSafjI` |
| `voice/en/core-guardian-down-2.mp3` | `IKqtsbwOubixVMI5Rgxj` |
| `voice/es/core-contested-1.mp3` | `uJiu99gCEBv5Cs9S2uoa` |
| `voice/es/core-contested-2.mp3` | `F2GAoRlwRXihT07hJ7Kg` |
| `voice/en/core-contested.mp3` | `0u4ZLCov8zcu2LUfOQxQ` |
| `voice/es/node-threatened.mp3` | `A7zzCEu5GTVbDtvhxNLo` |
| `voice/en/node-threatened-1.mp3` | `8ci4VpFnv5NroXKiZlcS` |
| `voice/en/node-threatened-2.mp3` | `pWndNbidCsFZ66lfoaok` |
| `voice/es/module-online-1.mp3` | `CRyaHs4owOnaBLxrMAoY` |
| `voice/es/module-online-2.mp3` | `W5ZwgqeEKqPalXBB0Dtu` |
| `voice/en/module-online-1.mp3` | `iedQvZvOPdD3RtMTuhBT` |
| `voice/en/module-online-2.mp3` | `3q8emzgKH9qEWmkb497f` |
| `voice/es/insufficient-metal-1.mp3` | `V9r2Crh3ZLgZZekcKQH8` |
| `voice/es/insufficient-metal-2.mp3` | `LF7m3MRL5cTGcUYoPjLp` |
| `voice/en/insufficient-metal-1.mp3` | `3c3sGve9hIptp0UvTm5J` |
| `voice/en/insufficient-metal-2.mp3` | `5MlkCLcC0xoig5b1evVn` |
| `voice/es/fleet-full-1.mp3` | `aPZzVEqT69ADp8Z8yMlg` |
| `voice/es/fleet-full-2.mp3` | `2qgM35cwi8Dyj0JjigDh` |
| `voice/en/fleet-full-1.mp3` | `GkXp71uPWIIYAY1YiNSc` |
| `voice/en/fleet-full-2.mp3` | `nh391R3uZSubRmR9l3WK` |
| `voice/es/order-denied-1.mp3` | `NQQRY3vH6n77O4lmbFHF` |
| `voice/es/order-denied-2.mp3` | `FueV0BZoPiW8A3CgBmg1` |
| `voice/en/order-denied-1.mp3` | `XAf0BPsOo19BsKa2Dgj8` |
| `voice/en/order-denied-2.mp3` | `h8xqFPuduFzPneV9khPB` |
| `voice/es/augment-offer.mp3` | `MX9iJcFDwPytLMrS6WPa` |
| `voice/en/augment-offer.mp3` | `SxNBvJpZbuL2XOyAZBme` |
| `voice/es/link-lost.mp3` | `Y4Oa2zXIQbiNteZZEaG8` |
| `voice/en/link-lost.mp3` | `ajE7dIi49d8E2e3fp9dm` |
| `voice/es/ship-ready-1.mp3` | `Naiveu79gsHNdXS5vEqi` |
| `voice/es/ship-ready-2.mp3` | `wPcDd1WCneN0isGCAesS` |
| `voice/es/ship-ready-3.mp3` | `Xrm8EY8KJGrAbh29VIsm` |
| `voice/en/ship-ready-1.mp3` | `DOM4WaHLe0xKCzPvguX4` |
| `voice/en/ship-ready-2.mp3` | `HI3czSRQsiq3MKLzmkDz` |
| `voice/en/ship-ready-3.mp3` | `vyeLBvFOEPtfU0o4R6FF` |
| `voice/es/station-captured.mp3` | `CPI0kDPPPINPPr5GrHUT` |
| `voice/en/station-captured.mp3` | `553tTgxtRCuIoAT1t9DF` |
| `voice/es/station-lost.mp3` | `WetW5NrrVoDTIRjMjZWT` |
| `voice/en/station-lost.mp3` | `314NY9Vnnb0sMJVlFqyn` |
| `voice/es/link-restored.mp3` | `vvlzVOQoNZJs28dCJxGB` |
| `voice/en/link-restored.mp3` | `odG6uHWlitPmENQL9UOQ` |

Los archivos de `voice/analista/` usan las mismas generaciones que su par en `voice/es` o `voice/en`.
