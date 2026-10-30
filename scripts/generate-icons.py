"""Renderiza a marca geométrica do Steam Atlas em PNG, sem bibliotecas externas."""
from pathlib import Path
import struct
import zlib

OUTPUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
OUTPUT.mkdir(exist_ok=True)

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

for name, size in [('icon-192.png', 192), ('icon-512.png', 512), ('icon-maskable.png', 512), ('apple-touch-icon.png', 180)]:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            hits = 0
            for dy in (.25, .75):
                for dx in (.25, .75):
                    distance = abs((x + dx) / size - .5) + abs((y + dy) / size - .5)
                    hits += distance <= .10 or .19 <= distance <= .29
            raw.extend(round(bg + (fg - bg) * hits / 4) for bg, fg in zip((16, 21, 25), (195, 239, 128)))
    header = struct.pack('!IIBBBBB', size, size, 8, 2, 0, 0, 0)
    (OUTPUT / name).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
