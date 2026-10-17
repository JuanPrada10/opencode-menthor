<div align="center">

# 🧠 Menthor for OpenCode

**Tu mentor técnico y compañero pedagógico para aprender a programar construyendo software real, sin que la IA escriba el código por ti.**

[![npm version](https://img.shields.io/npm/v/opencode-menthor.svg?color=38bdf8&style=flat-square)](https://www.npmjs.com/package/opencode-menthor)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399.svg?style=flat-square)](LICENSE)
[![OpenCode V2 Compatible](https://img.shields.io/badge/OpenCode-V2%20Compatible-818cf8.svg?style=flat-square)](https://opencode.ai)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-fbbf24.svg?style=flat-square)](https://nodejs.org)

[Características](#-características-principales) •
[Para quién es](#-para-quién-es) •
[Instalación](#-instalación) •
[Cómo Funciona](#-cómo-funciona) •
[Menthor Studio](#-menthor-studio-dashboard-en-vivo)

</div>

---

## 💡 ¿Qué es Menthor?

Los asistentes de programación actuales suelen cometer el mismo error formativo: **te resuelven el código de inmediato**. Cuando la IA programa por ti, tu comprensión se desvanece, pierdes la práctica motriz del lenguaje y te vuelves dependiente de la generación automática.

**Menthor** cambia completamente el paradigma:
- Actúa como un **Tech Lead y profesor particular**.
- **Tiene prohibido implementar las soluciones por ti** o entregarte código para copiar y pegar.
- Te guía socráticamente con **pistas graduales**, analogías didácticas y un **visor web en tiempo real** (*Menthor Studio*) que sincroniza tus criterios de aceptación, sintaxis de referencia y tu bitácora de aprendizaje.

---

## 🎯 ¿Para quién es?

- 🎓 **Estudiantes y Bootcamperos**: que quieren resolver proyectos reales con la tranquilidad de tener un mentor experto guiándolos paso a paso sin regalarles la solución.
- 🚀 **Desarrolladores Junior y Autodidactas**: que buscan entender la arquitectura, tomar decisiones fundamentadas y superar bloqueos cognitivos sin frustración.
- 🛠️ **Desarrolladores experimentados aprendiendo un nuevo stack**: para asimilar la sintaxis y modismos de un nuevo lenguaje practicándolo ellos mismos.

---

## ✨ Características Principales

### 1. 🛡️ Blindaje Pedagógico y Restricciones Estrictas
- **Cero código completo**: Menthor no genera funciones ni módulos terminados del proyecto.
- **Inmunidad a la urgencia**: Aunque pidas *"resuélvemelo rápido que tengo una entrega"*, Menthor mantendrá la disciplina pedagógica para asegurar tu aprendizaje.
- **Modelado sintáctico proactivo (Dominio Ajeno)**: Cuando necesitas refrescar sintaxis, Menthor te ofrece un modelo anatómico breve utilizando un dominio totalmente ajeno a tu proyecto (naves espaciales, fauna o fantasía), asegurando que aprendas la estructura sin copiar la solución algorítmica.

### 2. 🪜 Andamiaje Progresivo en 3 Niveles
Si te quedas bloqueado, no te deja a la deriva:
1. **Nivel 1 (Concepto)**: Pista socrática sobre el principio teórico o método nativo.
2. **Nivel 2 (Estrategia)**: Explicación de la arquitectura o pasos lógicos en lenguaje conversacional.
3. **Nivel 3 (Plantilla)**: Sintaxis mínima orientativa en dominio neutro.

### 3. 🖥️ Menthor Studio (Dashboard Web en Tiempo Real)
Una interfaz web oscura, limpia y sin distracciones que se levanta automáticamente en `http://localhost:4567`:
- **Flujo Guiado Continuo**: Vista centrada verticalmente en la tarea activa.
- **Checklist Interactivo**: Criterios de aceptación con micro-interacciones hápticas y animación de celebración al completar la tarea.
- **Sticky Progress Bar**: Navegación flotante al hacer scroll con seguimiento de progreso en vivo.
- **Visor de Código estilo IDE**: Resaltado sintáctico, números de línea en gutter atenuado y botón de copiado animado.
- **Sincronización SSE bidireccional**: Cualquier cambio en tu proyecto o en tu bitácora se refleja de inmediato en el navegador.

### 4. 📝 Bitácora Viva (`LEARNING.md`)
Menthor mantiene un registro documental en la raíz de tu proyecto:
- **Competencias Demostradas**: Registro acumulativo de habilidades que ya dominas.
- **Conceptos por Reforzar**: Temas que generaron dudas para repasarlos luego.
- **Bloque Gestionado de Tarea**: Persistencia atómica de criterios, pistas y código de referencia sin alterar el resto del documento.

---

## 📦 Instalación

### Opción 1: Vía npm (Recomendada)

Agrega el paquete a tu configuración de OpenCode (`~/.config/opencode/opencode.jsonc` o `opencode.jsonc` de tu proyecto):

```jsonc
{
  "plugins": [
    "opencode-menthor"
  ]
}
```

O si utilizas el gestor de paquetes de OpenCode:

```bash
opencode plugin install opencode-menthor
```

### Opción 2: Directo desde GitHub

También puedes cargarlo directamente desde el repositorio:

```jsonc
{
  "plugins": [
    "github:juandacor/opencode-menthor"
  ]
}
```

---

## 🚀 Cómo Funciona

Una vez instalado, el plugin se registra automáticamente en OpenCode.

### 1. Iniciar con Menthor
Puedes hablar con él seleccionando el agente **Menthor** en OpenCode o usando el comando rápido:

```bash
/menthor
```

### 2. Detección Inteligente de Escenarios
Menthor inspecciona el estado de tu espacio de trabajo:
- **Proyecto existente con `LEARNING.md`**: Retoma exactamente donde lo dejaste sin preguntas repetitivas.
- **Proyecto existente sin `LEARNING.md`**: Analiza tu código en modo lectura, comprende el stack y te propone continuar desde el punto adecuado.
- **Directorio vacío**: Te ayuda a conceptualizar un MVP pequeño y alcanzable y define la primera tarea formativa.

### 3. El Ciclo de Aprendizaje
```
   Contextualizar ➔ Definir Tarea ➔ Preparar ➔ Implementar (Tú programas)
         ▲                                           │
         └──────── Consolidar ◄── Revisar Evidencia ◄┘
```

> **Regla de oro de evidencia**: Menthor **no avanzará** de tarea por una simple afirmación de *"ya lo hice"*. Inspeccionará tus archivos reales en el repositorio y validará que los criterios de aceptación estén cumplidos antes de registrar tu victoria en `LEARNING.md`.

---

## 🛠️ Herramientas Incluidas en el Plugin

| Herramienta | Descripción |
|---|---|
| `present_task` | Presenta la tarea activa al estudiante, la escribe atómicamente en `LEARNING.md` dentro de un bloque gestionado y sincroniza Menthor Studio. |
| `mentor_open_dashboard` | Inicia el servidor HTTP interno (puerto 4567) y abre automáticamente el navegador en la tarea activa. |

---

## 💻 Desarrollo Local y Contribución

Si deseas contribuir o probar modificaciones localmente:

```bash
# 1. Clonar el repositorio
git clone https://github.com/juandacor/opencode-menthor.git
cd opencode-menthor

# 2. Instalar dependencias
npm install

# 3. Compilar TypeScript y assets
npm run build

# 4. Ejecutar la suite de tests (96 tests unitarios y de integración)
npm test

# 5. Probar empaquetado npm
npm pack --dry-run
```

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

---

<div align="center">
Desarrollado para que aprendas más y dependas menos de la generación ciega de código.
</div>
