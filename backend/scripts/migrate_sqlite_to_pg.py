"""
Migrate data from SQLite (company.db) to PostgreSQL.
Only migrates columns that exist in both source and target.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, MetaData, select

SQLITE_PATH = os.environ.get('SQLITE_PATH', str(Path(__file__).parent.parent / 'company.db'))
PG_URL = os.environ.get('DATABASE_URL', 'postgresql://goldenfarm:your_strong_password@localhost:5432/goldenfarmict')

def migrate():
    sqlite_path = SQLITE_PATH
    if not os.path.exists(sqlite_path):
        alt = '/app/data/company.db'
        if os.path.exists(alt):
            sqlite_path = alt
        else:
            print(f"SQLite DB not found at {sqlite_path} or {alt}")
            return

    print(f"SQLite: {sqlite_path}")

    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
    pg_engine = create_engine(PG_URL)

    sqlite_meta = MetaData()
    sqlite_meta.reflect(bind=sqlite_engine)

    pg_meta = MetaData()
    pg_meta.reflect(bind=pg_engine)

    with sqlite_engine.connect() as sqlite_conn, pg_engine.connect() as pg_conn:
        for table_name in sqlite_meta.sorted_tables:
            name = table_name.name
            if name not in pg_meta.tables:
                print(f"  Skip {name}: not in PostgreSQL")
                continue

            pg_table = pg_meta.tables[name]
            sqlite_table = sqlite_meta.tables[name]

            # Check if target table already has data
            existing = pg_conn.execute(select(pg_table).limit(1)).fetchone()
            if existing:
                print(f"  Skip {name}: data already exists in PostgreSQL")
                continue

            rows = sqlite_conn.execute(select(sqlite_table)).fetchall()
            if not rows:
                print(f"  {name}: 0 rows (empty)")
                continue

            # Only migrate columns that exist in both source and target
            sqlite_cols = {col.name for col in sqlite_table.columns}
            pg_cols = {col.name for col in pg_table.columns}
            common_cols = sqlite_cols & pg_cols

            if not common_cols:
                print(f"  {name}: no common columns to migrate")
                continue

            columns = [col for col in sqlite_table.columns if col.name in common_cols]
            pg_columns = [col.name for col in columns]

            inserted = 0
            for row in rows:
                data = dict(zip([c.name for c in sqlite_table.columns], row))
                filtered = {k: v for k, v in data.items() if k in common_cols}
                pg_conn.execute(pg_table.insert().values(**filtered))
                inserted += 1
            pg_conn.commit()
            print(f"  {name}: {inserted} rows migrated (columns: {pg_columns})")

    print("Migration complete!")

if __name__ == '__main__':
    migrate()
