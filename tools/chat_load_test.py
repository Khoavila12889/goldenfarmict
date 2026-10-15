"""Staging-only WebSocket acceptance runner; supply 500 distinct test accounts.

Credentials JSON: [{"employee_code": "test1", "token": "...", "room_id": "..."}, ...]
Never prints credentials. Creates real chat messages in the target environment.
Requires websockets (already included in the backend runtime).
"""
import argparse
import asyncio
import json
import random
import statistics
import time
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import websockets


async def run(args):
    users = json.loads(Path(args.credentials).read_text())[:args.users]
    if len(users) != args.users or len({u['employee_code'] for u in users}) != args.users:
        raise ValueError('Provide the requested number of distinct test accounts')
    if urlsplit(args.url).hostname not in ('localhost', '127.0.0.1', '::1') and not args.confirm_staging:
        raise ValueError('Nonlocal target requires --confirm-staging')
    start = asyncio.Event()
    ready = 0
    latencies, failures = [], []
    run_id = uuid.uuid4().hex[:12]

    async def client(index, user):
        nonlocal ready
        pending = {}
        reader = None
        try:
            query = urlencode({k: user[k] for k in ('employee_code', 'token')})
            async with websockets.connect(f'{args.url}?{query}', open_timeout=30, max_queue=1024) as ws:
                ready += 1
                async def receive():
                    async for raw in ws:
                        data = json.loads(raw)
                        if data.get('event') == 'ping':
                            await ws.send(json.dumps({'event': 'pong'}))
                        temporary = data.get('client_temp_id')
                        if temporary in pending:
                            sent, future = pending[temporary]
                            if not future.done():
                                if data.get('event') == 'message_error':
                                    future.set_result(False)
                                elif data.get('id'):
                                    latencies.append((time.monotonic() - sent) * 1000)
                                    future.set_result(True)
                reader = asyncio.create_task(receive())
                await start.wait()
                # Spread sends while maintaining all sockets open concurrently.
                await asyncio.sleep(random.random() * args.duration)
                for sequence in range(args.messages):
                    temporary = f'load-{run_id}-{index}-{sequence}'
                    future = asyncio.get_running_loop().create_future()
                    pending[temporary] = (time.monotonic(), future)
                    await ws.send(json.dumps({'room_id': user['room_id'], 'content': temporary, 'client_temp_id': temporary}))
                    try:
                        if not await asyncio.wait_for(future, 30): failures.append('message_rejected')
                    except asyncio.TimeoutError:
                        failures.append('ack_timeout')
                    pending.pop(temporary, None)
                    await asyncio.sleep(args.interval)
                await asyncio.sleep(args.duration)
        except Exception as exc:
            failures.append(type(exc).__name__)  # never print URLs containing tokens
        finally:
            if reader:
                reader.cancel()
                await asyncio.gather(reader, return_exceptions=True)

    tasks = [asyncio.create_task(client(i, u)) for i, u in enumerate(users)]
    deadline = time.monotonic() + 60
    while ready < args.users and time.monotonic() < deadline and not all(t.done() for t in tasks):
        await asyncio.sleep(.1)
    peak_ready = ready
    start.set()
    await asyncio.gather(*tasks)
    ordered = sorted(latencies)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * .95))] if ordered else None
    print(json.dumps({'run_id': run_id, 'connected': peak_ready, 'expected_messages': args.users * args.messages,
                      'acknowledged': len(latencies), 'failures': len(failures),
                      'ack_p50_ms': round(statistics.median(latencies), 2) if latencies else None,
                      'ack_p95_ms': round(p95, 2) if p95 else None}, indent=2))
    return 0 if peak_ready == args.users and len(latencies) == args.users * args.messages and not failures and p95 <= args.p95_ms else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='ws://127.0.0.1:8000/api/chat/ws')
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--users', type=int, default=500)
    parser.add_argument('--messages', type=int, default=3)
    parser.add_argument('--duration', type=float, default=30)
    parser.add_argument('--interval', type=float, default=1)
    parser.add_argument('--p95-ms', type=float, default=2000)
    parser.add_argument('--confirm-staging', action='store_true')
    args = parser.parse_args()
    if args.users < 1 or args.messages < 1 or args.duration < 0 or args.interval < 0:
        parser.error('Invalid load parameters')
    raise SystemExit(asyncio.run(run(args)))
