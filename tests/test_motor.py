import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import seratest as engine


class MotorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=Path.cwd(), prefix='test_serato_')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / 'Música').mkdir()
        (self.root / 'Música' / 'canción.mp3').write_bytes(b'fixture')

    def run_engine(self, simulate=False, folders=None):
        engine.main(self.root, simulate, folders or ['Música'], log=lambda message: None)

    def snapshot(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_simulation_writes_nothing(self):
        before = self.snapshot()
        self.run_engine(True)
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.root / '_Serato_').exists())
        self.assertFalse((self.root / '_Serato_Backup').exists())

    def test_generation_backup_and_no_duplicates(self):
        self.run_engine()
        db = self.root / '_Serato_' / 'database V2'
        crate = self.root / '_Serato_' / 'Subcrates' / 'Música.crate'
        original = db.read_bytes()
        self.run_engine()
        self.assertEqual(db.read_bytes(), original)
        self.assertEqual(sum(t == 'otrk' for t, v in engine.leer(original)), 1)
        self.assertEqual(sum(t == 'otrk' for t, v in engine.leer(crate.read_bytes())), 1)
        backups = list((self.root / '_Serato_Backup').iterdir())
        self.assertEqual(len(backups), 2)
        self.assertTrue(any((p / 'database V2').exists() and (p / 'database V2').read_bytes() == original for p in backups))

    def test_unselected_missing_and_duplicate_records_are_preserved(self):
        self.run_engine()
        db = self.root / '_Serato_' / 'database V2'
        old = engine.txt('pfil', 'Otra/ausente.mp3') + engine.txt('tart', 'Artista original')
        db.write_bytes(db.read_bytes() + engine.campo('otrk', old) * 2)
        crates = self.root / '_Serato_' / 'Subcrates'
        untouched = crates / 'Otra.crate'
        untouched.write_bytes(engine.txt('vrsn', '1.0/Serato ScratchLive Crate'))
        original_crate = untouched.read_bytes()
        (self.root / 'Música' / 'nueva.mp3').write_bytes(b'fixture')
        summary = engine.main(self.root, True, ['Música'], log=lambda message: None)
        self.assertEqual(summary['existing_tracks'], 3)
        self.assertEqual(summary['new_tracks'], 1)
        self.assertEqual(summary['new_crates'], 0)
        self.run_engine()
        tracks = [v for t, v in engine.leer(db.read_bytes()) if t == 'otrk']
        self.assertEqual(tracks.count(old), 2)
        self.assertEqual(untouched.read_bytes(), original_crate)

    def test_truncated_records_rejected(self):
        for data in [b'partial', b'otrk' + struct.pack('>I', 100) + b'x']:
            with self.subTest(data=data), self.assertRaises(ValueError):
                engine.leer(data)

    def test_bad_database_untouched(self):
        self.run_engine()
        db = self.root / '_Serato_' / 'database V2'
        for data in [b'partial', b'']:
            db.write_bytes(data)
            before = self.snapshot()
            with self.assertRaises(ValueError):
                self.run_engine()
            self.assertEqual(before, self.snapshot())

    def test_bad_crate_does_not_change_database(self):
        self.run_engine()
        (self.root / 'Música' / 'nuevo.mp3').write_bytes(b'fixture')
        crate = self.root / '_Serato_' / 'Subcrates' / 'Música.crate'
        crate.write_bytes(b'broken')
        before = self.snapshot()
        with self.assertRaises(ValueError):
            self.run_engine()
        self.assertEqual(before, self.snapshot())

    def test_crate_collision_stops_before_writing(self):
        for folder in ['A%%B', 'A/B']:
            p = self.root / folder
            p.mkdir(parents=True)
            (p / 'tema.mp3').write_bytes(b'fixture')
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, 'Conflicto'):
            self.run_engine(folders=['A%%B', 'A'])
        self.assertEqual(before, self.snapshot())
        self.assertFalse((self.root / '_Serato_').exists())

    def test_scan_error_stops_before_writing(self):
        def denied(root, onerror):
            onerror(PermissionError('Acceso denegado'))
            return iter(())
        with patch.object(engine.os, 'walk', side_effect=denied):
            with self.assertRaises(PermissionError):
                self.run_engine()
        self.assertFalse((self.root / '_Serato_').exists())

    def test_replace_failure_restores_existing_files(self):
        self.run_engine()
        (self.root / 'Música' / 'nuevo.mp3').write_bytes(b'fixture')
        serato = self.root / '_Serato_'
        before = {p: p.read_bytes() for p in serato.rglob('*') if p.is_file()}
        replace = engine.os.replace
        def fail_crate(src, dst):
            if str(src).endswith('.new') and Path(dst).suffix == '.crate':
                raise OSError('Disco no disponible')
            return replace(src, dst)
        with patch.object(engine.os, 'replace', side_effect=fail_crate):
            with self.assertRaisesRegex(RuntimeError, 'restauraron'):
                self.run_engine()
        self.assertEqual(before, {p: p.read_bytes() for p in serato.rglob('*') if p.is_file()})

    def test_replace_failure_removes_new_database(self):
        replace = engine.os.replace
        def fail_crate(src, dst):
            if Path(dst).suffix == '.crate':
                raise OSError('Disco no disponible')
            return replace(src, dst)
        with patch.object(engine.os, 'replace', side_effect=fail_crate):
            with self.assertRaises(RuntimeError):
                self.run_engine()
        self.assertFalse((self.root / '_Serato_' / 'database V2').exists())

    def test_backend_json_simulation(self):
        request = dict(action='run', root=str(self.root), folders=['Música'], audio=True, video=False, simulate=True)
        result = subprocess.run([sys.executable, '-B', '-X', 'utf8', 'backend.py'], input=json.dumps(request), text=True, encoding='utf-8', capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        events = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertTrue(events[-1]['success'])
        self.assertEqual(events[-1]['summary']['new_tracks'], 1)
        self.assertEqual(events[-1]['summary']['new_crates'], 1)
        messages = '\n'.join(event['message'] for event in events if event['type'] == 'log')
        for phase in ['Origen:', 'Base validada:', 'Escaneo completo:', 'Validación completa:', 'Proceso terminado en']:
            self.assertIn(phase, messages)
        self.assertEqual(result.stderr, '')
        self.assertFalse((self.root / '_Serato_').exists())

    def test_backend_error_keeps_json_and_reports_traceback(self):
        request = dict(action='run', root=str(self.root), folders=[], simulate=True)
        result = subprocess.run([sys.executable, '-B', '-X', 'utf8', 'backend.py'], input=json.dumps(request), text=True, encoding='utf-8', capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout.splitlines()[-1])['type'], 'error')
        self.assertIn('Traceback', result.stderr)
        self.assertIn('ValueError', result.stderr)

    def test_direct_execution_does_not_run_engine(self):
        result = subprocess.run([sys.executable, '-B', 'seratest.py'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Abrir_Serato.bat', result.stderr)


if __name__ == '__main__':
    unittest.main()
