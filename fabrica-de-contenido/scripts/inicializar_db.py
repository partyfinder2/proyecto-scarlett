"""
Crea automatizaciones.db: 10 canales, tablas del pipeline y 16 guiones semilla (Grok).
Ejecutar desde automatizaciones/:  python scripts/inicializar_db.py
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "automatizaciones.db"

CANALES = [
    (1, "Mecánica de Motos", "🏍️", "mecanica", 1, "rpqlUOplj0Q0PIilat8h", "es-MX-JorgeNeural", '["TORQUE","VALVULA","CARBURADOR","DIAGRAMA","TALLER"]'),
    (2, "Creadoras Faceless", "🦊", "creadoras", 1, "EXAVITQu4vr4xnSDxMaL", "es-MX-DaliaNeural", '["ANTIFAZ","SETUP","LUZ","ANONIMA","ESTUDIO"]'),
    (3, "Finanzas y Dólares", "💵", "finanzas", 1, "ErXwobaYiN019PkySvjV", "es-MX-JorgeNeural", '["BILLETERA","CAMBIO","COMISION","CUENTA","FLUJO"]'),
    (4, "Herramientas de IA", "🤖", "ia_tools", 1, "TxGEqnHWrfWFTfGW9XjX", "es-MX-JorgeNeural", '["FLUJO","PROMPT","VOZ","CLON","SISTEMA"]'),
    (5, "Repostería y Pastelería", "🍰", "reposteria", 0, "EXAVITQu4vr4xnSDxMaL", "es-MX-DaliaNeural", '["HORNO","BETUN","GRAMOS","MOLDE","RECETA"]'),
    (6, "Resina y Manualidades", "💎", "resina", 0, "EXAVITQu4vr4xnSDxMaL", "es-MX-DaliaNeural", '["MOLDE","BURBUJA","CATALIZADOR","LIJADO","PIEZA"]'),
    (7, "Criptomonedas", "₿", "cripto", 0, "ErXwobaYiN019PkySvjV", "es-MX-JorgeNeural", '["CUSTODIA","RED","LLAVE","COMISION","BLOQUE"]'),
    (8, "Fitness y Salud", "💪", "fitness", 0, "TxGEqnHWrfWFTfGW9XjX", "es-MX-JorgeNeural", '["RUTINA","POSTURA","CARGA","SERIE","DESCANSO"]'),
    (9, "Canal Libre 9", "⭐", "libre", 0, "", "es-MX-DaliaNeural", "[]"),
    (10, "Canal Libre 10", "⭐", "libre", 0, "", "es-MX-DaliaNeural", "[]"),
]

# canal_id, hook_id, spoken_hook, frame1_text, body_aida, cta_keyword, closing_phrase, activo (regalo), slot, nicho
GUIONES_SEED = [
    (1, "H1", "Si tu moto se apaga en el semáforo, no es el carburador.", "NO ES EL CARBURADOR",
     "Si tu moto se apaga en el semáforo, no es el carburador. Nueve de cada diez veces limpias espreas en vano cuando el problema real es una puntería de escape pisada que pierde compresión en caliente. Con una galga de diez milésimas lo compruebas en frío en cinco minutos sin desarmar medio motor.",
     "VALVULA", "Te dejo las holguras exactas por cilindrada: escribe VALVULA en los comentarios y te paso la tabla.", "Tabla de holguras de válvulas por cilindrada (125cc a 250cc)", "almuerzo", "mecanica"),
    (1, "H3", "Tres tornillos. Si aprietas el del medio primero, tuerces la tapa.", "3 TORNILLOS: EL ORDEN IMPORTA",
     "Tres tornillos. Si aprietas el del medio primero, tuerces la tapa del embrague y empieza a sudar aceite a la semana. El aluminio de cárter siempre se asienta en cruz a dos pasos: primero arrime a mano y luego ocho Newton-metro con torquímetro.",
     "TORQUE", "Para que no barran una sola rosca más, comenta TORQUE y te envío el mapa de apriete.", "Mapa de torques críticos y orden de apriete en cruz", "noche", "mecanica"),
    (2, "H2", "Armé este estudio anónimo en mi recámara con dos luces de escritorio.", "ESTUDIO ANÓNIMO CON 2 LUCES",
     "Armé este estudio anónimo en mi recámara con dos luces de escritorio. El error de las principiantes es iluminarse de frente, porque eso delata facciones y aplana la imagen. Si colocas una luz cálida detrás de ti a cuarenta y cinco grados y apagas el techo, creas una silueta de lujo imposible de rastrear.",
     "LUZ", "Si quieres el esquema exacto de ángulos y distancias, escribe LUZ abajo y te lo mando.", "Diagrama de iluminación de silueta y encuadre sin rostro", "almuerzo", "creadoras"),
    (2, "H4", "Cada foto que subes directo del carrete lleva pegada la ubicación de tu calle.", "TU FOTO GUARDA TU UBICACIÓN",
     "Cada foto que subes directo del carrete lleva pegada la ubicación de tu calle y el modelo exacto de tu teléfono en los metadatos EXIF. Antes de publicar cualquier contenido anónimo, debes limpiar el archivo y desactivar el rastreo de red local para blindar tu privacidad al cien por ciento.",
     "ANONIMA", "Armé el checklist de cinco pasos de privacidad digital: comenta ANONIMA y te lo comparto.", "Checklist OpSec de 5 pasos para limpiar metadatos y geolocalización", "noche", "creadoras"),
    (3, "H4", "Cada vez que recibes dólares por transferencia tradicional pierdes hasta el seis por ciento en el tipo de cambio.", "PIERDES 6% EN EL CAMBIO",
     "Cada vez que recibes dólares por transferencia tradicional pierdes hasta el seis por ciento oculto en la diferencia cambiaria del banco, aunque te digan cero comisión. La clave no es cambiar todo el mismo día, sino separar la cuenta receptora en dólares de tu cuenta de gasto local.",
     "CAMBIO", "Hice la comparativa real de comisiones por ruta en Latinoamérica: escribe CAMBIO y te paso la hoja.", "Comparativa de costos reales y rutas para recibir pagos en USD", "almuerzo", "finanzas"),
    (3, "H1", "Ahorrar en tu moneda local debajo del colchón no es prudencia, es perder poder de compra cada mes.", "NO ES AHORRO SI SE DEVALÚA",
     "Ahorrar en tu moneda local debajo del colchón no es prudencia, es perder poder de compra cada mes frente a la inflación de alimentos y renta. Dividir tu fondo de emergencia en tres escalones de liquidez te permite tener efectivo hoy sin que tu reserva se evapore.",
     "BILLETERA", "Si quieres ver cómo estructurar los tres escalones paso a paso, comenta BILLETERA y te envío la guía.", "Estructura práctica de 3 escalones para fondo de reserva", "noche", "finanzas"),
    (4, "H2", "Este flujo convirtió un documento de texto en diez videos verticales en cuatro minutos.", "10 VIDEOS EN 4 MINUTOS",
     "Este flujo convirtió un documento de texto en diez videos verticales en cuatro minutos. En lugar de editar subtítulos línea por línea toda la tarde, un script local separa el gancho de tres segundos, sincroniza la voz por sílaba y corta el formato vertical en una sola pasada.",
     "FLUJO", "Te comparto el diagrama completo de herramientas que uso: escribe FLUJO en los comentarios.", "Mapa del pipeline local de texto a video vertical", "almuerzo", "ia_tools"),
    (4, "H5", "Para. Deja de pedirle a la inteligencia artificial que escriba como experto.", "NO LE PIDAS QUE SEA EXPERTO",
     "Para. Deja de pedirle a la inteligencia artificial que escriba como experto. Cuando usas esa frase, te devuelve párrafos llenos de palabras vacías que nadie lee. En su lugar, dale tres ejemplos reales de cómo hablas tú y prohíbele usar adjetivos de relleno.",
     "PROMPT", "Si quieres la plantilla exacta de restricciones que uso a diario, comenta PROMPT y te la paso.", "Plantilla de restricciones para textos naturales sin clichés de IA", "noche", "ia_tools"),
    (5, "H1", "Si el betún se te corta a mitad del batido, no es culpa de la mantequilla.", "NO ES LA MANTEQUILLA",
     "Si el betún se te corta a mitad del batido, no es culpa de la mantequilla: es el choque de temperatura entre el bowl frío y el líquido. Antes de tirar la mezcla a la basura, calienta solo dos cucharadas en baño maría y reintégralas batiendo en velocidad baja.",
     "BETUN", "Para que tengas la tabla exacta de temperaturas de rescate, comenta BETUN y te la mando.", "Tabla de temperaturas exactas para rescate de coberturas y betunes", "almuerzo", "reposteria"),
    (5, "H3", "Cinco gramos de más en el polvo para hornear hacen que tu pastel se hunda en el centro.", "5 GRAMOS HUNDEN EL CENTRO",
     "Cinco gramos de más en el polvo para hornear hacen que tu pastel suba rápido los primeros diez minutos y luego se desplome en el centro. En pastelería de venta nunca se mide con cucharas medidoras: todo va en báscula digital por porcentaje sobre la harina.",
     "GRAMOS", "Tengo la tabla de conversión de tazas a gramos exactos: escribe GRAMOS y te la envío.", "Tabla maestra de equivalencias en gramos por tamaño de molde", "noche", "reposteria"),
    (6, "H5", "No acerques la pistola de calor a menos de diez centímetros del molde.", "NO ACERQUES TANTO EL CALOR",
     "No acerques la pistola de calor a menos de diez centímetros del molde. Cuando calientas de más la superficie para reventar burbujas, quemas la silicona del molde y la pieza queda pegada para siempre. El pase debe ser rápido, en círculos y solo en los primeros cinco minutos de vaciado.",
     "BURBUJA", "Si quieres la guía de tiempos de vaciado y desmolde según el grosor, comenta BURBUJA.", "Guía de tiempos de curado y eliminación de burbujas sin dañar moldes", "almuerzo", "resina"),
    (6, "H3", "Dos partes de resina por una de catalizador en volumen no pesan lo mismo en la báscula.", "VOLUMEN NO ES IGUAL A PESO",
     "Dos partes de resina por una de catalizador en volumen no pesan lo mismo en la báscula porque el componente A es más denso que el B. Si mezclas por gramos una resina que dice proporción por volumen, tu pieza quedará chicloso y nunca secará.",
     "MOLDE", "Hice la calculadora de mezcla por tamaño de pieza: escribe MOLDE abajo y te la paso.", "Tabla de cálculo de resina por mililitros y gramos según el molde", "noche", "resina"),
    (7, "H4", "Elegir la red equivocada al retirar tus monedas hace que el envío se pierda sin botón de cancelar.", "UNA RED EQUIVOCADA LO PIERDE TODO",
     "Elegir la red equivocada al retirar tus monedas hace que el envío se pierda sin botón de cancelar. Aunque la dirección empiece igual con cero equis, la red de salida y la red de llegada deben coincidir letra por letra, y siempre se hace primero una prueba con el monto mínimo.",
     "RED", "Armé el mapa visual de redes compatibles y verificación previa: comenta RED y te lo envío.", "Checklist de verificación de redes antes de transferir activos digitales", "almuerzo", "cripto"),
    (7, "H1", "Guardar tus doce palabras de recuperación en una captura de pantalla del celular es dejar la llave en la puerta.", "NUNCA EN CAPTURA DE PANTALLA",
     "Guardar tus doce palabras de recuperación en una captura de pantalla del celular es dejar la llave en la puerta, porque cualquier aplicación con permiso de galería o respaldo en la nube las sincroniza en internet. La frase semilla solo se anota en papel o metal fuera de línea.",
     "CUSTODIA", "Si quieres la guía paso a paso de autocustodia segura desde cero, escribe CUSTODIA.", "Protocolo básico de autocustodia y respaldo físico fuera de línea", "noche", "cripto"),
    (8, "H5", "Para. Si bajas la barra rebotando en el pecho no estás ganando fuerza, estás cargando el hombro.", "NO REBOTES LA BARRA",
     "Para. Si bajas la barra rebotando en el pecho no estás ganando fuerza, estás cargando el tendón del hombro. Una pausa controlada de un segundo abajo con los omóplatos retraídos activa el doble de fibras con veinte por ciento menos de peso riesgoso.",
     "POSTURA", "Te grabé la lista de ajustes de agarre y retracción escapular: comenta POSTURA y te la mando.", "Guía ilustrada de técnica y retracción escapular en press y jalones", "almuerzo", "fitness"),
    (8, "H3", "Cuatro series al fallo todos los días no te hacen crecer más rápido: te estancan a la tercera semana.", "MÁS SERIES NO ES MÁS MÚSCULO",
     "Cuatro series al fallo todos los días no te hacen crecer más rápido: te estancan a la tercera semana porque tu sistema nervioso tarda más en recuperarse que el músculo. Dejar una o dos repeticiones en recámara en los primeros ejercicios te permite sostener el progreso todo el mes.",
     "RUTINA", "Si quieres la distribución semanal de volumen y descanso real, escribe RUTINA en comentarios.", "Plantilla de distribución semanal de series efectivas y recuperación", "noche", "fitness"),
]


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS canales (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  numero              INTEGER NOT NULL UNIQUE,
  nombre              TEXT    NOT NULL,
  emoji               TEXT    NOT NULL DEFAULT '📺',
  nicho               TEXT    NOT NULL,
  activo              INTEGER NOT NULL DEFAULT 0,
  voice_id            TEXT    NOT NULL DEFAULT '',
  voz_fallback        TEXT    NOT NULL DEFAULT 'es-MX-DaliaNeural',
  cta_keywords        TEXT    NOT NULL DEFAULT '[]',
  instagram_token_id  INTEGER,
  youtube_token_id    INTEGER,
  facebook_token_id   INTEGER,
  creado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tokens_sociales (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  plataforma       TEXT    NOT NULL UNIQUE,
  access_token     TEXT    NOT NULL,
  refresh_token    TEXT,
  expira_en        DATETIME,
  actualizado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS videos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  canal_id         INTEGER NOT NULL DEFAULT 1 REFERENCES canales(id),
  origen           TEXT    NOT NULL DEFAULT 'local',
  tiktok_url       TEXT    UNIQUE,
  local_path       TEXT,
  copy_aida        TEXT,
  descripcion      TEXT,
  sonido_de_fondo  TEXT,
  music_local_path TEXT,
  status           TEXT    NOT NULL DEFAULT 'pendiente',
  veces_usado      INTEGER NOT NULL DEFAULT 0,
  ultimo_usado_en  DATETIME,
  roto_desde       DATETIME,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guiones (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  canal_id         INTEGER NOT NULL DEFAULT 1 REFERENCES canales(id),
  hook_id          TEXT    NOT NULL,
  spoken_hook      TEXT    NOT NULL,
  frame1_text      TEXT    NOT NULL,
  body_aida        TEXT    NOT NULL,
  cta_keyword      TEXT    NOT NULL,
  closing_phrase   TEXT    NOT NULL,
  activo           TEXT    NOT NULL,
  slot             TEXT    NOT NULL,
  nicho            TEXT,
  activo_flag      INTEGER NOT NULL DEFAULT 1,
  veces_usado      INTEGER NOT NULL DEFAULT 0,
  ultimo_usado_en  DATETIME,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(canal_id, hook_id, slot, cta_keyword)
);

CREATE TABLE IF NOT EXISTS cola_publicacion (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  canal_id         INTEGER NOT NULL DEFAULT 1 REFERENCES canales(id),
  video_id         INTEGER NOT NULL REFERENCES videos(id),
  guion_id         INTEGER NOT NULL REFERENCES guiones(id),
  slot             TEXT    NOT NULL,
  fecha_programada DATETIME NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'pendiente',
  output_path      TEXT,
  error_tecnico    TEXT,
  retry_count      INTEGER NOT NULL DEFAULT 0,
  plataformas      TEXT    NOT NULL DEFAULT 'instagram,youtube,facebook',
  fijado           INTEGER NOT NULL DEFAULT 0,
  publicado_en     DATETIME,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (retry_count <= 3)
);

CREATE TABLE IF NOT EXISTS bot_guardian_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo             TEXT    NOT NULL,
  semaforo         TEXT    NOT NULL DEFAULT 'verde',
  mensaje_pablo    TEXT    NOT NULL,
  detalle_tecnico  TEXT,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pipeline_estados (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  tarea_id       TEXT    NOT NULL UNIQUE,
  canal_id       INTEGER REFERENCES canales(id),
  paso_actual    INTEGER NOT NULL DEFAULT 0,
  porcentaje     INTEGER NOT NULL DEFAULT 0,
  mensaje        TEXT    NOT NULL DEFAULT 'Iniciando...',
  status         TEXT    NOT NULL DEFAULT 'procesando',
  error          TEXT,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cola_fecha ON cola_publicacion(fecha_programada, status);
CREATE INDEX IF NOT EXISTS idx_cola_slot ON cola_publicacion(slot, status);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status, canal_id);
CREATE INDEX IF NOT EXISTS idx_guiones_canal ON guiones(canal_id, slot, activo_flag);
CREATE INDEX IF NOT EXISTS idx_log_semaforo ON bot_guardian_log(semaforo, creado_en);
"""


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    try:
        con.executescript(SCHEMA)

        con.executemany(
            """INSERT OR IGNORE INTO canales
            (numero, nombre, emoji, nicho, activo, voice_id, voz_fallback, cta_keywords)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            CANALES,
        )

        con.executemany(
            """INSERT OR IGNORE INTO guiones
            (canal_id, hook_id, spoken_hook, frame1_text, body_aida, cta_keyword,
             closing_phrase, activo, slot, nicho, activo_flag, veces_usado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)""",
            GUIONES_SEED,
        )

        defaults = [
            ("historial_dias", "7"),
            ("memoria_max_mb", "1536"),
            ("escudo_anticopyright", "1"),
        ]
        for clave, valor in defaults:
            con.execute(
                "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)",
                (clave, valor),
            )

        con.commit()
        n_canales = con.execute("SELECT COUNT(*) FROM canales").fetchone()[0]
        n_guiones = con.execute("SELECT COUNT(*) FROM guiones").fetchone()[0]
        print(f"✅ Base lista: {DB_PATH}")
        print(f"   Canales: {n_canales} · Guiones semilla: {n_guiones}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
