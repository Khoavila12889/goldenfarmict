"""Isolated tests: no connection to the application PostgreSQL database.
Run from backend: python -m unittest discover -s tests/chat -v
"""
import asyncio
import os
import threading
import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

os.environ["DATABASE_URL"] = "postgresql://test:test@127.0.0.1:1/never_connect"
os.environ["SESSION_SECRET"] = "isolated-chat-test-secret"

from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from starlette.websockets import WebSocketState
from app.core.chat_persist import MessagePersistQueue, PendingMessage
from app.core.chat_ws import ConnectionManager
from app.core.chat_files import signed_file_url, validate_attachment, verify_file_signature
from app.models import ChatRoom, ChatRoomMember, ChatMessage, Employee, User
from app.routers import chat


class PersistenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_receipt_waits_for_commit_and_shutdown_flushes_once(self):
        queue = MessagePersistQueue(flush_interval=.005)
        started, release = threading.Event(), threading.Event()
        batches = []
        def write(items):
            batches.extend(m.id for m in items)
            started.set()
            release.wait(2)
        queue._bulk_insert_sync = write
        await queue.start()
        task = asyncio.create_task(queue.persist(PendingMessage('id', 'room', 'user', 'hello')))
        await asyncio.to_thread(started.wait, 1)
        self.assertFalse(task.done())
        release.set()
        await task
        await queue.stop()
        self.assertEqual(batches, ['id'])
        self.assertEqual(queue.persisted, 1)

    async def test_failure_reaches_sender(self):
        queue = MessagePersistQueue(flush_interval=.001)
        def fail(items):
            raise RuntimeError('database unavailable')
        queue._bulk_insert_sync = fail
        await queue.start()
        with patch('app.core.chat_persist.RETRY_BACKOFF_SEC', 0):
            with self.assertRaises(RuntimeError):
                await queue.persist(PendingMessage('id', 'room', 'user', 'hello'))
        await queue.stop()
        self.assertEqual(queue.persisted, 0)
        self.assertEqual(queue.failed, 1)

    async def test_shutdown_batch_not_written_twice(self):
        queue = MessagePersistQueue(flush_interval=60)
        batches = []
        queue._bulk_insert_sync = lambda items: batches.extend(m.id for m in items)
        await queue.start()
        await queue.enqueue(PendingMessage('id', 'room', 'user', 'hello'))
        await asyncio.sleep(.01)
        await queue.stop()
        self.assertEqual(batches, ['id'])
        with self.assertRaises(RuntimeError):
            await queue.persist(PendingMessage('other', 'room', 'user', 'hello'))

    async def test_full_queue_rejects_without_unbounded_fallback(self):
        queue = MessagePersistQueue(maxsize=1)
        queue._started = True
        await queue.enqueue(PendingMessage('one', 'room', 'user', 'hello'))
        with self.assertRaises(RuntimeError):
            await queue.persist(PendingMessage('two', 'room', 'user', 'hello'))
        self.assertEqual(queue.stats()['queue_size'], 1)

    async def test_handler_does_not_ack_failed_storage_or_accept_bad_payload(self):
        user = {'employee_code': 'u', 'full_name': 'User'}
        with patch.object(chat, '_cached_is_member', return_value=True), patch.object(chat.persist_queue, 'persist', new=AsyncMock(side_effect=RuntimeError('failed'))):
            with self.assertRaises(RuntimeError):
                await chat._handle_incoming_message(user, {'room_id': 'r', 'content': 'hello'})
        for data in ({'room_id': []}, {'room_id': 'r', 'content': 'x' * 10001}, {'room_id': 'r', 'attachment_size': -1}):
            with self.assertRaises(ValueError):
                await chat._handle_incoming_message(user, data)


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        for model in (User, Employee, ChatRoom, ChatRoomMember, ChatMessage):
            model.__table__.create(self.engine)
        self.session = sessionmaker(bind=self.engine)
        self.user = {'employee_code': 'u', 'user_code': 'u', 'role': 'user', 'user_role': 'user', 'department': '', 'full_name': 'User'}
        with self.session() as db:
            db.add(User(employee_code='u', role='user', password_hash='unused'))
            db.add(Employee(employee_code='u', full_name='User'))
            db.add_all([ChatRoom(id='r', type='group'), ChatRoom(id='private', type='group')])
            db.add(ChatRoomMember(room_id='r', employee_code='u'))
            # Same timestamps exercise deterministic tie breaking.
            db.add_all([ChatMessage(id=f'{i:03}', room_id='r', sender_id='u', content=str(i), created_at=datetime(2026, 1, 1)) for i in range(125)])
            db.commit()
        self.patches = [patch.object(chat, 'SessionLocal', self.session), patch.object(chat, 'verify_session', return_value=self.user)]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.engine.dispose()

    def page(self, before=None, room='r'):
        return chat.get_messages(room_id=room, limit=50, offset=0, before=before)

    def test_latest_history_keyset_has_no_gaps_during_new_insert(self):
        first = self.page()
        self.assertEqual(first['data'][0]['id'], '075')
        self.assertTrue(first['has_more'])
        with self.session() as db:
            db.add(ChatMessage(id='999', room_id='r', sender_id='u', content='new', created_at=datetime(2026, 1, 2)))
            db.commit()
        second = self.page(first['next_cursor'])
        third = self.page(second['next_cursor'])
        self.assertFalse(third['has_more'])
        ids = [m['id'] for page in (third, second, first) for m in page['data']]
        self.assertEqual(ids, [f'{i:03}' for i in range(125)])

    def test_membership_and_bad_cursor(self):
        for room, cursor, status in [('private', None, 403), ('r', 'bad', 400), ('r', '2026-01-01T00:00:00Z|id', 400)]:
            with self.assertRaises(HTTPException) as caught:
                self.page(cursor, room)
            self.assertEqual(caught.exception.status_code, status)

    def test_room_list_uses_fixed_query_count_and_filters_private_rooms(self):
        statements = []
        event.listen(self.engine, 'before_cursor_execute', lambda *args: statements.append(args[2]))
        result = chat.get_rooms()
        self.assertEqual([r['id'] for r in result['data']], ['r'])
        self.assertEqual(result['data'][0]['last_message']['id'], '124')
        self.assertLessEqual(len(statements), 3)

    def test_direct_requires_two_people_and_reuses_existing_room(self):
        with self.assertRaises(HTTPException) as caught:
            chat.create_room(chat.RoomCreate(type='direct', member_codes=['u']))
        self.assertEqual(caught.exception.status_code, 400)
        with self.session() as db:
            db.add(User(employee_code='v', username='v', role='user', password_hash='unused'))
            db.add(ChatRoom(id='dm', type='direct'))
            db.add_all([ChatRoomMember(room_id='dm', employee_code=code) for code in ['u', 'v']])
            db.commit()
        # SQLite has no advisory locks; verify room reuse query separately.
        original_execute = self.session.class_.execute
        def execute(db, statement, *args, **kwargs):
            if str(statement).startswith('SELECT pg_advisory_xact_lock'):
                return None
            return original_execute(db, statement, *args, **kwargs)
        with patch.object(self.session.class_, 'execute', execute):
            result = chat.create_room(chat.RoomCreate(type='direct', member_codes=['v']))
        self.assertEqual(result['data']['id'], 'dm')



class FileTests(unittest.TestCase):
    def test_signed_file_tampering_expiry_and_external_urls(self):
        path = '/api/chat/uploads/' + 'a' * 32 + '.pdf'
        url = signed_file_url(path)
        self.assertEqual(validate_attachment(url), path)
        with self.assertRaises(ValueError): validate_attachment(url.replace('a' * 32, 'b' * 32))
        with patch('app.core.chat_files.time.time', return_value=99999999999):
            with self.assertRaises(ValueError): validate_attachment(url)
        for bad in ('https://evil.test/file', '/api/chat/uploads/../../secret', 'javascript:alert(1)'):
            with self.assertRaises(ValueError): signed_file_url(bad)
        self.assertFalse(verify_file_signature('a.pdf', 0, ''))


class FakeSocket:
    client_state = WebSocketState.CONNECTED
    def __init__(self): self.messages = []
    async def accept(self): pass
    async def send_json(self, message): self.messages.append(message)
    async def close(self, **kwargs): self.client_state = WebSocketState.DISCONNECTED


class FanoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_500_recipients_multitab_and_receive_heartbeat(self):
        manager = ConnectionManager()
        sockets = [FakeSocket() for _ in range(500)]
        for i, socket in enumerate(sockets): await manager.connect(socket, str(i))
        extra = FakeSocket()
        meta = await manager.connect(extra, '0')
        seen = meta.last_seen
        await manager.broadcast_to_room({'id': 'one'}, [str(i) for i in range(500)])
        self.assertTrue(all(len(s.messages) == 1 for s in sockets))
        self.assertEqual(len(extra.messages), 1)
        self.assertEqual(meta.last_seen, seen, 'Sending must not count as receiving a heartbeat')
        self.assertFalse(await manager.disconnect(extra, '0'))
        self.assertTrue(await manager.disconnect(sockets[0], '0'))


if __name__ == '__main__': unittest.main(verbosity=2)
