# JerseyID Envíos

App de escritorio (Electron + React) para llevar el seguimiento de los envíos del negocio: proveedor, número de guía, estado, imagen y link de rastreo. Los datos se guardan en Firebase (gratis), así que se sincronizan automáticamente entre todas las computadoras donde instales/ejecutes la app.

## 1. Crear el proyecto de Firebase (una sola vez)

1. Entra a https://console.firebase.google.com y crea un proyecto nuevo (plan **Spark**, gratis, no pide tarjeta).
2. En el menú lateral entra a **Compilación → Authentication → Comenzar** y habilita el proveedor **Correo electrónico/contraseña**.
3. En **Compilación → Firestore Database → Crear base de datos**, elige **Modo de producción** y la región más cercana.
4. Dentro de Firestore, ve a la pestaña **Reglas** y pega el contenido del archivo [`firestore.rules`](firestore.rules) de este proyecto (solo deja leer/escribir a usuarios que iniciaron sesión). Publica los cambios.
5. Ve a **Configuración del proyecto** (ícono de engranaje) → baja a **Tus apps** → clic en el ícono `</>` (Web) → registra la app (el nombre puede ser "JerseyID Envíos") → copia el objeto `firebaseConfig` que te muestra.
6. En **Authentication → Users**, agrega manualmente los usuarios (correo + contraseña) que van a usar la app; o bien, la primera vez que abras la app puedes usar el botón "Crear cuenta del negocio" dentro de la misma app.

## 2. Conectar la app a tu proyecto

1. Copia `src/firebaseConfig.example.ts` como `src/firebaseConfig.ts` (si no existe ya).
2. Pega ahí los valores que copiaste del paso 5 anterior.
3. Repite este paso en cada computadora donde instales la app (ese archivo no se sube a git).

## 3. Ejecutar en modo desarrollo

```bash
npm install
npm run electron:dev
```

Se abre la ventana de la app. Si ves la pantalla "Falta configurar Firebase", revisa el paso 2.

## 4. Generar el instalador (.exe)

```bash
npm run electron:build
```

El instalador queda en la carpeta `release/`.

## 5. Publicar una actualización (auto-update)

La app usa `electron-updater` + GitHub Releases para auto-actualizarse. Cada vez que quieras publicar un cambio:

1. Sube la versión en `package.json` (ej. `"version": "1.0.1"`).
2. Corre:
   ```bash
   npm run release
   ```
   Esto compila, genera el instalador y lo publica como un GitHub Release (necesita la variable de entorno `GH_TOKEN` con un token de GitHub con permiso `repo`).
3. Cualquier computadora que ya tenga la app instalada (con el instalador, no la carpeta portable) va a detectar la actualización sola la próxima vez que la abra (o cada hora si la deja abierta) y se va a actualizar sin que nadie tenga que hacer nada manual.

La primera instalación en cada computadora nueva sí es manual: comparte el instalador (`JerseyID Envíos Setup X.X.X.exe`) una vez, y de ahí en adelante se actualiza sola.

## Cómo funciona

- **Envíos**: cada tarjeta tiene imagen, proveedor, número de seguimiento, estado y un link de rastreo que tú agregas manualmente al registrar o editar el envío (botón "Editar" → campo "Link de rastreo").
- **Imágenes**: se comprimen automáticamente en el navegador (máx. 1000px, JPEG) y se guardan junto con los demás datos en Firestore — no se necesita el plan de pago de Firebase Storage.
- **Multi-computadora**: como todo vive en Firebase, cualquier computadora con la app instalada y sesión iniciada ve los mismos envíos en tiempo real.
- **Búsqueda/filtro**: por proveedor, número de seguimiento, notas o estado.
