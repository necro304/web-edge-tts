# Edge TTS Chrome Extension

Extensión de Chrome (Manifest V3) que expone un API de Text-to-Speech en cualquier página web usando el servicio de voz de Microsoft Edge. No requiere API keys ni servidores externos.

## Instalación

1. Clona o descarga este repositorio
2. Abre `chrome://extensions/` en Chrome o Chromium
3. Activa **Modo desarrollador** (esquina superior derecha)
4. Click en **Cargar extensión sin empaquetar**
5. Selecciona la carpeta `src/`

La extensión se inyecta automáticamente en todas las páginas.

## API

Una vez instalada, todas las páginas tienen acceso al objeto global `window.edgeTTS`.

### `edgeTTS.speak(text, options?)`

Sintetiza y reproduce texto como audio. Retorna una `Promise` que se resuelve cuando el audio termina de reproducirse.

```js
// Uso básico
await window.edgeTTS.speak('Hola, bienvenido al sistema');

// Con opciones
await window.edgeTTS.speak('Turno número 5, ventanilla 3', {
  voice: 'es-MX-DaliaNeural',  // Voz a utilizar
  rate: '+0%',                   // Velocidad: '-50%' a '+100%'
  pitch: '+0Hz'                  // Tono: '-50Hz' a '+50Hz'
});
```

**Parámetros:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `text` | `string` | Sí | Texto a sintetizar |
| `options.voice` | `string` | No | Nombre de la voz (default: `es-MX-DaliaNeural`) |
| `options.rate` | `string` | No | Velocidad de habla (default: `+0%`) |
| `options.pitch` | `string` | No | Tono de la voz (default: `+0Hz`) |

### `edgeTTS.stop()`

Detiene la reproducción en curso inmediatamente.

```js
await window.edgeTTS.stop();
```

## Integración en una página web

### Ejemplo básico

```html
<button id="hablar">Hablar</button>

<script>
  document.getElementById('hablar').addEventListener('click', async () => {
    try {
      await window.edgeTTS.speak('Hola, esto es una prueba');
      console.log('Audio finalizado');
    } catch (err) {
      console.error('Error TTS:', err.message);
    }
  });
</script>
```

### Esperar a que la extensión esté disponible

La extensión inyecta el API al cargar la página. Si tu script se ejecuta muy temprano, puedes esperar a que esté disponible:

```js
function waitForTTS(timeout = 5000) {
  return new Promise((resolve, reject) => {
    if (window.edgeTTS) return resolve(window.edgeTTS);

    const interval = setInterval(() => {
      if (window.edgeTTS) {
        clearInterval(interval);
        resolve(window.edgeTTS);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Edge TTS extension not available'));
    }, timeout);
  });
}

// Uso
const tts = await waitForTTS();
await tts.speak('Extensión detectada correctamente');
```

### Cola de mensajes

Si necesitas reproducir varios mensajes en secuencia sin solapamiento:

```js
async function speakQueue(messages) {
  for (const msg of messages) {
    await window.edgeTTS.speak(msg);
  }
}

speakQueue([
  'Turno número 42',
  'Diríjase a ventanilla 3',
  'Área de pediatría'
]);
```

### Interrumpir y reemplazar

Una nueva llamada a `speak()` interrumpe automáticamente la reproducción anterior:

```js
// Esto interrumpe el mensaje anterior y reproduce el nuevo
window.edgeTTS.speak('Primer mensaje');
window.edgeTTS.speak('Este reemplaza al primero');
```

La promesa del mensaje interrumpido se rechaza con el error `"Interrupted by another TTS request"`.

## Voces disponibles

Algunas voces en español compatibles:

| Voz | Idioma | Género |
|-----|--------|--------|
| `es-MX-DaliaNeural` | Español (México) | Femenino |
| `es-MX-JorgeNeural` | Español (México) | Masculino |
| `es-ES-ElviraNeural` | Español (España) | Femenino |
| `es-ES-AlvaroNeural` | Español (España) | Masculino |
| `es-CO-SalomeNeural` | Español (Colombia) | Femenino |
| `es-CO-GonzaloNeural` | Español (Colombia) | Masculino |
| `es-AR-ElenaNeural` | Español (Argentina) | Femenino |
| `es-AR-TomasNeural` | Español (Argentina) | Masculino |

Para voces en otros idiomas, consulta la [lista completa de voces de Edge TTS](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts#supported-languages).

## Manejo de errores

```js
try {
  await window.edgeTTS.speak('Texto de prueba');
} catch (err) {
  switch (true) {
    case err.message.includes('Autoplay failed'):
      // El navegador bloqueó la reproducción automática.
      // El usuario debe interactuar con la página primero (click, tap, etc.)
      break;
    case err.message.includes('Interrupted'):
      // Otra llamada a speak() interrumpió esta
      break;
    case err.message.includes('WebSocket'):
      // Error de conexión con el servicio de Bing
      break;
    default:
      console.error('Error TTS:', err.message);
  }
}
```

## Notas importantes

- **Autoplay policy**: Chrome requiere que el usuario haya interactuado con la página (click, tecla, etc.) antes de permitir reproducción de audio. La primera llamada a `speak()` debe originarse de una acción del usuario.
- **Una voz a la vez**: Solo se reproduce un mensaje simultáneamente. Una nueva llamada a `speak()` cancela la anterior.
- **Sin build**: La extensión usa JavaScript vanilla, no requiere compilación ni dependencias npm.
- **Raspberry Pi**: Compatible con Chromium en Raspberry Pi. Cargar como extensión sin empaquetar en modo desarrollador.
