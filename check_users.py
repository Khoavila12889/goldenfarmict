import sys; sys.path.insert(0, 'backend')
from app.core.database import get_conn
c = get_conn()
u = c.execute('SELECT COUNT(*) AS c FROM users').fetchone()['c']
e = c.execute('SELECT COUNT(*) AS c FROM employees').fetchone()['c']
a = c.execute("SELECT COUNT(*) AS c FROM users WHERE password_hash LIKE '%argon2id%'").fetchone()['c']
s = c.execute("SELECT COUNT(*) AS c FROM users WHERE password_hash NOT LIKE '%argon2id%'").fetchone()['c']
print(f'users={u} employees={e} argon2={a} sha256={s}')
# Show a few sample users
rows = c.execute('SELECT employee_code, role, substr(password_hash,1,20) AS pw FROM users LIMIT 5').fetchall()
print('Sample users:')
for r in rows: print(f'  {r["employee_code"]} role={r["role"]} pw={r["pw"]}')
c.close()
