# ============================================================
# SETUP INSTRUCTIONS
# ============================================================
#
# 1. Put the entire agent/ folder inside your backend/ directory:
#
#    backend/
#    ├── agent/
#    │   ├── __init__.py
#    │   ├── agent.py
#    │   ├── system_prompt.py
#    │   ├── tools.py
#    │   └── tool_handlers.py
#    ├── auth.py
#    ├── main.py          ← ADD THE CODE BELOW TO THIS FILE
#    ├── supabase_client.py
#    └── .env
#
# 2. Add these to your requirements.txt:
#
#    anthropic>=0.40.0
#    httpx>=0.27.0
#
# 3. Add these to your .env file:
#
#    AWS_ACCESS_KEY_ID=your-aws-access-key
#    AWS_SECRET_ACCESS_KEY=your-aws-secret-key
#    AWS_REGION=us-east-1
#
# 4. Install:
#
#    cd backend
#    source .venv/bin/activate
#    pip install -r requirements.txt
#
# 5. AWS Bedrock setup (one time):
#
#    a) Create AWS account at aws.amazon.com (you get $200 free credits)
#    b) Go to AWS Console → Amazon Bedrock → Model Access
#    c) Request access to Anthropic Claude models (instant approval)
#    d) Go to IAM → Users → Create a user with BedrockFullAccess policy
#    e) Create access key for that user → copy the key ID and secret
#    f) Put them in your .env file
#
# 6. Run:
#
#    cd backend
#    source .venv/bin/activate
#    uvicorn main:app --reload --port 8000
#
# 7. Test:
#
#    Open browser: http://localhost:8000/agent/test
#
#    Or curl:
#    curl -X POST http://localhost:8000/agent/chat \
#      -H "Content-Type: application/json" \
#      -d '{"messages": [{"role": "user", "content": "Find food pantries near Chelsea Manhattan"}]}'
#
# ============================================================


# ============================================================
# ADD THIS CODE TO YOUR EXISTING backend/main.py
# ============================================================

# --- Add these imports at the top of your main.py ---

from pydantic import BaseModel  # you may already have this
from agent.agent import run_agent


# --- Add these Pydantic models (put with your other models) ---

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[dict] = []


# --- Add these endpoints (put with your other routes) ---

@app.post("/agent/chat", response_model=ChatResponse)
async def agent_chat(request: ChatRequest):
    """
    Main chat endpoint for the Campaign Builder Agent.
    Frontend sends full conversation history, agent returns response.
    """
    try:
        messages = [
            {"role": msg.role, "content": msg.content}
            for msg in request.messages
        ]

        print(f"\n{'='*60}")
        print(f"[Agent] Processing {len(messages)} messages")
        print(f"[Agent] Latest: {messages[-1]['content'][:100]}...")
        print(f"{'='*60}")

        result = await run_agent(messages)

        print(f"[Agent] Response length: {len(result['content'])} chars")
        print(f"[Agent] Tools called: {[tc['tool'] for tc in result.get('tool_calls', [])]}")

        return ChatResponse(
            response=result["content"],
            tool_calls=result.get("tool_calls", []),
        )

    except Exception as e:
        print(f"[Agent Error] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/agent/test")
async def agent_test():
    """Quick test — hit http://localhost:8000/agent/test in your browser."""
    try:
        result = await run_agent([{
            "role": "user",
            "content": "What food pantries are near zip code 11220 in Brooklyn?"
        }])
        return {
            "response": result["content"],
            "tools_used": [tc["tool"] for tc in result.get("tool_calls", [])]
        }
    except Exception as e:
        return {"error": str(e)}
