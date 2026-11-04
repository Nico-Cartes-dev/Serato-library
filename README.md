# Biblioteca Serato

Interfaz de escritorio con Electron (HTML, CSS y JavaScript) y procesamiento local en Python. No utiliza Tkinter.

## Abrir

Requisitos: Node.js con npm y Python 3 disponibles en PATH.

1. Ejecuta `npm install` la primera vez.
2. Haz doble clic en `Abrir_Serato.bat` o ejecuta `npm start`.
3. Elige el disco y pulsa Continuar.
4. Selecciona las carpetas y pulsa Revisar resumen; se ejecuta una simulación sin escribir.
5. Revisa los conteos, cierra Serato y pulsa Confirmar y generar. Puedes volver Atrás para cambiar la selección.

Los archivos de Serato se guardan en `_Serato_` dentro del origen elegido. Los respaldos se guardan en `_Serato_Backup`. La generación conserva el comportamiento del motor original: conserva todos los registros existentes y fusiona los crates seleccionados. Desmarcar una carpeta no elimina sus pistas ni sus crates. Los archivos de audio y video directamente en la raíz no se incluyen; deben estar dentro de una carpeta.

## Estructura

- `electron/`: ventana, diseño e IPC de la aplicación.
- `backend.py`: protocolo JSON entre Electron y Python.
- `seratest.py`: motor de base de datos y crates.

No se ha creado todavía un instalador independiente: esta versión requiere Node.js y Python instalados. La compatibilidad final de la biblioteca debe verificarse dentro de Serato.

## Comprobaciones

Ejecuta `python -B -m unittest discover -s tests -v` y `npm run check`.

Antes de escribir se valida y prepara toda la biblioteca. Cada archivo se reemplaza de forma atómica; si falla un reemplazo se intenta restaurar lo ya cambiado. Una desconexión o corte de energía entre archivos puede requerir recuperar el respaldo de `_Serato_Backup`. Cierra también otras instancias de la aplicación antes de generar.

## Consola de desarrollo

`Abrir_Serato.bat` y `npm run dev` abren la aplicación con DevTools en otra ventana. Selecciona la pestaña Console para ver el registro del motor y los errores. F12 abre o cierra DevTools. `npm start` inicia sin abrir la consola automáticamente.

Para probar datos reales, selecciona el origen y usa primero **Revisar resumen**. La simulación no modifica archivos.

Los diagnósticos de Console incluyen tiempos, operación, origen, selección, fases del motor y detalles de errores de Python. Los avances del escaneo se limitan a un aviso cada dos segundos. Se muestran localmente en consola; no se crea un archivo de logs.

## Guía y avisos

Al abrir se muestra una guía; pulsa Comenzar para elegir el disco. Puedes volver a consultarla con Cómo funciona. Al finalizar la revisión o generación aparece un aviso visual y suena una melodía corta. Los errores muestran un aviso y tono distintos. Desmarca Avisarme con sonido al terminar en la guía para silenciarlo; el aviso visual se mantiene. El sonido depende del volumen y del dispositivo de salida del sistema.

## Crear el instalador de Windows

El instalador `dist/Serato-Library-Setup-1.0.0.exe` incluye Electron y el motor Python. El equipo donde se instala no necesita Node.js ni Python. Es para Windows x64, se instala por usuario y permite elegir carpeta y crear accesos directos. F12 permite consultar la consola también en la versión instalada.

Para recompilar desde el código, con Node.js y Python 3.14 x64 instalados:

```powershell
npm ci
node node_modules/electron/install.js
python -m venv .venv-build
.\.venv-build\Scripts\python.exe -m pip install PyInstaller==6.22.3
npm run dist
python -B -m unittest discover -s tests -v
```

Los archivos de compilación quedan en `build/` y el instalador en `dist/`. El paquete solo incluye la interfaz y el motor, sin bibliotecas de música ni datos del disco F:. El instalador todavía no lleva firma digital de un editor.
