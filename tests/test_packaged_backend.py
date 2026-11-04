"""Verifica el motor incluido en el paquete sin usar Python instalado vía PATH."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

BACKEND = Path(__file__).resolve().parents[1] / 'dist' / 'win-unpacked' / 'resources' / 'backend' / 'serato-backend.exe'


@unittest.skipUnless(BACKEND.exists(), 'Primero ejecuta npm run dist')
class PackagedBackendTests(unittest.TestCase):
    def call(self, request):
        environment = dict(os.environ, PATH=os.environ.get('SystemRoot', 'C:\\Windows'))
        result = subprocess.run([str(BACKEND)], input=json.dumps(request), capture_output=True, encoding='utf-8', env=environment, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        events = [json.loads(line) for line in result.stdout.splitlines()]
        return events[-1]

    def test_standalone_drives_and_unicode_library(self):
        self.assertTrue(self.call({'action': 'drives'})['drives'])
        with tempfile.TemporaryDirectory(dir=Path.cwd(), prefix='test_installer_') as tmp:
            root = Path(tmp)
            (root / 'Música').mkdir()
            (root / 'Música' / 'canción.mp3').write_bytes(b'fixture')
            self.assertEqual(self.call(dict(action='folders', root=tmp))['folders'], ['Música'])
            request = dict(action='run', root=tmp, folders=['Música'], audio=True, video=False, simulate=True)
            self.assertEqual(self.call(request)['summary']['new_tracks'], 1)
            self.assertFalse((root / '_Serato_').exists())
            request['simulate'] = False
            self.assertTrue(self.call(request)['success'])
            self.assertTrue((root / '_Serato_' / 'Subcrates' / 'Música.crate').exists())
            self.assertTrue((root / '_Serato_Backup').is_dir())


if __name__ == '__main__':
    unittest.main()
