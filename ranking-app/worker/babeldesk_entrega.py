"""Re-export de babeldesk_entrega para compatibilidad de import (babeldesk_entrega o worker.babeldesk_entrega)."""
from babeldesk_entrega import (
    INBOX_DEFAULT,
    entregar_ranking_en_inbox,
    ruta_inbox_babeldesk,
)

__all__ = ["INBOX_DEFAULT", "entregar_ranking_en_inbox", "ruta_inbox_babeldesk"]

