"""Tests for task endpoints (organizer + volunteer assignment flows)."""

from types import SimpleNamespace

CAMPAIGN_ID = "550e8400-e29b-41d4-a716-446655440001"
TASK_ID = "550e8400-e29b-41d4-a716-446655440010"
SECOND_TASK_ID = "550e8400-e29b-41d4-a716-446655440011"

ORGANIZER_ID = "user-uuid-123"
OTHER_USER_ID = "user-uuid-999"


class FakeTable:
    def __init__(self, table_name: str, state: dict):
        self.table_name = table_name
        self.state = state
        self._op = "select"
        self._filters = []
        self._order_field = None
        self._order_desc = False
        self._range = None
        self._single = False
        self._count_requested = False
        self._payload = None

    def _matches(self, row: dict) -> bool:
        for kind, field, value in self._filters:
            if kind == "eq" and row.get(field) != value:
                return False
            if kind == "neq" and row.get(field) == value:
                return False
            if kind == "in" and row.get(field) not in value:
                return False
        return True

    def select(self, _columns="*", count=None):
        self._op = "select"
        self._count_requested = count == "exact"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, field, value):
        self._filters.append(("eq", field, value))
        return self

    def neq(self, field, value):
        self._filters.append(("neq", field, value))
        return self

    def in_(self, field, value):
        self._filters.append(("in", field, value))
        return self

    def order(self, field, desc=False):
        self._order_field = field
        self._order_desc = desc
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        table_data = self.state[self.table_name]

        if self._op == "insert":
            rows = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for row in rows:
                copied = dict(row)
                table_data.append(copied)
                inserted.append(copied)
            return SimpleNamespace(data=inserted, count=None)

        matched_indexes = [
            idx for idx, row in enumerate(table_data) if self._matches(row)
        ]

        if self._op == "update":
            updated = []
            for idx in matched_indexes:
                table_data[idx].update(self._payload)
                updated.append(dict(table_data[idx]))
            return SimpleNamespace(data=updated, count=None)

        if self._op == "delete":
            deleted = [dict(table_data[idx]) for idx in matched_indexes]
            for idx in reversed(matched_indexes):
                del table_data[idx]
            return SimpleNamespace(data=deleted, count=None)

        selected = [dict(table_data[idx]) for idx in matched_indexes]
        if self._order_field:
            selected = sorted(
                selected,
                key=lambda row: row.get(self._order_field),
                reverse=self._order_desc,
            )
        if self._range is not None:
            start, end = self._range
            selected = selected[start : end + 1]

        count = len(selected) if self._count_requested else None
        if self._single:
            return SimpleNamespace(data=selected[0] if selected else None, count=count)

        return SimpleNamespace(data=selected, count=count)


def install_fake_supabase(mock_supabase, state: dict):
    def table_router(table_name: str):
        return FakeTable(table_name, state)

    mock_supabase.table.side_effect = table_router


def build_state(organizer_id=ORGANIZER_ID):
    return {
        "campaigns": [
            {
                "id": CAMPAIGN_ID,
                "organizer_id": organizer_id,
                "title": "Hyde Park Flyering",
            }
        ],
        "tasks": [
            {
                "id": TASK_ID,
                "campaign_id": CAMPAIGN_ID,
                "title": "North block",
                "description": "Cover north side",
                "max_assignees": 1,
                "assigned_to": None,
                "created_at": "2026-03-14T10:00:00+00:00",
            }
        ],
        "signups": [],
    }


def test_list_campaign_tasks_is_public(unauth_client, mock_supabase):
    state = build_state()
    install_fake_supabase(mock_supabase, state)

    resp = unauth_client.get(f"/campaigns/{CAMPAIGN_ID}/tasks")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert len(body["data"]) == 1
    assert body["data"][0]["id"] == TASK_ID


def test_create_campaign_task_as_organizer(client, mock_supabase):
    state = build_state()
    install_fake_supabase(mock_supabase, state)

    payload = {"title": "Welcome table", "description": "Greet volunteers"}
    resp = client.post(f"/campaigns/{CAMPAIGN_ID}/tasks", json=payload)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["title"] == "Welcome table"
    assert len(state["tasks"]) == 2


def test_create_campaign_task_forbidden_for_non_organizer(client, mock_supabase):
    state = build_state(organizer_id=OTHER_USER_ID)
    install_fake_supabase(mock_supabase, state)

    resp = client.post(f"/campaigns/{CAMPAIGN_ID}/tasks", json={"title": "Leaflet"})

    assert resp.status_code == 403


def test_update_task_forbidden_for_non_organizer(client, mock_supabase):
    state = build_state(organizer_id=OTHER_USER_ID)
    install_fake_supabase(mock_supabase, state)

    resp = client.put(f"/tasks/{TASK_ID}", json={"title": "Updated"})

    assert resp.status_code == 403


def test_assign_task_requires_signup(client, mock_supabase):
    state = build_state()
    install_fake_supabase(mock_supabase, state)

    resp = client.post(f"/tasks/{TASK_ID}/assign")

    assert resp.status_code == 403


def test_assign_and_unassign_task_success(client, mock_supabase):
    state = build_state()
    state["signups"] = [
        {
            "id": "signup-1",
            "campaign_id": CAMPAIGN_ID,
            "user_id": ORGANIZER_ID,
            "status": "pending",
            "task_id": None,
        }
    ]
    install_fake_supabase(mock_supabase, state)

    assign_resp = client.post(f"/tasks/{TASK_ID}/assign")
    assert assign_resp.status_code == 200
    assert state["signups"][0]["task_id"] == TASK_ID
    assert state["tasks"][0]["assigned_to"] == ORGANIZER_ID

    unassign_resp = client.delete(f"/tasks/{TASK_ID}/assign")
    assert unassign_resp.status_code == 200
    assert state["signups"][0]["task_id"] is None
    assert state["tasks"][0]["assigned_to"] is None


def test_delete_task_clears_signup_assignments(client, mock_supabase):
    state = build_state()
    state["tasks"].append(
        {
            "id": SECOND_TASK_ID,
            "campaign_id": CAMPAIGN_ID,
            "title": "South block",
            "description": None,
            "max_assignees": 2,
            "assigned_to": None,
            "created_at": "2026-03-14T11:00:00+00:00",
        }
    )
    state["signups"] = [
        {
            "id": "signup-1",
            "campaign_id": CAMPAIGN_ID,
            "user_id": ORGANIZER_ID,
            "status": "pending",
            "task_id": TASK_ID,
        },
        {
            "id": "signup-2",
            "campaign_id": CAMPAIGN_ID,
            "user_id": OTHER_USER_ID,
            "status": "pending",
            "task_id": SECOND_TASK_ID,
        },
    ]
    install_fake_supabase(mock_supabase, state)

    resp = client.delete(f"/tasks/{TASK_ID}")

    assert resp.status_code == 200
    remaining_ids = {row["id"] for row in state["tasks"]}
    assert TASK_ID not in remaining_ids
    assert state["signups"][0]["task_id"] is None
    assert state["signups"][1]["task_id"] == SECOND_TASK_ID
