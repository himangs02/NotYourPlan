"""
EventFlow YugabyteDB Initializer & Diagnostic Utility.
Tests connection to YugabyteDB using credentials in .env, creates schema tables,
and seeds initial venue data.
"""
import os
import sys
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

print("=" * 60)
print("EventFlow YugabyteDB Initialization & Diagnostics")
print("=" * 60)

database_url = os.environ.get("DATABASE_URL")
if not database_url:
    print("[INFO] DATABASE_URL not set in environment or .env. Using fallback sqlite:///eventflow.db")
else:
    # Mask password for display
    masked_url = database_url
    if "@" in masked_url and ":" in masked_url:
        try:
            proto_user, rest = masked_url.split(":", 1)
            pwd, host_rest = rest.split("@", 1)
            masked_url = f"{proto_user}:******@{host_rest}"
        except Exception:
            pass
    print(f"[INFO] Connecting with DATABASE_URL: {masked_url}")

try:
    from db.database import engine, init_db, SessionLocal, EventModel
    from db.seeds.venue_data import CAMPUS_VENUE_SNAPSHOT

    # 1. Test basic connection
    print("[1/3] Testing database connection...")
    with engine.connect() as conn:
        result = conn.execute("SELECT 1" if engine.dialect.name == "sqlite" else "SELECT version();").scalar()
        print(f"  [OK] Connected successfully! Engine: {engine.dialect.name} | Result: {str(result)[:40]}")

    # 2. Create tables
    print("[2/3] Creating schema tables (events, world_versions, goals, plans, etc.)...")
    init_db()
    print("  [OK] All tables verified/created.")

    # 3. Seed baseline event if empty
    print("[3/3] Checking initial seed data...")
    db = SessionLocal()
    try:
        existing = db.query(EventModel).filter_by(event_id="event-dtu-convocation-001").first()
        if not existing:
            event = EventModel(
                event_id="event-dtu-convocation-001",
                name="Annual Convocation & Fest Closing",
                venue_name=CAMPUS_VENUE_SNAPSHOT["venue_name"],
                attendee_count=3000,
                staff_budget=20
            )
            db.add(event)
            db.commit()
            print("  [OK] Seeded baseline event: 'event-dtu-convocation-001'")
        else:
            print("  [--] Baseline event 'event-dtu-convocation-001' already exists.")
    finally:
        db.close()

    print("\n[SUCCESS] YugabyteDB is ready for EventFlow decision support!\n")

except Exception as e:
    print(f"\n[WARN] Could not connect directly to YugabyteDB: {e}")
    print("[NOTE] EventFlow automatically falls back to local context table fallback if YugabyteDB is offline.")
    print("       To connect to YugabyteDB Aeon Cloud, verify your cluster hostname in .env:\n")
    print("       DATABASE_URL=postgresql://notyouridea:Das%4012345@<YOUR_CLUSTER_HOST>:5433/yugabyte?sslmode=require\n")
