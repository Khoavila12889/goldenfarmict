import asyncio
import websockets
import json
import time

# Cấu hình test
WS_URL = "ws://localhost:8000/api/chat/ws"  # Changed from /api/events as it's likely SSE
TOTAL_CLIENTS = 100
MESSAGES_PER_CLIENT = 10

async def chat_client(client_id):
    try:
        async with websockets.connect(f"{WS_URL}?token=8e6b77d97ddd1e5c&employee_code=admin") as ws:
            # Lắng nghe tin nhắn (Chạy ngầm)
            async def listen():
                try:
                    async for msg in ws:
                        pass # Nhận để tránh đầy buffer
                except Exception:
                    pass
            
            asyncio.create_task(listen())

            # Spam tin nhắn
            for i in range(MESSAGES_PER_CLIENT):
                payload = {
                    "action": "send_message",
                    "payload": {
                        "text": f"Message {i} from client {client_id}",
                        "group_id": "general"
                    }
                }
                start_time = time.time()
                await ws.send(json.dumps(payload))
                
                # Đo độ trễ (nếu cần thiết kế logic nhận ack)
                await asyncio.sleep(0.5) # Spam mỗi 0.5s
                
    except Exception as e:
        print(f"Client {client_id} error: {e}")

async def main():
    print(f"Bắt đầu test tải với {TOTAL_CLIENTS} users...")
    start_time = time.time()
    
    # Tạo 100 kết nối đồng thời
    tasks = [chat_client(i) for i in range(TOTAL_CLIENTS)]
    await asyncio.gather(*tasks)
    
    end_time = time.time()
    print(f"Hoàn thành test trong {end_time - start_time:.2f} giây!")
    print(f"Throughput: {TOTAL_CLIENTS * MESSAGES_PER_CLIENT / (end_time - start_time):.2f} msg/s")

if __name__ == "__main__":
    asyncio.run(main())
