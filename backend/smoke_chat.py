from agent_app.chat_service import chat_store
from agent_app.chat_agent import run_turn


def main() -> None:
    session = chat_store.create_session(user_id="anonymous")

    result = run_turn(
        session_id=session["session_id"],
        user_message="I want to run a flyering event in Hyde Park next Saturday",
        chat_history=[],
        token="dev-token",
    )

    print("session_id:", session["session_id"])
    print("reply:", result["reply"])
    print("context:", result["context"])
    print("action:", result["action"])


if __name__ == "__main__":
    main()
