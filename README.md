# JerseyID Envíos

App de escritorio (Electron + React) para llevar el seguimiento de los envíos del negocio: proveedor, número de guía, estado, imagen y link de rastreo. Los datos se guardan en Firebase (gratis), así que se sincronizan automáticamente entre todas las computadoras donde instales/ejecutes la app.

## 1. Crear el proyecto de Firebase (una sola vez)

1. Entra a https://console.firebase.google.com y crea un proyecto nuevo (plan **Spark**, gratis, no pide tarjeta).
2. En el menú lateral entra a **Compilación → Authentication → Comenzar** y habilita el proveedor **Correo electrónico/contraseña**.
3. En **Compilación → Firestore Database → Crear base de datos**, elige **Modo de producción** y la región más cercana.
4. Dentro de Firestore, ve a la pestaña **Reglas** y pega el contenido del archivo [`firestore.rules`](firestore.rules) de este proyecto (solo deja leer/escribir a usuarios que iniciaron sesión). Publica los cambios. Para cambios futuros a este archivo, en vez de copiar/pegar a mano puedes correr `npm run deploy:rules` (requiere haber hecho `npx firebase login` una vez).
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

## 5. Hacer un cambio de código (día a día)

1. Abre la carpeta del proyecto en un editor (recomendado [VS Code](https://code.visualstudio.com/)):
   ```powershell
   cd "c:\Users\Ivanv\Documents\Proyectos\APPenvios"
   code .
   ```
2. Busca el archivo que quieras tocar. Casi todo lo visual está en `src/components/` (ej. [`ShipmentForm.tsx`](src/components/ShipmentForm.tsx) es el formulario para crear/editar un envío, [`ShipmentCard.tsx`](src/components/ShipmentCard.tsx) es la tarjeta que se ve en la lista).
3. Guarda el archivo y prueba el cambio en vivo antes de publicarlo:
   ```powershell
   npm run electron:dev
   ```
4. Cuando estés conforme, sube el cambio a GitHub:
   ```powershell
   git add -A
   git commit -m "Descripción corta del cambio"
   git push origin master
   ```
   Este paso por sí solo **no** actualiza la app de nadie — solo guarda el código en GitHub. Para que tu socia (o cualquiera con la app instalada) reciba el cambio, sigue con el paso 6.

## 6. Publicar una actualización (auto-update)

La app usa `electron-updater` + GitHub Releases para auto-actualizarse. Cada vez que quieras publicar un cambio:

1. Sube la versión en `package.json` (ej. de `"1.0.3"` a `"1.0.4"`) y súbelo a git:
   ```powershell
   git add package.json
   git commit -m "Bump version to 1.0.4"
   git push origin master
   ```
2. Necesitas un token de GitHub con permiso de escritura sobre el repo:
   - Ve a https://github.com/settings/personal-access-tokens → **Generate new token**.
   - En **Repository access** elige **"Only select repositories"** y selecciona `jerseyid-envios` (con "Public repositories" NO funciona, es solo lectura).
   - En **Permissions → Repository permissions**, agrega **Contents: Read and write**.
   - Genera el token y cópialo (empieza con `github_pat_...`, solo se muestra una vez).
3. Corre en PowerShell, dentro de la carpeta del proyecto:
   ```powershell
   $env:GH_TOKEN = "tu_token_aqui"
   npm run release
   ```
   Esto compila, genera el instalador y lo publica como un GitHub Release en https://github.com/IvnVg4/jerseyid-envios/releases.
4. Por seguridad, cuando termines revoca el token en https://github.com/settings/personal-access-tokens (sobre todo si lo compartiste con alguien o lo pegaste en un chat).
5. Cualquier computadora que ya tenga la app instalada (con el instalador, no la carpeta portable) va a detectar la actualización sola la próxima vez que la abra (o cada hora si la deja abierta) y se va a actualizar sin que nadie tenga que hacer nada manual.

La primera instalación en cada computadora nueva sí es manual: comparte el instalador (`JerseyID Envíos Setup X.X.X.exe`) una vez, y de ahí en adelante se actualiza sola.

## Cómo funciona

- **Envíos**: cada tarjeta tiene imagen, proveedor, número de seguimiento, estado y un link de rastreo que tú agregas manualmente al registrar o editar el envío (botón "Editar" → campo "Link de rastreo"). Cada envío tiene un **origen** (Fábrica = restock de inventario, Sucursal = ya es tu stock saliendo hacia un cliente) y, si es de Fábrica, a dónde **llega** (Sucursal o Domicilio) — esto controla la automatización de Stock y Pedidos de abajo.
- **Stock**: pestaña para el inventario. Cada producto es Jersey, Balón, Chamarra o Playera; los jerseys además piden manga (corta/larga) y versión (fan/jugador/retro) obligatorias, y opcionalmente personalizado y uno o más parches. La talla (S a 4XL) aplica a jerseys, chamarras y playeras. Cada producto tiene un **estado de stock**: Agotado, En camino (ligado a un envío de Fábrica + cuántas piezas vienen) o En stock (con su cantidad). Cuando marcas ese envío como "Entregado", las piezas en camino pasan solas a stock disponible. Cada producto guarda hasta 2 fotos.
- **Pedidos**: nombre y número del cliente, anticipo opcional, y los productos del pedido. Si el producto ya está en stock, la línea queda "Vendida" al instante (descuenta stock). Si el producto está "en camino", la línea queda "Bajo pedido" ligada al mismo envío del producto; al marcar ese envío "Entregado", la línea pasa sola a "Listo para entregar" (si el envío llega a tu Sucursal — ahí tú la marcas "Entregado" a mano cuando se la das al cliente) o directo a "Entregado" (si el envío va directo al Domicilio del cliente).
- **Imágenes**: se comprimen automáticamente en el navegador (máx. 1000px, JPEG) y se guardan junto con los demás datos en Firestore — no se necesita el plan de pago de Firebase Storage. En cualquier lado donde aparezcan fotos (tarjetas o formularios, tanto en Envíos como en Stock) puedes hacer clic para verlas en grande con flechas para pasar entre ellas.
- **Multi-computadora**: como todo vive en Firebase, cualquier computadora con la app instalada y sesión iniciada ve los mismos envíos, stock y pedidos en tiempo real.
- **Búsqueda/filtro**: envíos por proveedor, número de seguimiento, notas o estado; productos por nombre/diseño, parche o tipo.
