import asyncio
import websockets
import json
import time

URL = "ws://localhost:8000/api/chat/ws?token=8e6b77d97ddd1e5c&employee_code=admin"

async def test_websocket():
    try:
        print(f"Đang kết nối tới: {URL}")
        async with websockets.connect(URL) as websocket:
            print("✅ Đã kết nối thành công!")
            
            # Đợi 1 chút
            await asyncio.sleep(1)
            
            # Thử gửi một tin nhắn
            test_msg = {
                "action": "send_message", 
                "payload": {
                    "text": "Hello from Test Script",
                    "group_id": "general"
                }
            }
            
            print(f"Đang gửi tin nhắn: {test_msg}")
            await websocket.send(json.dumps(test_msg))
            
            # Đợi nhận phản hồi
            print("Đang chờ phản hồi từ server...")
            # Lắng nghe trong 3 giây
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                print(f"📥 Nhận được phản hồi: {response}")
            except asyncio.TimeoutError:
                print("⚠️ Timeout: Không nhận được phản hồi trong 3 giây.")

    except Exception as e:
        print(f"❌ Lỗi kết nối: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())
