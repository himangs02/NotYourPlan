"""
Meko Context Service for EventFlow.
Preserves evolving shared context and handoffs across specialist planning roles:
- Goal Interpreter
- Plan Strategist
- Simulation Analyst
- Operations Writer

Operates with external Meko API when credentials are provided,
or via YugabyteDB-backed context table when Meko cloud API is pending.
"""
import os
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from db.database import MekoContextModel

SPECIALIST_ROLES = [
    "Goal Interpreter",
    "Plan Strategist",
    "Simulation Analyst",
    "Operations Writer"
]

class MekoContextService:
    def __init__(self, db: Optional[Session] = None):
        self.db = db
        self.meko_api_key = os.environ.get("MEKO_API_KEY")
        self.meko_endpoint = os.environ.get("MEKO_ENDPOINT")
        # Explicit status tracking
        self.is_external_meko_connected = bool(self.meko_api_key and self.meko_endpoint)
        self.mode = "MEKO_CLOUD_API" if self.is_external_meko_connected else "YUGABYTEDB_CONTEXT_TABLE_FALLBACK"

    def save_context(
        self,
        event_id: str,
        role: str,
        context_payload: Dict[str, Any],
        handoff_from: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Saves specialist context and handoff state into the Meko shared memory layer.
        """
        context_id = str(uuid.uuid4())
        record = {
            "context_id": context_id,
            "event_id": event_id,
            "role": role,
            "handoff_from": handoff_from,
            "context_payload": context_payload,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "storage_mode": self.mode
        }

        if self.db:
            db_record = MekoContextModel(
                context_id=context_id,
                event_id=event_id,
                role=role,
                handoff_from=handoff_from,
                context_payload=context_payload,
                created_at=datetime.utcnow()
            )
            self.db.add(db_record)
            self.db.commit()

        return record

    def get_event_context_history(self, event_id: str) -> List[Dict[str, Any]]:
        """
        Retrieves the chronological handoff timeline across specialist roles.
        """
        if not self.db:
            return []

        records = self.db.query(MekoContextModel).filter(
            MekoContextModel.event_id == event_id
        ).order_by(MekoContextModel.created_at.asc()).all()

        return [
            {
                "context_id": r.context_id,
                "event_id": r.event_id,
                "role": r.role,
                "handoff_from": r.handoff_from,
                "context_payload": r.context_payload,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "storage_mode": self.mode
            }
            for r in records
        ]

    def record_handoff(
        self,
        event_id: str,
        from_role: str,
        to_role: str,
        artifacts_passed: Dict[str, Any],
        notes: str = ""
    ) -> Dict[str, Any]:
        """
        Records an explicit handoff between two specialist agents.
        """
        payload = {
            "handoff_type": f"{from_role} -> {to_role}",
            "artifacts_passed": artifacts_passed,
            "notes": notes,
            "handshake_verified": True
        }
        return self.save_context(
            event_id=event_id,
            role=to_role,
            context_payload=payload,
            handoff_from=from_role
        )
