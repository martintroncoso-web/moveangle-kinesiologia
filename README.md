# MoveAngle — Analizador de movimiento humano

Proyecto académico para Análisis Bioinstrumental (Kinesiología). La aplicación recibe un video, estima landmarks corporales y calcula el ángulo formado por tres puntos anatómicos. Incluye visualización de esqueleto, gráfico ángulo-tiempo y grabación de un video anotado.

## Objetivo

Responder de forma cuantitativa a preguntas de movimiento como:

> ¿Durante un hip thrust, el ángulo de cadera progresa desde aproximadamente 90° hacia 180° al final de la extensión?

La aplicación no está limitada al hip thrust. El usuario puede cambiar el ángulo para estudiar rodilla, codo, hombro, tobillo, muñeca u otra combinación de tres landmarks disponibles.

## Tecnología

- HTML + CSS + JavaScript ES Modules.
- MediaPipe Pose Landmarker (`@mediapipe/tasks-vision`) para estimación de pose.
- Modelo Lite de Pose Landmarker cargado desde Google Cloud Storage.
- Procesamiento local en el navegador.
- `MediaRecorder` para generar un video WebM anotado.

## Estructura

- `index.html`: interfaz y tutorial.
- `styles.css`: diseño responsive.
- `app.js`: carga del modelo, detección de pose, cálculo angular, gráfico y grabación.

## Ejecución local

No se recomienda abrir `index.html` con doble clic (`file://`) porque los módulos ES y algunos recursos del navegador pueden bloquearse por políticas de seguridad. Usa un servidor local.

Con Python:

```bash
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

Con Node:

```bash
npx serve .
```

## Publicación gratuita

### Opción recomendada: GitHub Pages

1. Crea un repositorio público en GitHub, por ejemplo `moveangle-kinesiologia`.
2. Sube `index.html`, `styles.css`, `app.js` y `README.md`.
3. En el repositorio: **Settings → Pages**.
4. Selecciona **Deploy from a branch**, rama `main` y carpeta `/root`.
5. Guarda. GitHub generará una URL pública del tipo:
   `https://TU-USUARIO.github.io/moveangle-kinesiologia/`

No se necesita servidor propio ni una API de pago.

## Uso para hip thrust

1. Graba a la persona de perfil, idealmente con todo el cuerpo visible.
2. Carga el video.
3. Selecciona `Cadera izquierda` o `Cadera derecha`.
4. El vértice del ángulo será la cadera; los otros puntos serán hombro y rodilla.
5. Deja el objetivo en `180°` si quieres observar la extensión final.
6. Inicia el análisis.
7. El gráfico muestra el ángulo en función del tiempo y las estadísticas muestran mínimo, máximo y rango.
8. Puedes grabar un video WebM que contiene el video original junto con la figura de palitos y el ángulo.

## Interpretación y limitaciones

El ángulo calculado es el ángulo geométrico entre los segmentos definidos por tres landmarks. La precisión depende de la vista de cámara, oclusiones, iluminación, ropa, resolución y calidad del seguimiento de pose. Para un trabajo académico debe presentarse como una herramienta de análisis cuantitativo y no como un instrumento clínico validado.

En una vista lateral, el ángulo hombro-cadera-rodilla puede utilizarse como aproximación del ángulo de cadera durante hip thrust. El objetivo de 180° es una referencia geométrica; no significa que todas las personas deban alcanzar exactamente ese valor.

## Explicación simple del código

1. El navegador carga el modelo Pose Landmarker.
2. Cada cierto intervalo toma el cuadro actual del video.
3. MediaPipe estima coordenadas normalizadas de puntos corporales.
4. Se seleccionan tres puntos A-B-C.
5. Se forman dos vectores desde B hacia A y desde B hacia C.
6. El ángulo se obtiene con el producto punto:

`ángulo = arccos((u·v)/(|u||v|))`

7. El valor se guarda junto con el tiempo y se dibuja en el gráfico.
8. Los mismos datos se representan como una figura de palitos.

## Nota sobre la "IA"

La parte de inteligencia artificial corresponde a la estimación de pose mediante un modelo de visión por computador. El cálculo angular posterior es determinista y se realiza mediante geometría, no mediante una segunda IA generativa.
