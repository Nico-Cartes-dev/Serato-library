import os, re, struct, shutil, time, tempfile
from pathlib import Path

EXCLUIR = {"_serato_", "_serato_backup", "instaladores", "cosas", "virtualdj",
           "medal", "nise", "msdownld.tmp", "system volume information",
           "$recycle.bin", "avdj25piv858472mipkr2r"}
AUDIO = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".aif", ".aiff", ".ogg", ".wma", ".opus"}
VIDEO = {".mp4", ".m4v", ".mov", ".avi", ".mkv", ".wmv", ".webm", ".mpg", ".mpeg", ".flv"}
def leer(data):
    i, out = 0, []
    while i < len(data):
        if i + 8 > len(data):
            raise ValueError("Archivo Serato dañado: cabecera incompleta.")
        tag = data[i:i+4].decode("ascii")
        n = struct.unpack(">I", data[i+4:i+8])[0]
        if i + 8 + n > len(data):
            raise ValueError("Archivo Serato dañado: registro incompleto.")
        out.append((tag, data[i+8:i+8+n]))
        i += 8 + n
    return out

def campo(tag, val):
    return tag.encode() + struct.pack(">I", len(val)) + val

def txt(tag, s):
    return campo(tag, s.encode("utf-16-be"))

def norm(p):
    return p.replace("\\", "/").lower()

def campo_de(contenido, buscado):
    for t, v in leer(contenido):
        if t == buscado:
            return v.decode("utf-16-be")
    return None

def nombre_crate(partes):
    limpio = [re.sub(r'[<>:"/\\|?*]', "_", p).strip() for p in partes]
    return "%%".join(limpio)

def guardar_archivos(archivos, raiz, log):
    serato = raiz / "_Serato_"
    backup_root = raiz / "_Serato_Backup"
    log("Creando respaldo antes de guardar…")
    backup_root.mkdir(exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix=time.strftime("script_%Y%m%d_%H%M%S_"), dir=backup_root))
    db = serato / "database V2"
    if db.exists():
        shutil.copy2(db, backup / db.name)
    if (serato / "Subcrates").exists():
        shutil.copytree(serato / "Subcrates", backup / "Subcrates")
    log(f"Backup en: {backup}")
    serato.mkdir(exist_ok=True)
    # Cada reemplazo es atómico; el respaldo permite recuperar una interrupción entre archivos.
    with tempfile.TemporaryDirectory(prefix=".generacion_", dir=serato) as tmp:
        stage = Path(tmp)
        log(f"Preparando {len(archivos)} archivos temporales…")
        preparados, reemplazados = [], []
        for i, (destino, contenido) in enumerate(archivos.items()):
            nuevo, anterior = stage / f"{i}.new", stage / f"{i}.old"
            with nuevo.open("wb") as archivo:
                archivo.write(contenido)
                archivo.flush()
                os.fsync(archivo.fileno())
            existe = destino.exists()
            if existe:
                shutil.copy2(destino, anterior)
            preparados.append((destino, nuevo, anterior if existe else None))
        log("Archivos temporales listos. Reemplazando biblioteca…")
        try:
            for destino, nuevo, anterior in preparados:
                destino.parent.mkdir(exist_ok=True)
                os.replace(nuevo, destino)
                reemplazados.append((destino, anterior))
        except OSError as error:
            log(f"ERROR al guardar {destino}: {error}. Restaurando {len(reemplazados)} archivos…")
            fallos = []
            for destino, anterior in reversed(reemplazados):
                try:
                    if anterior is None:
                        destino.unlink()
                    else:
                        os.replace(anterior, destino)
                except OSError as rollback_error:
                    log(f"ERROR al restaurar {destino}: {rollback_error}")
                    fallos.append(str(rollback_error))
            detalle = "No se pudo restaurar todo; recupera el respaldo." if fallos else "Se restauraron los archivos reemplazados."
            log(detalle)
            raise RuntimeError(f"Error al guardar: {error}. {detalle} Respaldo: {backup}") from error

    log(f"Guardado completo: {len(archivos)} archivos.")


def main(raiz, simulacro, solo, excluir=None, extensiones=None, log=print):
    inicio = time.monotonic()
    RAIZ = Path(raiz)
    SIMULACRO = simulacro
    SOLO = solo
    EXCLUIR = {s.lower() for s in (excluir if excluir is not None else globals()["EXCLUIR"])} | {"_serato_", "_serato_backup"}
    EXT = extensiones if extensiones is not None else AUDIO | VIDEO
    SERATO = RAIZ / "_Serato_"
    DB = SERATO / "database V2"
    SUBCRATES = SERATO / "Subcrates"
    print = log
    if not RAIZ.is_dir():
        raise ValueError("El disco o carpeta seleccionado no está disponible.")
    if not isinstance(SIMULACRO, bool):
        raise ValueError("Modo de ejecución inválido.")
    if not SOLO or any(not isinstance(s, str) or Path(s).name != s or s in {".", ".."} for s in SOLO):
        raise ValueError("Selecciona al menos una carpeta válida.")
    for nombre in SOLO:
        if nombre.lower() in EXCLUIR or not (RAIZ / nombre).is_dir():
            raise ValueError(f"Carpeta excluida o no disponible: {nombre}")
    if not EXT:
        raise ValueError("Selecciona al menos un tipo de archivo.")
    modo = "SIMULACRO (no se escribe nada)" if SIMULACRO else "EJECUCIÓN REAL"
    print(f"Modo: {modo}")
    print(f"Origen: {RAIZ} | Carpetas seleccionadas: {len(SOLO)} | Extensiones: {sorted(EXT)}")

    # --- leer BD ---
    print(f"Leyendo base: {DB}" if DB.exists() else "No hay base existente; se preparará una nueva.")
    top = leer(DB.read_bytes()) if DB.exists() else [("vrsn", "2.0/Serato Scratch LIVE Database".encode("utf-16-be"))]
    if not any(t == "vrsn" for t, v in top):
        raise ValueError("Base Serato inválida: falta la versión.")
    header = [(t, v) for t, v in top if t == "vrsn"]
    otros  = [(t, v) for t, v in top if t not in ("vrsn", "otrk")]
    tracks = [v for t, v in top if t == "otrk"]

    print(f"Base validada: {len(tracks)} pistas existentes.")
    sep = "/"
    for tr in tracks:
        p = campo_de(tr, "pfil")
        if p:
            sep = "\\" if "\\" in p else "/"
            break

    # Agregar sin eliminar ni alterar los registros existentes.
    limpias = list(tracks)
    vistos = set()
    for tr in tracks:
        p = campo_de(tr, "pfil")
        if p:
            vistos.add(norm(p))
    print(f"Se conservan las {len(tracks)} pistas existentes, incluidas las de carpetas no seleccionadas.")

    # --- escanear carpetas de primer nivel ---
    solo = {s.lower() for s in SOLO}
    nuevas = 0
    por_carpeta = {}
    print("Escaneando carpetas seleccionadas…")
    ultimo_aviso = time.monotonic()
    recorridas = 0

    def error_escaneo(error):
        print(f"ERROR de acceso durante el escaneo: {error}")
        raise error

    for dirpath, dirs, files in os.walk(RAIZ, onerror=error_escaneo):
        rel = Path(dirpath).relative_to(RAIZ)
        dirs[:] = [d for d in dirs if d.lower() not in EXCLUIR
                   and not (not rel.parts and solo and d.lower() not in solo)]
        if not rel.parts:
            continue
        recorridas += 1
        if time.monotonic() - ultimo_aviso >= 2:
            print(f"Escaneo: {recorridas} carpetas revisadas | Carpeta actual: {rel} | Pistas nuevas: {nuevas}")
            ultimo_aviso = time.monotonic()
        for f in sorted(files):
            ext = Path(f).suffix.lower()
            if ext not in EXT:
                continue
            ruta = sep.join(rel.parts + (f,))
            por_carpeta.setdefault(rel.parts, []).append(ruta)
            if norm(ruta) not in vistos:
                vistos.add(norm(ruta))
                reg = (txt("ttyp", ext.lstrip(".")) + txt("pfil", ruta) +
                       txt("tsng", Path(f).stem) +
                       campo("uadd", struct.pack(">I", int(time.time()))))
                limpias.append(reg)
                nuevas += 1

    print(f"Escaneo completo: {recorridas} carpetas, {sum(map(len, por_carpeta.values()))} archivos multimedia y {nuevas} pistas nuevas.")

    # --- carpetas que serán crates (incluye padres intermedios) ---
    carpetas = set()
    for partes in por_carpeta:
        for i in range(1, len(partes) + 1):
            carpetas.add(partes[:i])

    print(f"Validando nombres y contenido de {len(carpetas)} crates…")
    nombres = {}
    for partes in sorted(carpetas):
        clave = nombre_crate(partes).casefold()
        if clave in nombres:
            raise ValueError(f"Conflicto de crates: {nombres[clave]} y {partes}")
        nombres[clave] = partes

    out = b"".join(campo(t, v) for t, v in header)
    out += b"".join(campo("otrk", t) for t in limpias)
    out += b"".join(campo(t, v) for t, v in otros)
    archivos = {DB: out}

    # Preparar y validar todos los crates antes de escribir la biblioteca.
    vrsn = txt("vrsn", "1.0/Serato ScratchLive Crate")
    agregadas = 0
    crates_nuevos = 0
    for partes in sorted(carpetas):
        archivo = SUBCRATES / (nombre_crate(partes) + ".crate")
        if not archivo.exists():
            crates_nuevos += 1
        existentes, previo = set(), b""
        if archivo.exists():
            registros = leer(archivo.read_bytes())
            if not any(t == "vrsn" for t, v in registros):
                raise ValueError(f"Crate inválido: {archivo.name}")
            for t, v in registros:
                if t == "otrk":
                    p = campo_de(v, "ptrk")
                    if p: existentes.add(norm(p))
                if t != "vrsn":
                    previo += campo(t, v)
        cuerpo = vrsn + previo
        for ruta in por_carpeta.get(partes, []):
            if norm(ruta) not in existentes:
                cuerpo += campo("otrk", txt("ptrk", ruta))
                agregadas += 1
        archivos[archivo] = cuerpo

    print(f"Validación completa: {len(archivos)} archivos preparados, {sum(map(len, archivos.values()))} bytes.")
    if not SIMULACRO:
        guardar_archivos(archivos, RAIZ, print)

    verbo = "Se agregarían" if SIMULACRO else "Agregadas"
    print(f"Pistas nuevas en BD: {nuevas} | Pistas existentes conservadas: {len(tracks)}")
    print(f"Crates: {len(carpetas)} | {verbo} a crates: {agregadas}")
    if SIMULACRO:
        print("\nSimulación terminada. No se modificó ningún archivo.")

    print(f"Proceso terminado en {time.monotonic() - inicio:.2f} segundos.")
    return dict(existing_tracks=len(tracks), found_tracks=sum(map(len, por_carpeta.values())), new_tracks=nuevas,
                crates=len(carpetas), new_crates=crates_nuevos, crate_entries=agregadas)

if __name__ == "__main__":
    raise SystemExit("Abre Abrir_Serato.bat para seleccionar el disco y generar la biblioteca.")