import json
import sys
import ctypes
import traceback
from pathlib import Path
import seratest


def emit(kind, **values):
    print(json.dumps(dict(type=kind, **values), ensure_ascii=False), flush=True)


def run(request):
    action = request.get('action')
    if action == 'drives':
        mask = ctypes.windll.kernel32.GetLogicalDrives() if sys.platform == 'win32' else 0
        drives = [f'{chr(65+i)}:\\' for i in range(26) if mask & (1 << i)]
        emit('result', drives=drives or [str(Path.home())], exclusions=sorted(seratest.EXCLUIR))
        return
    root = Path(request['root'])
    if not root.is_dir():
        raise ValueError('El origen seleccionado no está disponible.')
    excluded = {str(s).strip().lower() for s in request.get('exclusions', []) if str(s).strip()} | {'_serato_', '_serato_backup'}
    if action == 'folders':
        folders = sorted([p.name for p in root.iterdir() if p.is_dir() and p.name.lower() not in excluded], key=str.lower)
        emit('result', folders=folders)
    elif action == 'run':
        selected = request.get('folders', [])
        if not selected or any(not isinstance(s, str) or Path(s).name != s or s in {'.', '..'} for s in selected):
            raise ValueError('Selecciona al menos una carpeta válida.')
        extensions = (seratest.AUDIO if request.get('audio') else set()) | (seratest.VIDEO if request.get('video') else set())
        if not isinstance(request.get('simulate'), bool):
            raise ValueError('Modo de ejecución inválido.')
        summary = seratest.main(raiz=root, simulacro=request['simulate'], solo=selected, excluir=excluded, extensiones=extensions, log=lambda message='': emit('log', message=str(message)))
        emit('result', success=True, summary=summary)
    else:
        raise ValueError('Operación desconocida.')


if __name__ == '__main__':
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        stream.reconfigure(encoding='utf-8')
    try:
        run(json.load(sys.stdin))
    except Exception as error:
        traceback.print_exc(file=sys.stderr)
        emit('error', message=str(error))
        sys.exit(1)
