# Changelog - Version 2.0 (PostgreSQL Migration)

## Major Changes

### Database Migration
- **Removed SQLite support** - PostgreSQL 14+ là database duy nhất được hỗ trợ
- **Updated database architecture** - SQLAlchemy ORM với PostgreSQL optimization
- **Removed SQLite legacy code** - All SQLite-specific code removed from codebase

### Files Changed

#### Core Module Updates
| File | Changes |
|------|---------|
| `backend/app/core/session.py` | PostgreSQL-only, DATABASE_URL required, no SQLite fallback |
| `backend/app/core/database.py` | PostgreSQL schema initialization, removed SQLite imports |
| `backend/app/core/db.py` | PostgreSQL-optimized, removed SQLite-specific code |
| `backend/main.py` | Simplified startup, removed SQLite migration logic |
| `backend/app/models.py` | Added missing models (LicCategory, LicItem, UserPermission) |

#### Router Updates (Date/Time Fixes)
All routers updated to use PostgreSQL-compatible date/time syntax:
- `app/routers/dashboard.py` - Fixed `CURRENT_DATE::text`
- `app/routers/approvals.py` - Fixed `updated_at=CURRENT_TIMESTAMP::text`
- `app/routers/employees.py` - Fixed `CURRENT_DATE::text`, `CURRENT_TIMESTAMP::text`
- `app/routers/equipment.py` - Fixed `CURRENT_DATE::text`, `CURRENT_TIMESTAMP::text`
- `app/routers/business_trips.py` - Fixed `completed_at`, `updated_at`
- `app/routers/documents.py` - Fixed `updated_at=CURRENT_TIMESTAMP::text`

### Documentation Updates
| File | Changes |
|------|---------|
| `README.md` | Updated tech stack to PostgreSQL only |
| `SYSTEM_LOGIC.md` | Updated database section, removed SQLite migration guide |
| `RUNBOOK.md` | Updated database section |
| `Dockerfile` | Updated comment to PostgreSQL |
| `docker-compose.yml` | Already PostgreSQL configured |
| `POSTGRESQL_MIGRATION.md` | New - Migration guide from SQLite to PostgreSQL |
| `CHANGELOG.md` | This file |

## Database Schema

### Tables (26 total)
1. employees
2. equipment
3. licenses
4. equipment_history
5. tickets
6. users
7. resources
8. workflow_templates
9. workflow_steps
10. approval_requests
11. approval_logs
12. departments
13. business_trips
14. bookings
15. salary_slips
16. salaries
17. salary_upload_logs
18. storage_config
19. storage_permissions
20. software_categories
21. software_items
22. lic_categories
23. lic_items
24. user_permissions
25. todos
26. todo_subtasks

## Breaking Changes

### Required Actions
1. **Setup PostgreSQL** - Create database and user before upgrading
2. **Set DATABASE_URL** - Must be configured in `.env`
3. **Backup data** - Backup SQLite database before migration
4. **Restart backend** - Tables will be auto-created on first run

### Removed Features
- SQLite database support
- `database.py` SQLite-specific functions
- Automatic SQLite path resolution
- `company.db` file (legacy SQLite)

## Migration Path

### For New Installations
1. Setup PostgreSQL (via Docker or local)
2. Configure `.env` with `DATABASE_URL`
3. Run `docker compose up` or start backend
4. Backend auto-creates all tables

### For Existing SQLite Users
1. Backup `backend/company.db`
2. Export data from SQLite
3. Import into PostgreSQL
4. Reset sequences using `fix_postgres_sequences.py`
5. Update `.env` with PostgreSQL connection string

## Testing

### Verification
```bash
# Check database connection
cd backend
python -c "from app.core.session import DATABASE_URL; print(DATABASE_URL)"

# Check models
python -c "from app.models import Base; print(Base.metadata.tables.keys())"
```

## Support

- Documentation: `README.md`, `POSTGRESQL_MIGRATION.md`
- Database Schema: `SYSTEM_LOGIC.md`
- Migration Guide: `POSTGRESQL_MIGRATION.md`
