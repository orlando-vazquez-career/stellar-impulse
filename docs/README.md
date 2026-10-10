# Documentación del equipo

## Dossier de evaluación del hackathon

Documentación profesional con corte al **10 de octubre de 2026**. Los textos distinguen implementación, evidencia histórica, hipótesis comerciales y políticas por implementar. No declaran ingresos, auditorías o tracción sin respaldo.

```text
docs/
├── INFORME_EJECUTIVO.md
├── architecture/
│   ├── ARCHITECTURE.md
│   └── CONTRACTS_AND_DATA_FLOW.md
├── security/
│   ├── SECURITY.md
│   └── COMPLIANCE.md
└── business/
    ├── BUSINESS_MODEL.md
    ├── BUSINESS_PLAN.md
    ├── GO_TO_MARKET.md
    ├── ROADMAP.md
    ├── TOKENOMICS_FINANCE.md
    ├── ASSET_TYPES.md
    └── ASSET_REPORT.md
```

| Documento | Qué permite revisar |
|---|---|
| [Informe ejecutivo](INFORME_EJECUTIVO.md) | Propuesta, entrega, riesgos, economía y siguiente etapa |
| [Modelo de negocio](business/BUSINESS_MODEL.md) | Clientes, valor, monetización y unit economics |
| [Plan de negocio](business/BUSINESS_PLAN.md) | Responsables, operación, presupuesto y continuidad |
| [Go-to-market](business/GO_TO_MARKET.md) | Canales, experimentos, fases y KPIs |
| [Roadmap](business/ROADMAP.md) | Hackathon frente a producción; Q1–Q3 2027 y gates |
| [Economía y finanzas](business/TOKENOMICS_FINANCE.md) | Activos, escenarios, costos, sensibilidad y tesorería |
| [Tipos de activos](business/ASSET_TYPES.md) | Recursos, colecciones, méritos, transferibilidad y derechos |
| [Informe de activos](business/ASSET_REPORT.md) | Catálogo registrado, procedencia, evidencia y riesgos |
| [Seguridad](security/SECURITY.md) | Threat model, controles, secretos, acceso y auditoría |
| [Preparación de cumplimiento](security/COMPLIANCE.md) | Privacidad, derechos y condiciones previas a comercialización |
| [Arquitectura actual](architecture/ARCHITECTURE.md) | Componentes, autoridad, datos y límites operativos |
| [Contratos y flujos](architecture/CONTRACTS_AND_DATA_FLOW.md) | Interfaces, firmas, pagos, premios y secuencias |

**Lectura sugerida:** informe ejecutivo → modelo de negocio → arquitectura → seguridad → activos → go-to-market → roadmap → finanzas y plan operativo. Para evaluar afirmaciones técnicas, contrastar código, pruebas y registro de despliegue; los documentos no sustituyen aceptación de usuario o auditoría.

## Documentación de implementación y diseño

Los documentos siguientes conservan especificaciones y registros de diferentes etapas. Algunas descripciones de bootstrap son históricas; consultar fecha, código y el dossier actual antes de atribuirlas a la entrega.

1. [Producto y reglas](product.md): qué queremos construir y qué queda fuera.
2. [Instalación y desarrollo](development.md): arranque desde un clon limpio.
3. [Arquitectura](architecture.md): límites, mensajes y decisiones iniciales.
4. [Dirección visual](design.md): composición, estados y accesibilidad.
5. [Manual de marca](brand-manual.md): identidad, tokens, logo y aplicación por pantalla.
6. [Design system demostrativo](DESIGN-stellar-impulse.pdf): exportación visual de `DESIGN.md`.
7. [Estrategia](plans/strategy.md): hitos, capacidad, riesgos y recortes.
8. [Táctica](plans/tactics.md): tareas pequeñas con dependencias y aceptación.
9. [Stellar y contratos](blockchain.md): toolchain, alcance y modelo de amenazas.
10. [Pruebas y demo](testing.md): aceptación del bootstrap y del MVP.
11. [Estado](status.md): evidencia y pendientes, sin confundir plan con implementación.
12. [Mapas del campo de batalla](map-backend.md): cuadrícula, importación Tiled y vistas por jugador.
13. [Protocolo de la sala de campaña](protocol.md): conexión, mensajes, fases y reconexión.

14. [Formaciones, audio y niebla](formations-audio-fog.md): controles, alcance y regresiones.
15. [Audio con ElevenLabs](audio-elevenlabs.md): voz de a bordo VELA, guion, efectos y procesado.

El repositorio contiene todas las instrucciones necesarias para colaborar. No requiere
extensiones de editor, herramientas de agentes ni servicios privados de un integrante.

## Glosario

- **Tick**: paso discreto de simulación; propuesta inicial: 10 por segundo.
- **Vista**: proyección del estado que una conexión tiene permitido conocer.
- **Sector**: etapa de una campaña con economía y despliegue reiniciados.
- **Núcleo**: objetivo de captura habilitado después de apertura temporal y combate PvE.
- **Fragmento**: registro de victoria de sector y ventaja limitada en la siguiente elección.
- **Cosmético**: apariencia sin efectos sobre reglas ni estadísticas.
- **Testnet**: red de prueba; sus activos no representan pagos reales.
