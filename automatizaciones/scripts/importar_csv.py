"""
Importa videos de fondo desde 02_BASE_DATOS_TIKTOKS_MECANICA.csv → tabla videos (canal 1).
Uso:  python scripts/importar_csv.py
      python scripts/importar_csv.py ruta/al/archivo.csv
"""
from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"
DEFAULT_CSV = BASE_DIR / "02_BASE_DATOS_TIKTOKS_MECANICA.csv"
CANAL_MECANICA = 1


def importar(csv_path: Path, canal_id: int = CANAL_MECANICA) -> tuple[int, int]:
    if not csv_path.exists():
        raise FileNotFoundError(f"No encuentro el CSV: {csv_path}")
    if not DB_PATH.exists():
        raise FileNotFoundError("Primero ejecuta: python scripts/inicializar_db.py")

    insertados = 0
    omitidos = 0

    con = sqlite3.connect(DB_PATH)
    try:
        with csv_path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                url = (row.get("Tiktok URL") or row.get("TikTok URL") or "").strip()
                if not url:
                    continue
                copy = (row.get("Copy") or "").strip()
                desc = (row.get("Descripción") or row.get("Descripcion") or "").strip()
                musica = (row.get("Sonido de Fondo") or "").strip() or None

                try:
                    con.execute(
                        """INSERT INTO videos
                        (canal_id, origen, tiktok_url, copy_aida, descripcion, sonido_de_fondo, status)
                        VALUES (?, 'tiktok_csv', ?, ?, ?, ?, 'pendiente')""",
                        (canal_id, url, copy, desc, musica),
                    )
                    insertados += 1
                except sqlite3.IntegrityError:
                    omitidos += 1

        con.commit()
    finally:
        con.close()

    return insertados, omitidos


def main() -> None:
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    insertados, omitidos = importar(csv_path)
    print(f"✅ CSV importado: {insertados} filas nuevas · {omitidos} duplicadas/omitidas")
    print(f"   Archivo: {csv_path.name} → canal_id={CANAL_MECANICA}")


if __name__ == "__main__":
    main()
