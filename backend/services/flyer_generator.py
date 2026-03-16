"""Generate campaign flyer PDFs from campaign data."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from fpdf import FPDF

DEFAULT_DESCRIPTION = (
    "Join us to spread the word and help families find food resources."
)
DEFAULT_POSTER_STYLE = "color_blocked"

# do not use dark_centered style for now
SUPPORTED_STYLES = {"dark_centered", "color_blocked", "modern_bordered"}

LEMON_YELLOW = (255, 214, 10)
LEMON_DARK = (214, 163, 0)
LEAF_GREEN = (34, 197, 94)
SKY_BLUE = (56, 189, 248)
FUN_ORANGE = (249, 115, 22)
INK_DARK = (24, 24, 27)

_UNICODE_FONT_FAMILY: str | None = None
_UNICODE_FONT_READY = False
_UNICODE_FONT_FAILED = False

REQUIRED_FIELDS = [
    "title",
    "location",
    "address",
    "date",
    "start_time",
    "end_time",
]


@dataclass(slots=True)
class FlyerCampaignData:
    title: str
    location: str
    address: str
    date: str
    start_time: str
    end_time: str
    description: str = DEFAULT_DESCRIPTION

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "FlyerCampaignData":
        missing = [field for field in REQUIRED_FIELDS if not payload.get(field)]
        if missing:
            raise ValueError(f"Missing required campaign fields: {missing}")

        return cls(
            title=str(payload["title"]),
            location=str(payload["location"]),
            address=str(payload["address"]),
            date=str(payload["date"]),
            start_time=str(payload["start_time"]),
            end_time=str(payload["end_time"]),
            description=str(payload.get("description") or DEFAULT_DESCRIPTION),
        )


def _campaign_payload(campaign: FlyerCampaignData) -> dict[str, str]:
    return {
        "title": campaign.title,
        "location": campaign.location,
        "address": campaign.address,
        "date": campaign.date,
        "start_time": campaign.start_time,
        "end_time": campaign.end_time,
    }


def _fit_title_font_size(title: str, base: int = 46) -> int:
    # Keep long titles readable without spilling too far down the page.
    length = len(title.strip())
    if length > 55:
        return max(28, base - 16)
    if length > 40:
        return max(30, base - 10)
    if length > 26:
        return max(34, base - 6)
    return base


def _fit_font_size_for_width(
    pdf: FPDF,
    text: str,
    max_width: float,
    family: str,
    style: str,
    start_size: int,
    min_size: int,
) -> int:
    size = start_size
    while size > min_size:
        pdf.set_font(family, style, size)
        if pdf.get_string_width(text) <= max_width:
            return size
        size -= 1
    return min_size


def _wrap_text_for_width(pdf: FPDF, text: str, max_width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.get_string_width(candidate) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _fit_font_size_for_box(
    pdf: FPDF,
    text: str,
    width: float,
    height: float,
    family: str,
    style: str,
    start_size: int,
    min_size: int,
    line_height_factor: float = 1.2,
) -> int:
    size = start_size
    while size >= min_size:
        pdf.set_font(family, style, size)
        lines = _wrap_text_for_width(pdf, text, width)
        line_h = size * 0.35 * line_height_factor
        if len(lines) * line_h <= height:
            return size
        size -= 1
    return min_size


def _draw_fit_text_box(
    pdf: FPDF,
    x: float,
    y: float,
    width: float,
    height: float,
    text: str,
    family: str,
    style: str,
    max_size: int,
    min_size: int,
    color: tuple[int, int, int],
    align: str = "C",
    line_height_factor: float = 1.2,
) -> None:
    size = _fit_font_size_for_box(
        pdf,
        text,
        width=width,
        height=height,
        family=family,
        style=style,
        start_size=max_size,
        min_size=min_size,
        line_height_factor=line_height_factor,
    )
    pdf.set_text_color(*color)
    pdf.set_font(family, style, size)
    line_h = size * 0.35 * line_height_factor
    pdf.set_xy(x, y)
    pdf.multi_cell(width, line_h, text, align=align)


def _set_emoji_capable_font(pdf: FPDF, size: int, style: str = "") -> None:
    candidates = [
        ("NotoSans", "/System/Library/Fonts/Supplemental/NotoSans-Regular.ttf"),
        ("ArialUnicode", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        ("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for family, font_path in candidates:
        try:
            if family.lower() not in pdf.fonts:
                pdf.add_font(family, "", font_path)
            pdf.set_font(family, style, size)
            return
        except Exception:
            continue

    # Fallback when no Unicode-capable font is available in the runtime.
    pdf.set_font("Helvetica", style, size)


def _draw_lemon_emoji_row(pdf: FPDF, y: float, size: int = 16) -> None:
    _set_emoji_capable_font(pdf, size=size)
    pdf.set_text_color(*LEMON_YELLOW)
    pdf.set_xy(16, y)
    pdf.cell(0, 8, "🍋  🍋", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(166, y)
    pdf.cell(0, 8, "🍋  🍋", new_x="LMARGIN", new_y="NEXT")


def _draw_confetti(pdf: FPDF) -> None:
    confetti = [
        (16, 22, FUN_ORANGE),
        (28, 30, LEMON_YELLOW),
        (185, 24, SKY_BLUE),
        (172, 34, LEAF_GREEN),
        (20, 268, SKY_BLUE),
        (34, 276, FUN_ORANGE),
        (176, 270, LEMON_YELLOW),
        (190, 278, LEAF_GREEN),
    ]
    for x, y, color in confetti:
        pdf.set_fill_color(*color)
        pdf.rect(x, y, 4, 4, style="F")


def create_dark_centered_poster(pdf: FPDF, data: dict[str, str]) -> None:
    # Background
    pdf.set_fill_color(*INK_DARK)
    pdf.rect(0, 0, 210, 297, style="F")

    # Playful accents and lemon branding
    _draw_confetti(pdf)
    _draw_lemon_emoji_row(pdf, 14, size=16)
    _set_emoji_capable_font(pdf, size=22)
    pdf.set_text_color(*LEMON_YELLOW)
    pdf.set_xy(98, 15)
    pdf.cell(0, 10, "🍋", new_x="LMARGIN", new_y="NEXT")
    pdf.set_text_color(*LEMON_YELLOW)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_y(31)
    pdf.cell(
        0, 8, "LEMONTREE COMMUNITY FLYER", align="C", new_x="LMARGIN", new_y="NEXT"
    )

    pdf.set_draw_color(*LEAF_GREEN)
    pdf.set_line_width(1.4)
    pdf.line(24, 43, 186, 43)

    # Title
    pdf.set_text_color(255, 255, 255)
    _draw_fit_text_box(
        pdf,
        x=20,
        y=56,
        width=170,
        height=72,
        text=data["title"],
        family="Helvetica",
        style="B",
        max_size=_fit_title_font_size(data["title"], base=48),
        min_size=24,
        color=(255, 255, 255),
        line_height_factor=1.12,
    )

    pdf.set_text_color(196, 181, 253)
    pdf.set_font("Helvetica", "I", 14)
    pdf.cell(
        0,
        10,
        "Bring a friend and spread the word!",
        align="C",
        new_x="LMARGIN",
        new_y="NEXT",
    )

    # Date + time
    pdf.set_text_color(232, 232, 232)
    pdf.set_font("Helvetica", "I", 24)
    pdf.set_y(146)
    pdf.cell(0, 10, data["date"], align="C", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 18)
    time_string = f"{data['start_time']} - {data['end_time']}"
    pdf.cell(0, 10, time_string, align="C", new_x="LMARGIN", new_y="NEXT")

    # Location + address
    pdf.set_text_color(*LEMON_YELLOW)
    _draw_fit_text_box(
        pdf,
        x=20,
        y=214,
        width=170,
        height=20,
        text=data["location"],
        family="Helvetica",
        style="B",
        max_size=22,
        min_size=14,
        color=LEMON_YELLOW,
        line_height_factor=1.05,
    )

    _draw_fit_text_box(
        pdf,
        x=20,
        y=236,
        width=170,
        height=24,
        text=data["address"],
        family="Helvetica",
        style="",
        max_size=16,
        min_size=11,
        color=(255, 255, 255),
        line_height_factor=1.05,
    )

    pdf.set_text_color(167, 243, 208)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_y(274)
    pdf.cell(
        0,
        8,
        "Volunteer. Share. Show up for your community.",
        align="C",
        new_x="LMARGIN",
        new_y="NEXT",
    )


def create_color_blocked_poster(pdf: FPDF, data: dict[str, str]) -> None:
    # Header block
    pdf.set_fill_color(225, 29, 72)
    pdf.rect(0, 0, 210, 100, style="F")

    # Mid and footer bands for a brighter, branded look.
    pdf.set_fill_color(255, 251, 235)
    pdf.rect(0, 100, 210, 180, style="F")
    pdf.set_fill_color(*INK_DARK)
    pdf.rect(0, 280, 210, 17, style="F")

    _set_emoji_capable_font(pdf, size=18)
    pdf.set_text_color(*LEMON_YELLOW)
    pdf.set_xy(12, 11)
    pdf.cell(0, 8, "🍋", new_x="LMARGIN", new_y="NEXT")
    pdf.set_xy(186, 11)
    pdf.cell(0, 8, "🍋", new_x="LMARGIN", new_y="NEXT")
    _draw_lemon_emoji_row(pdf, 86, size=12)

    # Title
    pdf.set_text_color(255, 255, 255)
    _draw_fit_text_box(
        pdf,
        x=20,
        y=30,
        width=170,
        height=62,
        text=data["title"],
        family="Helvetica",
        style="B",
        max_size=_fit_title_font_size(data["title"], base=42),
        min_size=22,
        color=(255, 255, 255),
        line_height_factor=1.1,
    )

    # WHEN block
    pdf.set_text_color(*INK_DARK)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_y(120)
    pdf.set_x(20)
    pdf.cell(0, 15, "WHEN", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*LEAF_GREEN)
    pdf.set_line_width(1.2)
    pdf.line(20, 135, 90, 135)

    pdf.set_font("Helvetica", "", 18)
    pdf.set_x(20)
    time_string = f"{data['start_time']} to {data['end_time']}"
    _draw_fit_text_box(
        pdf,
        x=20,
        y=139,
        width=170,
        height=14,
        text=data["date"],
        family="Helvetica",
        style="",
        max_size=18,
        min_size=12,
        color=INK_DARK,
        align="L",
        line_height_factor=1.0,
    )
    _draw_fit_text_box(
        pdf,
        x=20,
        y=151,
        width=170,
        height=14,
        text=time_string,
        family="Helvetica",
        style="",
        max_size=18,
        min_size=12,
        color=INK_DARK,
        align="L",
        line_height_factor=1.0,
    )

    # WHERE block
    pdf.set_y(180)
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_x(20)
    pdf.cell(0, 15, "WHERE", new_x="LMARGIN", new_y="NEXT")

    pdf.set_draw_color(*FUN_ORANGE)
    pdf.line(20, 195, 98, 195)

    pdf.set_font("Helvetica", "", 18)
    _draw_fit_text_box(
        pdf,
        x=20,
        y=199,
        width=170,
        height=14,
        text=data["location"],
        family="Helvetica",
        style="",
        max_size=18,
        min_size=12,
        color=INK_DARK,
        align="L",
        line_height_factor=1.0,
    )
    _draw_fit_text_box(
        pdf,
        x=20,
        y=211,
        width=170,
        height=24,
        text=data["address"],
        family="Helvetica",
        style="",
        max_size=18,
        min_size=11,
        color=INK_DARK,
        align="L",
        line_height_factor=1.0,
    )

    # Footer text
    pdf.set_text_color(*LEMON_YELLOW)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_y(284)
    pdf.cell(
        0,
        8,
        "LEMONTREE | Volunteer. Share. Show up.",
        align="C",
        new_x="LMARGIN",
        new_y="NEXT",
    )


def create_modern_bordered_poster(pdf: FPDF, data: dict[str, str]) -> None:
    # Background and frame
    pdf.set_fill_color(255, 250, 240)
    pdf.rect(0, 0, 210, 297, style="F")
    pdf.set_fill_color(255, 255, 255)
    pdf.rect(9, 9, 192, 279, style="F")
    pdf.set_draw_color(13, 77, 58)
    pdf.set_line_width(1.9)
    pdf.rect(9, 9, 192, 279)

    # Top campaign band
    pdf.set_fill_color(13, 77, 58)
    pdf.rect(9, 9, 192, 16, style="F")
    pdf.set_text_color(245, 255, 125)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_xy(9, 12)
    pdf.cell(192, 8, "COMMUNITY VOLUNTEER CAMPAIGN", align="C")

    # Hero block
    pdf.set_fill_color(255, 183, 3)
    pdf.rect(9, 25, 192, 62, style="F")
    pdf.set_draw_color(13, 77, 58)
    pdf.set_line_width(0.7)
    pdf.line(9, 25, 201, 25)

    pdf.set_text_color(106, 4, 15)
    pdf.set_font("Helvetica", "B", 21)
    pdf.set_xy(17, 33)
    pdf.cell(120, 9, "VOLUNTEERS NEEDED")

    _draw_fit_text_box(
        pdf,
        x=17,
        y=44,
        width=128,
        height=36,
        text=data["title"],
        family="Helvetica",
        style="B",
        max_size=_fit_title_font_size(data["title"], base=32),
        min_size=16,
        color=(16, 42, 67),
        align="L",
        line_height_factor=1.05,
    )

    # Date card
    pdf.set_fill_color(106, 4, 15)
    pdf.rect(151, 33, 42, 10, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(151, 35)
    pdf.cell(42, 6, "EVENT DATE", align="C")

    pdf.set_fill_color(255, 255, 255)
    pdf.rect(151, 43, 42, 24, style="F")
    pdf.set_draw_color(106, 4, 15)
    pdf.set_line_width(0.8)
    pdf.rect(151, 43, 42, 24)
    _draw_fit_text_box(
        pdf,
        x=154,
        y=46,
        width=36,
        height=18,
        text=data["date"],
        family="Helvetica",
        style="B",
        max_size=11,
        min_size=8,
        color=(106, 4, 15),
        line_height_factor=1.0,
    )

    # Content block separator
    pdf.set_draw_color(13, 77, 58)
    pdf.set_line_width(0.7)
    pdf.line(9, 87, 201, 87)

    # Description card
    pdf.set_fill_color(232, 255, 246)
    pdf.rect(17, 97, 176, 24, style="F")
    pdf.set_draw_color(13, 77, 58)
    pdf.set_line_width(0.8)
    pdf.rect(17, 97, 176, 24)
    _draw_fit_text_box(
        pdf,
        x=21,
        y=102,
        width=168,
        height=15,
        text=data.get("description") or DEFAULT_DESCRIPTION,
        family="Helvetica",
        style="B",
        max_size=14,
        min_size=10,
        color=(18, 58, 44),
        align="L",
        line_height_factor=1.0,
    )

    # Detail table frame
    table_x = 17
    table_y = 129
    table_w = 176
    row_h = 18
    label_w = 56
    value_w = table_w - label_w
    rows = [
        ("LOCATION", data["location"]),
        ("ADDRESS", data["address"]),
        ("TIME", f"{data['start_time']} - {data['end_time']}"),
    ]

    pdf.set_draw_color(18, 58, 44)
    pdf.set_line_width(0.8)
    pdf.rect(table_x, table_y, table_w, row_h * len(rows))

    for i, (label, value) in enumerate(rows):
        y = table_y + i * row_h
        if i > 0:
            pdf.line(table_x, y, table_x + table_w, y)
        pdf.line(table_x + label_w, y, table_x + label_w, y + row_h)

        if label == "TIME":
            pdf.set_fill_color(255, 243, 205)
            pdf.rect(table_x + label_w, y, value_w, row_h, style="F")

        pdf.set_fill_color(18, 58, 44)
        pdf.rect(table_x, y, label_w, row_h, style="F")

        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_xy(table_x + 3, y + 5)
        pdf.cell(label_w - 6, 7, label, align="L")

        _draw_fit_text_box(
            pdf,
            x=table_x + label_w + 3,
            y=y + 4,
            width=value_w - 6,
            height=row_h - 8,
            text=value,
            family="Helvetica",
            style="B",
            max_size=14,
            min_size=9,
            color=(15, 47, 63),
            align="L",
            line_height_factor=1.0,
        )

    # CTA + footer with a single separator between sections
    pdf.set_fill_color(106, 4, 15)
    pdf.rect(17, 190, 176, 16, style="F")
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_xy(17, 194)
    pdf.cell(176, 8, "SHOW UP. PITCH IN. MAKE IMPACT.", align="C")

    pdf.set_draw_color(13, 77, 58)
    pdf.set_line_width(0.8)
    pdf.line(17, 214, 193, 214)

    pdf.set_text_color(13, 77, 58)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_xy(17, 218)
    pdf.cell(176, 8, "Bring a friend and help us serve more neighbors.", align="C")


def _render_style(pdf: FPDF, payload: dict[str, str], style: str) -> None:
    if style == "dark_centered":
        create_dark_centered_poster(pdf, payload)
        return
    if style == "color_blocked":
        create_color_blocked_poster(pdf, payload)
        return
    create_modern_bordered_poster(pdf, payload)


def generate_flyer_bytes(
    campaign: FlyerCampaignData,
    style: str = DEFAULT_POSTER_STYLE,
) -> bytes:
    """Render the flyer to PDF in memory and return the raw bytes."""
    if style not in SUPPORTED_STYLES:
        raise ValueError(
            f"Unsupported poster style '{style}'. Valid styles: {sorted(SUPPORTED_STYLES)}"
        )

    payload = _campaign_payload(campaign)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    _render_style(pdf, payload, style)

    return bytes(pdf.output())


def generate_flyer_pdf(
    campaign: FlyerCampaignData,
    output_path: str | Path,
    style: str = DEFAULT_POSTER_STYLE,
) -> Path:
    """Render the flyer to PDF and return the saved path."""
    if style not in SUPPORTED_STYLES:
        raise ValueError(
            f"Unsupported poster style '{style}'. Valid styles: {sorted(SUPPORTED_STYLES)}"
        )

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = _campaign_payload(campaign)

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    _render_style(pdf, payload, style)

    pdf.output(str(path))
    return path
